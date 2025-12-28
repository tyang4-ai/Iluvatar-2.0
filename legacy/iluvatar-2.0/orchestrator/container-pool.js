/**
 * ILUVATAR 3.0 - Container Pool
 *
 * Manages Docker containers for hackathon isolation.
 * Each hackathon runs in its own container with n8n + ILUVATAR 2.0.
 *
 * Features:
 * - Container lifecycle management
 * - Resource limits and monitoring
 * - Health checks
 * - Warm pool for fast startup
 */

const Docker = require('dockerode');
const EventEmitter = require('events');

class ContainerPool extends EventEmitter {
  constructor(options = {}) {
    super();

    this.docker = new Docker(options.dockerOptions || {
      socketPath: process.platform === 'win32'
        ? '//./pipe/docker_engine'
        : '/var/run/docker.sock'
    });

    this.redis = options.redis;
    this.maxContainers = options.maxContainers || 10;
    this.imageName = options.imageName || 'iluvatar-hackathon:latest';

    // Container tracking
    this.containers = new Map();  // hackathonId -> Container
    this.warmPool = [];  // Pre-created containers ready for use

    // Resource limits per container
    this.resourceLimits = {
      memory: options.memory || '4g',
      cpus: options.cpus || '2',
      storage: options.storage || '20g'
    };
  }

  /**
   * Initialize the container pool
   */
  async initialize() {
    console.log('  Initializing container pool...');

    // 1. Check Docker connection
    await this.docker.ping();
    console.log('    ✓ Docker connected');

    // 2. Ensure image exists
    await this.ensureImage();
    console.log('    ✓ Image ready');

    // 3. Clean up orphaned containers from previous runs
    await this.cleanupOrphanedContainers();
    console.log('    ✓ Orphaned containers cleaned');

    // 4. Create warm pool
    await this.createWarmPool(2);
    console.log('    ✓ Warm pool created');

    // 5. Start health check loop
    this.startHealthCheck();

    console.log(`    Pool ready (max: ${this.maxContainers})`);
  }

  /**
   * Ensure the hackathon image exists
   */
  async ensureImage() {
    try {
      await this.docker.getImage(this.imageName).inspect();
    } catch (error) {
      if (error.statusCode === 404) {
        console.log(`    Building image ${this.imageName}...`);
        await this.buildImage();
      } else {
        throw error;
      }
    }
  }

