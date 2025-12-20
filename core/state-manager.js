/**
 * ILUVATAR 2.0 - Redis State Manager
 *
 * Manages shared state with optimistic locking to prevent race conditions.
 * Multiple agents can read concurrently, but writes use version-based locks.
 */

const Redis = require('ioredis');

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
   * @param {string[]} keys - Keys to read (use ['*'] for all)
   * @returns {Promise<{data: Object, version: number}>}
   */
  async read(agentId, keys) {
    const multi = this.redis.multi();

    // Get current version
    multi.get('state:version');

    // Get requested keys
    if (keys.includes('*')) {
      multi.hgetall('state:data');
    } else {
      keys.forEach(key => {
        multi.hget('state:data', key);
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

    // Log read for debugging
    await this.redis.zadd('state:reads', Date.now(),
      JSON.stringify({ agentId, keys, version, timestamp: Date.now() })
    );

    return { data, version };
  }

  /**
   * Write shared state (optimistic locking)
   * Throws ConflictError if version mismatch
   *
   * @param {string} agentId - Agent making the request
   * @param {Object} updates - Key-value pairs to update
   * @param {number} expectedVersion - Expected current version
   * @returns {Promise<{success: boolean, newVersion: number}>}
   */
  async write(agentId, updates, expectedVersion) {
    // WATCH for version changes (optimistic locking)
    await this.redis.watch('state:version');

    const currentVersion = parseInt(await this.redis.get('state:version')) || 0;

    // Version mismatch = another agent wrote in between
    if (currentVersion !== expectedVersion) {
      await this.redis.unwatch();
      throw new ConflictError(
        `State version mismatch. Expected ${expectedVersion}, got ${currentVersion}. ` +
        `Another agent modified state. Retry with fresh read.`
      );
    }

    // Atomic write (MULTI/EXEC transaction)
    const multi = this.redis.multi();

    // Increment version
    multi.incr('state:version');

    // Update all fields
    Object.entries(updates).forEach(([key, value]) => {
      multi.hset('state:data', key, JSON.stringify(value));
    });

    // Log write for debugging
    multi.zadd('state:writes', Date.now(),
      JSON.stringify({
        agentId,
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
      throw new ConflictError('Write aborted due to concurrent modification');
    }
  }

  /**
   * Retry logic for write conflicts
   * Automatically retries on ConflictError
   *
   * @param {string} agentId - Agent making the request
   * @param {Function} updateFn - Function that takes current data and returns updates
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<{success: boolean, newVersion: number}>}
   */
  async writeWithRetry(agentId, updateFn, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Read current state
        const { data, version } = await this.read(agentId, ['*']);

        // User-provided function computes updates based on current state
        const updates = await updateFn(data);

        // Try to write
        return await this.write(agentId, updates, version);
      } catch (err) {
        if (err instanceof ConflictError && attempt < maxRetries - 1) {
          // Exponential backoff
          await this._sleep(100 * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to write after ${maxRetries} attempts`);
  }

  /**
   * Get specific key from state
   */
  async get(key) {
    const value = await this.redis.hget('state:data', key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * Set specific key (without versioning - use for simple updates)
   */
  async set(key, value) {
    return await this.redis.hset('state:data', key, JSON.stringify(value));
  }

  /**
   * Delete keys from state
   */
  async delete(keys) {
    if (Array.isArray(keys)) {
      return await this.redis.hdel('state:data', ...keys);
    }
    return await this.redis.hdel('state:data', keys);
  }

  /**
   * Clear all state (DANGEROUS - use for testing only)
   */
  async clear() {
    const multi = this.redis.multi();
    multi.del('state:data');
    multi.del('state:version');
    multi.del('state:reads');
    multi.del('state:writes');
    return await multi.exec();
  }

  /**
   * Get debugging information
   */
  async getDebugInfo() {
    const version = await this.redis.get('state:version');
    const recentReads = await this.redis.zrevrange('state:reads', 0, 9);
    const recentWrites = await this.redis.zrevrange('state:writes', 0, 9);

    return {
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
