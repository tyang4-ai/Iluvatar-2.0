/**
 * ILUVATAR 3.0 - Multi-Tenant Orchestrator
 *
 * Main entry point for the always-running orchestrator service.
 * Manages multiple concurrent hackathons, each in isolated containers.
 *
 * Features:
 * - Discord bot for user interaction
 * - Container pool management
 * - Hackathon lifecycle (create, pause, resume, archive)
 * - Cross-hackathon resource management
 * - S3 archival for completed hackathons
 */

const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const Redis = require('ioredis');

const { ModelConfig } = require('./model-config');
const { AIAdapter } = require('./ai-adapter');
const { HackathonManager } = require('./hackathon-manager');
const { ContainerPool } = require('./container-pool');
const { DiscordBot } = require('./discord-bot');
const { PDFProcessor } = require('./pdf-processor');
const { GitHubConnector } = require('./github-connector');
const { S3Archiver } = require('./s3-archiver');
const { ToolsConfig } = require('./tools-config');
const { HackathonRegistry } = require('./db/hackathon-registry');

class Orchestrator {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 4000,
      discordToken: config.discordToken || process.env.DISCORD_TOKEN,
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      postgresUrl: config.postgresUrl || process.env.DATABASE_URL,
      maxConcurrentHackathons: config.maxConcurrentHackathons || 10,
      ...config
    };

    this.redis = null;
    this.app = null;
    this.server = null;
    this.discordBot = null;
    this.hackathonManager = null;
    this.containerPool = null;
    this.registry = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize all orchestrator components
   */
  async initialize() {
    console.log('🚀 Initializing ILUVATAR 3.0 Orchestrator...');

    // 1. Connect to Redis
    console.log('  Connecting to Redis...');
    this.redis = new Redis(this.config.redisUrl);
    await this.redis.ping();
    console.log('  ✓ Redis connected');

    // 2. Initialize database registry
    console.log('  Initializing database...');
    this.registry = new HackathonRegistry(this.config.postgresUrl);
    await this.registry.initialize();
    console.log('  ✓ Database initialized');

    // 3. Initialize model configuration
    console.log('  Loading model configurations...');
    this.modelConfig = new ModelConfig();
    console.log('  ✓ Models configured');

    // 4. Initialize AI adapter
    console.log('  Initializing AI adapter...');
    this.aiAdapter = new AIAdapter(this.modelConfig);
    console.log('  ✓ AI adapter ready');

    // 5. Initialize container pool
    console.log('  Initializing container pool...');
    this.containerPool = new ContainerPool({
      maxContainers: this.config.maxConcurrentHackathons,
      redis: this.redis
    });
    await this.containerPool.initialize();
    console.log('  ✓ Container pool ready');

    // 6. Initialize supporting services
    console.log('  Initializing supporting services...');
    this.pdfProcessor = new PDFProcessor();
    this.githubConnector = new GitHubConnector();
    this.s3Archiver = new S3Archiver();
    this.toolsConfig = new ToolsConfig();
    console.log('  ✓ Supporting services ready');

    // 7. Initialize hackathon manager
    console.log('  Initializing hackathon manager...');
    this.hackathonManager = new HackathonManager({
      redis: this.redis,
      registry: this.registry,
      containerPool: this.containerPool,
      aiAdapter: this.aiAdapter,
      pdfProcessor: this.pdfProcessor,
      githubConnector: this.githubConnector,
      s3Archiver: this.s3Archiver,
      toolsConfig: this.toolsConfig
    });
    console.log('  ✓ Hackathon manager ready');

    // 8. Initialize Discord bot
    console.log('  Initializing Discord bot...');
    this.discordBot = new DiscordBot({
      token: this.config.discordToken,
      hackathonManager: this.hackathonManager,
      registry: this.registry
    });
    await this.discordBot.initialize();
    console.log('  ✓ Discord bot connected');

    // 9. Initialize Express API
    console.log('  Initializing API server...');
    this.initializeAPI();
    console.log('  ✓ API server ready');

    // 10. Restore active hackathons
    console.log('  Restoring active hackathons...');
    await this.restoreActiveHackathons();
    console.log('  ✓ Active hackathons restored');

    // 11. Setup graceful shutdown
    this.setupGracefulShutdown();

    console.log('');
    console.log('✅ ILUVATAR 3.0 Orchestrator initialized successfully!');
    console.log(`   API: http://localhost:${this.config.port}`);
    console.log(`   Max concurrent hackathons: ${this.config.maxConcurrentHackathons}`);
    console.log('');
  }

  /**
   * Initialize Express API endpoints
   */
  initializeAPI() {
    this.app = express();
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        activeHackathons: this.hackathonManager?.getActiveCount() || 0,
        timestamp: new Date().toISOString()
      });
    });

    // System status
    this.app.get('/status', async (req, res) => {
      try {
        const status = await this.getSystemStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List hackathons
    this.app.get('/hackathons', async (req, res) => {
      try {
        const hackathons = await this.registry.listHackathons({
          status: req.query.status,
          limit: parseInt(req.query.limit) || 50
        });
        res.json(hackathons);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get hackathon details
    this.app.get('/hackathons/:id', async (req, res) => {
      try {
        const hackathon = await this.registry.getHackathon(req.params.id);
        if (!hackathon) {
          return res.status(404).json({ error: 'Hackathon not found' });
        }
        res.json(hackathon);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Create hackathon (internal API, Discord is primary interface)
    this.app.post('/hackathons', async (req, res) => {
      try {
        const hackathon = await this.hackathonManager.createHackathon(req.body);
        res.status(201).json(hackathon);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Pause hackathon
    this.app.post('/hackathons/:id/pause', async (req, res) => {
      try {
        await this.hackathonManager.pauseHackathon(req.params.id);
        res.json({ message: 'Hackathon paused' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Resume hackathon
    this.app.post('/hackathons/:id/resume', async (req, res) => {
      try {
        await this.hackathonManager.resumeHackathon(req.params.id);
        res.json({ message: 'Hackathon resumed' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Archive hackathon
    this.app.post('/hackathons/:id/archive', async (req, res) => {
      try {
        const archive = await this.hackathonManager.archiveHackathon(req.params.id);
        res.json(archive);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Global budget
    this.app.get('/budget', async (req, res) => {
      try {
        const budget = await this.getGlobalBudget();
        res.json(budget);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Container pool status
    this.app.get('/containers', async (req, res) => {
      try {
        const containers = await this.containerPool.getStatus();
        res.json(containers);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Start the orchestrator
   */
  async start() {
    await this.initialize();

    this.server = this.app.listen(this.config.port, () => {
      console.log(`🌐 Orchestrator API listening on port ${this.config.port}`);
    });
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    const activeHackathons = await this.registry.listHackathons({ status: 'active' });
    const containerStatus = await this.containerPool.getStatus();

    return {
      orchestrator: {
        status: 'running',
        uptime: process.uptime(),
        version: '3.0.0'
      },
      hackathons: {
        active: activeHackathons.length,
        max: this.config.maxConcurrentHackathons,
        available_slots: this.config.maxConcurrentHackathons - activeHackathons.length
      },
      containers: containerStatus,
      services: {
        redis: this.redis.status === 'ready' ? 'connected' : 'disconnected',
        discord: this.discordBot?.isReady() ? 'connected' : 'disconnected',
        database: await this.registry.healthCheck() ? 'connected' : 'disconnected'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get global budget across all hackathons
   */
  async getGlobalBudget() {
    const hackathons = await this.registry.listHackathons({ status: 'active' });

    let totalSpent = 0;
    let totalBudget = 0;
    const byHackathon = [];

    for (const hackathon of hackathons) {
      const budget = await this.hackathonManager.getBudget(hackathon.id);
      totalSpent += budget.spent;
      totalBudget += budget.total;
      byHackathon.push({
        id: hackathon.id,
        name: hackathon.name,
        spent: budget.spent,
        total: budget.total,
        percent_used: ((budget.spent / budget.total) * 100).toFixed(2)
      });
    }

    return {
      global: {
        total_spent: totalSpent.toFixed(4),
        total_budget: totalBudget.toFixed(2),
        percent_used: totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(2) : '0'
      },
      by_hackathon: byHackathon,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Restore active hackathons from database on startup
   */
  async restoreActiveHackathons() {
    const activeHackathons = await this.registry.listHackathons({ status: 'active' });

    for (const hackathon of activeHackathons) {
      try {
        await this.hackathonManager.restoreHackathon(hackathon.id);
        console.log(`    Restored: ${hackathon.name}`);
      } catch (error) {
        console.error(`    Failed to restore ${hackathon.name}: ${error.message}`);
      }
    }

    console.log(`  ${activeHackathons.length} hackathon(s) restored`);
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);

      try {
        // 1. Stop accepting new requests
        if (this.server) {
          this.server.close();
          console.log('  ✓ HTTP server closed');
        }

        // 2. Pause all active hackathons (save state)
        if (this.hackathonManager) {
          await this.hackathonManager.pauseAll();
          console.log('  ✓ All hackathons paused');
        }

        // 3. Disconnect Discord bot
        if (this.discordBot) {
          await this.discordBot.disconnect();
          console.log('  ✓ Discord bot disconnected');
        }

        // 4. Stop containers
        if (this.containerPool) {
          await this.containerPool.stopAll();
          console.log('  ✓ Containers stopped');
        }

        // 5. Close database connections
        if (this.registry) {
          await this.registry.close();
          console.log('  ✓ Database connection closed');
        }

        // 6. Close Redis
        if (this.redis) {
          await this.redis.quit();
          console.log('  ✓ Redis connection closed');
        }

        console.log('\n✅ Graceful shutdown complete');
        process.exit(0);

      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// CLI entry point
if (require.main === module) {
  const orchestrator = new Orchestrator();

  orchestrator.start().catch(error => {
    console.error('Failed to start orchestrator:', error);
    process.exit(1);
  });
}

module.exports = { Orchestrator };
