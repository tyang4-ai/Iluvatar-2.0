/**
 * ILUVATAR 3.0 - Admin Manager
 *
 * Provides Discord-based administration commands to eliminate SSH access.
 * All commands are owner-only (verified by Discord user ID).
 *
 * Commands:
 * - /admin-set-env - Set environment variable
 * - /admin-get-env - Get environment variable (masked)
 * - /admin-list-env - List all environment variables
 * - /admin-delete-env - Delete environment variable
 * - /admin-add-tool - Add new MCP tool
 * - /admin-list-tools - List all tools
 * - /admin-toggle-tool - Enable/disable tool
 * - /admin-add-credential - Add API credential
 * - /admin-list-credentials - List credentials (masked)
 * - /admin-restart - Restart services
 * - /admin-logs - View recent logs
 * - /admin-backup - Create backup
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class AdminManager {
  constructor(options = {}) {
    // Owner Discord user IDs - ONLY these users can run admin commands
    this.ownerIds = new Set(
      (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)
    );

    // Add primary owner
    if (process.env.DISCORD_OWNER_ID) {
      this.ownerIds.add(process.env.DISCORD_OWNER_ID);
    }

    this.envFilePath = options.envFilePath || path.join(process.cwd(), '.env');
    this.toolsConfig = options.toolsConfig;
    this.logsPath = options.logsPath || '/var/log/iluvatar';

    // In-memory credential store (encrypted in production)
    this.credentials = new Map();

    // Runtime environment overrides (persisted to .env on change)
    this.runtimeEnv = new Map();

    // Custom tools added at runtime
    this.customTools = new Map();

    // Load existing .env into memory
    this.loadEnvFile();
  }

  /**
   * Check if user is an owner/admin
   */
  isOwner(userId) {
    return this.ownerIds.has(userId);
  }

  /**
   * Verify owner access - throws if not authorized
   */
  verifyOwner(userId, commandName) {
    if (!this.isOwner(userId)) {
      throw new Error(
        `Unauthorized: Only bot owners can use /${commandName}. ` +
        `Your ID (${userId}) is not in the admin list.`
      );
    }
  }

  /**
   * Load .env file into memory
   */
  async loadEnvFile() {
    try {
      const content = await fs.readFile(this.envFilePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex);
          const value = trimmed.substring(eqIndex + 1);
          this.runtimeEnv.set(key, value);
        }
      }

      console.log(`    Loaded ${this.runtimeEnv.size} environment variables`);
    } catch (error) {
      console.warn('    Could not load .env file:', error.message);
    }
  }

  /**
   * Save environment variables to .env file
   */
  async saveEnvFile() {
    const lines = [];

    // Add header
    lines.push('# ILUVATAR Environment Configuration');
    lines.push('# Auto-generated - Do not edit manually while services are running');
    lines.push(`# Last updated: ${new Date().toISOString()}`);
    lines.push('');

    // Group by category
    const categories = {
      'AI Providers': ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'LOCAL_MODEL_URL'],
      'Discord': ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'DISCORD_OWNER_ID', 'ADMIN_USER_IDS', 'ADMIN_CHANNEL_ID'],
      'GitHub': ['GITHUB_TOKEN'],
      'Database': ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'],
      'Security': ['N8N_ENCRYPTION_KEY', 'VAULT_ROOT_TOKEN', 'JWT_SECRET'],
      'n8n': ['N8N_BASIC_AUTH_USER', 'N8N_BASIC_AUTH_PASSWORD', 'N8N_HOST', 'N8N_PORT', 'WEBHOOK_URL'],
      'AWS': ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_ARCHIVE_BUCKET'],
      'Deployment': ['VERCEL_TOKEN', 'RAILWAY_TOKEN'],
      'Budget': ['DEFAULT_BUDGET', 'GLOBAL_BUDGET_LIMIT', 'BUDGET_WARNING_THRESHOLD'],
      'Other': []
    };

    const categorized = new Set();

    for (const [category, keys] of Object.entries(categories)) {
      const categoryVars = [];
      for (const key of keys) {
        if (this.runtimeEnv.has(key)) {
          categoryVars.push(`${key}=${this.runtimeEnv.get(key)}`);
          categorized.add(key);
        }
      }
      if (categoryVars.length > 0) {
        lines.push(`# ${category}`);
        lines.push(...categoryVars);
        lines.push('');
      }
    }

    // Add uncategorized variables
    const uncategorized = [];
    for (const [key, value] of this.runtimeEnv) {
      if (!categorized.has(key)) {
        uncategorized.push(`${key}=${value}`);
      }
    }
    if (uncategorized.length > 0) {
      lines.push('# Custom Variables');
      lines.push(...uncategorized);
      lines.push('');
    }

    await fs.writeFile(this.envFilePath, lines.join('\n'));
  }

  // ==================== ENVIRONMENT VARIABLE COMMANDS ====================

  /**
   * Set environment variable
   */
  async setEnv(userId, key, value) {
    this.verifyOwner(userId, 'admin-set-env');

    // Validate key format
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error('Invalid key format. Use UPPER_SNAKE_CASE (e.g., MY_API_KEY)');
    }

    // Set in runtime
    this.runtimeEnv.set(key, value);
    process.env[key] = value;

    // Persist to file
    await this.saveEnvFile();

    return {
      success: true,
      key,
      masked: this.maskValue(value),
      message: `Environment variable ${key} set successfully. Restart services for changes to take effect.`
    };
  }

  /**
   * Get environment variable (masked for security)
   */
  async getEnv(userId, key) {
    this.verifyOwner(userId, 'admin-get-env');

    const value = this.runtimeEnv.get(key) || process.env[key];

    if (!value) {
      return { exists: false, key };
    }

    return {
      exists: true,
      key,
      masked: this.maskValue(value),
      length: value.length
    };
  }

  /**
   * List all environment variables (masked)
   */
  async listEnv(userId, filter = null) {
    this.verifyOwner(userId, 'admin-list-env');

    const vars = [];

    for (const [key, value] of this.runtimeEnv) {
      if (filter && !key.toLowerCase().includes(filter.toLowerCase())) {
        continue;
      }

      vars.push({
        key,
        masked: this.maskValue(value),
        source: 'file'
      });
    }

    // Sort alphabetically
    vars.sort((a, b) => a.key.localeCompare(b.key));

    return {
      count: vars.length,
      filter,
      variables: vars
    };
  }

  /**
   * Delete environment variable
   */
  async deleteEnv(userId, key) {
    this.verifyOwner(userId, 'admin-delete-env');

    if (!this.runtimeEnv.has(key)) {
      throw new Error(`Environment variable ${key} not found`);
    }

    // Prevent deleting critical variables
    const protected_vars = ['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'POSTGRES_PASSWORD'];
    if (protected_vars.includes(key)) {
      throw new Error(`Cannot delete protected variable: ${key}`);
    }

    this.runtimeEnv.delete(key);
    delete process.env[key];

    await this.saveEnvFile();

    return {
      success: true,
      key,
      message: `Environment variable ${key} deleted.`
    };
  }

  // ==================== TOOL MANAGEMENT COMMANDS ====================

  /**
   * Add a new MCP tool
   */
  async addTool(userId, toolDefinition) {
    this.verifyOwner(userId, 'admin-add-tool');

    const { name, description, category, parameters } = toolDefinition;

    // Validate tool definition
    if (!name || !description) {
      throw new Error('Tool must have name and description');
    }

    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new Error('Tool name must be lowercase_snake_case');
    }

    // Create tool object
    const tool = {
      name,
      description,
      category: category || 'custom',
      parameters: parameters || {
        type: 'object',
        properties: {},
        required: []
      }
    };

    // Add to custom tools
    this.customTools.set(name, tool);

    // Also add to toolsConfig if available
    if (this.toolsConfig) {
      this.toolsConfig.tools[name] = tool;
      this.toolsConfig.enableTool(name);
    }

    // Persist to file
    await this.saveCustomTools();

    return {
      success: true,
      tool: {
        name: tool.name,
        description: tool.description,
        category: tool.category
      }
    };
  }

  /**
   * List all tools
   */
  async listTools(userId, category = null) {
    this.verifyOwner(userId, 'admin-list-tools');

    let tools = [];

    if (this.toolsConfig) {
      tools = this.toolsConfig.getAllTools();
    }

    // Add custom tools
    for (const tool of this.customTools.values()) {
      if (!tools.find(t => t.name === tool.name)) {
        tools.push(tool);
      }
    }

    // Filter by category
    if (category) {
      tools = tools.filter(t => t.category === category);
    }

    return {
      count: tools.length,
      category,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        enabled: this.toolsConfig?.enabledTools?.has(t.name) ?? true,
        custom: this.customTools.has(t.name)
      }))
    };
  }

  /**
   * Enable or disable a tool
   */
  async toggleTool(userId, toolName, enabled) {
    this.verifyOwner(userId, 'admin-toggle-tool');

    if (!this.toolsConfig) {
      throw new Error('Tools config not available');
    }

    const tool = this.toolsConfig.getTool(toolName) || this.customTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    if (enabled) {
      this.toolsConfig.enableTool(toolName);
    } else {
      this.toolsConfig.disableTool(toolName);
    }

    return {
      success: true,
      tool: toolName,
      enabled
    };
  }

  /**
   * Delete a custom tool
   */
  async deleteTool(userId, toolName) {
    this.verifyOwner(userId, 'admin-delete-tool');

    if (!this.customTools.has(toolName)) {
      throw new Error(`Custom tool not found: ${toolName}. Only custom tools can be deleted.`);
    }

    this.customTools.delete(toolName);

    if (this.toolsConfig) {
      delete this.toolsConfig.tools[toolName];
      this.toolsConfig.disableTool(toolName);
    }

    await this.saveCustomTools();

    return {
      success: true,
      tool: toolName
    };
  }

  /**
   * Save custom tools to file
   */
  async saveCustomTools() {
    const toolsPath = path.join(process.cwd(), 'config', 'custom-tools.json');

    const tools = Array.from(this.customTools.values());

    await fs.mkdir(path.dirname(toolsPath), { recursive: true });
    await fs.writeFile(toolsPath, JSON.stringify(tools, null, 2));
  }

  /**
   * Load custom tools from file
   */
  async loadCustomTools() {
    try {
      const toolsPath = path.join(process.cwd(), 'config', 'custom-tools.json');
      const content = await fs.readFile(toolsPath, 'utf-8');
      const tools = JSON.parse(content);

      for (const tool of tools) {
        this.customTools.set(tool.name, tool);
        if (this.toolsConfig) {
          this.toolsConfig.tools[tool.name] = tool;
          this.toolsConfig.enableTool(tool.name);
        }
      }

      console.log(`    Loaded ${tools.length} custom tools`);
    } catch (error) {
      // File doesn't exist yet - that's OK
    }
  }

  // ==================== CREDENTIAL MANAGEMENT COMMANDS ====================

  /**
   * Add or update a credential
   */
  async addCredential(userId, service, key, value) {
    this.verifyOwner(userId, 'admin-add-credential');

    // Store credential
    if (!this.credentials.has(service)) {
      this.credentials.set(service, new Map());
    }

    this.credentials.get(service).set(key, value);

    // Also set as environment variable for common credentials
    const envKey = `${service.toUpperCase()}_${key.toUpperCase()}`;
    this.runtimeEnv.set(envKey, value);
    process.env[envKey] = value;

    await this.saveEnvFile();

    return {
      success: true,
      service,
      key,
      envKey,
      message: `Credential ${service}/${key} saved and set as ${envKey}`
    };
  }

  /**
   * List credentials (masked)
   */
  async listCredentials(userId) {
    this.verifyOwner(userId, 'admin-list-credentials');

    const result = [];

    for (const [service, keys] of this.credentials) {
      for (const [key, value] of keys) {
        result.push({
          service,
          key,
          masked: this.maskValue(value)
        });
      }
    }

    // Also list common credential env vars
    const credentialVars = [
      'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DISCORD_BOT_TOKEN',
      'GITHUB_TOKEN', 'VERCEL_TOKEN', 'RAILWAY_TOKEN'
    ];

    for (const varName of credentialVars) {
      const value = this.runtimeEnv.get(varName);
      if (value && !result.find(r => r.key === varName)) {
        result.push({
          service: 'env',
          key: varName,
          masked: this.maskValue(value)
        });
      }
    }

    return {
      count: result.length,
      credentials: result
    };
  }

  /**
   * Delete a credential
   */
  async deleteCredential(userId, service, key) {
    this.verifyOwner(userId, 'admin-delete-credential');

    if (this.credentials.has(service)) {
      this.credentials.get(service).delete(key);
    }

    // Also remove from env
    const envKey = `${service.toUpperCase()}_${key.toUpperCase()}`;
    this.runtimeEnv.delete(envKey);
    delete process.env[envKey];

    await this.saveEnvFile();

    return {
      success: true,
      service,
      key
    };
  }

  // ==================== SERVICE MANAGEMENT COMMANDS ====================

  /**
   * Restart services
   */
  async restartServices(userId, service = 'all') {
    this.verifyOwner(userId, 'admin-restart');

    const results = [];

    try {
      if (service === 'all') {
        // Restart via systemctl
        await execAsync('sudo systemctl restart iluvatar-orchestrator');
        results.push({ service: 'iluvatar-orchestrator', status: 'restarted' });
      } else if (service === 'orchestrator') {
        await execAsync('docker-compose restart orchestrator');
        results.push({ service: 'orchestrator', status: 'restarted' });
      } else if (service === 'n8n') {
        await execAsync('docker-compose restart n8n');
        results.push({ service: 'n8n', status: 'restarted' });
      } else if (service === 'redis') {
        await execAsync('docker-compose restart redis');
        results.push({ service: 'redis', status: 'restarted' });
      } else if (service === 'postgres') {
        await execAsync('docker-compose restart postgres');
        results.push({ service: 'postgres', status: 'restarted' });
      } else {
        throw new Error(`Unknown service: ${service}. Available: all, orchestrator, n8n, redis, postgres`);
      }

      return {
        success: true,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get recent logs
   */
  async getLogs(userId, service = 'orchestrator', lines = 50) {
    this.verifyOwner(userId, 'admin-logs');

    try {
      const { stdout } = await execAsync(
        `docker-compose logs --tail=${lines} ${service}`,
        { maxBuffer: 1024 * 1024 }
      );

      // Truncate if too long for Discord
      let logs = stdout;
      if (logs.length > 1900) {
        logs = logs.substring(logs.length - 1900);
        logs = '...(truncated)\n' + logs;
      }

      return {
        success: true,
        service,
        lines,
        logs
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service status
   */
  async getServiceStatus(userId) {
    this.verifyOwner(userId, 'admin-status');

    try {
      const { stdout } = await execAsync('docker-compose ps --format json');

      // Parse docker-compose output
      const services = [];
      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const svc = JSON.parse(line);
          services.push({
            name: svc.Service || svc.Name,
            status: svc.State || svc.Status,
            health: svc.Health || 'N/A'
          });
        } catch {
          // Non-JSON output
        }
      }

      return {
        success: true,
        services
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create backup
   */
  async createBackup(userId) {
    this.verifyOwner(userId, 'admin-backup');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `/tmp/iluvatar-backup-${timestamp}`;

    try {
      // Create backup directory
      await execAsync(`mkdir -p ${backupDir}`);

      // Backup .env
      await execAsync(`cp ${this.envFilePath} ${backupDir}/.env`);

      // Backup custom tools
      const toolsPath = path.join(process.cwd(), 'config', 'custom-tools.json');
      try {
        await execAsync(`cp ${toolsPath} ${backupDir}/`);
      } catch { /* File may not exist */ }

      // Backup database
      await execAsync(
        `docker exec iluvatar_postgres pg_dump -U iluvatar iluvatar > ${backupDir}/database.sql`
      );

      // Create archive
      const archivePath = `/tmp/iluvatar-backup-${timestamp}.tar.gz`;
      await execAsync(`tar -czf ${archivePath} -C /tmp iluvatar-backup-${timestamp}`);

      // Upload to S3 if configured
      const s3Bucket = process.env.S3_ARCHIVE_BUCKET;
      let s3Url = null;

      if (s3Bucket) {
        await execAsync(`aws s3 cp ${archivePath} s3://${s3Bucket}/backups/`);
        s3Url = `s3://${s3Bucket}/backups/iluvatar-backup-${timestamp}.tar.gz`;
      }

      // Cleanup
      await execAsync(`rm -rf ${backupDir}`);

      return {
        success: true,
        timestamp,
        localPath: archivePath,
        s3Url
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Mask sensitive values for display
   */
  maskValue(value) {
    if (!value) return '(empty)';
    if (value.length <= 8) return '****';

    const start = value.substring(0, 4);
    const end = value.substring(value.length - 4);
    return `${start}...${end}`;
  }

  /**
   * Initialize - load persisted data
   */
  async initialize() {
    await this.loadEnvFile();
    await this.loadCustomTools();
  }

  /**
   * Get owner IDs for display
   */
  getOwnerIds() {
    return Array.from(this.ownerIds);
  }

  /**
   * Add an owner
   */
  async addOwner(userId, newOwnerId) {
    this.verifyOwner(userId, 'admin-add-owner');

    this.ownerIds.add(newOwnerId);

    // Update env variable
    const currentIds = this.runtimeEnv.get('ADMIN_USER_IDS') || '';
    const ids = currentIds.split(',').filter(Boolean);
    if (!ids.includes(newOwnerId)) {
      ids.push(newOwnerId);
      this.runtimeEnv.set('ADMIN_USER_IDS', ids.join(','));
      await this.saveEnvFile();
    }

    return {
      success: true,
      newOwnerId,
      totalOwners: this.ownerIds.size
    };
  }

  /**
   * Remove an owner (cannot remove self or last owner)
   */
  async removeOwner(userId, targetOwnerId) {
    this.verifyOwner(userId, 'admin-remove-owner');

    if (userId === targetOwnerId) {
      throw new Error('Cannot remove yourself as owner');
    }

    if (this.ownerIds.size <= 1) {
      throw new Error('Cannot remove the last owner');
    }

    this.ownerIds.delete(targetOwnerId);

    // Update env variable
    const ids = Array.from(this.ownerIds);
    this.runtimeEnv.set('ADMIN_USER_IDS', ids.join(','));
    await this.saveEnvFile();

    return {
      success: true,
      removedOwnerId: targetOwnerId,
      totalOwners: this.ownerIds.size
    };
  }
}

module.exports = { AdminManager };
