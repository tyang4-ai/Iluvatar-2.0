/**
 * ILUVATAR 2.0 - Error Handler
 *
 * Smart retry with error classification and 6-layer debugging pyramid integration.
 * Layer 1 of the debugging system (before escalating to Treebeard).
 */

const Redis = require('ioredis');

// Error taxonomy for smart retry
const ERROR_TYPES = {
  RATE_LIMIT: 'rate_limit',
  API_TIMEOUT: 'api_timeout',
  SYNTAX_ERROR: 'syntax_error',
  TEST_FAILURE: 'test_failure',
  DEPLOYMENT_ERROR: 'deployment_error',
  IMPORT_ERROR: 'import_error',
  TYPE_ERROR: 'type_error',
  AUTHENTICATION_ERROR: 'auth_error',
  NETWORK_ERROR: 'network_error',
  UNKNOWN: 'unknown'
};

// Retry strategies per error type
const RETRY_STRATEGIES = {
  [ERROR_TYPES.RATE_LIMIT]: {
    max_retries: 5,
    backoff: 'exponential',
    base_delay_ms: 2000,
    should_adjust_params: false
  },
  [ERROR_TYPES.API_TIMEOUT]: {
    max_retries: 3,
    backoff: 'linear',
    base_delay_ms: 1000,
    should_adjust_params: false
  },
  [ERROR_TYPES.SYNTAX_ERROR]: {
    max_retries: 1,
    backoff: 'none',
    base_delay_ms: 0,
    should_adjust_params: true,  // Lower temperature
    param_adjustments: { temperature: 0.3 }
  },
  [ERROR_TYPES.TEST_FAILURE]: {
    max_retries: 0,  // Escalate immediately to Treebeard
    backoff: 'none',
    base_delay_ms: 0,
    should_escalate: true
  },
  [ERROR_TYPES.DEPLOYMENT_ERROR]: {
    max_retries: 2,
    backoff: 'linear',
    base_delay_ms: 5000,
    should_adjust_params: true,
    param_adjustments: { validate_config: true }
  },
  [ERROR_TYPES.IMPORT_ERROR]: {
    max_retries: 1,
    backoff: 'none',
    base_delay_ms: 0,
    should_adjust_params: true,
    param_adjustments: { check_dependencies: true }
  },
  [ERROR_TYPES.TYPE_ERROR]: {
    max_retries: 1,
    backoff: 'none',
    base_delay_ms: 0,
    should_adjust_params: true,
    param_adjustments: { temperature: 0.2 }
  },
  [ERROR_TYPES.NETWORK_ERROR]: {
    max_retries: 3,
    backoff: 'exponential',
    base_delay_ms: 1000,
    should_adjust_params: false
  },
  [ERROR_TYPES.AUTHENTICATION_ERROR]: {
    max_retries: 0,
    backoff: 'none',
    base_delay_ms: 0,
    should_escalate: true  // Auth errors need human intervention
  },
  [ERROR_TYPES.UNKNOWN]: {
    max_retries: 2,
    backoff: 'linear',
    base_delay_ms: 2000,
    should_adjust_params: false
  }
};

