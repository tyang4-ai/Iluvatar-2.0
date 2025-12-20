/**
 * ILUVATAR 3.0 - Hackathon Manager
 *
 * Manages hackathon lifecycle: creation, execution, pause, resume, archive.
 * Each hackathon runs in an isolated Docker container with its own n8n instance.
 *
 * Features:
 * - Multi-tenant hackathon management
 * - Container lifecycle orchestration
 * - State persistence and recovery
 * - Budget enforcement across hackathons
 * - S3 archival on completion
 */

const EventEmitter = require('events');
const path = require('path');

class HackathonManager extends EventEmitter {
  constructor(options) {
    super();

    this.redis = options.redis;
    this.registry = options.registry;
    this.containerPool = options.containerPool;
    this.aiAdapter = options.aiAdapter;
    this.pdfProcessor = options.pdfProcessor;
    this.githubConnector = options.githubConnector;
    this.s3Archiver = options.s3Archiver;
    this.toolsConfig = options.toolsConfig;

    // Active hackathon containers (hackathonId -> container info)
    this.activeHackathons = new Map();

    // Budget tracking
    this.budgets = new Map();
  }

  /**
   * Create a new hackathon
   *
   * @param {Object} config - Hackathon configuration
   * @param {string} config.name - Hackathon name
   * @param {string} config.deadline - ISO deadline string
   * @param {number} config.budget - Budget in USD
   * @param {string} config.description - Project description
   * @param {string} config.pdfUrl - Rules PDF URL (optional)
   * @param {string} config.discordChannelId - Discord channel ID
   * @param {string} config.ownerId - Discord user ID of owner
   * @param {Array<string>} config.memberIds - Team member Discord IDs
   * @param {Object} config.tools - Tool credentials (GitHub, Vercel, etc.)
   */
  async createHackathon(config) {
    console.log(`Creating hackathon: ${config.name}`);

    // 1. Validate configuration
    this.validateConfig(config);

    // 2. Check capacity
    if (this.activeHackathons.size >= this.containerPool.maxContainers) {
      throw new Error('Maximum concurrent hackathons reached');
    }

    // 3. Process PDF if provided
    let parsedRules = null;
    if (config.pdfUrl) {
      console.log('  Processing hackathon PDF...');
      parsedRules = await this.pdfProcessor.processUrl(config.pdfUrl);
    }

    // 4. Generate hackathon ID
    const hackathonId = this.generateHackathonId(config.name);

    // 5. Create database record
    const hackathon = await this.registry.createHackathon({
      id: hackathonId,
      name: config.name,
      description: config.description,
      deadline: config.deadline,
      budget: config.budget,
      discord_channel_id: config.discordChannelId,
      owner_id: config.ownerId,
      member_ids: config.memberIds || [],
      parsed_rules: parsedRules,
      status: 'initializing',
      created_at: new Date().toISOString()
    });

    // 6. Store tool credentials securely
    if (config.tools) {
      await this.registry.storeToolCredentials(hackathonId, config.tools);
    }

    // 7. Request container from pool
    console.log('  Requesting container...');
    const container = await this.containerPool.requestContainer(hackathonId, {
      budget: config.budget,
      deadline: config.deadline,
      parsedRules: parsedRules
    });

    // 8. Initialize container with ILUVATAR 2.0
    console.log('  Initializing ILUVATAR 2.0 in container...');
    await this.initializeContainer(container, hackathon);

    // 9. Track active hackathon
    this.activeHackathons.set(hackathonId, {
      container,
      hackathon,
      startedAt: new Date().toISOString()
    });

    // 10. Initialize budget tracking
    this.budgets.set(hackathonId, {
      total: config.budget,
      spent: 0,
      lastUpdated: new Date().toISOString()
    });

    // 11. Update status
    await this.registry.updateHackathonStatus(hackathonId, 'active');

    // 12. Emit creation event
    this.emit('hackathon:created', {
      hackathonId,
      name: config.name,
      containerId: container.id
    });

    console.log(`  ✓ Hackathon created: ${hackathonId}`);

    return {
      id: hackathonId,
      name: config.name,
      status: 'active',
      container_id: container.id,
      deadline: config.deadline,
      budget: config.budget
    };
  }