  /**
   * Build the hackathon container image
   */
  async buildImage() {
    // In production, this would build from a Dockerfile
    // For now, we'll use a pre-built image or pull from registry

    // Option 1: Pull from registry
    try {
      await new Promise((resolve, reject) => {
        this.docker.pull(this.imageName, (err, stream) => {
          if (err) return reject(err);

          this.docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          });
        });
      });
    } catch (error) {
      // Option 2: Build locally
      console.log('    Image not in registry, using base image...');
      // Use node:18 as base and configure at runtime
      this.imageName = 'node:18-alpine';
    }
  }

  /**
   * Clean up orphaned containers from previous runs
   * Only removes containers that are NOT associated with active hackathons in Redis
   */
  async cleanupOrphanedContainers() {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ['iluvatar=hackathon'] }
    });

    // Get list of container IDs that are associated with active hackathons
    const activeContainerIds = new Set();
    const containerKeys = await this.redis.keys('container:*');
    for (const key of containerKeys) {
      if (!key.includes(':config')) {
        const containerId = await this.redis.hget(key, 'containerId');
        if (containerId) {
          activeContainerIds.add(containerId);
        }
      }
    }

    for (const containerInfo of containers) {
      // Skip containers that are associated with active hackathons
      if (activeContainerIds.has(containerInfo.Id)) {
        console.log(`    Keeping active container: ${containerInfo.Id.substring(0, 12)}`);
        continue;
      }

      // Skip warm pool containers (they have "warm" in the name)
      if (containerInfo.Names && containerInfo.Names.some(n => n.includes('warm'))) {
        continue;
      }

      try {
        const container = this.docker.getContainer(containerInfo.Id);

        if (containerInfo.State === 'running') {
          await container.stop({ t: 10 });
        }

        await container.remove();
        console.log(`    Removed orphaned container: ${containerInfo.Id.substring(0, 12)}`);
      } catch (error) {
        console.error(`    Failed to remove container: ${error.message}`);
      }
    }
  }

  /**
   * Create warm pool of pre-initialized containers
   */
  async createWarmPool(count) {
    for (let i = 0; i < count; i++) {
      try {
        const container = await this.createContainer(`warm-${i}`);
        this.warmPool.push(container);
      } catch (error) {
        console.warn(`    Failed to create warm container: ${error.message}`);
      }
    }
  }

  /**
   * Request a container for a hackathon
   */
  async requestContainer(hackathonId, config = {}) {
    // Check capacity
    if (this.containers.size >= this.maxContainers) {
      throw new Error('Container pool at capacity');
    }

    let container;

    // Try to get from warm pool
    while (this.warmPool.length > 0) {
      container = this.warmPool.pop();

      // Verify container still exists before using
      const exists = await this.containerExists(container);
      if (exists) {
        await this.configureContainer(container, hackathonId, config);
        // Replenish warm pool in background
        this.replenishWarmPool();
        break;
      } else {
        console.log(`    Warm pool container ${container.id?.substring(0, 12)} no longer exists, trying next...`);
        container = null;
      }
    }

    // If no valid container from pool, create new one
    if (!container) {
      container = await this.createContainer(hackathonId);
      await this.configureContainer(container, hackathonId, config);
    }

    // Start container
    await container.start();

    // Track container
    this.containers.set(hackathonId, {
      container,
      hackathonId,
      config,
      startedAt: new Date().toISOString()
    });

    // Store in Redis for persistence
    await this.redis.hset(`container:${hackathonId}`, {
      containerId: container.id,
      status: 'running',
      startedAt: new Date().toISOString()
    });

    this.emit('container:started', { hackathonId, containerId: container.id });

    return new ContainerWrapper(container, this.docker, hackathonId);
  }

  /**
   * Create a new container
   */
  async createContainer(name) {
    const container = await this.docker.createContainer({
      Image: this.imageName,
      name: `iluvatar-${name}-${Date.now()}`,
      Labels: {
        'iluvatar': 'hackathon',
        'hackathon.name': name
      },
      HostConfig: {
        Memory: this.parseMemory(this.resourceLimits.memory),
        NanoCpus: this.parseCpus(this.resourceLimits.cpus),
        RestartPolicy: { Name: 'unless-stopped' },
        NetworkMode: 'bridge',
        PortBindings: {
          '5678/tcp': [{ HostPort: '' }],  // n8n
          '3000/tcp': [{ HostPort: '' }]   // App
        }
      },
      ExposedPorts: {
        '5678/tcp': {},
        '3000/tcp': {}
      },
      Env: [
        'NODE_ENV=production'
      ],
      Cmd: ['tail', '-f', '/dev/null']  // Keep container running
    });

    return container;
  }

  /**
   * Configure container for specific hackathon
   */
  async configureContainer(container, hackathonId, config) {
    // Update labels
    // Note: Docker doesn't support updating labels after creation,
    // so we track this separately

    // Store configuration in Redis
    await this.redis.hset(`container:${hackathonId}:config`, {
      budget: config.budget?.toString() || '50',
      deadline: config.deadline || '',
      configured_at: new Date().toISOString()
    });
  }

  /**
   * Check if a container still exists in Docker
   */
  async containerExists(container) {
    try {
      await container.inspect();
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Replenish warm pool in background
   */
  async replenishWarmPool() {
    if (this.warmPool.length < 2) {
      try {
        const container = await this.createContainer(`warm-${Date.now()}`);
        this.warmPool.push(container);
      } catch (error) {
        console.warn(`Failed to replenish warm pool: ${error.message}`);
      }
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(hackathonId) {
    const entry = this.containers.get(hackathonId);
    if (!entry) {
      throw new Error(`Container not found: ${hackathonId}`);
    }

    await entry.container.stop({ t: 30 });

    await this.redis.hset(`container:${hackathonId}`, 'status', 'stopped');

    this.emit('container:stopped', { hackathonId });
  }

  /**
   * Remove a container
   */
  async removeContainer(hackathonId) {
    const entry = this.containers.get(hackathonId);
    if (!entry) return;

    try {
      await entry.container.remove({ force: true });
    } catch (error) {
      console.warn(`Failed to remove container: ${error.message}`);
    }

    this.containers.delete(hackathonId);
    await this.redis.del(`container:${hackathonId}`);
    await this.redis.del(`container:${hackathonId}:config`);

    this.emit('container:removed', { hackathonId });
  }

  /**
   * Stop all containers
   */
  async stopAll() {
    const stopPromises = [];

    for (const [hackathonId] of this.containers) {
      stopPromises.push(
        this.stopContainer(hackathonId).catch(err => {
          console.error(`Failed to stop ${hackathonId}: ${err.message}`);
        })
      );
    }

    // Also stop warm pool
    for (const container of this.warmPool) {
      stopPromises.push(
        container.remove({ force: true }).catch(() => {})
      );
    }

    await Promise.all(stopPromises);
  }

  /**
   * Get pool status
   */
  async getStatus() {
    const containerStatuses = [];

    for (const [hackathonId, entry] of this.containers) {
      try {
        const inspect = await entry.container.inspect();
        containerStatuses.push({
          hackathonId,
          containerId: entry.container.id.substring(0, 12),
          status: inspect.State.Status,
          startedAt: entry.startedAt,
          memory: inspect.HostConfig.Memory,
          cpus: inspect.HostConfig.NanoCpus
        });
      } catch (error) {
        containerStatuses.push({
          hackathonId,
          containerId: entry.container.id.substring(0, 12),
          status: 'unknown',
          error: error.message
        });
      }
    }

    return {
      active: this.containers.size,
      max: this.maxContainers,
      available: this.maxContainers - this.containers.size,
      warm_pool: this.warmPool.length,
      containers: containerStatuses
    };
  }

  /**
   * Start health check loop
   */
  startHealthCheck() {
    setInterval(async () => {
      for (const [hackathonId, entry] of this.containers) {
        try {
          const inspect = await entry.container.inspect();

          if (inspect.State.Status !== 'running') {
            console.warn(`Container ${hackathonId} not running: ${inspect.State.Status}`);
            this.emit('container:unhealthy', { hackathonId, status: inspect.State.Status });
          }
        } catch (error) {
          console.error(`Health check failed for ${hackathonId}: ${error.message}`);
        }
      }
    }, 30000);  // Check every 30 seconds
  }

  /**
   * Parse memory string to bytes
   */
  parseMemory(memStr) {
    const match = memStr.match(/^(\d+)([gmk]?)$/i);
    if (!match) return 4 * 1024 * 1024 * 1024;  // Default 4GB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'g': return value * 1024 * 1024 * 1024;
      case 'm': return value * 1024 * 1024;
      case 'k': return value * 1024;
      default: return value;
    }
  }

  /**
   * Parse CPU string to nanocpus
   */
  parseCpus(cpuStr) {
    const cpus = parseFloat(cpuStr);
    return cpus * 1000000000;  // Convert to nanocpus
  }
}

/**
 * Wrapper for container operations with hackathon context
 */
class ContainerWrapper {
  constructor(container, docker, hackathonId) {
    this.container = container;
    this.docker = docker;
    this.hackathonId = hackathonId;
    this.id = container.id;
  }

  /**
   * Execute command in container
   */
  async exec(cmd, options = {}) {
    const exec = await this.container.exec({
      Cmd: Array.isArray(cmd) ? cmd : ['sh', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options.cwd || '/app'
    });

    if (options.detach) {
      await exec.start({ Detach: true });
      return null;
    }

    const stream = await exec.start({});
    return new Promise((resolve, reject) => {
      let output = '';

      stream.on('data', chunk => {
        output += chunk.toString();
      });

      stream.on('end', () => {
        resolve(output);
      });

      stream.on('error', reject);
    });
  }

  /**
   * Set environment variables
   */
  async setEnv(envVars) {
    // Write env file
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await this.exec(`echo '${envContent}' > /app/.env`);
  }

  /**
   * Start container
   */
  async start() {
    await this.container.start();
  }

  /**
   * Stop container
   */
  async stop() {
    await this.container.stop({ t: 30 });
  }

  /**
   * Remove container
   */
  async remove() {
    await this.container.remove({ force: true });
  }

  /**
   * Get container status
   */
  async getStatus() {
    const inspect = await this.container.inspect();
    return inspect.State.Status;
  }

  /**
   * Get container logs
   */
  async logs(options = {}) {
    const logStream = await this.container.logs({
      stdout: options.stdout !== false,
      stderr: options.stderr !== false,
      tail: options.tail || 1000,
      follow: false
    });

    return logStream.toString();
  }

  /**
   * Get container stats
   */
  async stats() {
    const stats = await this.container.stats({ stream: false });
    return {
      cpu: this.calculateCpuPercent(stats),
      memory: {
        used: stats.memory_stats.usage,
        limit: stats.memory_stats.limit,
        percent: (stats.memory_stats.usage / stats.memory_stats.limit * 100).toFixed(2)
      },
      network: stats.networks
    };
  }

  /**
   * Calculate CPU percentage
   */
  calculateCpuPercent(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage -
      stats.precpu_stats.system_cpu_usage;

    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta * stats.cpu_stats.online_cpus * 100).toFixed(2);
    }

    return '0.00';
  }
}

module.exports = { ContainerPool, ContainerWrapper };
