/**
 * ILUVATAR 2.0 - Structured Logging
 *
 * Centralized logging with tracing, correlation IDs, and Grafana integration.
 * Supports multiple log levels and structured JSON output.
 */

const Redis = require('ioredis');
const crypto = require('crypto');

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

class Logger {
  constructor(redisClient, options = {}) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });

    this.minLevel = options.minLevel !== undefined ? options.minLevel : LOG_LEVELS.INFO;
    this.enableConsole = options.enableConsole !== false;
    this.enableRedis = options.enableRedis !== false;
  }

  /**
   * Create a child logger with context
   *
   * @param {Object} context - Persistent context (agentId, hackathonId, etc.)
   * @returns {Logger} Child logger instance
   */
  child(context) {
    const childLogger = Object.create(this);
    childLogger.context = { ...(this.context || {}), ...context };
    return childLogger;
  }

  /**
   * Log debug message
   */
  async debug(message, meta = {}) {
    return this._log(LOG_LEVELS.DEBUG, message, meta);
  }

  /**
   * Log info message
   */
  async info(message, meta = {}) {
    return this._log(LOG_LEVELS.INFO, message, meta);
  }

  /**
   * Log warning message
   */
  async warn(message, meta = {}) {
    return this._log(LOG_LEVELS.WARN, message, meta);
  }

  /**
   * Log error message
   */
  async error(message, meta = {}) {
    return this._log(LOG_LEVELS.ERROR, message, meta);
  }

  /**
   * Log critical error (alerts triggered)
   */
  async critical(message, meta = {}) {
    const logEntry = await this._log(LOG_LEVELS.CRITICAL, message, meta);

    // Send alert to Discord via Pippin
    await this.redis.publish('agent:Pippin', JSON.stringify({
      from: 'Logger',
      to: 'Pippin',
      type: 'critical_alert',
      payload: logEntry
    }));

    return logEntry;
  }

  /**
   * Internal logging method
   * @private
   */
  async _log(level, message, meta = {}) {
    // Check if should log based on min level
    if (level < this.minLevel) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: this._getLevelName(level),
      message: message,
      trace_id: meta.trace_id || this.context?.trace_id || crypto.randomUUID(),
      agent_id: meta.agent_id || this.context?.agent_id,
      hackathon_id: meta.hackathon_id || this.context?.hackathon_id,
      file: meta.file,
      line: meta.line,
      meta: meta,
      context: this.context
    };

    // Console output (for development)
    if (this.enableConsole) {
      this._consoleLog(level, logEntry);
    }

    // Redis storage (for production/Grafana)
    if (this.enableRedis) {
      await this._redisLog(level, logEntry);
    }

    return logEntry;
  }

  /**
   * Get level name from number
   * @private
   */
  _getLevelName(level) {
    const names = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    return names[level] || 'UNKNOWN';
  }

  /**
   * Console output with colors
   * @private
   */
  _consoleLog(level, entry) {
    const colors = {
      0: '\x1b[36m',  // DEBUG - Cyan
      1: '\x1b[32m',  // INFO - Green
      2: '\x1b[33m',  // WARN - Yellow
      3: '\x1b[31m',  // ERROR - Red
      4: '\x1b[35m'   // CRITICAL - Magenta
    };
    const reset = '\x1b[0m';

    const color = colors[level] || '';
    const prefix = entry.agent_id ? `[${entry.agent_id}]` : '[SYSTEM]';

    console.log(
      `${color}${entry.timestamp} ${entry.level} ${prefix}${reset} ${entry.message}`,
      entry.meta && Object.keys(entry.meta).length > 0 ? entry.meta : ''
    );
  }

  /**
   * Store in Redis (sorted set by timestamp)
   * @private
   */
  async _redisLog(level, entry) {
    const serialized = JSON.stringify(entry);

    // Store in main log
    await this.redis.zadd('logs:all', Date.now(), serialized);

    // Store in level-specific log
    const levelName = this._getLevelName(level).toLowerCase();
    await this.redis.zadd(`logs:${levelName}`, Date.now(), serialized);

    // Store in agent-specific log (if agent_id present)
    if (entry.agent_id) {
      await this.redis.zadd(`logs:agent:${entry.agent_id}`, Date.now(), serialized);
    }

    // Store in trace-specific log (for correlation)
    if (entry.trace_id) {
      await this.redis.zadd(`logs:trace:${entry.trace_id}`, Date.now(), serialized);
    }

    // Increment counters
    await this.redis.hincrby('logs:stats', `count:${levelName}`, 1);

    if (entry.agent_id) {
      await this.redis.hincrby('logs:stats', `agent:${entry.agent_id}`, 1);
    }
  }

  /**
   * Get recent logs
   */
  async getLogs(options = {}) {
    const {
      level = 'all',
      agent_id = null,
      trace_id = null,
      limit = 100,
      offset = 0
    } = options;

    let key = 'logs:all';

    if (trace_id) {
      key = `logs:trace:${trace_id}`;
    } else if (agent_id) {
      key = `logs:agent:${agent_id}`;
    } else if (level !== 'all') {
      key = `logs:${level.toLowerCase()}`;
    }

    const logs = await this.redis.zrevrange(key, offset, offset + limit - 1);
    return logs.map(log => JSON.parse(log));
  }

  /**
   * Get logs for a specific trace (correlation)
   */
  async getTraceLogs(trace_id) {
    return this.getLogs({ trace_id, limit: 1000 });
  }

  /**
   * Get log statistics
   */
  async getStats() {
    const stats = await this.redis.hgetall('logs:stats');
    const totalLogs = await this.redis.zcard('logs:all');

    return {
      total_logs: totalLogs,
      by_level: {
        debug: parseInt(stats['count:debug'] || 0),
        info: parseInt(stats['count:info'] || 0),
        warn: parseInt(stats['count:warn'] || 0),
        error: parseInt(stats['count:error'] || 0),
        critical: parseInt(stats['count:critical'] || 0)
      },
      by_agent: Object.entries(stats)
        .filter(([key]) => key.startsWith('agent:'))
        .map(([key, value]) => ({
          agent: key.replace('agent:', ''),
          count: parseInt(value)
        }))
        .sort((a, b) => b.count - a.count)
    };
  }

  /**
   * Search logs by message content
   */
  async search(query, options = {}) {
    const { limit = 50, level = 'all' } = options;

    const key = level === 'all' ? 'logs:all' : `logs:${level.toLowerCase()}`;
    const allLogs = await this.redis.zrevrange(key, 0, limit * 10);  // Get more to search through

    const results = allLogs
      .map(log => JSON.parse(log))
      .filter(log => {
        const messageLower = log.message.toLowerCase();
        const queryLower = query.toLowerCase();
        return messageLower.includes(queryLower);
      })
      .slice(0, limit);

    return results;
  }

  /**
   * Clean up old logs
   */
  async cleanup(olderThanDays = 7) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    const keys = [
      'logs:all',
      'logs:debug',
      'logs:info',
      'logs:warn',
      'logs:error',
      'logs:critical'
    ];

    const results = {};
    for (const key of keys) {
      const removed = await this.redis.zremrangebyscore(key, '-inf', cutoff);
      results[key] = removed;
    }

    return results;
  }

  /**
   * Export logs to JSON file (for debugging)
   */
  async exportLogs(options = {}) {
    const logs = await this.getLogs(options);

    return {
      exported_at: new Date().toISOString(),
      log_count: logs.length,
      filters: options,
      logs: logs
    };
  }

  /**
   * Close Redis connection
   */
  async close() {
    await this.redis.quit();
  }
}

// Create singleton instance
let globalLogger = null;

function createLogger(redisClient, options) {
  globalLogger = new Logger(redisClient, options);
  return globalLogger;
}

function getLogger() {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

module.exports = {
  Logger,
  LOG_LEVELS,
  createLogger,
  getLogger
};
