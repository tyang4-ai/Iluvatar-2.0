/**
 * ILUVATAR 2.0 - Checkpoint System
 *
 * Manages 11 checkpoints (6 major + 5 micro) with auto-approve timeouts.
 * Integrates with Pippin (Discord agent) for user interaction.
 */

const Redis = require('ioredis');

// Checkpoint definitions
const CHECKPOINTS = {
  // Major checkpoints (require explicit approval)
  1: {
    name: 'idea_approval',
    description: 'Review and approve generated hackathon ideas',
    type: 'major',
    auto_approve_minutes: 15,
    requires_user_input: true
  },
  2: {
    name: 'platform_selection',
    description: 'Confirm deployment platform and tech stack',
    type: 'major',
    auto_approve_minutes: 10,
    requires_user_input: true
  },
  3: {
    name: 'architecture_approval',
    description: 'Review and approve architecture plan',
    type: 'major',
    auto_approve_minutes: 15,
    requires_user_input: true
  },
  4: {
    name: 'code_complete',
    description: 'Verify code generation is complete',
    type: 'major',
    auto_approve_minutes: 5,
    requires_user_input: false  // Auto-approve if tests pass
  },
  5: {
    name: 'tests_passed',
    description: 'Confirm all tests are passing',
    type: 'major',
    auto_approve_minutes: 5,
    requires_user_input: false
  },
  6: {
    name: 'deployment_confirmation',
    description: 'Verify deployment successful and live',
    type: 'major',
    auto_approve_minutes: 5,
    requires_user_input: true
  },

  // Micro checkpoints (auto-approve by default)
  7: {
    name: 'tech_stack_confirmation',
    description: 'Quick confirmation of chosen tech stack',
    type: 'micro',
    auto_approve_minutes: 5,
    requires_user_input: false
  },
  8: {
    name: 'backend_routes_review',
    description: 'Review generated API routes',
    type: 'micro',
    auto_approve_minutes: 10,
    requires_user_input: false
  },
  9: {
    name: 'frontend_design_direction',
    description: 'Approve UI design direction',
    type: 'micro',
    auto_approve_minutes: 10,
    requires_user_input: false
  },
  10: {
    name: 'integration_smoke_test',
    description: 'Verify frontend-backend integration',
    type: 'micro',
    auto_approve_minutes: 5,
    requires_user_input: false
  },
  11: {
    name: 'demo_script_review',
    description: 'Review final demo presentation script',
    type: 'micro',
    auto_approve_minutes: 10,
    requires_user_input: false
  }
};

