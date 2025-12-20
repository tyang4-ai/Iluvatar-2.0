/**
 * ILUVATAR 3.0 - Event Dispatcher
 *
 * Routes events to appropriate agents based on triggers.
 * Handles event-driven, situational, and support agents.
 */

const EventEmitter = require('events');

/**
 * Agent trigger configuration
 */
const AGENT_TRIGGERS = {
  // Tier 2: Event-Triggered Agents
  shadowfax: {
    tier: 'event',
    events: ['context_warning'],
    webhook: '/event/context-warning',
    description: 'Context compression when tokens > 80%'
  },
  galadriel: {
    tier: 'event',
    events: ['file_written', 'file_completed'],
    webhook: '/event/file-written',
    description: 'Code review after file generation'
  },
  elrond: {
    tier: 'event',
    events: ['test_failed', 'build_error', 'lint_error'],
    webhook: '/event/test-failed',
    description: 'Debug analysis on failures'
  },
  faramir: {
    tier: 'event',
    events: ['pre_submission', 'build_complete'],
    webhook: '/event/pre-submission',
    description: 'Quality scoring before submission'
  },

  // Tier 3: Situational Agents
  treebeard: {
    tier: 'situational',
    redisCheck: 'status:rate_limited',
    checkValue: 'true',
    webhook: '/situational/patience',
    description: 'Patience mode when rate limited'
  },
  aragorn: {
    tier: 'situational',
    redisCheck: 'decisions:pending',
    checkOperator: '>',
    checkValue: 0,
    webhook: '/situational/leadership',
    description: 'Leadership decisions on conflicts'
  },
  eowyn: {
    tier: 'situational',
    redisCheck: 'blocked:reason',
    checkValue: 'impossible',
    webhook: '/situational/unconventional',
    description: 'Unconventional solutions for blocks'
  },

  // Tier 4: Support Agents
  gollum: {
    tier: 'support',
    events: ['tests_passed'],
    webhook: '/support/edge-cases',
    description: 'Edge case testing after tests pass'
  },
  pippin: {
    tier: 'support',
    randomTrigger: 0.05,
    webhook: '/support/serendipity',
    description: 'Random exploration (5% chance)'
  },
  merry: {
    tier: 'support',
    events: ['clone_needs_help'],
    webhook: '/support/help-clone',
    description: 'Support for struggling clones'
  },
  quickbeam: {
    tier: 'support',
    events: ['pre_agent_call'],
    webhook: '/support/prefetch',
    description: 'Speculative pre-fetching'
  },
  bilbo: {
    tier: 'support',
    events: ['user_feedback', 'user_preference'],
    webhook: '/support/user-prefs',
    description: 'User preference learning'
  },
  arwen: {
    tier: 'support',
    events: ['architecture_approved'],
    webhook: '/support/test-plan',
    description: 'Test plan generation'
  },
  thorin: {
    tier: 'support',
    events: ['test_plan_ready'],
    webhook: '/support/write-tests',
    description: 'Test file writing'
  },
  eomer: {
    tier: 'support',
    events: ['code_complete', 'pre_deployment'],
    webhook: '/support/deploy',
    description: 'Deployment configuration'
  },
  haldir: {
    tier: 'support',
    events: ['deployment_complete'],
    webhook: '/support/verify-deploy',
    description: 'Deployment verification'
  },
  historian: {
    tier: 'support',
    events: ['archive_query'],
    webhook: '/support/archive-query',
    description: 'Archive Q&A'
  },
  scribe: {
    tier: 'support',
    events: ['hackathon_complete'],
    webhook: '/support/write-experience',
    description: 'Experience summary writing'
  },
  librarian: {
    tier: 'support',
    events: ['repo_query', 'structure_query'],
    webhook: '/support/repo-query',
    description: 'Repository organization'
  }
};

class EventDispatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = options.redis;
    this.n8nWebhookBase = options.n8nWebhookBase || 'http://n8n:5678/webhook';
    this.httpClient = options.httpClient || require('axios');
    this.agentTriggers = { ...AGENT_TRIGGERS, ...options.customTriggers };
    this.situationalCheckInterval = options.situationalCheckInterval || 30000;
    this.activeHackathons = new Map();
    this.situationalTimer = null;

    // Build event-to-agent index
    this.eventAgentIndex = this._buildEventIndex();
  }

  /**
   * Build index mapping events to agents
   */
  _buildEventIndex() {
    const index = {};
    for (const [agent, config] of Object.entries(this.agentTriggers)) {
      if (config.events) {
        for (const event of config.events) {
          if (!index[event]) {
            index[event] = [];
          }
          index[event].push({ agent, config });
        }
      }
    }
    return index;
  }

  /**
   * Start the dispatcher
   */
  async start() {
    console.log('Event Dispatcher starting...');

    // Subscribe to Redis pub/sub for events
    if (this.redis) {
      const subscriber = this.redis.duplicate();
      await subscriber.subscribe(
        'events:file_completed',
        'events:test_failed',
        'events:context_warning',
        'events:clone_needs_help',
        'events:hackathon_complete',
        'circuit:failure'
      );

      subscriber.on('message', (channel, message) => {
        try {
          const data = JSON.parse(message);
          const eventType = channel.replace('events:', '');
          this._handleEvent(eventType, data);
        } catch (err) {
          console.error(`Error handling event from ${channel}:`, err.message);
        }
      });
    }

    // Start situational checks timer
    this.situationalTimer = setInterval(() => {
      this._runSituationalChecks();
    }, this.situationalCheckInterval);

    console.log('Event Dispatcher started');
    this.emit('started');
  }

  /**
   * Stop the dispatcher
   */
  async stop() {
    if (this.situationalTimer) {
      clearInterval(this.situationalTimer);
      this.situationalTimer = null;
    }
    console.log('Event Dispatcher stopped');
    this.emit('stopped');
  }

  /**
   * Register a hackathon for monitoring
   */
  registerHackathon(hackathonId, metadata = {}) {
    this.activeHackathons.set(hackathonId, {
      id: hackathonId,
      startedAt: Date.now(),
      ...metadata
    });
    console.log(`Registered hackathon ${hackathonId} for event monitoring`);
  }

  /**
   * Unregister a hackathon
   */
  unregisterHackathon(hackathonId) {
    this.activeHackathons.delete(hackathonId);
    console.log(`Unregistered hackathon ${hackathonId}`);
  }

  /**
   * Handle incoming event
   */
  async _handleEvent(eventType, data) {
    // Handle null/undefined data gracefully
    const eventData = data || {};
    console.log(`Event received: ${eventType}`, eventData.hackathon_id || 'no-hackathon');

    // Find agents that respond to this event
    const agents = this.eventAgentIndex[eventType] || [];

    for (const { agent, config } of agents) {
      try {
        await this.triggerAgent(agent, eventData);
      } catch (err) {
        console.error(`Failed to trigger ${agent} for ${eventType}:`, err.message);
      }
    }

    // Check for random Pippin trigger
    const pippinConfig = this.agentTriggers.pippin;
    if (pippinConfig && pippinConfig.randomTrigger && Math.random() < pippinConfig.randomTrigger) {
      try {
        await this.triggerAgent('pippin', {
          ...eventData,
          trigger_reason: 'random_exploration'
        });
      } catch (err) {
        console.error('Failed to trigger Pippin:', err.message);
      }
    }

    this.emit('event_processed', { eventType, data, agentsTriggered: agents.map(a => a.agent) });
  }

  /**
   * Run situational checks for all active hackathons
   */
  async _runSituationalChecks() {
    if (!this.redis) return;

    for (const [hackathonId, metadata] of this.activeHackathons) {
      try {
        // Check Treebeard (rate limited)
        const rateLimited = await this.redis.hget(`hackathon:${hackathonId}:state`, 'rate_limited');
        if (rateLimited === 'true') {
          await this.triggerAgent('treebeard', { hackathon_id: hackathonId, reason: 'rate_limited' });
        }

        // Check Aragorn (pending decisions)
        const pendingDecisions = await this.redis.scard(`hackathon:${hackathonId}:decisions:pending`);
        if (pendingDecisions > 0) {
          await this.triggerAgent('aragorn', {
            hackathon_id: hackathonId,
            pending_count: pendingDecisions
          });
        }

        // Check Eowyn (impossible blocks)
        const blockedReason = await this.redis.hget(`hackathon:${hackathonId}:state`, 'blocked_reason');
        if (blockedReason === 'impossible') {
          await this.triggerAgent('eowyn', {
            hackathon_id: hackathonId,
            blocked_reason: blockedReason
          });
        }

        // Check for stuck clones
        const clones = await this.redis.keys(`clone:*:status`);
        for (const cloneKey of clones) {
          const startedAt = await this.redis.hget(cloneKey, 'started_at');
          const state = await this.redis.hget(cloneKey, 'state');

          if (state === 'processing' && startedAt) {
            const stuckTime = Date.now() - parseInt(startedAt);
            if (stuckTime > 600000) { // 10 minutes
              const cloneId = cloneKey.split(':')[1];
              await this.triggerAgent('merry', {
                hackathon_id: hackathonId,
                clone_id: cloneId,
                stuck_time_ms: stuckTime,
                trigger_reason: 'clone_stuck'
              });
            }
          }
        }

      } catch (err) {
        console.error(`Situational check failed for ${hackathonId}:`, err.message);
      }
    }
  }

  /**
   * Trigger a specific agent
   */
  async triggerAgent(agentName, data) {
    const config = this.agentTriggers[agentName];
    if (!config) {
      console.warn(`Unknown agent: ${agentName}`);
      return null;
    }

    const webhookUrl = `${this.n8nWebhookBase}${config.webhook}`;

    console.log(`Triggering ${agentName} at ${webhookUrl}`);

    try {
      const response = await this.httpClient.post(webhookUrl, {
        agent: agentName,
        triggered_at: new Date().toISOString(),
        ...data
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.emit('agent_triggered', {
        agent: agentName,
        webhook: config.webhook,
        data,
        response: response.status
      });

      return response.data;
    } catch (err) {
      console.error(`Agent trigger failed for ${agentName}:`, err.message);
      this.emit('agent_trigger_failed', {
        agent: agentName,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Manually emit an event
   */
  async emitEvent(eventType, data) {
    if (this.redis) {
      await this.redis.publish(`events:${eventType}`, JSON.stringify(data));
    }
    await this._handleEvent(eventType, data);
  }

  /**
   * Get dispatcher status
   */
  getStatus() {
    return {
      running: !!this.situationalTimer,
      activeHackathons: this.activeHackathons.size,
      registeredAgents: Object.keys(this.agentTriggers).length,
      eventTypes: Object.keys(this.eventAgentIndex).length
    };
  }

  /**
   * Get agent configuration
   */
  getAgentConfig(agentName) {
    return this.agentTriggers[agentName] || null;
  }

  /**
   * List all registered agents
   */
  listAgents() {
    return Object.entries(this.agentTriggers).map(([name, config]) => ({
      name,
      tier: config.tier,
      description: config.description,
      webhook: config.webhook
    }));
  }
}

module.exports = { EventDispatcher, AGENT_TRIGGERS };
