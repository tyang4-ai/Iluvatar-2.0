/**
 * ILUVATAR 2.0 - Time Tracker
 *
 * Burndown tracking, velocity calculation, and crunch mode triggers.
 * Critical for Radagast's time-aware architecture planning.
 */

const Redis = require('ioredis');

class TimeTracker {
  constructor(redisClient) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });
  }

  /**
   * Initialize time tracking for a hackathon
   *
   * @param {Object} hackathon - Hackathon details
   * @param {string} hackathon.id - Unique hackathon ID
   * @param {string} hackathon.deadline - ISO 8601 deadline
   * @param {Object} hackathon.phases - Phase time budgets
   */
  async initialize(hackathon) {
    const startTime = new Date().toISOString();
    const deadlineTime = new Date(hackathon.deadline);
    const totalHours = (deadlineTime - new Date()) / (1000 * 60 * 60);

    const timeData = {
      hackathon_id: hackathon.id,
      start_time: startTime,
      deadline: hackathon.deadline,
      total_hours: totalHours.toFixed(2),
      phases: hackathon.phases || this._getDefaultPhases(totalHours),
      completed_files: 0,
      total_files_estimated: 0,
      velocity: 0,  // files per hour
      crunch_mode: false,
      crunch_mode_activated_at: null
    };

    await this.redis.hset('time:tracking', 'data', JSON.stringify(timeData));
    await this.redis.zadd('time:events', Date.now(), JSON.stringify({
      timestamp: startTime,
      event: 'hackathon_started',
      total_hours: totalHours
    }));

    return timeData;
  }

  /**
   * Get default phase allocation based on total time
   * @private
   */
  _getDefaultPhases(totalHours) {
    return {
      ideation: { budget_hours: totalHours * 0.04, status: 'pending' },
      planning: { budget_hours: totalHours * 0.06, status: 'pending' },
      backend: { budget_hours: totalHours * 0.25, status: 'pending' },
      frontend: { budget_hours: totalHours * 0.29, status: 'pending' },
      integration: { budget_hours: totalHours * 0.08, status: 'pending' },
      testing: { budget_hours: totalHours * 0.13, status: 'pending' },
      deployment: { budget_hours: totalHours * 0.04, status: 'pending' },
      polish: { budget_hours: totalHours * 0.06, status: 'pending' },
      buffer: { budget_hours: totalHours * 0.05, status: 'pending' }
    };
  }

  /**
   * Mark phase as started
   */
  async startPhase(phaseName) {
    const data = await this._getData();
    const phase = data.phases[phaseName];

    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    phase.status = 'in_progress';
    phase.started_at = new Date().toISOString();

    await this._saveData(data);
    await this._logEvent('phase_started', { phase: phaseName });

    return phase;
  }

  /**
   * Mark phase as completed
   */
  async completePhase(phaseName) {
    const data = await this._getData();
    const phase = data.phases[phaseName];

    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    phase.status = 'completed';
    phase.completed_at = new Date().toISOString();

    const startTime = new Date(phase.started_at);
    const endTime = new Date(phase.completed_at);
    phase.actual_hours = ((endTime - startTime) / (1000 * 60 * 60)).toFixed(2);
    phase.variance_hours = (phase.actual_hours - phase.budget_hours).toFixed(2);

    await this._saveData(data);
    await this._logEvent('phase_completed', {
      phase: phaseName,
      actual_hours: phase.actual_hours,
      variance: phase.variance_hours
    });

    return phase;
  }

  /**
   * Track file completion (for velocity calculation)
   */
  async trackFileCompletion(fileName, agentId) {
    const data = await this._getData();
    data.completed_files++;

    // Calculate velocity
    const elapsedHours = await this.getElapsedHours();
    if (elapsedHours > 0) {
      data.velocity = (data.completed_files / elapsedHours).toFixed(2);
    }

    await this._saveData(data);
    await this._logEvent('file_completed', {
      file: fileName,
      agent: agentId,
      total_completed: data.completed_files,
      velocity: data.velocity
    });

    return {
      completed_files: data.completed_files,
      velocity: parseFloat(data.velocity)
    };
  }

  /**
   * Update total files estimate (from Radagast's architecture)
   */
  async setTotalFilesEstimate(totalFiles) {
    const data = await this._getData();
    data.total_files_estimated = totalFiles;
    await this._saveData(data);

    return { total_files_estimated: totalFiles };
  }

  /**
   * Get current time status
   */
  async getStatus() {
    const data = await this._getData();
    const elapsedHours = await this.getElapsedHours();
    const remainingHours = await this.getRemainingHours();
    const totalHours = parseFloat(data.total_hours);
    const percentElapsed = (elapsedHours / totalHours * 100).toFixed(1);

    // Calculate progress
    const completedFiles = data.completed_files;
    const totalFiles = data.total_files_estimated;
    const percentComplete = totalFiles > 0 ? (completedFiles / totalFiles * 100).toFixed(1) : 0;

    // Predict completion time
    const velocity = parseFloat(data.velocity);
    const remainingFiles = totalFiles - completedFiles;
    const hoursNeeded = velocity > 0 ? (remainingFiles / velocity).toFixed(1) : '?';
    const onTrack = velocity > 0 ? (parseFloat(hoursNeeded) <= remainingHours) : null;

    // Check for crunch mode triggers
    const crunchModeShouldActivate = this._shouldActivateCrunchMode(percentElapsed, data.crunch_mode);

    return {
      elapsed_hours: elapsedHours.toFixed(1),
      remaining_hours: remainingHours.toFixed(1),
      total_hours: totalHours.toFixed(1),
      percent_elapsed: parseFloat(percentElapsed),
      percent_complete: parseFloat(percentComplete),
      velocity: velocity,
      completed_files: completedFiles,
      total_files: totalFiles,
      remaining_files: remainingFiles,
      estimated_hours_needed: hoursNeeded,
      on_track: onTrack,
      status: onTrack === null ? 'unknown' : (onTrack ? 'on_time' : 'behind_schedule'),
      crunch_mode: data.crunch_mode,
      should_activate_crunch: crunchModeShouldActivate,
      deadline: data.deadline
    };
  }

  /**
   * Get elapsed hours since start
   */
  async getElapsedHours() {
    const data = await this._getData();
    if (!data.start_time) return 0;

    const startTime = new Date(data.start_time);
    const now = new Date();
    return (now - startTime) / (1000 * 60 * 60);
  }

  /**
   * Get remaining hours until deadline
   */
  async getRemainingHours() {
    const data = await this._getData();
    if (!data.deadline) return 0;

    const deadline = new Date(data.deadline);
    const now = new Date();
    const remaining = (deadline - now) / (1000 * 60 * 60);
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Check if crunch mode should be activated
   * @private
   */
  _shouldActivateCrunchMode(percentElapsed, alreadyActivated) {
    if (alreadyActivated) return false;

    // Activate at 90% time elapsed
    return percentElapsed >= 90;
  }

  /**
   * Activate crunch mode
   */
  async activateCrunchMode(reason = 'auto') {
    const data = await this._getData();

    if (data.crunch_mode) {
      return { message: 'Crunch mode already active', activated_at: data.crunch_mode_activated_at };
    }

    data.crunch_mode = true;
    data.crunch_mode_activated_at = new Date().toISOString();

    await this._saveData(data);
    await this._logEvent('crunch_mode_activated', { reason });

    // Alert all agents via message bus
    await this.redis.publish('agent:broadcast', JSON.stringify({
      from: 'Gollum',
      to: '*',
      type: 'crunch_mode_activated',
      timestamp: data.crunch_mode_activated_at,
      payload: {
        reason,
        message: 'Cut all nice-to-haves, focus on demoable core only'
      }
    }));

    return {
      message: 'Crunch mode activated',
      activated_at: data.crunch_mode_activated_at,
      reason
    };
  }

  /**
   * Get burndown chart data
   */
  async getBurndownData() {
    const data = await this._getData();
    const events = await this.redis.zrange('time:events', 0, -1);

    const fileCompletions = events
      .map(e => JSON.parse(e))
      .filter(e => e.event === 'file_completed')
      .map(e => ({
        timestamp: e.timestamp,
        completed_files: e.payload.total_completed,
        velocity: parseFloat(e.payload.velocity)
      }));

    const totalHours = parseFloat(data.total_hours);
    const totalFiles = data.total_files_estimated;

    // Ideal burndown line
    const idealBurndown = [];
    for (let h = 0; h <= totalHours; h += totalHours / 10) {
      idealBurndown.push({
        hour: h.toFixed(1),
        files_remaining: Math.max(0, totalFiles - (totalFiles / totalHours * h)).toFixed(0)
      });
    }

    return {
      ideal_burndown: idealBurndown,
      actual_progress: fileCompletions,
      total_files: totalFiles,
      total_hours: totalHours
    };
  }

  /**
   * Get velocity trend (last N hours)
   */
  async getVelocityTrend(hoursWindow = 6) {
    const events = await this.redis.zrange('time:events', 0, -1);
    const now = Date.now();
    const windowStart = now - (hoursWindow * 60 * 60 * 1000);

    const recentCompletions = events
      .map(e => JSON.parse(e))
      .filter(e => e.event === 'file_completed' && e.timestamp >= windowStart);

    const velocityByHour = {};
    recentCompletions.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      velocityByHour[hour] = (velocityByHour[hour] || 0) + 1;
    });

    return {
      window_hours: hoursWindow,
      completions_in_window: recentCompletions.length,
      velocity_last_window: (recentCompletions.length / hoursWindow).toFixed(2),
      by_hour: velocityByHour
    };
  }

  /**
   * Internal: Get data from Redis
   * @private
   */
  async _getData() {
    const raw = await this.redis.hget('time:tracking', 'data');
    return JSON.parse(raw || '{}');
  }

  /**
   * Internal: Save data to Redis
   * @private
   */
  async _saveData(data) {
    await this.redis.hset('time:tracking', 'data', JSON.stringify(data));
  }

  /**
   * Internal: Log event to timeline
   * @private
   */
  async _logEvent(eventType, payload) {
    await this.redis.zadd('time:events', Date.now(), JSON.stringify({
      timestamp: new Date().toISOString(),
      event: eventType,
      payload
    }));
  }

  /**
   * Close Redis connection
   */
  async close() {
    await this.redis.quit();
  }
}

module.exports = { TimeTracker };