class CheckpointSystem {
  constructor(redisClient) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });
  }

  /**
   * Create a checkpoint and wait for user approval
   *
   * @param {number} checkpointId - Checkpoint ID (1-11)
   * @param {Object} data - Checkpoint data to present to user
   * @param {Object} options - Override options
   * @returns {Promise<{approved: boolean, user_feedback: string}>}
   */
  async createCheckpoint(checkpointId, data, options = {}) {
    const checkpoint = CHECKPOINTS[checkpointId];

    if (!checkpoint) {
      throw new Error(`Unknown checkpoint ID: ${checkpointId}`);
    }

    const checkpointData = {
      id: checkpointId,
      name: checkpoint.name,
      description: checkpoint.description,
      type: checkpoint.type,
      status: 'pending',
      created_at: new Date().toISOString(),
      data: data,
      auto_approve_minutes: options.auto_approve_minutes || checkpoint.auto_approve_minutes,
      requires_user_input: options.requires_user_input ?? checkpoint.requires_user_input,
      approved: false,
      user_feedback: null
    };

    // Store checkpoint state
    await this.redis.hset(
      'checkpoints:active',
      checkpointId.toString(),
      JSON.stringify(checkpointData)
    );

    // Log checkpoint creation
    await this.redis.zadd('checkpoints:log', Date.now(), JSON.stringify({
      timestamp: checkpointData.created_at,
      event: 'checkpoint_created',
      checkpoint_id: checkpointId,
      name: checkpoint.name
    }));

    // Send to Pippin (Discord agent) for user interaction
    await this.redis.publish('agent:Pippin', JSON.stringify({
      from: 'CheckpointSystem',
      to: 'Pippin',
      type: 'checkpoint_required',
      payload: checkpointData
    }));

    // Wait for approval or timeout
    const result = await this._waitForApproval(checkpointId, checkpointData.auto_approve_minutes);

    // Update checkpoint state
    checkpointData.status = result.approved ? 'approved' : 'rejected';
    checkpointData.approved = result.approved;
    checkpointData.user_feedback = result.user_feedback;
    checkpointData.resolved_at = new Date().toISOString();

    await this.redis.hset(
      'checkpoints:history',
      checkpointId.toString(),
      JSON.stringify(checkpointData)
    );

    // Remove from active
    await this.redis.hdel('checkpoints:active', checkpointId.toString());

    // Log resolution
    await this.redis.zadd('checkpoints:log', Date.now(), JSON.stringify({
      timestamp: checkpointData.resolved_at,
      event: result.approved ? 'checkpoint_approved' : 'checkpoint_rejected',
      checkpoint_id: checkpointId,
      name: checkpoint.name,
      auto_approved: result.auto_approved || false
    }));

    return result;
  }

  /**
   * Wait for user approval or timeout
   * @private
   */
  async _waitForApproval(checkpointId, timeoutMinutes) {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const pollIntervalMs = 2000;  // Check every 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Check if user has responded
      const response = await this.redis.hget('checkpoints:responses', checkpointId.toString());

      if (response) {
        const parsed = JSON.parse(response);

        // Clear response
        await this.redis.hdel('checkpoints:responses', checkpointId.toString());

        return {
          approved: parsed.approved,
          user_feedback: parsed.feedback,
          auto_approved: false
        };
      }

      // Wait before next poll
      await this._sleep(pollIntervalMs);
    }

    // Timeout - auto-approve
    return {
      approved: true,
      user_feedback: 'Auto-approved after timeout',
      auto_approved: true
    };
  }

  /**
   * User approves checkpoint (called by Pippin)
   */
  async approve(checkpointId, feedback = null) {
    await this.redis.hset('checkpoints:responses', checkpointId.toString(), JSON.stringify({
      approved: true,
      feedback: feedback,
      timestamp: new Date().toISOString()
    }));

    return { message: 'Checkpoint approved', checkpoint_id: checkpointId };
  }

  /**
   * User rejects checkpoint (called by Pippin)
   */
  async reject(checkpointId, feedback) {
    await this.redis.hset('checkpoints:responses', checkpointId.toString(), JSON.stringify({
      approved: false,
      feedback: feedback,
      timestamp: new Date().toISOString()
    }));

    return { message: 'Checkpoint rejected', checkpoint_id: checkpointId, feedback };
  }

  /**
   * Skip checkpoint (user override)
   */
  async skip(checkpointId) {
    return this.approve(checkpointId, 'User skipped checkpoint');
  }

  /**
   * Get active checkpoints
   */
  async getActiveCheckpoints() {
    const active = await this.redis.hgetall('checkpoints:active');

    return Object.entries(active).map(([id, data]) => ({
      id: parseInt(id),
      ...JSON.parse(data)
    }));
  }

  /**
   * Get checkpoint history
   */
  async getHistory() {
    const history = await this.redis.hgetall('checkpoints:history');

    return Object.entries(history).map(([id, data]) => ({
      id: parseInt(id),
      ...JSON.parse(data)
    })).sort((a, b) => a.id - b.id);
  }

  /**
   * Get checkpoint statistics
   */
  async getStats() {
    const history = await this.getHistory();
    const log = await this.redis.zrange('checkpoints:log', 0, -1);

    const totalCheckpoints = history.length;
    const approved = history.filter(c => c.approved).length;
    const rejected = history.filter(c => !c.approved).length;
    const autoApproved = log.filter(e => {
      const parsed = JSON.parse(e);
      return parsed.event === 'checkpoint_approved' && parsed.auto_approved;
    }).length;

    return {
      total_checkpoints: totalCheckpoints,
      approved: approved,
      rejected: rejected,
      auto_approved: autoApproved,
      manual_approvals: approved - autoApproved,
      approval_rate: totalCheckpoints > 0 ? (approved / totalCheckpoints * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Configure checkpoint behavior (user preferences)
   */
  async configure(config) {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...config };

    await this.redis.hset('checkpoints:config', 'settings', JSON.stringify(newConfig));

    return newConfig;
  }

  /**
   * Get current configuration
   */
  async getConfig() {
    const config = await this.redis.hget('checkpoints:config', 'settings');

    return config ? JSON.parse(config) : {
      auto_approve_all_micro: true,
      auto_approve_all_major: false,
      default_timeout_minutes: 15
    };
  }

  /**
   * Reset checkpoints for new hackathon
   */
  async reset() {
    const multi = this.redis.multi();
    multi.del('checkpoints:active');
    multi.del('checkpoints:responses');
    multi.del('checkpoints:history');
    multi.del('checkpoints:log');
    await multi.exec();

    return { message: 'Checkpoints reset successfully' };
  }

  /**
   * Sleep utility
   * @private
   */
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

module.exports = { CheckpointSystem, CHECKPOINTS };
