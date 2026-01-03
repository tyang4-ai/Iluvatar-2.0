/**
 * ILUVATAR 2.0 - Redis State Manager
 *
 * Manages shared state with optimistic locking to prevent race conditions.
 * Multiple agents can read concurrently, but writes use version-based locks.
 *
 * SCOPED STATE:
 * - "global" scope: Shared config (style guides, training settings)
 * - "novel:{id}" scope: Per-novel state with independent versioning
 *
 * This allows multiple novels to be worked on simultaneously without conflicts,
 * while global config changes are still properly locked.
 */

const Redis = require('ioredis');

/**
 * Build Redis key names for a given scope
 *
 * Why this function exists:
 * Instead of hardcoded keys like "state:version", we now generate keys
 * dynamically based on scope. This lets us have isolated state per novel.
 *
 * @param {string} scope - "global" or "novel:{novelId}"
 * @returns {object} - { versionKey, dataKey, readsKey, writesKey }
 */
function getScopeKeys(scope) {
  // Validate scope format - fail fast if caller passes garbage
  if (scope !== 'global' && !scope.startsWith('novel:')) {
    throw new Error(`Invalid scope: ${scope}. Must be "global" or "novel:{id}"`);
  }

  return {
    versionKey: `${scope}:version`,   // e.g., "novel:abc123:version" or "global:version"
    dataKey: `${scope}:data`,         // e.g., "novel:abc123:data"
    readsKey: `${scope}:reads`,       // audit log for reads
    writesKey: `${scope}:writes`      // audit log for writes
  };
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

class StateManager {
  constructor(redisClient) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
  }

  /**
   * Read shared state (concurrent, no locking)
   * Multiple agents can read simultaneously
   *
   * @param {string} agentId - Agent making the request
   * @param {string} scope - "global" or "novel:{novelId}"
   * @param {string[]} keys - Keys to read (use ['*'] for all)
   * @returns {Promise<{data: Object, version: number}>}
   */
  async read(agentId, scope, keys) {
    // Get the Redis keys for this scope
    const { versionKey, dataKey, readsKey } = getScopeKeys(scope);

    const multi = this.redis.multi();

    // Get current version for THIS scope
    multi.get(versionKey);

    // Get requested keys from THIS scope's data hash
    if (keys.includes('*')) {
      multi.hgetall(dataKey);
    } else {
      keys.forEach(key => {
        multi.hget(dataKey, key);
      });
    }

    const results = await multi.exec();
    const version = parseInt(results[0][1]) || 0;
    const data = {};

    if (keys.includes('*')) {
      // Parse all values
      const allData = results[1][1];
      for (const [key, value] of Object.entries(allData || {})) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      }
    } else {
      // Parse specific keys
      keys.forEach((key, i) => {
        const value = results[i + 1][1];
        try {
          data[key] = value ? JSON.parse(value) : null;
        } catch {
          data[key] = value;
        }
      });
    }

    // Log read for debugging (to this scope's audit log)
    await this.redis.zadd(readsKey, Date.now(),
      JSON.stringify({ agentId, scope, keys, version, timestamp: Date.now() })
    );

    return { data, version };
  }

  /**
   * Write shared state (optimistic locking)
   * Throws ConflictError if version mismatch
   *
   * @param {string} agentId - Agent making the request
   * @param {string} scope - "global" or "novel:{novelId}"
   * @param {Object} updates - Key-value pairs to update
   * @param {number} expectedVersion - Expected current version
   * @returns {Promise<{success: boolean, newVersion: number}>}
   */
  async write(agentId, scope, updates, expectedVersion) {
    // Get the Redis keys for this scope
    const { versionKey, dataKey, writesKey } = getScopeKeys(scope);

    // WATCH for version changes (optimistic locking)
    // This tells Redis: "abort my transaction if this key changes"
    await this.redis.watch(versionKey);

    const currentVersion = parseInt(await this.redis.get(versionKey)) || 0;

    // Version mismatch = another agent wrote in between
    if (currentVersion !== expectedVersion) {
      await this.redis.unwatch();
      throw new ConflictError(
        `State version mismatch for ${scope}. Expected ${expectedVersion}, got ${currentVersion}. ` +
        `Another agent modified state. Retry with fresh read.`
      );
    }

    // Atomic write (MULTI/EXEC transaction)
    const multi = this.redis.multi();

    // Increment version for THIS scope
    multi.incr(versionKey);

    // Update all fields in THIS scope's data hash
    Object.entries(updates).forEach(([key, value]) => {
      multi.hset(dataKey, key, JSON.stringify(value));
    });

    // Log write for debugging
    multi.zadd(writesKey, Date.now(),
      JSON.stringify({
        agentId,
        scope,
        updates: Object.keys(updates),
        version: currentVersion + 1,
        timestamp: Date.now()
      })
    );

    // Execute transaction
    try {
      await multi.exec();
      return { success: true, newVersion: currentVersion + 1 };
    } catch (err) {
      // Transaction aborted (version changed during WATCH)
      throw new ConflictError(`Write aborted for ${scope} due to concurrent modification`);
    }
  }

  /**
   * Retry logic for write conflicts
   * Automatically retries on ConflictError
   *
   * @param {string} agentId - Agent making the request
   * @param {string} scope - "global" or "novel:{novelId}"
   * @param {Function} updateFn - Function that takes current data and returns updates
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<{success: boolean, newVersion: number}>}
   */
  async writeWithRetry(agentId, scope, updateFn, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Read current state for THIS scope
        const { data, version } = await this.read(agentId, scope, ['*']);

        // User-provided function computes updates based on current state
        const updates = await updateFn(data);

        // Try to write to THIS scope
        return await this.write(agentId, scope, updates, version);
      } catch (err) {
        if (err instanceof ConflictError && attempt < maxRetries - 1) {
          // Exponential backoff: 100ms, 200ms, 400ms...
          await this._sleep(100 * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to write to ${scope} after ${maxRetries} attempts`);
  }

  /**
   * Get specific key from state (no versioning)
   *
   * DUAL-KEY FALLBACK:
   * Tries hash field first (novel:xyz:data → outline), then falls back to
   * simple string key (novel:xyz:outline). This supports both:
   * - Discord bot writes: HSET novel:xyz:data outline "..."
   * - N8N writes: SET novel:xyz:outline "..."
   *
   * SPECIAL HANDLING for 'chapters' and 'critiques':
   * N8N saves individual items to novel:xyz:chapter:1, novel:xyz:chapter:2, etc.
   * but NovelManager expects {1: {...}, 2: {...}} object.
   * This method aggregates those individual keys into an object.
   *
   * @param {string} scope - "global" or "novel:{novelId}"
   * @param {string} key - Key to get
   */
  async get(scope, key) {
    const { dataKey } = getScopeKeys(scope);

    // Try hash field first (primary storage)
    const hashValue = await this.redis.hget(dataKey, key);
    if (hashValue && hashValue !== 'null') {
      try {
        const parsed = JSON.parse(hashValue);
        // Only return if it's a real value (not null/undefined/empty object for outline)
        if (parsed !== null && parsed !== undefined) {
          return parsed;
        }
      } catch {
        return hashValue;
      }
    }

    // Special handling for 'chapters' and 'critiques' - aggregate from N8N's individual keys
    if (key === 'chapters' || key === 'critiques') {
      return await this._aggregateN8NKeys(scope, key);
    }

    // Fallback: try simple string key (for N8N compatibility)
    // N8N saves to "novel:xyz:outline" instead of hash field
    const simpleKey = `${scope}:${key}`;
    const simpleValue = await this.redis.get(simpleKey);
    if (simpleValue) {
      try {
        return JSON.parse(simpleValue);
      } catch {
        return simpleValue;
      }
    }

    return null;
  }

  /**
   * Aggregate individual N8N keys into an object
   *
   * N8N saves: novel:xyz:chapter:1, novel:xyz:chapter:2, etc.
   * We aggregate into: { 1: {...}, 2: {...} }
   *
   * @param {string} scope - "novel:{novelId}"
   * @param {string} type - "chapters" or "critiques"
   * @private
   */
  async _aggregateN8NKeys(scope, type) {
    // Map plural to singular: chapters -> chapter, critiques -> critique
    const singular = type === 'chapters' ? 'chapter' : 'critique';
    const pattern = `${scope}:${singular}:*`;

    // Find all matching keys
    const keys = await this.redis.keys(pattern);
    if (!keys || keys.length === 0) {
      return {};
    }

    // Fetch all values
    const result = {};
    for (const key of keys) {
      // Extract chapter number from key: "novel:xyz:chapter:1" -> "1"
      const parts = key.split(':');
      const num = parts[parts.length - 1];

      const value = await this.redis.get(key);
      if (value) {
        try {
          result[num] = JSON.parse(value);
        } catch {
          result[num] = value;
        }
      }
    }

    return result;
  }

  /**
   * Set specific key (without versioning - use for simple updates)
   * WARNING: This bypasses optimistic locking! Use for non-critical data only.
   * @param {string} scope - "global" or "novel:{novelId}"
   * @param {string} key - Key to set
   * @param {any} value - Value to store
   */
  async set(scope, key, value) {
    const { dataKey } = getScopeKeys(scope);
    return await this.redis.hset(dataKey, key, JSON.stringify(value));
  }

  /**
   * Delete keys from state
   * @param {string} scope - "global" or "novel:{novelId}"
   * @param {string|string[]} keys - Key(s) to delete
   */
  async delete(scope, keys) {
    const { dataKey } = getScopeKeys(scope);
    if (Array.isArray(keys)) {
      return await this.redis.hdel(dataKey, ...keys);
    }
    return await this.redis.hdel(dataKey, keys);
  }

  /**
   * Clear all state for a scope (DANGEROUS - use for testing only)
   * @param {string} scope - "global" or "novel:{novelId}"
   */
  async clear(scope) {
    const { versionKey, dataKey, readsKey, writesKey } = getScopeKeys(scope);
    const multi = this.redis.multi();
    multi.del(dataKey);
    multi.del(versionKey);
    multi.del(readsKey);
    multi.del(writesKey);
    return await multi.exec();
  }

  /**
   * Get debugging information for a scope
   * @param {string} scope - "global" or "novel:{novelId}"
   */
  async getDebugInfo(scope) {
    const { versionKey, readsKey, writesKey } = getScopeKeys(scope);
    const version = await this.redis.get(versionKey);
    const recentReads = await this.redis.zrevrange(readsKey, 0, 9);
    const recentWrites = await this.redis.zrevrange(writesKey, 0, 9);

    return {
      scope,
      currentVersion: parseInt(version) || 0,
      recentReads: recentReads.map(r => JSON.parse(r)),
      recentWrites: recentWrites.map(w => JSON.parse(w))
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close Redis connection
   */
  async close() {
    await this.redis.quit();
  }
}

module.exports = { StateManager, ConflictError };