class ErrorHandler {
  constructor(redisClient) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });
  }

  /**
   * Classify error based on message and context
   *
   * @param {Error} error - Error object
   * @param {Object} context - Error context (agent, file, operation)
   * @returns {string} Error type from ERROR_TYPES
   */
  classifyError(error, context = {}) {
    const message = error.message || error.toString();
    const messageLower = message.toLowerCase();

    // Rate limit detection
    if (messageLower.includes('rate limit') || messageLower.includes('429') ||
        messageLower.includes('too many requests')) {
      return ERROR_TYPES.RATE_LIMIT;
    }

    // API timeout
    if (messageLower.includes('timeout') || messageLower.includes('timed out') ||
        messageLower.includes('504') || messageLower.includes('gateway timeout')) {
      return ERROR_TYPES.API_TIMEOUT;
    }

    // Syntax errors
    if (messageLower.includes('syntaxerror') || messageLower.includes('unexpected token') ||
        messageLower.includes('parsing error') || messageLower.includes('invalid syntax')) {
      return ERROR_TYPES.SYNTAX_ERROR;
    }

    // Test failures
    if (messageLower.includes('test failed') || messageLower.includes('assertion') ||
        messageLower.includes('expected') && messageLower.includes('received')) {
      return ERROR_TYPES.TEST_FAILURE;
    }

    // Import/Module errors
    if (messageLower.includes('cannot find module') || messageLower.includes('modulenotfounderror') ||
        messageLower.includes('import') && messageLower.includes('failed')) {
      return ERROR_TYPES.IMPORT_ERROR;
    }

    // Type errors
    if (messageLower.includes('typeerror') || messageLower.includes('is not a function') ||
        messageLower.includes('undefined is not')) {
      return ERROR_TYPES.TYPE_ERROR;
    }

    // Authentication
    if (messageLower.includes('unauthorized') || messageLower.includes('401') ||
        messageLower.includes('authentication') || messageLower.includes('invalid api key')) {
      return ERROR_TYPES.AUTHENTICATION_ERROR;
    }

    // Network errors
    if (messageLower.includes('network') || messageLower.includes('econnrefused') ||
        messageLower.includes('enotfound') || messageLower.includes('connection')) {
      return ERROR_TYPES.NETWORK_ERROR;
    }

    // Deployment errors
    if (context.operation === 'deployment' || messageLower.includes('deploy') ||
        messageLower.includes('build failed')) {
      return ERROR_TYPES.DEPLOYMENT_ERROR;
    }

    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Smart retry with exponential/linear backoff
   *
   * @param {Function} operation - Async function to retry
   * @param {Object} context - Context (agentId, file, operation type)
   * @returns {Promise<any>} Operation result or throws after max retries
   */
  async retry(operation, context = {}) {
    let lastError;
    let attempt = 0;
    let errorType = null;

    while (true) {
      try {
        const result = await operation(attempt);

        // Success - log recovery if there were previous errors
        if (attempt > 0) {
          await this._logSuccess(context, errorType, attempt);
        }

        return result;

      } catch (error) {
        lastError = error;
        errorType = this.classifyError(error, context);
        const strategy = RETRY_STRATEGIES[errorType];

        attempt++;

        // Log error
        await this._logError(error, errorType, context, attempt);

        // Check if should escalate immediately
        if (strategy.should_escalate) {
          await this._escalateToTreebeard(error, errorType, context, attempt);
          throw error;  // Re-throw to stop retry loop
        }

        // Check if max retries exceeded
        if (attempt > strategy.max_retries) {
          // Escalate to Layer 2 (Treebeard)
          await this._escalateToTreebeard(error, errorType, context, attempt);
          throw new Error(
            `Max retries (${strategy.max_retries}) exceeded for ${errorType}. ` +
            `Original error: ${error.message}`
          );
        }

        // Calculate backoff delay
        const delay = this._calculateDelay(strategy, attempt);

        // Wait before retry
        if (delay > 0) {
          await this._sleep(delay);
        }

        // Log retry attempt
        await this._logRetry(context, errorType, attempt, delay);
      }
    }
  }

  /**
   * Calculate backoff delay
   * @private
   */
  _calculateDelay(strategy, attempt) {
    if (strategy.backoff === 'exponential') {
      return strategy.base_delay_ms * Math.pow(2, attempt - 1);
    } else if (strategy.backoff === 'linear') {
      return strategy.base_delay_ms * attempt;
    }
    return 0;
  }

  /**
   * Sleep for specified milliseconds
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log error occurrence
   * @private
   */
  async _logError(error, errorType, context, attempt) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error_type: errorType,
      message: error.message,
      stack: error.stack,
      context: context,
      attempt: attempt
    };

    await this.redis.zadd('errors:log', Date.now(), JSON.stringify(errorLog));
    await this.redis.hincrby('errors:counts', errorType, 1);

    if (context.agentId) {
      await this.redis.hincrby('errors:by_agent', context.agentId, 1);
    }
  }

  /**
   * Log retry attempt
   * @private
   */
  async _logRetry(context, errorType, attempt, delay) {
    const retryLog = {
      timestamp: new Date().toISOString(),
      event: 'retry_attempt',
      error_type: errorType,
      attempt: attempt,
      delay_ms: delay,
      context: context
    };

    await this.redis.zadd('errors:retries', Date.now(), JSON.stringify(retryLog));
  }

  /**
   * Log successful recovery
   * @private
   */
  async _logSuccess(context, errorType, attempts) {
    const successLog = {
      timestamp: new Date().toISOString(),
      event: 'error_recovered',
      error_type: errorType,
      attempts_taken: attempts,
      context: context
    };

    await this.redis.zadd('errors:recoveries', Date.now(), JSON.stringify(successLog));
    await this.redis.hincrby('errors:recovery_counts', errorType, 1);
  }

  /**
   * Escalate to Treebeard (Layer 2 debugging)
   * @private
   */
  async _escalateToTreebeard(error, errorType, context, attempts) {
    const escalation = {
      timestamp: new Date().toISOString(),
      event: 'escalate_to_treebeard',
      error_type: errorType,
      error_message: error.message,
      error_stack: error.stack,
      context: context,
      layer_1_attempts: attempts,
      reason: attempts > RETRY_STRATEGIES[errorType].max_retries
        ? 'max_retries_exceeded'
        : 'immediate_escalation'
    };

    // Publish escalation to Treebeard
    await this.redis.publish('agent:Treebeard', JSON.stringify({
      from: 'ErrorHandler',
      to: 'Treebeard',
      type: 'debugging_request',
      priority: 'high',
      payload: escalation
    }));

    await this.redis.zadd('errors:escalations', Date.now(), JSON.stringify(escalation));
  }

  /**
   * Get error statistics
   */
  async getStats() {
    const counts = await this.redis.hgetall('errors:counts');
    const recoveryCounts = await this.redis.hgetall('errors:recovery_counts');
    const byAgent = await this.redis.hgetall('errors:by_agent');

    const totalErrors = Object.values(counts).reduce((sum, count) => sum + parseInt(count), 0);
    const totalRecoveries = Object.values(recoveryCounts).reduce((sum, count) => sum + parseInt(count), 0);

    return {
      total_errors: totalErrors,
      total_recoveries: totalRecoveries,
      recovery_rate: totalErrors > 0 ? (totalRecoveries / totalErrors * 100).toFixed(2) + '%' : '0%',
      by_type: counts,
      recoveries_by_type: recoveryCounts,
      by_agent: byAgent
    };
  }

  /**
   * Get recent errors
   */
  async getRecentErrors(limit = 50) {
    const errors = await this.redis.zrevrange('errors:log', 0, limit - 1);
    return errors.map(e => JSON.parse(e));
  }

  /**
   * Get recent escalations to Treebeard
   */
  async getEscalations(limit = 20) {
    const escalations = await this.redis.zrevrange('errors:escalations', 0, limit - 1);
    return escalations.map(e => JSON.parse(e));
  }

  /**
   * Clear error logs (cleanup)
   */
  async clearLogs(olderThanDays = 7) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    const removedErrors = await this.redis.zremrangebyscore('errors:log', '-inf', cutoff);
    const removedRetries = await this.redis.zremrangebyscore('errors:retries', '-inf', cutoff);
    const removedRecoveries = await this.redis.zremrangebyscore('errors:recoveries', '-inf', cutoff);

    return {
      removed_errors: removedErrors,
      removed_retries: removedRetries,
      removed_recoveries: removedRecoveries
    };
  }

  /**
   * Close Redis connection
   */
  async close() {
    await this.redis.quit();
  }
}

module.exports = { ErrorHandler, ERROR_TYPES, RETRY_STRATEGIES };