  /**
   * Validate hackathon configuration
   */
  validateConfig(config) {
    if (!config.name) {
      throw new Error('Hackathon name is required');
    }

    if (!config.deadline) {
      throw new Error('Deadline is required');
    }

    const deadline = new Date(config.deadline);
    if (isNaN(deadline.getTime()) || deadline <= new Date()) {
      throw new Error('Invalid deadline: must be a future date');
    }

    if (!config.budget || config.budget < 1) {
      throw new Error('Budget must be at least $1');
    }

    if (!config.discordChannelId) {
      throw new Error('Discord channel ID is required');
    }

    if (!config.ownerId) {
      throw new Error('Owner ID is required');
    }
  }

  /**
   * Generate unique hackathon ID
   */
  generateHackathonId(name) {
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20);

    const timestamp = Date.now().toString(36);
    return `${slug}-${timestamp}`;
  }

  /**
   * Initialize ILUVATAR 2.0 in container
   */
  async initializeContainer(container, hackathon) {
    // 1. Copy ILUVATAR 2.0 codebase to container
    await container.exec([
      'git', 'clone',
      'https://github.com/your-org/iluvatar-2.0.git',
      '/app/iluvatar'
    ]);

    // 2. Install dependencies
    await container.exec(['npm', 'install'], { cwd: '/app/iluvatar' });

    // 3. Configure environment
    const envVars = {
      HACKATHON_ID: hackathon.id,
      HACKATHON_NAME: hackathon.name,
      DEADLINE: hackathon.deadline,
      BUDGET: hackathon.budget.toString(),
      REDIS_URL: process.env.REDIS_URL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      DISCORD_WEBHOOK_URL: await this.getDiscordWebhook(hackathon.discord_channel_id)
    };

    await container.setEnv(envVars);

    // 4. Start n8n workflow engine
    await container.exec(['npm', 'run', 'start:n8n'], {
      cwd: '/app/iluvatar',
      detach: true
    });

    // 5. Initialize state in Redis
    await this.redis.hset(`hackathon:${hackathon.id}:state`, {
      status: 'active',
      phase: 'initialization',
      started_at: new Date().toISOString()
    });

    // 6. Trigger ideation phase
    await this.redis.publish(`hackathon:${hackathon.id}:control`, JSON.stringify({
      type: 'start_ideation',
      rules: hackathon.parsed_rules
    }));
  }

  /**
   * Get Discord webhook for channel
   */
  async getDiscordWebhook(channelId) {
    // This would be implemented to create/get webhook for the channel
    return `https://discord.com/api/webhooks/${channelId}/token`;
  }

  /**
   * Pause a hackathon
   */
  async pauseHackathon(hackathonId) {
    const active = this.activeHackathons.get(hackathonId);
    if (!active) {
      throw new Error(`Hackathon not active: ${hackathonId}`);
    }

    console.log(`Pausing hackathon: ${hackathonId}`);

    // 1. Signal container to pause
    await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
      type: 'pause'
    }));

    // 2. Wait for state save
    await this.waitForStateSave(hackathonId);

    // 3. Stop container (but don't remove)
    await active.container.stop();

    // 4. Update status
    await this.registry.updateHackathonStatus(hackathonId, 'paused');
    active.hackathon.status = 'paused';

    this.emit('hackathon:paused', { hackathonId });

    console.log(`  ✓ Hackathon paused: ${hackathonId}`);
  }

  /**
   * Resume a paused hackathon
   */
  async resumeHackathon(hackathonId) {
    const active = this.activeHackathons.get(hackathonId);
    if (!active) {
      // Try to restore from database
      return this.restoreHackathon(hackathonId);
    }

    console.log(`Resuming hackathon: ${hackathonId}`);

    // 1. Start container
    await active.container.start();

    // 2. Wait for container ready
    await this.waitForContainerReady(active.container);

    // 3. Signal resume
    await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
      type: 'resume'
    }));

    // 4. Update status
    await this.registry.updateHackathonStatus(hackathonId, 'active');
    active.hackathon.status = 'active';

    this.emit('hackathon:resumed', { hackathonId });

    console.log(`  ✓ Hackathon resumed: ${hackathonId}`);
  }

  /**
   * Restore hackathon from database
   */
  async restoreHackathon(hackathonId) {
    console.log(`Restoring hackathon: ${hackathonId}`);

    // 1. Get hackathon from database
    const hackathon = await this.registry.getHackathon(hackathonId);
    if (!hackathon) {
      throw new Error(`Hackathon not found: ${hackathonId}`);
    }

    if (hackathon.status === 'archived') {
      throw new Error('Cannot restore archived hackathon');
    }

    // 2. Request new container
    const container = await this.containerPool.requestContainer(hackathonId, {
      budget: hackathon.budget,
      deadline: hackathon.deadline
    });

    // 3. Initialize container
    await this.initializeContainer(container, hackathon);

    // 4. Restore state from Redis
    const savedState = await this.redis.hgetall(`hackathon:${hackathonId}:state`);
    if (savedState && Object.keys(savedState).length > 0) {
      await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
        type: 'restore_state',
        state: savedState
      }));
    }

    // 5. Track active hackathon
    this.activeHackathons.set(hackathonId, {
      container,
      hackathon,
      startedAt: new Date().toISOString()
    });

    // 6. Restore budget tracking
    const budgetData = await this.redis.hgetall(`hackathon:${hackathonId}:budget`);
    this.budgets.set(hackathonId, {
      total: parseFloat(budgetData.total) || hackathon.budget,
      spent: parseFloat(budgetData.spent) || 0,
      lastUpdated: budgetData.lastUpdated || new Date().toISOString()
    });

    // 7. Update status
    await this.registry.updateHackathonStatus(hackathonId, 'active');

    this.emit('hackathon:restored', { hackathonId });

    console.log(`  ✓ Hackathon restored: ${hackathonId}`);

    return hackathon;
  }

  /**
   * Archive a completed hackathon
   */
  async archiveHackathon(hackathonId) {
    const active = this.activeHackathons.get(hackathonId);

    console.log(`Archiving hackathon: ${hackathonId}`);

    // 1. Get hackathon data
    const hackathon = active?.hackathon || await this.registry.getHackathon(hackathonId);
    if (!hackathon) {
      throw new Error(`Hackathon not found: ${hackathonId}`);
    }

    // 2. Export container data (code, logs, etc.)
    let containerData = null;
    if (active) {
      containerData = await this.exportContainerData(active.container);
    }

    // 3. Get final state
    const finalState = await this.redis.hgetall(`hackathon:${hackathonId}:state`);
    const budget = this.budgets.get(hackathonId) ||
      await this.redis.hgetall(`hackathon:${hackathonId}:budget`);

    // 4. Archive to S3
    const archiveResult = await this.s3Archiver.archive({
      hackathonId,
      hackathon,
      finalState,
      budget,
      containerData,
      archivedAt: new Date().toISOString()
    });

    // 5. Stop and remove container
    if (active) {
      await active.container.stop();
      await active.container.remove();
      this.activeHackathons.delete(hackathonId);
    }

    // 6. Clean up Redis
    await this.cleanupRedisData(hackathonId);

    // 7. Update database
    await this.registry.updateHackathonStatus(hackathonId, 'archived', {
      archived_at: new Date().toISOString(),
      archive_url: archiveResult.url,
      final_budget_spent: budget.spent
    });

    // 8. Release budget tracking
    this.budgets.delete(hackathonId);

    this.emit('hackathon:archived', {
      hackathonId,
      archiveUrl: archiveResult.url
    });

    console.log(`  ✓ Hackathon archived: ${hackathonId}`);

    return {
      hackathonId,
      archiveUrl: archiveResult.url,
      finalBudgetSpent: budget.spent
    };
  }

  /**
   * Export container data for archival
   */
  async exportContainerData(container) {
    // Export code repository
    const codeArchive = await container.exec([
      'tar', '-czf', '/tmp/code.tar.gz', '-C', '/app', '.'
    ]);

    // Export logs
    const logs = await container.logs({ stdout: true, stderr: true });

    // Export n8n workflow data
    const workflowData = await container.exec([
      'cat', '/app/iluvatar/.n8n/database.sqlite'
    ]);

    return {
      code: codeArchive,
      logs,
      workflows: workflowData
    };
  }

  /**
   * Clean up Redis data for hackathon
   */
  async cleanupRedisData(hackathonId) {
    const keys = await this.redis.keys(`hackathon:${hackathonId}:*`);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Pause all hackathons (for graceful shutdown)
   */
  async pauseAll() {
    const pausePromises = [];

    for (const [hackathonId] of this.activeHackathons) {
      pausePromises.push(
        this.pauseHackathon(hackathonId).catch(err => {
          console.error(`Failed to pause ${hackathonId}: ${err.message}`);
        })
      );
    }

    await Promise.all(pausePromises);
  }

  /**
   * Get hackathon status
   */
  async getStatus(hackathonId) {
    const active = this.activeHackathons.get(hackathonId);

    if (active) {
      const state = await this.redis.hgetall(`hackathon:${hackathonId}:state`);
      const budget = this.budgets.get(hackathonId);

      return {
        id: hackathonId,
        name: active.hackathon.name,
        status: active.hackathon.status,
        phase: state.phase,
        deadline: active.hackathon.deadline,
        budget: {
          total: budget.total,
          spent: budget.spent,
          remaining: budget.total - budget.spent,
          percent_used: ((budget.spent / budget.total) * 100).toFixed(2)
        },
        container: {
          id: active.container.id,
          status: await active.container.getStatus()
        },
        started_at: active.startedAt
      };
    }

    // Fall back to database
    const hackathon = await this.registry.getHackathon(hackathonId);
    if (!hackathon) {
      throw new Error(`Hackathon not found: ${hackathonId}`);
    }

    return {
      id: hackathonId,
      name: hackathon.name,
      status: hackathon.status,
      deadline: hackathon.deadline,
      budget: {
        total: hackathon.budget,
        spent: hackathon.budget_spent || 0
      }
    };
  }

  /**
   * Get budget for hackathon
   */
  async getBudget(hackathonId) {
    const budget = this.budgets.get(hackathonId);

    if (budget) {
      return budget;
    }

    const hackathon = await this.registry.getHackathon(hackathonId);
    return {
      total: hackathon.budget,
      spent: hackathon.budget_spent || 0
    };
  }

  /**
   * Get count of active hackathons
   */
  getActiveCount() {
    return this.activeHackathons.size;
  }

  /**
   * Wait for container state save
   */
  async waitForStateSave(hackathonId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('State save timeout'));
      }, timeout);

      const checkState = async () => {
        const state = await this.redis.hget(`hackathon:${hackathonId}:state`, 'saved');
        if (state === 'true') {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(checkState, 500);
        }
      };

      checkState();
    });
  }

  /**
   * Wait for container ready
   */
  async waitForContainerReady(container, timeout = 60000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await container.getStatus();
      if (status === 'running') {
        // Check if n8n is responding
        try {
          await container.exec(['curl', '-s', 'http://localhost:5678/healthz']);
          return;
        } catch (e) {
          // n8n not ready yet
        }
      }
      await this.sleep(1000);
    }

    throw new Error('Container ready timeout');
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get hackathon by Discord channel ID
   */
  async getHackathonByChannel(channelId) {
    return this.registry.getHackathonByChannel(channelId);
  }

  /**
   * Run planning phase only (no code execution)
   * Container is started but workflow runs in planning-only mode
   *
   * @param {string} hackathonId - Hackathon ID
   */
  async runPlanningOnly(hackathonId) {
    console.log(`Starting planning-only mode for hackathon: ${hackathonId}`);

    // Update state to indicate planning-only mode
    await this.redis.hset(`hackathon:${hackathonId}:state`, {
      mode: 'planning_only',
      phase: 'ideation',
      planning_started_at: new Date().toISOString()
    });

    // Update status in database
    await this.registry.updateHackathonStatus(hackathonId, 'planning');

    // Signal container's n8n workflow to run in planning-only mode
    await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
      type: 'start_planning_only',
      skip_execution: true,
      phases: ['ideation', 'architecture', 'analysis']
    }));

    this.emit('hackathon:planning_started', { hackathonId, mode: 'planning_only' });

    console.log(`  ✓ Planning-only mode started for: ${hackathonId}`);
  }

  /**
   * Start full hackathon workflow
   * Runs complete automation: ideation → planning → execution → deployment
   *
   * @param {string} hackathonId - Hackathon ID
   */
  async startFullWorkflow(hackathonId) {
    console.log(`Starting full workflow for hackathon: ${hackathonId}`);

    // Update state to indicate full auto mode
    await this.redis.hset(`hackathon:${hackathonId}:state`, {
      mode: 'full_auto',
      phase: 'ideation',
      workflow_started_at: new Date().toISOString()
    });

    // Update status in database
    await this.registry.updateHackathonStatus(hackathonId, 'active');

    // Signal container's n8n workflow to run in full auto mode
    await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
      type: 'start_full_workflow',
      skip_execution: false
    }));

    this.emit('hackathon:workflow_started', { hackathonId, mode: 'full_auto' });

    console.log(`  ✓ Full workflow started for: ${hackathonId}`);
  }

  /**
   * Run YOLO mode - fully autonomous workflow with pre-collected configuration
   *
   * YOLO mode runs the entire pipeline without any user checkpoints or approvals.
   * All configuration is collected upfront via a questionnaire before starting.
   *
   * @param {string} hackathonId - Hackathon ID
   * @param {Object} yoloConfig - Pre-collected configuration from questionnaire
   * @param {string} yoloConfig.frontend - Frontend framework (react, vue, svelte, nextjs, vanilla)
   * @param {string|null} yoloConfig.backend - Backend language (nodejs, python, go, rust, null)
   * @param {string|null} yoloConfig.database - Database (postgresql, mongodb, sqlite, supabase, null)
   * @param {string} yoloConfig.styling - Styling framework (tailwind, css-modules, styled, plain)
   * @param {boolean} yoloConfig.rules_uploaded - Whether rules PDF was uploaded
   * @param {string} yoloConfig.judging_priority - Priority criteria (innovation, technical, ux, impact)
   * @param {number} yoloConfig.time_limit_hours - Time limit in hours
   * @param {string} yoloConfig.team_size - Team size (solo, small, large)
   * @param {string|null} yoloConfig.deployment_target - Deployment platform (vercel, netlify, railway, null)
   * @param {boolean} yoloConfig.include_demo_video - Whether to include demo video
   * @param {string} yoloConfig.github_visibility - Repository visibility (public, private)
   * @param {string[]} yoloConfig.apis_to_integrate - APIs to integrate
   * @param {string[]} yoloConfig.required_libraries - Required libraries
   * @param {number|null} yoloConfig.budget_limit - Budget limit in dollars (null = unlimited)
   * @param {string[]} yoloConfig.must_include_features - Features that must be included
   * @param {string[]} yoloConfig.must_avoid - Things to avoid
   * @param {string} yoloConfig.preferred_model - Preferred AI model (sonnet, opus, auto)
   */
  async runYoloMode(hackathonId, yoloConfig) {
    console.log(`Starting YOLO mode for hackathon ${hackathonId}`);
    console.log(`  Tech Stack: ${yoloConfig.frontend}/${yoloConfig.backend || 'no-backend'}/${yoloConfig.database || 'no-db'}`);
    console.log(`  Deployment: ${yoloConfig.deployment_target || 'none'}`);
    console.log(`  Time Limit: ${yoloConfig.time_limit_hours}h`);

    // Store YOLO configuration in Redis state
    const yoloState = {
      mode: 'yolo',
      skip_execution: 'false',
      auto_approve: 'true',
      checkpoints_enabled: 'false',
      yolo_started_at: new Date().toISOString(),

      // Tech Stack (agents use these directly, no guessing)
      'yolo.tech_stack.frontend': yoloConfig.frontend,
      'yolo.tech_stack.backend': yoloConfig.backend || 'none',
      'yolo.tech_stack.database': yoloConfig.database || 'none',
      'yolo.tech_stack.styling': yoloConfig.styling,

      // Hackathon Context
      'yolo.context.rules_uploaded': yoloConfig.rules_uploaded ? 'true' : 'false',
      'yolo.context.judging_priority': yoloConfig.judging_priority,
      'yolo.context.time_limit_hours': String(yoloConfig.time_limit_hours),
      'yolo.context.team_size': yoloConfig.team_size,

      // Deployment & Output
      'yolo.deployment.target': yoloConfig.deployment_target || 'none',
      'yolo.deployment.include_demo_video': yoloConfig.include_demo_video ? 'true' : 'false',
      'yolo.deployment.github_visibility': yoloConfig.github_visibility,

      // Integrations (stored as JSON arrays)
      'yolo.integrations.apis': JSON.stringify(yoloConfig.apis_to_integrate || []),
      'yolo.integrations.libraries': JSON.stringify(yoloConfig.required_libraries || []),

      // Constraints
      'yolo.constraints.budget_limit': yoloConfig.budget_limit ? String(yoloConfig.budget_limit) : 'unlimited',
      'yolo.constraints.must_include': JSON.stringify(yoloConfig.must_include_features || []),
      'yolo.constraints.must_avoid': JSON.stringify(yoloConfig.must_avoid || []),
      'yolo.constraints.preferred_model': yoloConfig.preferred_model
    };

    await this.redis.hset(`hackathon:${hackathonId}:state`, yoloState);

    // Update status in database
    await this.registry.updateHackathonStatus(hackathonId, 'active');

    // Signal container's n8n workflow to run in YOLO mode
    await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
      type: 'start_yolo_mode',
      skip_execution: false,
      auto_approve: true,
      yolo_config: yoloConfig
    }));

    this.emit('hackathon:yolo_started', { hackathonId, config: yoloConfig });

    console.log(`  ⚡ YOLO mode started for: ${hackathonId}`);
  }

  /**
   * Resume workflow from specific phase with optional custom plan
   *
   * @param {string} hackathonId - Hackathon ID
   * @param {string} phase - Phase to start from (backend, frontend, integration, testing, deployment)
   * @param {boolean} useCustomPlan - Whether to use a previously uploaded custom plan
   */
  async resumeFromPhase(hackathonId, phase, useCustomPlan = false) {
    console.log(`Resuming hackathon ${hackathonId} from phase: ${phase}`);

    const validPhases = ['backend', 'frontend', 'integration', 'testing', 'deployment'];
    if (!validPhases.includes(phase)) {
      throw new Error(`Invalid phase: ${phase}. Valid phases: ${validPhases.join(', ')}`);
    }

    // Load custom plan if requested
    let customPlan = null;
    if (useCustomPlan) {
      const state = await this.redis.hgetall(`hackathon:${hackathonId}:state`);
      if (state.custom_plan) {
        customPlan = JSON.parse(state.custom_plan);
      }
    }

    // Update state
    await this.redis.hset(`hackathon:${hackathonId}:state`, {
      mode: 'resume_from_phase',
      phase: phase,
      resume_started_at: new Date().toISOString(),
      using_custom_plan: useCustomPlan ? 'true' : 'false'
    });

    // Update status in database
    await this.registry.updateHackathonStatus(hackathonId, 'active');

    // Signal container to start from specific phase
    await this.redis.publish(`hackathon:${hackathonId}:control`, JSON.stringify({
      type: 'resume_from_phase',
      phase: phase,
      use_custom_plan: useCustomPlan,
      custom_plan: customPlan
    }));

    this.emit('hackathon:resumed_from_phase', { hackathonId, phase, useCustomPlan });

    console.log(`  ✓ Resumed from phase ${phase} for: ${hackathonId}`);
  }

  /**
   * Upload file to hackathon's S3 storage
   *
   * @param {string} hackathonId - Hackathon ID
   * @param {string} filename - Original filename
   * @param {Buffer} content - File content as buffer
   * @param {string} targetPath - Target path in project (optional)
   * @returns {Object} Upload result with key and URL
   */
  async uploadFile(hackathonId, filename, content, targetPath) {
    const key = `hackathons/${hackathonId}/uploads/${targetPath || filename}`;

    console.log(`Uploading file for hackathon ${hackathonId}: ${key}`);

    await this.s3Archiver.s3.putObject({
      Bucket: this.s3Archiver.bucket,
      Key: key,
      Body: content,
      ContentType: this.getContentType(filename)
    }).promise();

    // Track uploaded file in Redis
    const uploadRecord = {
      filename,
      key,
      targetPath: targetPath || filename,
      size: content.length,
      uploadedAt: new Date().toISOString()
    };

    await this.redis.rpush(
      `hackathon:${hackathonId}:uploads`,
      JSON.stringify(uploadRecord)
    );

    console.log(`  ✓ File uploaded: ${key}`);

    return {
      key,
      url: `s3://${this.s3Archiver.bucket}/${key}`,
      size: content.length
    };
  }

  /**
   * Get content type from filename
   */
  getContentType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const types = {
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'py': 'text/x-python',
      'zip': 'application/zip',
      'tar': 'application/x-tar',
      'gz': 'application/gzip',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf'
    };
    return types[ext] || 'application/octet-stream';
  }

  // ===================================
  // Distributed File Locks
  // ===================================

  /**
   * Acquire exclusive lock on a file for a clone
   * Prevents race conditions when multiple clones write simultaneously
   *
   * @param {string} filePath - Path to lock
   * @param {string} cloneId - Clone requesting lock
   * @param {number} ttlMs - Lock TTL in milliseconds (default 30s)
   * @returns {Promise<boolean>} true if acquired, false if already locked
   */
  async acquireFileLock(filePath, cloneId, ttlMs = 30000) {
    const lockKey = `lock:file:${filePath}`;
    const acquired = await this.redis.set(lockKey, cloneId, 'NX', 'PX', ttlMs);
    return acquired === 'OK';
  }

  /**
   * Release file lock
   * Only releases if the caller owns the lock
   *
   * @param {string} filePath - Path to unlock
   * @param {string} cloneId - Clone releasing lock
   * @returns {Promise<boolean>} true if released, false if not owner
   */
  async releaseFileLock(filePath, cloneId) {
    const lockKey = `lock:file:${filePath}`;

    // Use Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, cloneId);
    return result === 1;
  }

  /**
   * Wait for file lock with timeout
   * Blocks until lock is acquired or timeout expires
   *
   * @param {string} filePath - Path to lock
   * @param {string} cloneId - Clone requesting lock
   * @param {number} timeoutMs - Max wait time (default 60s)
   * @param {number} pollMs - Poll interval (default 500ms)
   * @returns {Promise<boolean>} true if acquired
   * @throws {Error} If timeout reached without acquiring lock
   */
  async waitForFileLock(filePath, cloneId, timeoutMs = 60000, pollMs = 500) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.acquireFileLock(filePath, cloneId)) {
        return true;
      }
      await this.sleep(pollMs);
    }

    throw new Error(`Timeout waiting for lock on ${filePath} after ${timeoutMs}ms`);
  }

  /**
   * Check if a file is currently locked
   *
   * @param {string} filePath - Path to check
   * @returns {Promise<Object|null>} Lock info or null if unlocked
   */
  async getFileLockInfo(filePath) {
    const lockKey = `lock:file:${filePath}`;
    const owner = await this.redis.get(lockKey);
    const ttl = await this.redis.pttl(lockKey);

    if (owner) {
      return { filePath, owner, ttlMs: ttl };
    }
    return null;
  }

  /**
   * Get all active file locks
   *
   * @returns {Promise<Array>} List of active locks
   */
  async getAllFileLocks() {
    const keys = await this.redis.keys('lock:file:*');
    const locks = [];

    for (const key of keys) {
      const filePath = key.replace('lock:file:', '');
      const info = await this.getFileLockInfo(filePath);
      if (info) {
        locks.push(info);
      }
    }

    return locks;
  }

  /**
   * Force release all file locks (admin operation)
   * Use with caution - can cause race conditions if clones are still running
   *
   * @returns {Promise<number>} Number of locks released
   */
  async forceReleaseAllFileLocks() {
    const keys = await this.redis.keys('lock:file:*');

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    return keys.length;
  }

  // ===================================
  // S3 Checkpoint Backup
  // ===================================

  /**
   * Start periodic checkpoint timer for all active hackathons
   * Saves state to S3 every 5 minutes
   */
  startCheckpointTimer() {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }

    this.checkpointInterval = setInterval(async () => {
      for (const [hackathonId] of this.activeHackathons) {
        try {
          await this.saveCheckpoint(hackathonId);
        } catch (err) {
          console.error(`Checkpoint failed for ${hackathonId}: ${err.message}`);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('Checkpoint timer started (5 minute interval)');
  }

  /**
   * Stop checkpoint timer
   */
  stopCheckpointTimer() {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
      console.log('Checkpoint timer stopped');
    }
  }

  /**
   * Save checkpoint for a hackathon to S3
   *
   * @param {string} hackathonId - Hackathon ID
   * @returns {Promise<Object>} Checkpoint info
   */
  async saveCheckpoint(hackathonId) {
    const timestamp = Date.now();
    const isoTime = new Date(timestamp).toISOString();

    // Gather state from Redis
    const state = await this.redis.hgetall(`hackathon:${hackathonId}:state`);
    const data = await this.redis.hgetall('state:data');
    const budget = this.budgets.get(hackathonId);

    // Get work queues
    const backendQueue = await this.redis.zrange('queue:backend', 0, -1);
    const frontendQueue = await this.redis.zrange('queue:frontend', 0, -1);

    // Build checkpoint
    const checkpoint = {
      hackathon_id: hackathonId,
      timestamp,
      iso_time: isoTime,
      state,
      data,
      budget: budget ? { total: budget.total, spent: budget.spent } : null,
      queues: {
        backend: backendQueue.map(item => {
          try { return JSON.parse(item); } catch { return item; }
        }),
        frontend: frontendQueue.map(item => {
          try { return JSON.parse(item); } catch { return item; }
        })
      }
    };

    // Upload to S3
    const key = `checkpoints/${hackathonId}/${timestamp}.json`;

    await this.s3Archiver.s3.putObject({
      Bucket: this.s3Archiver.bucket,
      Key: key,
      Body: JSON.stringify(checkpoint, null, 2),
      ContentType: 'application/json'
    }).promise();

    // Track checkpoint in Redis
    await this.redis.lpush(
      `hackathon:${hackathonId}:checkpoints`,
      JSON.stringify({ timestamp, key })
    );

    // Keep only last 20 checkpoint references in Redis
    await this.redis.ltrim(`hackathon:${hackathonId}:checkpoints`, 0, 19);

    this.emit('checkpoint:saved', {
      hackathonId,
      timestamp,
      key
    });

    console.log(`  ✓ Checkpoint saved for ${hackathonId}: ${key}`);

    return { hackathonId, timestamp, key };
  }

  /**
   * List available checkpoints for a hackathon
   *
   * @param {string} hackathonId - Hackathon ID
   * @returns {Promise<Array>} List of checkpoints
   */
  async listCheckpoints(hackathonId) {
    const refs = await this.redis.lrange(`hackathon:${hackathonId}:checkpoints`, 0, -1);
    return refs.map(ref => JSON.parse(ref));
  }

  /**
   * Restore state from a checkpoint
   *
   * @param {string} hackathonId - Hackathon ID
   * @param {string} key - S3 key of checkpoint to restore
   * @returns {Promise<Object>} Restored checkpoint data
   */
  async restoreCheckpoint(hackathonId, key) {
    console.log(`Restoring checkpoint for ${hackathonId} from ${key}`);

    // Download checkpoint from S3
    const response = await this.s3Archiver.s3.getObject({
      Bucket: this.s3Archiver.bucket,
      Key: key
    }).promise();

    const checkpoint = JSON.parse(response.Body.toString('utf8'));

    // Restore state to Redis
    if (checkpoint.state && Object.keys(checkpoint.state).length > 0) {
      await this.redis.hset(`hackathon:${hackathonId}:state`, checkpoint.state);
    }

    if (checkpoint.data && Object.keys(checkpoint.data).length > 0) {
      await this.redis.hset('state:data', checkpoint.data);
    }

    // Restore work queues
    if (checkpoint.queues) {
      // Clear and restore backend queue
      await this.redis.del('queue:backend');
      for (const item of checkpoint.queues.backend) {
        const jsonItem = typeof item === 'string' ? item : JSON.stringify(item);
        await this.redis.zadd('queue:backend', item.priority || 0, jsonItem);
      }

      // Clear and restore frontend queue
      await this.redis.del('queue:frontend');
      for (const item of checkpoint.queues.frontend) {
        const jsonItem = typeof item === 'string' ? item : JSON.stringify(item);
        await this.redis.zadd('queue:frontend', item.priority || 0, jsonItem);
      }
    }

    // Restore budget
    if (checkpoint.budget) {
      this.budgets.set(hackathonId, checkpoint.budget);
    }

    this.emit('checkpoint:restored', {
      hackathonId,
      timestamp: checkpoint.timestamp,
      key
    });

    console.log(`  ✓ Checkpoint restored for ${hackathonId}`);

    return checkpoint;
  }
}

module.exports = { HackathonManager };
