/**
 * ILUVATAR 2.0 - Budget Tracker
 *
 * Real-time cost tracking for Anthropic API usage.
 * Managed by Gollum agent (monitoring precious tokens and budget).
 */

const Redis = require('ioredis');

// Anthropic API pricing (USD per 1M tokens) - as of Dec 2024
const PRICING = {
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    thinking_input: 15.00,  // Extended thinking same as input
    thinking_output: 75.00
  },
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00
  },
  'claude-3-5-haiku-20241022': {
    input: 0.25,
    output: 1.25
  }
};

class BudgetTracker {
  constructor(redisClient, maxBudget = 100) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });

    this.maxBudget = maxBudget;
  }

  /**
   * Calculate cost for API call
   *
   * @param {Object} usage - Token usage object
   * @param {string} usage.model - Model name
   * @param {number} usage.input_tokens - Input tokens
   * @param {number} usage.output_tokens - Output tokens
   * @param {number} usage.thinking_tokens - Extended thinking tokens (optional)
   * @returns {number} Cost in USD
   */
  calculateCost(usage) {
    const pricing = PRICING[usage.model];
    if (!pricing) {
      console.warn(`[BudgetTracker] Unknown model: ${usage.model}`);
      return 0;
    }

    let cost = 0;

    // Input tokens cost
    cost += (usage.input_tokens / 1_000_000) * pricing.input;

    // Output tokens cost
    cost += (usage.output_tokens / 1_000_000) * pricing.output;

    // Extended thinking tokens (if applicable)
    if (usage.thinking_tokens && pricing.thinking_input) {
      cost += (usage.thinking_tokens / 1_000_000) * pricing.thinking_input;
    }

    return cost;
  }

  /**
   * Estimate cost before making API call
   *
   * @param {string} model - Model name
   * @param {number} estimatedInputTokens - Estimated input tokens
   * @param {number} estimatedOutputTokens - Estimated output tokens
   * @returns {number} Estimated cost in USD
   */
  estimateCost(model, estimatedInputTokens, estimatedOutputTokens = 4096) {
    return this.calculateCost({
      model,
      input_tokens: estimatedInputTokens,
      output_tokens: estimatedOutputTokens,
      thinking_tokens: 0
    });
  }

  /**
   * Pre-flight check before API call
   *
   * @param {string} agentId - Agent making the request
   * @param {string} model - Model to use
   * @param {number} estimatedInputTokens - Estimated input size
   * @returns {Promise<{allowed: boolean, reason: string, currentSpend: number, estimate: number}>}
   */
  async checkBudget(agentId, model, estimatedInputTokens) {
    const currentSpend = await this.getCurrentSpend();
    const estimate = this.estimateCost(model, estimatedInputTokens);

    const projectedSpend = currentSpend + estimate;
    const percentUsed = (projectedSpend / this.maxBudget) * 100;

    // Hard stop at 100%
    if (projectedSpend > this.maxBudget) {
      return {
        allowed: false,
        reason: `Budget exceeded. Current: $${currentSpend.toFixed(2)}, Estimate: $${estimate.toFixed(2)}, Max: $${this.maxBudget.toFixed(2)}`,
        currentSpend,
        estimate,
        percentUsed: 100
      };
    }

    // Warning at 90%
    if (percentUsed >= 90) {
      await this._sendAlert('budget_warning', {
        percentUsed: percentUsed.toFixed(1),
        currentSpend,
        maxBudget: this.maxBudget,
        agentId,
        estimate
      });
    }

    return {
      allowed: true,
      currentSpend,
      estimate,
      percentUsed
    };
  }

  /**
   * Track actual API usage after response
   *
   * @param {string} agentId - Agent that made the request
   * @param {Object} usage - Actual token usage from API response
   * @param {string} usage.model - Model used
   * @param {number} usage.input_tokens - Actual input tokens
   * @param {number} usage.output_tokens - Actual output tokens
   * @param {number} usage.thinking_tokens - Extended thinking tokens
   * @returns {Promise<{cost: number, totalSpend: number, percentUsed: number}>}
   */
  async trackUsage(agentId, usage) {
    const cost = this.calculateCost(usage);

    const multi = this.redis.multi();

    // Increment total spend
    multi.hincrbyfloat('budget:spend', 'total', cost);

    // Increment agent-specific spend
    multi.hincrbyfloat('budget:spend', `agent:${agentId}`, cost);

    // Increment model-specific spend
    multi.hincrbyfloat('budget:spend', `model:${usage.model}`, cost);

    // Log individual transaction
    multi.zadd('budget:transactions', Date.now(), JSON.stringify({
      timestamp: new Date().toISOString(),
      agentId,
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      thinking_tokens: usage.thinking_tokens || 0,
      cost: cost.toFixed(4)
    }));

    // Track token usage
    multi.hincrby('budget:tokens', 'total_input', usage.input_tokens);
    multi.hincrby('budget:tokens', 'total_output', usage.output_tokens);
    if (usage.thinking_tokens) {
      multi.hincrby('budget:tokens', 'total_thinking', usage.thinking_tokens);
    }

    await multi.exec();

    const totalSpend = await this.getCurrentSpend();
    const percentUsed = (totalSpend / this.maxBudget) * 100;

    // Alert if crossed 80% threshold
    if (percentUsed >= 80 && percentUsed < 90) {
      await this._sendAlert('budget_80_percent', { totalSpend, percentUsed, maxBudget: this.maxBudget });
    }

    return {
      cost,
      totalSpend,
      percentUsed,
      remaining: this.maxBudget - totalSpend
    };
  }

  /**
   * Get current total spend
   */
  async getCurrentSpend() {
    const total = await this.redis.hget('budget:spend', 'total');
    return parseFloat(total || 0);
  }

  /**
   * Get detailed spending breakdown
   */
  async getSpendingBreakdown() {
    const spend = await this.redis.hgetall('budget:spend');
    const tokens = await this.redis.hgetall('budget:tokens');
    const totalSpend = parseFloat(spend.total || 0);

    return {
      total: totalSpend,
      max_budget: this.maxBudget,
      remaining: this.maxBudget - totalSpend,
      percent_used: (totalSpend / this.maxBudget * 100).toFixed(2) + '%',
      by_agent: Object.entries(spend)
        .filter(([key]) => key.startsWith('agent:'))
        .map(([key, value]) => ({
          agent: key.replace('agent:', ''),
          spent: parseFloat(value).toFixed(2)
        }))
        .sort((a, b) => b.spent - a.spent),
      by_model: Object.entries(spend)
        .filter(([key]) => key.startsWith('model:'))
        .map(([key, value]) => ({
          model: key.replace('model:', ''),
          spent: parseFloat(value).toFixed(2)
        }))
        .sort((a, b) => b.spent - a.spent),
      tokens: {
        input: parseInt(tokens.total_input || 0),
        output: parseInt(tokens.total_output || 0),
        thinking: parseInt(tokens.total_thinking || 0)
      }
    };
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit = 50) {
    const transactions = await this.redis.zrevrange('budget:transactions', 0, limit - 1);
    return transactions.map(t => JSON.parse(t));
  }

  /**
   * Update budget limit (mid-hackathon adjustment)
   */
  async updateBudget(newMaxBudget) {
    this.maxBudget = newMaxBudget;
    await this.redis.hset('budget:config', 'max_budget', newMaxBudget);

    return {
      new_budget: newMaxBudget,
      current_spend: await this.getCurrentSpend(),
      remaining: newMaxBudget - await this.getCurrentSpend()
    };
  }

  /**
   * Reset budget tracking (for new hackathon)
   */
  async reset() {
    const multi = this.redis.multi();
    multi.del('budget:spend');
    multi.del('budget:tokens');
    multi.del('budget:transactions');
    await multi.exec();

    return { message: 'Budget reset successfully', max_budget: this.maxBudget };
  }

  /**
   * Send budget alerts to Discord via message bus
   * @private
   */
  async _sendAlert(alertType, data) {
    // Publish to message bus for Pippin (Discord agent)
    await this.redis.publish('agent:Pippin', JSON.stringify({
      from: 'Gollum',
      to: 'Pippin',
      type: 'budget_alert',
      alert_type: alertType,
      payload: data,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Get cost optimization suggestions
   */
  async getOptimizationSuggestions() {
    const breakdown = await this.getSpendingBreakdown();
    const suggestions = [];

    // Check if using too much Opus
    const opusSpend = breakdown.by_model.find(m => m.model.includes('opus'));
    if (opusSpend && parseFloat(opusSpend.spent) > breakdown.total * 0.7) {
      suggestions.push({
        type: 'model_downgrade',
        priority: 'high',
        message: 'Consider using Sonnet for non-critical tasks (reviews, testing)',
        potential_savings: (parseFloat(opusSpend.spent) * 0.3).toFixed(2)
      });
    }

    // Check if budget running low
    if (breakdown.remaining < breakdown.max_budget * 0.1) {
      suggestions.push({
        type: 'crunch_mode',
        priority: 'critical',
        message: 'Activate crunch mode: reduce extended thinking tokens, skip nice-to-haves',
        potential_savings: (breakdown.total * 0.2).toFixed(2)
      });
    }

    return suggestions;
  }

  /**
   * Close Redis connection
   */
  async close() {
    await this.redis.quit();
  }
}

module.exports = { BudgetTracker, PRICING };
