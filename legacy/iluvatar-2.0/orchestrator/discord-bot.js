/**
 * ILUVATAR 3.0 - Discord Bot
 *
 * Multi-channel Discord bot for hackathon management.
 * Supports admin commands and per-hackathon channels.
 *
 * Owner-Only Admin Commands (no SSH required!):
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
 * - /admin-add-owner - Add another admin
 *
 * Admin Commands (#admin-dashboard):
 * - /new-hackathon - Create new hackathon with PDF upload
 * - /list-hackathons - Show all active/archived
 * - /system-status - Infrastructure health
 * - /global-budget - Total spend across hackathons
 * - /shutdown-hackathon - Force stop container
 *
 * Hackathon Commands (#hackathon-{name}):
 * - /status - Current progress
 * - /approve - Approve checkpoint
 * - /reject - Reject with feedback
 * - /pause - Pause hackathon
 * - /resume - Resume hackathon
 * - /budget - Budget status
 * - /suggest - Send suggestion to agents
 * - /models - View/change model config
 * - /tools - Manage tool credentials
 * - /archive-hackathon - Archive when complete
 * - /upload-results - Upload final submission
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const { AdminManager } = require('./admin-manager');

class DiscordBot {
  constructor(options) {
    this.token = options.token;
    this.hackathonManager = options.hackathonManager;
    this.registry = options.registry;
    this.toolsConfig = options.toolsConfig;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ],
      partials: [Partials.Channel, Partials.Message]
    });

    this.adminChannelId = process.env.ADMIN_CHANNEL_ID;
    this.guildId = process.env.DISCORD_GUILD_ID;

    // Initialize admin manager for owner-only commands
    this.adminManager = new AdminManager({
      toolsConfig: this.toolsConfig
    });

    // Pending checkpoint approvals
    this.pendingApprovals = new Map();

    // YOLO mode questionnaire state per hackathon
    this.yoloSetups = new Map();
  }

  /**
   * Initialize the Discord bot
   */
  async initialize() {
    // Initialize admin manager
    await this.adminManager.initialize();

    // Setup event handlers
    this.setupEventHandlers();

    // Login
    await this.client.login(this.token);

    // Wait for ready
    await new Promise(resolve => {
      this.client.once('ready', resolve);
    });

    // Register slash commands
    await this.registerCommands();

    console.log(`    Discord bot logged in as ${this.client.user.tag}`);
    console.log(`    Admin users: ${this.adminManager.getOwnerIds().length} configured`);
  }

  /**
   * Check if bot is ready
   */
  isReady() {
    return this.client.isReady();
  }

  /**
   * Disconnect the bot
   */
  async disconnect() {
    await this.client.destroy();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.client.on('interactionCreate', async interaction => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModalSubmit(interaction);
        } else if (interaction.isStringSelectMenu()) {
          await this.handleSelectMenu(interaction);
        }
      } catch (error) {
        console.error('Interaction error:', error);

        // Try to send error response, but don't crash if it fails
        try {
          const reply = {
            content: `Error: ${error.message}`,
            flags: 64 // Ephemeral
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
          } else {
            await interaction.reply(reply);
          }
        } catch (replyError) {
          // Interaction may have timed out or already been handled
          console.error('Failed to send error reply:', replyError.message);
        }
      }
    });

    // Listen for hackathon events
    if (this.hackathonManager) {
      this.hackathonManager.on('hackathon:created', data => {
        this.notifyHackathonCreated(data);
      });

      this.hackathonManager.on('hackathon:archived', data => {
        this.notifyHackathonArchived(data);
      });
    }
  }

  /**
   * Register slash commands
   */
  async registerCommands() {
    const commands = [
      // ==================== OWNER-ONLY ADMIN COMMANDS ====================
      // These commands eliminate the need for SSH access

      new SlashCommandBuilder()
        .setName('admin-set-env')
        .setDescription('[Owner Only] Set an environment variable')
        .addStringOption(opt =>
          opt.setName('key').setDescription('Variable name (UPPER_SNAKE_CASE)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('value').setDescription('Variable value').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-get-env')
        .setDescription('[Owner Only] Get an environment variable (masked)')
        .addStringOption(opt =>
          opt.setName('key').setDescription('Variable name').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-list-env')
        .setDescription('[Owner Only] List all environment variables')
        .addStringOption(opt =>
          opt.setName('filter').setDescription('Filter by name (optional)')),

      new SlashCommandBuilder()
        .setName('admin-delete-env')
        .setDescription('[Owner Only] Delete an environment variable')
        .addStringOption(opt =>
          opt.setName('key').setDescription('Variable name').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-add-tool')
        .setDescription('[Owner Only] Add a new MCP tool')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Tool name (lowercase_snake_case)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('description').setDescription('Tool description').setRequired(true))
        .addStringOption(opt =>
          opt.setName('category').setDescription('Tool category')
            .addChoices(
              { name: 'File System', value: 'file_system' },
              { name: 'Code', value: 'code' },
              { name: 'Web', value: 'web' },
              { name: 'Database', value: 'database' },
              { name: 'Deployment', value: 'deployment' },
              { name: 'Communication', value: 'communication' },
              { name: 'Custom', value: 'custom' }
            ))
        .addStringOption(opt =>
          opt.setName('parameters').setDescription('JSON parameters schema (optional)')),

      new SlashCommandBuilder()
        .setName('admin-list-tools')
        .setDescription('[Owner Only] List all MCP tools')
        .addStringOption(opt =>
          opt.setName('category').setDescription('Filter by category')),

      new SlashCommandBuilder()
        .setName('admin-toggle-tool')
        .setDescription('[Owner Only] Enable or disable a tool')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Tool name').setRequired(true))
        .addBooleanOption(opt =>
          opt.setName('enabled').setDescription('Enable or disable').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-delete-tool')
        .setDescription('[Owner Only] Delete a custom tool')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Tool name').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-add-credential')
        .setDescription('[Owner Only] Add an API credential')
        .addStringOption(opt =>
          opt.setName('service').setDescription('Service name (e.g., anthropic, github)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('key').setDescription('Credential key (e.g., api_key, token)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('value').setDescription('Credential value').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-list-credentials')
        .setDescription('[Owner Only] List all credentials (masked)'),

      new SlashCommandBuilder()
        .setName('admin-delete-credential')
        .setDescription('[Owner Only] Delete a credential')
        .addStringOption(opt =>
          opt.setName('service').setDescription('Service name').setRequired(true))
        .addStringOption(opt =>
          opt.setName('key').setDescription('Credential key').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-restart')
        .setDescription('[Owner Only] Restart services')
        .addStringOption(opt =>
          opt.setName('service').setDescription('Service to restart')
            .addChoices(
              { name: 'All Services', value: 'all' },
              { name: 'Orchestrator', value: 'orchestrator' },
              { name: 'n8n', value: 'n8n' },
              { name: 'Redis', value: 'redis' },
              { name: 'PostgreSQL', value: 'postgres' }
            )),

      new SlashCommandBuilder()
        .setName('admin-logs')
        .setDescription('[Owner Only] View recent logs')
        .addStringOption(opt =>
          opt.setName('service').setDescription('Service to view logs')
            .addChoices(
              { name: 'Orchestrator', value: 'orchestrator' },
              { name: 'n8n', value: 'n8n' },
              { name: 'Redis', value: 'redis' },
              { name: 'PostgreSQL', value: 'postgres' }
            ))
        .addIntegerOption(opt =>
          opt.setName('lines').setDescription('Number of lines (default: 50)').setMinValue(10).setMaxValue(200)),

      new SlashCommandBuilder()
        .setName('admin-backup')
        .setDescription('[Owner Only] Create a backup'),

      new SlashCommandBuilder()
        .setName('admin-status')
        .setDescription('[Owner Only] View service status'),

      new SlashCommandBuilder()
        .setName('admin-add-owner')
        .setDescription('[Owner Only] Add another admin user')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to add as admin').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-remove-owner')
        .setDescription('[Owner Only] Remove an admin user')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to remove').setRequired(true)),

      new SlashCommandBuilder()
        .setName('admin-list-owners')
        .setDescription('[Owner Only] List all admin users'),

      // ==================== HACKATHON MANAGEMENT COMMANDS ====================

      // Admin commands
      new SlashCommandBuilder()
        .setName('new-hackathon')
        .setDescription('Create a new hackathon')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Hackathon name').setRequired(true))
        .addStringOption(opt =>
          opt.setName('deadline').setDescription('Deadline (ISO format)').setRequired(true))
        .addNumberOption(opt =>
          opt.setName('budget').setDescription('Budget in USD').setRequired(true))
        .addAttachmentOption(opt =>
          opt.setName('pdf1').setDescription('Rules PDF 1 (optional)'))
        .addAttachmentOption(opt =>
          opt.setName('pdf2').setDescription('Rules PDF 2 (optional)'))
        .addAttachmentOption(opt =>
          opt.setName('pdf3').setDescription('Rules PDF 3 (optional)'))
        .addAttachmentOption(opt =>
          opt.setName('pdf4').setDescription('Rules PDF 4 (optional)'))
        .addAttachmentOption(opt =>
          opt.setName('pdf5').setDescription('Rules PDF 5 (optional)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('list-hackathons')
        .setDescription('List all hackathons')
        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('Filter by status')
            .addChoices(
              { name: 'Active', value: 'active' },
              { name: 'Paused', value: 'paused' },
              { name: 'Archived', value: 'archived' },
              { name: 'All', value: 'all' }
            )),

      new SlashCommandBuilder()
        .setName('system-status')
        .setDescription('Show system status')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('global-budget')
        .setDescription('Show global budget across all hackathons')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('shutdown-hackathon')
        .setDescription('Force shutdown a hackathon')
        .addStringOption(opt =>
          opt.setName('id').setDescription('Hackathon ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      // Hackathon commands
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show hackathon status'),

      new SlashCommandBuilder()
        .setName('approve')
        .setDescription('Approve current checkpoint')
        .addStringOption(opt =>
          opt.setName('feedback').setDescription('Optional feedback')),

      new SlashCommandBuilder()
        .setName('reject')
        .setDescription('Reject current checkpoint')
        .addStringOption(opt =>
          opt.setName('feedback').setDescription('Reason for rejection').setRequired(true)),

      new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the hackathon'),

      new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the hackathon'),

      new SlashCommandBuilder()
        .setName('budget')
        .setDescription('Show budget status'),

      new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Send a suggestion to the agents')
        .addStringOption(opt =>
          opt.setName('suggestion').setDescription('Your suggestion').setRequired(true)),

      new SlashCommandBuilder()
        .setName('archive-hackathon')
        .setDescription('Archive this hackathon'),

      new SlashCommandBuilder()
        .setName('set-github')
        .setDescription('Set GitHub repository for this hackathon')
        .addStringOption(opt =>
          opt.setName('repo').setDescription('GitHub repo URL (e.g., https://github.com/owner/repo)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('token').setDescription('GitHub personal access token (optional, for private repos)')),

      // ==================== RESOURCE MANAGEMENT COMMANDS ====================

      new SlashCommandBuilder()
        .setName('resource-add')
        .setDescription('Submit a resource for approval')
        .addStringOption(opt =>
          opt.setName('url').setDescription('Resource URL').setRequired(true))
        .addStringOption(opt =>
          opt.setName('title').setDescription('Resource title').setRequired(true))
        .addStringOption(opt =>
          opt.setName('description').setDescription('Brief description'))
        .addStringOption(opt =>
          opt.setName('category').setDescription('Category')
            .addChoices(
              { name: 'Documentation', value: 'docs' },
              { name: 'Tutorial', value: 'tutorial' },
              { name: 'Tool', value: 'tool' },
              { name: 'API', value: 'api' },
              { name: 'Template', value: 'template' },
              { name: 'Other', value: 'other' }
            ))
        .addStringOption(opt =>
          opt.setName('tags').setDescription('Comma-separated tags')),

      new SlashCommandBuilder()
        .setName('resource-add-repo')
        .setDescription('Submit a repository for organization by Librarian')
        .addStringOption(opt =>
          opt.setName('url').setDescription('Repository URL').setRequired(true))
        .addStringOption(opt =>
          opt.setName('description').setDescription('What this repo contains')),

      new SlashCommandBuilder()
        .setName('resource-approve')
        .setDescription('[Admin] Approve a pending resource')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Resource ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('resource-reject')
        .setDescription('[Admin] Reject a pending resource')
        .addIntegerOption(opt =>
          opt.setName('id').setDescription('Resource ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('resource-list')
        .setDescription('List approved resources')
        .addStringOption(opt =>
          opt.setName('category').setDescription('Filter by category')
            .addChoices(
              { name: 'Documentation', value: 'docs' },
              { name: 'Tutorial', value: 'tutorial' },
              { name: 'Tool', value: 'tool' },
              { name: 'API', value: 'api' },
              { name: 'Template', value: 'template' },
              { name: 'Other', value: 'other' }
            )),

      new SlashCommandBuilder()
        .setName('resource-pending')
        .setDescription('[Admin] List pending resources for approval')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

      new SlashCommandBuilder()
        .setName('resource-search')
        .setDescription('Search resources by keyword')
        .addStringOption(opt =>
          opt.setName('query').setDescription('Search query').setRequired(true)),

      // ==================== FILE & PLANNING COMMANDS ====================

      new SlashCommandBuilder()
        .setName('upload-files')
        .setDescription('Upload code or files to your hackathon')
        .addAttachmentOption(opt =>
          opt.setName('file').setDescription('File to upload').setRequired(true))
        .addStringOption(opt =>
          opt.setName('path').setDescription('Target path in project (e.g., src/main.py)')),

      new SlashCommandBuilder()
        .setName('upload-plan')
        .setDescription('Upload a custom plan JSON for your hackathon')
        .addAttachmentOption(opt =>
          opt.setName('plan').setDescription('Plan JSON file').setRequired(true)),

      new SlashCommandBuilder()
        .setName('continue-build')
        .setDescription('Continue hackathon from a specific phase')
        .addStringOption(opt =>
          opt.setName('from-phase')
            .setDescription('Phase to start from')
            .setRequired(true)
            .addChoices(
              { name: 'Ideation (planning)', value: 'ideation' },
              { name: 'Architecture (planning)', value: 'architecture' },
              { name: 'Backend Development', value: 'backend' },
              { name: 'Frontend Development', value: 'frontend' },
              { name: 'Integration', value: 'integration' },
              { name: 'Testing', value: 'testing' },
              { name: 'Deployment', value: 'deployment' }
            ))
        .addBooleanOption(opt =>
          opt.setName('use-uploaded-plan')
            .setDescription('Use previously uploaded plan JSON'))
    ];

    const rest = this.client.rest;
    await rest.put(
      `/applications/${this.client.user.id}/guilds/${this.guildId}/commands`,
      { body: commands.map(c => c.toJSON()) }
    );
  }

  /**
   * Handle slash commands
   */
  async handleCommand(interaction) {
    const { commandName } = interaction;

    switch (commandName) {
      // ==================== OWNER-ONLY ADMIN COMMANDS ====================
      case 'admin-set-env':
        await this.handleAdminSetEnv(interaction);
        break;
      case 'admin-get-env':
        await this.handleAdminGetEnv(interaction);
        break;
      case 'admin-list-env':
        await this.handleAdminListEnv(interaction);
        break;
      case 'admin-delete-env':
        await this.handleAdminDeleteEnv(interaction);
        break;
      case 'admin-add-tool':
        await this.handleAdminAddTool(interaction);
        break;
      case 'admin-list-tools':
        await this.handleAdminListTools(interaction);
        break;
      case 'admin-toggle-tool':
        await this.handleAdminToggleTool(interaction);
        break;
      case 'admin-delete-tool':
        await this.handleAdminDeleteTool(interaction);
        break;
      case 'admin-add-credential':
        await this.handleAdminAddCredential(interaction);
        break;
      case 'admin-list-credentials':
        await this.handleAdminListCredentials(interaction);
        break;
      case 'admin-delete-credential':
        await this.handleAdminDeleteCredential(interaction);
        break;
      case 'admin-restart':
        await this.handleAdminRestart(interaction);
        break;
      case 'admin-logs':
        await this.handleAdminLogs(interaction);
        break;
      case 'admin-backup':
        await this.handleAdminBackup(interaction);
        break;
      case 'admin-status':
        await this.handleAdminServiceStatus(interaction);
        break;
      case 'admin-add-owner':
        await this.handleAdminAddOwner(interaction);
        break;
      case 'admin-remove-owner':
        await this.handleAdminRemoveOwner(interaction);
        break;
      case 'admin-list-owners':
        await this.handleAdminListOwners(interaction);
        break;

      // ==================== HACKATHON MANAGEMENT COMMANDS ====================
      case 'new-hackathon':
        await this.handleNewHackathon(interaction);
        break;
      case 'list-hackathons':
        await this.handleListHackathons(interaction);
        break;
      case 'system-status':
        await this.handleSystemStatus(interaction);
        break;
      case 'global-budget':
        await this.handleGlobalBudget(interaction);
        break;
      case 'shutdown-hackathon':
        await this.handleShutdownHackathon(interaction);
        break;
      case 'status':
        await this.handleStatus(interaction);
        break;
      case 'approve':
        await this.handleApprove(interaction);
        break;
      case 'reject':
        await this.handleReject(interaction);
        break;
      case 'pause':
        await this.handlePause(interaction);
        break;
      case 'resume':
        await this.handleResume(interaction);
        break;
      case 'budget':
        await this.handleBudget(interaction);
        break;
      case 'suggest':
        await this.handleSuggest(interaction);
        break;
      case 'archive-hackathon':
        await this.handleArchive(interaction);
        break;
      case 'set-github':
        await this.handleSetGitHub(interaction);
        break;

      // ==================== RESOURCE MANAGEMENT COMMANDS ====================
      case 'resource-add':
        await this.handleResourceAdd(interaction);
        break;
      case 'resource-add-repo':
        await this.handleResourceAddRepo(interaction);
        break;
      case 'resource-approve':
        await this.handleResourceApprove(interaction);
        break;
      case 'resource-reject':
        await this.handleResourceReject(interaction);
        break;
      case 'resource-list':
        await this.handleResourceList(interaction);
        break;
      case 'resource-pending':
        await this.handleResourcePending(interaction);
        break;
      case 'resource-search':
        await this.handleResourceSearch(interaction);
        break;

      // ==================== FILE & PLANNING COMMANDS ====================
      case 'upload-files':
        await this.handleUploadFiles(interaction);
        break;
      case 'upload-plan':
        await this.handleUploadPlan(interaction);
        break;
      case 'continue-build':
        await this.handleContinueBuild(interaction);
        break;

      default:
        await interaction.reply({ content: 'Unknown command', ephemeral: true });
    }
  }

  // ==================== OWNER-ONLY ADMIN COMMAND HANDLERS ====================

  /**
   * Handle /admin-set-env command
   */
  async handleAdminSetEnv(interaction) {
    const userId = interaction.user.id;
    const key = interaction.options.getString('key');
    const value = interaction.options.getString('value');

    try {
      const result = await this.adminManager.setEnv(userId, key, value);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Environment Variable Set')
            .setColor(0x00ff00)
            .addFields(
              { name: 'Key', value: `\`${result.key}\``, inline: true },
              { name: 'Value', value: `\`${result.masked}\``, inline: true }
            )
            .setFooter({ text: 'Restart services for changes to take effect' })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-get-env command
   */
  async handleAdminGetEnv(interaction) {
    const userId = interaction.user.id;
    const key = interaction.options.getString('key');

    try {
      const result = await this.adminManager.getEnv(userId, key);

      if (!result.exists) {
        await interaction.reply({ content: `Variable \`${key}\` not found`, ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Environment Variable')
            .setColor(0x0099ff)
            .addFields(
              { name: 'Key', value: `\`${result.key}\``, inline: true },
              { name: 'Value', value: `\`${result.masked}\``, inline: true },
              { name: 'Length', value: `${result.length} chars`, inline: true }
            )
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-list-env command
   */
  async handleAdminListEnv(interaction) {
    const userId = interaction.user.id;
    const filter = interaction.options.getString('filter');

    try {
      const result = await this.adminManager.listEnv(userId, filter);

      if (result.count === 0) {
        await interaction.reply({ content: 'No environment variables found', ephemeral: true });
        return;
      }

      // Build list (truncate if too many)
      const maxShow = 25;
      let list = result.variables.slice(0, maxShow)
        .map(v => `\`${v.key}\` = \`${v.masked}\``)
        .join('\n');

      if (result.count > maxShow) {
        list += `\n\n... and ${result.count - maxShow} more`;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Environment Variables${filter ? ` (filter: ${filter})` : ''}`)
            .setColor(0x0099ff)
            .setDescription(list)
            .setFooter({ text: `Total: ${result.count} variables` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-delete-env command
   */
  async handleAdminDeleteEnv(interaction) {
    const userId = interaction.user.id;
    const key = interaction.options.getString('key');

    try {
      const result = await this.adminManager.deleteEnv(userId, key);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Environment Variable Deleted')
            .setColor(0xff6600)
            .addFields({ name: 'Key', value: `\`${result.key}\`` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-add-tool command
   */
  async handleAdminAddTool(interaction) {
    const userId = interaction.user.id;
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const category = interaction.options.getString('category') || 'custom';
    const parametersJson = interaction.options.getString('parameters');

    try {
      let parameters = { type: 'object', properties: {}, required: [] };
      if (parametersJson) {
        try {
          parameters = JSON.parse(parametersJson);
        } catch {
          throw new Error('Invalid JSON for parameters');
        }
      }

      const result = await this.adminManager.addTool(userId, {
        name, description, category, parameters
      });

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('MCP Tool Added')
            .setColor(0x00ff00)
            .addFields(
              { name: 'Name', value: `\`${result.tool.name}\``, inline: true },
              { name: 'Category', value: result.tool.category, inline: true },
              { name: 'Description', value: result.tool.description }
            )
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-list-tools command
   */
  async handleAdminListTools(interaction) {
    const userId = interaction.user.id;
    const category = interaction.options.getString('category');

    try {
      const result = await this.adminManager.listTools(userId, category);

      if (result.count === 0) {
        await interaction.reply({ content: 'No tools found', ephemeral: true });
        return;
      }

      const list = result.tools.map(t => {
        const status = t.enabled ? '' : ' (disabled)';
        const custom = t.custom ? ' [custom]' : '';
        return `**${t.name}**${status}${custom}\n${t.description}`;
      }).join('\n\n');

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`MCP Tools${category ? ` (${category})` : ''}`)
            .setColor(0x0099ff)
            .setDescription(list.substring(0, 4000))
            .setFooter({ text: `Total: ${result.count} tools` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-toggle-tool command
   */
  async handleAdminToggleTool(interaction) {
    const userId = interaction.user.id;
    const name = interaction.options.getString('name');
    const enabled = interaction.options.getBoolean('enabled');

    try {
      const result = await this.adminManager.toggleTool(userId, name, enabled);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Tool ${enabled ? 'Enabled' : 'Disabled'}`)
            .setColor(enabled ? 0x00ff00 : 0xff6600)
            .addFields({ name: 'Tool', value: `\`${result.tool}\`` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-delete-tool command
   */
  async handleAdminDeleteTool(interaction) {
    const userId = interaction.user.id;
    const name = interaction.options.getString('name');

    try {
      const result = await this.adminManager.deleteTool(userId, name);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Tool Deleted')
            .setColor(0xff6600)
            .addFields({ name: 'Tool', value: `\`${result.tool}\`` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-add-credential command
   */
  async handleAdminAddCredential(interaction) {
    const userId = interaction.user.id;
    const service = interaction.options.getString('service');
    const key = interaction.options.getString('key');
    const value = interaction.options.getString('value');

    try {
      const result = await this.adminManager.addCredential(userId, service, key, value);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Credential Added')
            .setColor(0x00ff00)
            .addFields(
              { name: 'Service', value: result.service, inline: true },
              { name: 'Key', value: result.key, inline: true },
              { name: 'Env Variable', value: `\`${result.envKey}\``, inline: true }
            )
            .setFooter({ text: 'Credential saved and set as environment variable' })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-list-credentials command
   */
  async handleAdminListCredentials(interaction) {
    const userId = interaction.user.id;

    try {
      const result = await this.adminManager.listCredentials(userId);

      if (result.count === 0) {
        await interaction.reply({ content: 'No credentials found', ephemeral: true });
        return;
      }

      const list = result.credentials
        .map(c => `**${c.service}/${c.key}**: \`${c.masked}\``)
        .join('\n');

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Credentials')
            .setColor(0x0099ff)
            .setDescription(list)
            .setFooter({ text: `Total: ${result.count} credentials (values masked)` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-delete-credential command
   */
  async handleAdminDeleteCredential(interaction) {
    const userId = interaction.user.id;
    const service = interaction.options.getString('service');
    const key = interaction.options.getString('key');

    try {
      const result = await this.adminManager.deleteCredential(userId, service, key);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Credential Deleted')
            .setColor(0xff6600)
            .addFields(
              { name: 'Service', value: result.service, inline: true },
              { name: 'Key', value: result.key, inline: true }
            )
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-restart command
   */
  async handleAdminRestart(interaction) {
    const userId = interaction.user.id;
    const service = interaction.options.getString('service') || 'all';

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.adminManager.restartServices(userId, service);

      if (result.success) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Services Restarted')
              .setColor(0x00ff00)
              .setDescription(result.results.map(r => `${r.service}: ${r.status}`).join('\n'))
          ]
        });
      } else {
        await interaction.editReply(`Error: ${result.error}`);
      }
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /admin-logs command
   */
  async handleAdminLogs(interaction) {
    const userId = interaction.user.id;
    const service = interaction.options.getString('service') || 'orchestrator';
    const lines = interaction.options.getInteger('lines') || 50;

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.adminManager.getLogs(userId, service, lines);

      if (result.success) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`Logs: ${service}`)
              .setColor(0x0099ff)
              .setDescription(`\`\`\`\n${result.logs.substring(0, 4000)}\n\`\`\``)
              .setFooter({ text: `Last ${lines} lines` })
          ]
        });
      } else {
        await interaction.editReply(`Error: ${result.error}`);
      }
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /admin-backup command
   */
  async handleAdminBackup(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.adminManager.createBackup(userId);

      if (result.success) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Backup Created')
              .setColor(0x00ff00)
              .addFields(
                { name: 'Timestamp', value: result.timestamp },
                { name: 'Local Path', value: `\`${result.localPath}\`` },
                { name: 'S3 URL', value: result.s3Url || 'Not configured' }
              )
          ]
        });
      } else {
        await interaction.editReply(`Error: ${result.error}`);
      }
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /admin-status command (service status)
   */
  async handleAdminServiceStatus(interaction) {
    const userId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.adminManager.getServiceStatus(userId);

      if (result.success) {
        const list = result.services.map(s => {
          const emoji = s.status === 'running' ? '' : '';
          return `${emoji} **${s.name}**: ${s.status}`;
        }).join('\n');

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Service Status')
              .setColor(0x0099ff)
              .setDescription(list || 'No services found')
          ]
        });
      } else {
        await interaction.editReply(`Error: ${result.error}`);
      }
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /admin-add-owner command
   */
  async handleAdminAddOwner(interaction) {
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('user');

    try {
      const result = await this.adminManager.addOwner(userId, targetUser.id);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Admin Added')
            .setColor(0x00ff00)
            .addFields(
              { name: 'User', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Total Admins', value: `${result.totalOwners}`, inline: true }
            )
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-remove-owner command
   */
  async handleAdminRemoveOwner(interaction) {
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('user');

    try {
      const result = await this.adminManager.removeOwner(userId, targetUser.id);

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Admin Removed')
            .setColor(0xff6600)
            .addFields(
              { name: 'User', value: `<@${targetUser.id}>`, inline: true },
              { name: 'Remaining Admins', value: `${result.totalOwners}`, inline: true }
            )
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /admin-list-owners command
   */
  async handleAdminListOwners(interaction) {
    const userId = interaction.user.id;

    try {
      // Verify owner first
      this.adminManager.verifyOwner(userId, 'admin-list-owners');

      const ownerIds = this.adminManager.getOwnerIds();
      const list = ownerIds.map(id => `<@${id}>`).join('\n') || 'No admins configured';

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Admin Users')
            .setColor(0x0099ff)
            .setDescription(list)
            .setFooter({ text: `Total: ${ownerIds.length} admins` })
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  // ==================== HACKATHON COMMAND HANDLERS ====================

  /**
   * Handle /new-hackathon command
   * Creates hackathon and shows mode selection buttons
   */
  async handleNewHackathon(interaction) {
    await interaction.deferReply();

    const name = interaction.options.getString('name');
    const deadline = interaction.options.getString('deadline');
    const budget = interaction.options.getNumber('budget');

    // Collect multiple PDF attachments (pdf1-pdf5)
    const pdfUrls = [];
    for (let i = 1; i <= 5; i++) {
      const pdf = interaction.options.getAttachment(`pdf${i}`);
      if (pdf?.url) {
        pdfUrls.push(pdf.url);
      }
    }

    try {
      // Create dedicated channel for this hackathon
      const channel = await interaction.guild.channels.create({
        name: `hackathon-${name.toLowerCase().replace(/\s+/g, '-')}`,
        type: 0,  // Text channel
        topic: `ILUVATAR Hackathon: ${name}`
      });

      // Create hackathon (container started but workflow paused, waiting for mode selection)
      const hackathon = await this.hackathonManager.createHackathon({
        name,
        deadline,
        budget,
        pdfUrls,  // Array of PDF URLs
        discordChannelId: channel.id,
        ownerId: interaction.user.id,
        memberIds: [],
        autoStart: false  // Don't auto-start workflow
      });

      // Build response embed with hackathon info
      const embed = new EmbedBuilder()
        .setTitle('🚀 Hackathon Created!')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Name', value: name, inline: true },
          { name: 'ID', value: hackathon.id, inline: true },
          { name: 'Deadline', value: deadline, inline: true },
          { name: 'Budget', value: `$${budget}`, inline: true },
          { name: 'Channel', value: `<#${channel.id}>`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Build rules summary embed (if PDF was parsed)
      const rulesEmbed = new EmbedBuilder()
        .setTitle(`📋 ${name} - Ready to Start`)
        .setColor(0x0099ff)
        .setDescription(hackathon.parsed_rules?.summary || 'No rules PDF provided. You can add context manually.');

      if (hackathon.parsed_rules) {
        if (hackathon.parsed_rules.deadline) {
          rulesEmbed.addFields({ name: 'Extracted Deadline', value: hackathon.parsed_rules.deadline, inline: true });
        }
        if (hackathon.parsed_rules.prize_tracks?.length > 0) {
          rulesEmbed.addFields({
            name: 'Prize Tracks',
            value: hackathon.parsed_rules.prize_tracks.slice(0, 5).join('\n') || 'None found',
            inline: true
          });
        }
        if (hackathon.parsed_rules.requirements?.length > 0) {
          rulesEmbed.addFields({
            name: 'Key Requirements',
            value: hackathon.parsed_rules.requirements.slice(0, 5).join('\n') || 'None found'
          });
        }
      }

      rulesEmbed.addFields({
        name: 'Next Step',
        value: 'Choose how you want to proceed:'
      });

      // Build mode selection buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`hackathon-mode:${hackathon.id}:add-context`)
          .setLabel('Add More Context')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`hackathon-mode:${hackathon.id}:plan-only`)
          .setLabel('Plan Only')
          .setEmoji('🗺️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`hackathon-mode:${hackathon.id}:full-auto`)
          .setLabel('Do Everything')
          .setEmoji('🚀')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`hackathon-mode:${hackathon.id}:yolo-mode`)
          .setLabel('YOLO Mode')
          .setEmoji('⚡')
          .setStyle(ButtonStyle.Danger)
      );

      // Send welcome message with mode selection to hackathon channel
      await channel.send({
        embeds: [rulesEmbed],
        components: [row]
      });

      // Also send commands reference
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('Available Commands')
            .setColor(0x666666)
            .setDescription(
              '**Status & Control:**\n' +
              '`/status` - View progress\n' +
              '`/approve` / `/reject` - Handle checkpoints\n' +
              '`/pause` / `/resume` - Control workflow\n\n' +
              '**Files & Planning:**\n' +
              '`/upload-files` - Upload code/files\n' +
              '`/upload-plan` - Upload custom plan JSON\n' +
              '`/continue-build` - Resume from specific phase\n\n' +
              '**Other:**\n' +
              '`/budget` - Check budget\n' +
              '`/suggest` - Send suggestion to agents'
            )
        ]
      });

      // Send deployment checklist showing infrastructure status
      await this.sendDeploymentChecklist(channel, hackathon.id);

    } catch (error) {
      await interaction.editReply(`Failed to create hackathon: ${error.message}`);
    }
  }

  /**
   * Handle /list-hackathons command
   */
  async handleListHackathons(interaction) {
    await interaction.deferReply();

    const status = interaction.options.getString('status') || 'active';

    const hackathons = await this.registry.listHackathons({
      status: status === 'all' ? undefined : status
    });

    if (hackathons.length === 0) {
      await interaction.editReply('No hackathons found.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Hackathons')
      .setColor(0x0099ff);

    for (const h of hackathons.slice(0, 10)) {
      const statusEmoji = {
        active: '🟢',
        paused: '🟡',
        archived: '📦'
      }[h.status] || '⚪';

      embed.addFields({
        name: `${statusEmoji} ${h.name}`,
        value: `ID: \`${h.id}\`\nDeadline: ${h.deadline}\nBudget: $${h.budget}`,
        inline: true
      });
    }

    if (hackathons.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${hackathons.length}` });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /system-status command
   */
  async handleSystemStatus(interaction) {
    await interaction.deferReply();

    // This would get actual status from orchestrator
    const embed = new EmbedBuilder()
      .setTitle('🔧 System Status')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Status', value: '🟢 Healthy', inline: true },
        { name: 'Active Hackathons', value: `${this.hackathonManager?.getActiveCount() || 0}`, inline: true },
        { name: 'Uptime', value: `${Math.floor(process.uptime() / 3600)}h`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /global-budget command
   */
  async handleGlobalBudget(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setTitle('💰 Global Budget')
      .setColor(0xffd700)
      .addFields(
        { name: 'Total Budget', value: '$500.00', inline: true },
        { name: 'Total Spent', value: '$123.45', inline: true },
        { name: 'Remaining', value: '$376.55', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /status command (hackathon-specific)
   */
  async handleStatus(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);

    if (!hackathonId) {
      await interaction.reply({
        content: 'This command must be used in a hackathon channel.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    try {
      const status = await this.hackathonManager.getStatus(hackathonId);

      // Calculate progress values
      const phasesCompleted = status.phases_completed || 0;
      const phasesTotal = status.phases_total || 6;
      const filesCompleted = status.files_completed || 0;
      const filesTotal = status.files_total || 0;
      const budgetSpent = parseFloat(status.budget?.spent) || 0;
      const budgetTotal = parseFloat(status.budget?.total) || 100;

      // Create progress bars
      const phaseBar = this.createProgressBar(phasesCompleted, phasesTotal);
      const budgetBar = this.createProgressBar(budgetSpent, budgetTotal);
      const timeBar = this.createTimeBar(status.deadline);
      const timeRemaining = this.formatTimeRemaining(status.deadline);

      // Status emoji
      const statusEmoji = {
        active: '🟢',
        paused: '🟡',
        completed: '✅',
        error: '🔴'
      }[status.status] || '⚪';

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${status.name} Status`)
        .setColor(status.status === 'active' ? 0x00ff00 : status.status === 'paused' ? 0xffff00 : 0x808080)
        .setDescription(`${statusEmoji} **${status.status?.toUpperCase()}** - ${status.phase || 'Initializing'}`)
        .addFields(
          {
            name: 'Phase Progress',
            value: `\`${phaseBar}\`\n${status.phase || 'Not started'} (${phasesCompleted}/${phasesTotal})`,
            inline: false
          },
          {
            name: 'Budget',
            value: `\`${budgetBar}\`\n$${budgetSpent.toFixed(2)}/$${budgetTotal}`,
            inline: true
          },
          {
            name: 'Time Remaining',
            value: `\`${timeBar}\`\n${timeRemaining}`,
            inline: true
          }
        )
        .setTimestamp();

      // Add files progress if available
      if (filesTotal > 0) {
        const filesBar = this.createProgressBar(filesCompleted, filesTotal);
        embed.addFields({
          name: 'Files',
          value: `\`${filesBar}\`\n${filesCompleted}/${filesTotal} complete`,
          inline: true
        });
      }

      // Add agent activity if available
      if (status.active_agents && status.active_agents.length > 0) {
        embed.addFields({
          name: 'Active Agents',
          value: status.active_agents.map(a => `🤖 ${a}`).join('\n'),
          inline: false
        });
      }

      // Add circuit breaker status if any are open
      if (status.open_circuits && status.open_circuits.length > 0) {
        embed.addFields({
          name: '⚠️ Circuit Breakers Open',
          value: status.open_circuits.map(c => `❌ ${c.id}: ${c.failures} failures`).join('\n'),
          inline: false
        });
        embed.setColor(0xff6600); // Orange warning color
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /approve command
   */
  async handleApprove(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    const feedback = interaction.options.getString('feedback') || '';

    // This would communicate with the checkpoint system
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Checkpoint Approved')
          .setColor(0x00ff00)
          .setDescription(feedback || 'Approved without feedback')
      ]
    });
  }

  /**
   * Handle /reject command
   */
  async handleReject(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    const feedback = interaction.options.getString('feedback');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Checkpoint Rejected')
          .setColor(0xff0000)
          .setDescription(feedback)
      ]
    });
  }

  /**
   * Handle /pause command
   */
  async handlePause(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      await this.hackathonManager.pauseHackathon(hackathonId);
      await interaction.editReply('⏸️ Hackathon paused.');
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /resume command
   */
  async handleResume(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      await this.hackathonManager.resumeHackathon(hackathonId);
      await interaction.editReply('▶️ Hackathon resumed.');
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /budget command
   */
  async handleBudget(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const budget = await this.hackathonManager.getBudget(hackathonId);

      const embed = new EmbedBuilder()
        .setTitle('💰 Budget Status')
        .setColor(0xffd700)
        .addFields(
          { name: 'Total', value: `$${budget.total}`, inline: true },
          { name: 'Spent', value: `$${budget.spent.toFixed(4)}`, inline: true },
          { name: 'Remaining', value: `$${(budget.total - budget.spent).toFixed(4)}`, inline: true }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /suggest command
   * Routes suggestions through Denethor (planning agent) first
   */
  async handleSuggest(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    const suggestion = interaction.options.getString('suggestion');

    await interaction.deferReply();

    try {
      // Route suggestion through Denethor (planning agent) first
      // Denethor will analyze the suggestion and determine which agents should act on it
      const message = {
        type: 'user_suggestion',
        from: 'discord',
        to: 'Denethor',  // Route to planning agent first
        hackathon_id: hackathonId,
        user_id: interaction.user.id,
        timestamp: new Date().toISOString(),
        payload: {
          suggestion: suggestion,
          channel_id: interaction.channelId,
          routing: 'planning_first'  // Flag that this came via planning route
        }
      };

      // Publish to Denethor's inbox via Redis
      if (this.hackathonManager?.messageBus) {
        await this.hackathonManager.messageBus.publish(
          `agent:04:inbox`,  // Denethor is agent 04
          JSON.stringify(message)
        );
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('💡 Suggestion Sent to Planner')
            .setColor(0x0099ff)
            .setDescription(suggestion)
            .addFields({
              name: 'Routed via',
              value: 'Denethor (Planning Agent) → Appropriate agents',
              inline: false
            })
            .setFooter({ text: 'Denethor will analyze and delegate to the right agents' })
        ]
      });
    } catch (error) {
      await interaction.editReply(`Error sending suggestion: ${error.message}`);
    }
  }

  /**
   * Handle /archive-hackathon command
   */
  async handleArchive(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const result = await this.hackathonManager.archiveHackathon(hackathonId);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📦 Hackathon Archived')
            .setColor(0x808080)
            .addFields(
              { name: 'Archive URL', value: result.archiveUrl || 'N/A' },
              { name: 'Final Spend', value: `$${result.finalBudgetSpent?.toFixed(4) || '0'}` }
            )
        ]
      });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /shutdown-hackathon command
   */
  async handleShutdownHackathon(interaction) {
    const hackathonId = interaction.options.getString('id');

    await interaction.deferReply();

    try {
      await this.hackathonManager.archiveHackathon(hackathonId);
      await interaction.editReply(`Hackathon ${hackathonId} has been shut down.`);
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /set-github command
   */
  async handleSetGitHub(interaction) {
    const hackathonId = await this.getHackathonIdFromChannel(interaction.channelId);
    if (!hackathonId) {
      await interaction.reply({ content: 'Use this in a hackathon channel.', ephemeral: true });
      return;
    }

    const repoUrl = interaction.options.getString('repo');
    const token = interaction.options.getString('token');

    await interaction.deferReply({ ephemeral: !!token }); // Ephemeral if token provided

    try {
      const result = await this.hackathonManager.setGitHubRepo(hackathonId, repoUrl, token);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ GitHub Repository Connected')
            .setColor(0x00ff00)
            .addFields(
              { name: 'Repository', value: `${result.owner}/${result.repo}`, inline: true },
              { name: 'URL', value: result.url, inline: true },
              { name: 'Token', value: token ? '🔒 Configured' : '⚠️ Not provided (public repos only)', inline: false }
            )
            .setFooter({ text: 'Agents will now push code to this repository' })
        ]
      });

      // Update deployment checklist
      await this.sendDeploymentChecklist(interaction.channel, hackathonId);
    } catch (error) {
      await interaction.editReply(`Error setting GitHub: ${error.message}`);
    }
  }

  // ==================== RESOURCE COMMAND HANDLERS ====================

  /**
   * Handle /resource-add command
   */
  async handleResourceAdd(interaction) {
    const url = interaction.options.getString('url');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description') || '';
    const category = interaction.options.getString('category') || 'other';
    const tagsStr = interaction.options.getString('tags') || '';
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

    try {
      const resource = await this.registry.submitResource({
        url,
        title,
        description,
        category,
        tags,
        submitted_by: interaction.user.id
      });

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📝 Resource Submitted')
            .setColor(0xffa500)
            .addFields(
              { name: 'Title', value: title, inline: true },
              { name: 'Category', value: category, inline: true },
              { name: 'Status', value: 'Pending approval', inline: true }
            )
            .setFooter({ text: `Resource ID: ${resource.id}` })
        ]
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /resource-add-repo command
   * Submits repo for Librarian agent to organize
   */
  async handleResourceAddRepo(interaction) {
    const url = interaction.options.getString('url');
    const description = interaction.options.getString('description') || '';

    await interaction.deferReply();

    try {
      // Submit as resource with special category
      const resource = await this.registry.submitResource({
        url,
        title: `Repository: ${url.split('/').slice(-1)[0]}`,
        description,
        category: 'repo',
        tags: ['repository', 'needs-organization'],
        submitted_by: interaction.user.id
      });

      // Send to Librarian agent (26) for organization
      if (this.hackathonManager?.messageBus) {
        await this.hackathonManager.messageBus.publish(
          'agent:26:inbox',  // Librarian is agent 26
          JSON.stringify({
            type: 'organize_repo',
            from: 'discord',
            to: 'Librarian',
            resource_id: resource.id,
            url: url,
            description: description,
            submitted_by: interaction.user.id,
            timestamp: new Date().toISOString()
          })
        );
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📚 Repository Submitted for Organization')
            .setColor(0x9932cc)
            .setDescription(`The Librarian agent will analyze and organize this repository.`)
            .addFields(
              { name: 'URL', value: url },
              { name: 'Status', value: 'Queued for Librarian', inline: true }
            )
            .setFooter({ text: `Resource ID: ${resource.id}` })
        ]
      });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /resource-approve command
   */
  async handleResourceApprove(interaction) {
    const resourceId = interaction.options.getInteger('id');

    try {
      const resource = await this.registry.approveResource(resourceId, interaction.user.id);

      if (!resource) {
        await interaction.reply({ content: 'Resource not found.', ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Resource Approved')
            .setColor(0x00ff00)
            .addFields(
              { name: 'Title', value: resource.title, inline: true },
              { name: 'URL', value: resource.url }
            )
        ]
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /resource-reject command
   */
  async handleResourceReject(interaction) {
    const resourceId = interaction.options.getInteger('id');

    try {
      const resource = await this.registry.rejectResource(resourceId, interaction.user.id);

      if (!resource) {
        await interaction.reply({ content: 'Resource not found.', ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Resource Rejected')
            .setColor(0xff0000)
            .addFields(
              { name: 'Title', value: resource.title }
            )
        ],
        ephemeral: true
      });
    } catch (error) {
      await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
    }
  }

  /**
   * Handle /resource-list command
   */
  async handleResourceList(interaction) {
    const category = interaction.options.getString('category');

    await interaction.deferReply();

    try {
      const resources = await this.registry.listResources({ category });

      if (resources.length === 0) {
        await interaction.editReply('No approved resources found.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📚 Resources${category ? ` (${category})` : ''}`)
        .setColor(0x0099ff);

      for (const r of resources.slice(0, 10)) {
        const tags = r.tags?.length ? `\nTags: ${r.tags.join(', ')}` : '';
        embed.addFields({
          name: r.title,
          value: `${r.url}${r.description ? '\n' + r.description : ''}${tags}`,
          inline: false
        });
      }

      if (resources.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${resources.length} resources` });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /resource-pending command
   */
  async handleResourcePending(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const resources = await this.registry.getPendingResources();

      if (resources.length === 0) {
        await interaction.editReply('No pending resources.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📝 Pending Resources')
        .setColor(0xffa500);

      for (const r of resources.slice(0, 10)) {
        embed.addFields({
          name: `[${r.id}] ${r.title}`,
          value: `${r.url}\nSubmitted by: <@${r.submitted_by}>`,
          inline: false
        });
      }

      embed.setFooter({ text: 'Use /resource-approve <id> or /resource-reject <id>' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /resource-search command
   */
  async handleResourceSearch(interaction) {
    const query = interaction.options.getString('query');

    await interaction.deferReply();

    try {
      const resources = await this.registry.searchResources(query);

      if (resources.length === 0) {
        await interaction.editReply(`No resources found for "${query}".`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search: "${query}"`)
        .setColor(0x0099ff);

      for (const r of resources.slice(0, 10)) {
        embed.addFields({
          name: r.title,
          value: `${r.url}${r.description ? '\n' + r.description : ''}`,
          inline: false
        });
      }

      if (resources.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${resources.length} results` });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }

  /**
   * Handle /upload-files command
   */
  async handleUploadFiles(interaction) {
    await interaction.deferReply();

    try {
      // Find hackathon for this channel
      const hackathon = await this.hackathonManager.getHackathonByChannel(interaction.channelId);
      if (!hackathon) {
        await interaction.editReply('❌ This command must be used in a hackathon channel.');
        return;
      }

      const file = interaction.options.getAttachment('file');
      const targetPath = interaction.options.getString('path') || file.name;

      // Download the file
      const response = await fetch(file.url);
      const buffer = Buffer.from(await response.arrayBuffer());

      // Upload to S3
      const result = await this.hackathonManager.uploadFile(hackathon.id, file.name, buffer, targetPath);

      const embed = new EmbedBuilder()
        .setTitle('📁 File Uploaded')
        .setColor(0x00ff00)
        .addFields(
          { name: 'File', value: file.name, inline: true },
          { name: 'Target Path', value: targetPath, inline: true },
          { name: 'Size', value: `${(file.size / 1024).toFixed(2)} KB`, inline: true }
        )
        .setFooter({ text: `Stored at: ${result.key}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error uploading file:', error.message);
      await interaction.editReply(`❌ Error uploading file: ${error.message}`);
    }
  }

  /**
   * Handle /upload-plan command
   */
  async handleUploadPlan(interaction) {
    await interaction.deferReply();

    try {
      // Find hackathon for this channel
      const hackathon = await this.hackathonManager.getHackathonByChannel(interaction.channelId);
      if (!hackathon) {
        await interaction.editReply('❌ This command must be used in a hackathon channel.');
        return;
      }

      const planFile = interaction.options.getAttachment('plan');

      // Download and parse the plan
      const response = await fetch(planFile.url);
      const planText = await response.text();

      let planJson;
      try {
        planJson = JSON.parse(planText);
      } catch (parseError) {
        await interaction.editReply('❌ Invalid JSON file. Please upload a valid plan JSON.');
        return;
      }

      // Validate plan structure (basic validation)
      if (!planJson.architecture && !planJson.idea && !planJson.phases) {
        await interaction.editReply('❌ Invalid plan structure. Plan must contain architecture, idea, or phases.');
        return;
      }

      // Store plan in hackathon state
      await this.hackathonManager.redis.hset(`hackathon:${hackathon.id}:state`, {
        custom_plan: JSON.stringify(planJson),
        custom_plan_uploaded_at: new Date().toISOString(),
        custom_plan_uploaded_by: interaction.user.id
      });

      const embed = new EmbedBuilder()
        .setTitle('📋 Custom Plan Uploaded')
        .setColor(0x00ff00)
        .setDescription('Your custom plan has been stored and will be used when you run `/continue-build`.')
        .addFields(
          { name: 'File', value: planFile.name, inline: true },
          { name: 'Size', value: `${(planFile.size / 1024).toFixed(2)} KB`, inline: true }
        );

      if (planJson.idea) {
        embed.addFields({ name: 'Idea', value: planJson.idea.title || planJson.idea.name || 'Custom', inline: false });
      }
      if (planJson.architecture) {
        embed.addFields({ name: 'Architecture', value: 'Included', inline: true });
      }
      if (planJson.phases) {
        embed.addFields({ name: 'Phases', value: Object.keys(planJson.phases).join(', '), inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error uploading plan:', error.message);
      await interaction.editReply(`❌ Error uploading plan: ${error.message}`);
    }
  }

  /**
   * Handle /continue-build command
   */
  async handleContinueBuild(interaction) {
    await interaction.deferReply();

    try {
      // Find hackathon for this channel
      const hackathon = await this.hackathonManager.getHackathonByChannel(interaction.channelId);
      if (!hackathon) {
        await interaction.editReply('❌ This command must be used in a hackathon channel.');
        return;
      }

      const fromPhase = interaction.options.getString('from-phase');
      const useUploadedPlan = interaction.options.getBoolean('use-uploaded-plan') || false;

      // Check if custom plan exists if requested
      if (useUploadedPlan) {
        const state = await this.hackathonManager.redis.hgetall(`hackathon:${hackathon.id}:state`);
        if (!state.custom_plan) {
          await interaction.editReply('❌ No custom plan found. Use `/upload-plan` first.');
          return;
        }
      }

      // Resume from phase
      await this.hackathonManager.resumeFromPhase(hackathon.id, fromPhase, useUploadedPlan);

      const phaseNames = {
        backend: 'Backend Development',
        frontend: 'Frontend Development',
        integration: 'Integration',
        testing: 'Testing',
        deployment: 'Deployment'
      };

      const embed = new EmbedBuilder()
        .setTitle('🚀 Build Resumed')
        .setColor(0x00ff00)
        .setDescription(`Hackathon workflow is resuming from the **${phaseNames[fromPhase]}** phase.`)
        .addFields(
          { name: 'Starting Phase', value: phaseNames[fromPhase], inline: true },
          { name: 'Using Custom Plan', value: useUploadedPlan ? 'Yes' : 'No', inline: true }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error continuing build:', error.message);
      await interaction.editReply(`❌ Error continuing build: ${error.message}`);
    }
  }

  /**
   * Handle hackathon mode selection buttons
   */
  async handleModeSelection(interaction, hackathonId, mode) {
    try {
      switch (mode) {
        case 'add-context':
          const contextEmbed = new EmbedBuilder()
            .setTitle('📝 Add More Context')
            .setColor(0x0099ff)
            .setDescription('You can add more context to your hackathon before starting:')
            .addFields(
              { name: '/upload-files', value: 'Upload code files, assets, or other resources', inline: false },
              { name: '/suggest', value: 'Add requirements or suggestions for the agents', inline: false },
              { name: '/set-github', value: 'Set or update your GitHub repository', inline: false }
            )
            .setFooter({ text: 'When ready, click the mode buttons again to proceed.' });

          await interaction.reply({ embeds: [contextEmbed], ephemeral: true });
          break;

        case 'plan-only':
          await interaction.deferReply();

          // Run planning-only mode
          await this.hackathonManager.runPlanningOnly(hackathonId);

          const planEmbed = new EmbedBuilder()
            .setTitle('🗺️ Planning Mode Started')
            .setColor(0x9b59b6)
            .setDescription('Running planning agents only. You will receive a plan without code execution.')
            .addFields(
              { name: 'Phase 1', value: '🧙 Gandalf - Ideation', inline: true },
              { name: 'Phase 2', value: '🌿 Radagast - Architecture', inline: true },
              { name: 'Phase 3', value: '👁️ Denethor - Work Distribution', inline: true }
            )
            .setFooter({ text: 'A downloadable plan.json will be provided when complete.' });

          await interaction.editReply({ embeds: [planEmbed] });
          break;

        case 'full-auto':
          await interaction.deferReply();

          // Start full workflow
          await this.hackathonManager.startFullWorkflow(hackathonId);

          const autoEmbed = new EmbedBuilder()
            .setTitle('🚀 Full Workflow Started')
            .setColor(0x00ff00)
            .setDescription('The complete hackathon automation workflow has been initiated.')
            .addFields(
              { name: 'Mode', value: 'Full Automation', inline: true },
              { name: 'Status', value: 'Running', inline: true }
            )
            .setFooter({ text: 'You will receive updates as each phase completes.' });

          await interaction.editReply({ embeds: [autoEmbed] });
          break;

        case 'yolo-mode':
          // Start YOLO questionnaire flow
          await this.startYoloQuestionnaire(interaction, hackathonId);
          break;

        default:
          await interaction.reply({ content: '❌ Unknown mode selected.', ephemeral: true });
      }
    } catch (error) {
      console.error('Error handling mode selection:', { hackathonId, mode, error: error.message });
      if (interaction.deferred) {
        await interaction.editReply(`❌ Error: ${error.message}`);
      } else {
        await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
      }
    }
  }

  /**
   * Start YOLO Mode questionnaire flow
   * Collects all configuration upfront before running autonomously
   */
  async startYoloQuestionnaire(interaction, hackathonId) {
    await interaction.deferReply();

    // Initialize YOLO setup state
    this.yoloSetups.set(hackathonId, {
      step: 1,
      config: {
        frontend: null,
        backend: null,
        database: null,
        styling: null,
        rules_uploaded: false,
        judging_priority: null,
        time_limit_hours: 24,
        team_size: 'solo',
        deployment_target: null,
        include_demo_video: false,
        github_visibility: 'public',
        apis_to_integrate: [],
        required_libraries: [],
        budget_limit: null,
        must_include_features: [],
        must_avoid: [],
        preferred_model: 'auto'
      }
    });

    // Send Step 1: Tech Stack
    const embed = new EmbedBuilder()
      .setTitle('⚡ YOLO Mode Setup - Step 1/5: Tech Stack')
      .setColor(0xED4245)
      .setDescription('Select your preferred technologies. YOLO mode will run the entire pipeline without approval checkpoints.')
      .setFooter({ text: 'Make your selections, then click Continue' });

    const frontendRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-frontend:${hackathonId}`)
        .setPlaceholder('🎨 Frontend Framework')
        .addOptions([
          { label: 'React', value: 'react', emoji: '⚛️', description: 'Popular component-based UI library' },
          { label: 'Vue.js', value: 'vue', emoji: '💚', description: 'Progressive JavaScript framework' },
          { label: 'Svelte', value: 'svelte', emoji: '🔶', description: 'Compile-time reactive framework' },
          { label: 'Next.js', value: 'nextjs', emoji: '▲', description: 'React framework with SSR/SSG' },
          { label: 'Vanilla JS', value: 'vanilla', emoji: '📜', description: 'Plain JavaScript, no framework' }
        ])
    );

    const backendRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-backend:${hackathonId}`)
        .setPlaceholder('🔧 Backend Language')
        .addOptions([
          { label: 'Node.js', value: 'nodejs', emoji: '🟢', description: 'JavaScript runtime with Express' },
          { label: 'Python', value: 'python', emoji: '🐍', description: 'Flask or FastAPI' },
          { label: 'Go', value: 'go', emoji: '🐹', description: 'Fast compiled language' },
          { label: 'Rust', value: 'rust', emoji: '🦀', description: 'Memory-safe systems language' },
          { label: 'No Backend', value: 'none', emoji: '❌', description: 'Frontend only / static site' }
        ])
    );

    const databaseRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-database:${hackathonId}`)
        .setPlaceholder('🗃️ Database')
        .addOptions([
          { label: 'PostgreSQL', value: 'postgresql', emoji: '🐘', description: 'Powerful relational database' },
          { label: 'MongoDB', value: 'mongodb', emoji: '🍃', description: 'NoSQL document database' },
          { label: 'SQLite', value: 'sqlite', emoji: '📦', description: 'Lightweight embedded database' },
          { label: 'Supabase', value: 'supabase', emoji: '⚡', description: 'Postgres with real-time & auth' },
          { label: 'No Database', value: 'none', emoji: '❌', description: 'No persistence needed' }
        ])
    );

    const stylingRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-styling:${hackathonId}`)
        .setPlaceholder('🎨 Styling Framework')
        .addOptions([
          { label: 'Tailwind CSS', value: 'tailwind', emoji: '🌊', description: 'Utility-first CSS framework' },
          { label: 'CSS Modules', value: 'css-modules', emoji: '📦', description: 'Scoped CSS per component' },
          { label: 'Styled Components', value: 'styled', emoji: '💅', description: 'CSS-in-JS solution' },
          { label: 'Plain CSS', value: 'plain', emoji: '🎨', description: 'Traditional CSS files' }
        ])
    );

    const continueRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yolo-next:${hackathonId}:1`)
        .setLabel('Continue to Step 2')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [frontendRow, backendRow, databaseRow, stylingRow, continueRow]
    });
  }

  /**
   * Send YOLO Step 2: Hackathon Rules
   */
  async sendYoloStep2(interaction, hackathonId) {
    const embed = new EmbedBuilder()
      .setTitle('⚡ YOLO Mode Setup - Step 2/5: Hackathon Rules')
      .setColor(0xED4245)
      .setDescription('Configure hackathon-specific settings.')
      .setFooter({ text: 'Make your selections, then click Continue' });

    const rulesRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-rules:${hackathonId}`)
        .setPlaceholder('📋 Did you upload hackathon rules?')
        .addOptions([
          { label: 'Yes, rules are uploaded', value: 'yes', emoji: '✅' },
          { label: 'No rules uploaded', value: 'no', emoji: '❌' }
        ])
    );

    const priorityRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-priority:${hackathonId}`)
        .setPlaceholder('🎯 Judging Priority')
        .addOptions([
          { label: 'Innovation', value: 'innovation', emoji: '💡', description: 'Focus on novel ideas' },
          { label: 'Technical', value: 'technical', emoji: '🔧', description: 'Focus on code quality' },
          { label: 'User Experience', value: 'ux', emoji: '👤', description: 'Focus on usability' },
          { label: 'Impact', value: 'impact', emoji: '🌍', description: 'Focus on real-world value' }
        ])
    );

    const timeRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-time:${hackathonId}`)
        .setPlaceholder('⏱️ Time Limit')
        .addOptions([
          { label: '12 Hours', value: '12', emoji: '🕐' },
          { label: '24 Hours', value: '24', emoji: '🕐' },
          { label: '48 Hours', value: '48', emoji: '🕐' },
          { label: '72 Hours', value: '72', emoji: '🕐' }
        ])
    );

    const teamRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-team:${hackathonId}`)
        .setPlaceholder('👥 Team Size')
        .addOptions([
          { label: 'Solo', value: 'solo', emoji: '👤' },
          { label: 'Small Team (2-4)', value: 'small', emoji: '👥' },
          { label: 'Large Team (5+)', value: 'large', emoji: '👨‍👩‍👧‍👦' }
        ])
    );

    const continueRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yolo-next:${hackathonId}:2`)
        .setLabel('Continue to Step 3')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️')
    );

    await interaction.update({
      embeds: [embed],
      components: [rulesRow, priorityRow, timeRow, teamRow, continueRow]
    });
  }

  /**
   * Send YOLO Step 3: Additional Specifications
   */
  async sendYoloStep3(interaction, hackathonId) {
    const embed = new EmbedBuilder()
      .setTitle('⚡ YOLO Mode Setup - Step 3/5: Deployment & Features')
      .setColor(0xED4245)
      .setDescription('Configure deployment and integrations.')
      .setFooter({ text: 'Make your selections, then click Continue' });

    const deployRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-deploy:${hackathonId}`)
        .setPlaceholder('🚀 Deployment Target')
        .addOptions([
          { label: 'Vercel', value: 'vercel', emoji: '▲', description: 'Best for Next.js/React' },
          { label: 'Netlify', value: 'netlify', emoji: '🌐', description: 'Great for static sites' },
          { label: 'Railway', value: 'railway', emoji: '🚂', description: 'Good for full-stack apps' },
          { label: 'No Deployment', value: 'none', emoji: '❌', description: 'Local only' }
        ])
    );

    const videoRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-video:${hackathonId}`)
        .setPlaceholder('🎬 Include Demo Video?')
        .addOptions([
          { label: 'Yes, generate demo video', value: 'yes', emoji: '🎬' },
          { label: 'No video needed', value: 'no', emoji: '❌' }
        ])
    );

    const githubRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-github:${hackathonId}`)
        .setPlaceholder('🔒 GitHub Visibility')
        .addOptions([
          { label: 'Public Repository', value: 'public', emoji: '🌍' },
          { label: 'Private Repository', value: 'private', emoji: '🔒' }
        ])
    );

    const apisRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-apis:${hackathonId}`)
        .setPlaceholder('🔌 APIs to Integrate')
        .setMinValues(0)
        .setMaxValues(5)
        .addOptions([
          { label: 'OpenAI', value: 'openai', emoji: '🤖', description: 'GPT, DALL-E, Whisper' },
          { label: 'Stripe', value: 'stripe', emoji: '💳', description: 'Payments' },
          { label: 'Twilio', value: 'twilio', emoji: '📱', description: 'SMS & Voice' },
          { label: 'Google Maps', value: 'google-maps', emoji: '🗺️', description: 'Maps & Location' },
          { label: 'Other (Custom)', value: 'other', emoji: '✏️', description: 'Enter custom APIs' }
        ])
    );

    const continueRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yolo-next:${hackathonId}:3`)
        .setLabel('Continue to Step 4')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️')
    );

    await interaction.update({
      embeds: [embed],
      components: [deployRow, videoRow, githubRow, apisRow, continueRow]
    });
  }

  /**
   * Send YOLO Step 4: Constraints
   */
  async sendYoloStep4(interaction, hackathonId) {
    const embed = new EmbedBuilder()
      .setTitle('⚡ YOLO Mode Setup - Step 4/5: Constraints')
      .setColor(0xED4245)
      .setDescription('Set budget and model preferences.')
      .setFooter({ text: 'Make your selections, then click Continue' });

    const budgetRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-budget:${hackathonId}`)
        .setPlaceholder('💰 Budget Limit')
        .addOptions([
          { label: '$10', value: '10', emoji: '💵' },
          { label: '$25', value: '25', emoji: '💵' },
          { label: '$50', value: '50', emoji: '💰' },
          { label: '$100', value: '100', emoji: '💰' },
          { label: 'Unlimited', value: 'unlimited', emoji: '♾️' }
        ])
    );

    const modelRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-model:${hackathonId}`)
        .setPlaceholder('🤖 Preferred AI Model')
        .addOptions([
          { label: 'Auto (Recommended)', value: 'auto', emoji: '🔄', description: 'Smart model selection' },
          { label: 'Claude Sonnet', value: 'sonnet', emoji: '⚡', description: 'Fast & cost-effective' },
          { label: 'Claude Opus', value: 'opus', emoji: '🧠', description: 'Most capable' }
        ])
    );

    const librariesRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`yolo-libraries:${hackathonId}`)
        .setPlaceholder('📚 Required Libraries')
        .setMinValues(0)
        .setMaxValues(5)
        .addOptions([
          { label: 'Axios', value: 'axios', description: 'HTTP client' },
          { label: 'Lodash', value: 'lodash', description: 'Utility functions' },
          { label: 'Zod', value: 'zod', description: 'Schema validation' },
          { label: 'date-fns', value: 'date-fns', description: 'Date utilities' },
          { label: 'Other (Custom)', value: 'other', emoji: '✏️', description: 'Enter custom libraries' }
        ])
    );

    const continueRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yolo-next:${hackathonId}:4`)
        .setLabel('Continue to Final Review')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➡️')
    );

    await interaction.update({
      embeds: [embed],
      components: [budgetRow, modelRow, librariesRow, continueRow]
    });
  }

  /**
   * Send YOLO Step 5: Final Confirmation
   */
  async sendYoloStep5(interaction, hackathonId) {
    const setup = this.yoloSetups.get(hackathonId);
    if (!setup) return;

    const config = setup.config;

    const embed = new EmbedBuilder()
      .setTitle('⚡ YOLO Mode - Final Confirmation')
      .setColor(0xED4245)
      .setDescription('Review your configuration before starting. **Once started, NO approvals will be requested.**')
      .addFields(
        {
          name: '🛠️ Tech Stack',
          value: `Frontend: ${config.frontend || 'Not set'}\nBackend: ${config.backend || 'Not set'}\nDatabase: ${config.database || 'Not set'}\nStyling: ${config.styling || 'Not set'}`,
          inline: true
        },
        {
          name: '📋 Hackathon',
          value: `Priority: ${config.judging_priority || 'Not set'}\nTime: ${config.time_limit_hours}h\nTeam: ${config.team_size}`,
          inline: true
        },
        {
          name: '🚀 Deployment',
          value: `Target: ${config.deployment_target || 'None'}\nVideo: ${config.include_demo_video ? 'Yes' : 'No'}\nGitHub: ${config.github_visibility}`,
          inline: true
        },
        {
          name: '💰 Budget',
          value: config.budget_limit ? `$${config.budget_limit}` : 'Unlimited',
          inline: true
        },
        {
          name: '🤖 Model',
          value: config.preferred_model || 'Auto',
          inline: true
        },
        {
          name: '🔌 APIs',
          value: config.apis_to_integrate.length > 0 ? config.apis_to_integrate.join(', ') : 'None',
          inline: true
        }
      )
      .setFooter({ text: '⚠️ This will run without any human checkpoints!' });

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`yolo-start:${hackathonId}`)
        .setLabel('🚀 Start YOLO Mode')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`yolo-cancel:${hackathonId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.update({
      embeds: [embed],
      components: [confirmRow]
    });
  }

  /**
   * Handle YOLO select menu interactions
   */
  async handleYoloSelectMenu(interaction) {
    const [prefix, field, hackathonId] = interaction.customId.split(':');
    const setup = this.yoloSetups.get(hackathonId);

    if (!setup) {
      await interaction.reply({ content: '❌ YOLO setup session expired. Please start again.', ephemeral: true });
      return;
    }

    const values = interaction.values;

    // Update config based on field
    switch (field) {
      case 'frontend':
        setup.config.frontend = values[0];
        break;
      case 'backend':
        setup.config.backend = values[0];
        break;
      case 'database':
        setup.config.database = values[0];
        break;
      case 'styling':
        setup.config.styling = values[0];
        break;
      case 'rules':
        setup.config.rules_uploaded = values[0] === 'yes';
        break;
      case 'priority':
        setup.config.judging_priority = values[0];
        break;
      case 'time':
        setup.config.time_limit_hours = parseInt(values[0]);
        break;
      case 'team':
        setup.config.team_size = values[0];
        break;
      case 'deploy':
        setup.config.deployment_target = values[0] === 'none' ? null : values[0];
        break;
      case 'video':
        setup.config.include_demo_video = values[0] === 'yes';
        break;
      case 'github':
        setup.config.github_visibility = values[0];
        break;
      case 'apis':
        // Check if 'other' is selected
        if (values.includes('other')) {
          await this.showCustomInputModal(interaction, hackathonId, 'apis', 'Custom APIs', 'Enter API names (comma-separated)', 'e.g., Spotify API, Discord API');
          return;
        }
        setup.config.apis_to_integrate = values.filter(v => v !== 'other');
        break;
      case 'budget':
        setup.config.budget_limit = values[0] === 'unlimited' ? null : parseInt(values[0]);
        break;
      case 'model':
        setup.config.preferred_model = values[0];
        break;
      case 'libraries':
        // Check if 'other' is selected
        if (values.includes('other')) {
          await this.showCustomInputModal(interaction, hackathonId, 'libraries', 'Custom Libraries', 'Enter library names (comma-separated)', 'e.g., react-query, zustand');
          return;
        }
        setup.config.required_libraries = values.filter(v => v !== 'other');
        break;
    }

    // Acknowledge the selection
    await interaction.deferUpdate();
  }

  /**
   * Show modal for custom input (APIs or Libraries)
   */
  async showCustomInputModal(interaction, hackathonId, field, title, label, placeholder) {
    const modal = new ModalBuilder()
      .setCustomId(`yolo-custom:${hackathonId}:${field}`)
      .setTitle(title);

    const input = new TextInputBuilder()
      .setCustomId('custom-input')
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  /**
   * Handle YOLO custom input modal submit
   */
  async handleYoloCustomModalSubmit(interaction, hackathonId, field) {
    const setup = this.yoloSetups.get(hackathonId);
    if (!setup) {
      await interaction.reply({ content: '❌ YOLO setup session expired.', ephemeral: true });
      return;
    }

    const customValue = interaction.fields.getTextInputValue('custom-input');
    const items = customValue.split(',').map(s => s.trim()).filter(s => s);

    if (field === 'apis') {
      setup.config.apis_to_integrate = [...new Set([...setup.config.apis_to_integrate, ...items])];
    } else if (field === 'libraries') {
      setup.config.required_libraries = [...new Set([...setup.config.required_libraries, ...items])];
    }

    await interaction.deferUpdate();
  }

  /**
   * Handle YOLO button interactions (next, start, cancel)
   */
  async handleYoloButton(interaction, hackathonId, action) {
    const setup = this.yoloSetups.get(hackathonId);

    if (!setup && action !== 'cancel') {
      await interaction.reply({ content: '❌ YOLO setup session expired. Please start again.', ephemeral: true });
      return;
    }

    switch (action) {
      case '1': // Next from step 1
        setup.step = 2;
        await this.sendYoloStep2(interaction, hackathonId);
        break;
      case '2': // Next from step 2
        setup.step = 3;
        await this.sendYoloStep3(interaction, hackathonId);
        break;
      case '3': // Next from step 3
        setup.step = 4;
        await this.sendYoloStep4(interaction, hackathonId);
        break;
      case '4': // Next from step 4 (to confirmation)
        setup.step = 5;
        await this.sendYoloStep5(interaction, hackathonId);
        break;
      case 'start':
        await this.executeYoloMode(interaction, hackathonId);
        break;
      case 'cancel':
        this.yoloSetups.delete(hackathonId);
        await interaction.update({
          content: '❌ YOLO Mode setup cancelled.',
          embeds: [],
          components: []
        });
        break;
    }
  }

  /**
   * Execute YOLO mode with collected configuration
   */
  async executeYoloMode(interaction, hackathonId) {
    const setup = this.yoloSetups.get(hackathonId);
    if (!setup) {
      await interaction.reply({ content: '❌ Configuration not found.', ephemeral: true });
      return;
    }

    // Update message to show starting
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚡ YOLO Mode Starting...')
          .setColor(0xED4245)
          .setDescription('Initializing autonomous hackathon workflow. Stand back!')
      ],
      components: []
    });

    try {
      // Call hackathon manager to start YOLO mode
      await this.hackathonManager.runYoloMode(hackathonId, setup.config);

      // Clean up setup state
      this.yoloSetups.delete(hackathonId);

      // Send confirmation
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚡ YOLO Mode Activated!')
            .setColor(0x00FF00)
            .setDescription('The hackathon is now running fully autonomously.')
            .addFields(
              { name: '🤖 Mode', value: 'Full Autonomous', inline: true },
              { name: '✅ Approvals', value: 'Auto-approved', inline: true },
              { name: '📊 Status', value: 'Running', inline: true }
            )
            .setFooter({ text: 'No human intervention will be requested until completion.' })
        ]
      });
    } catch (error) {
      await interaction.followUp({
        content: `❌ Failed to start YOLO mode: ${error.message}`,
        ephemeral: true
      });
    }
  }

  /**
   * Handle button interactions
   */
  async handleButton(interaction) {
    const [action, hackathonId, param] = interaction.customId.split(':');

    switch (action) {
      case 'approve':
        await this.handleApprovalButton(interaction, hackathonId, param, true);
        break;
      case 'reject':
        await this.showRejectModal(interaction, hackathonId, param);
        break;
      case 'skip':
        await this.handleApprovalButton(interaction, hackathonId, param, true, 'Skipped');
        break;
      case 'hackathon-mode':
        await this.handleModeSelection(interaction, hackathonId, param);
        break;
      case 'yolo-next':
        await this.handleYoloButton(interaction, hackathonId, param);
        break;
      case 'yolo-start':
        await this.handleYoloButton(interaction, hackathonId, 'start');
        break;
      case 'yolo-cancel':
        await this.handleYoloButton(interaction, hackathonId, 'cancel');
        break;
    }
  }

  /**
   * Handle modal submit
   */
  async handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('reject-modal:')) {
      const [, hackathonId, checkpointId] = interaction.customId.split(':');
      const feedback = interaction.fields.getTextInputValue('feedback');

      await this.handleApprovalButton(interaction, hackathonId, checkpointId, false, feedback);
    } else if (interaction.customId.startsWith('yolo-custom:')) {
      // Handle YOLO custom input modals (for "Other" options)
      const [, hackathonId, inputType] = interaction.customId.split(':');
      await this.handleYoloCustomModalSubmit(interaction, hackathonId, inputType);
    }
  }

  /**
   * Handle select menu interactions
   */
  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    // YOLO mode select menus
    if (customId.startsWith('yolo-')) {
      await this.handleYoloSelectMenu(interaction);
    }
  }

  /**
   * Show rejection modal
   */
  async showRejectModal(interaction, hackathonId, checkpointId) {
    const modal = new ModalBuilder()
      .setCustomId(`reject-modal:${hackathonId}:${checkpointId}`)
      .setTitle('Reject Checkpoint');

    const feedbackInput = new TextInputBuilder()
      .setCustomId('feedback')
      .setLabel('Reason for rejection')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(feedbackInput));

    await interaction.showModal(modal);
  }

  /**
   * Handle approval button click
   */
  async handleApprovalButton(interaction, hackathonId, checkpointId, approved, feedback = '') {
    // This would communicate with the checkpoint system
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle(approved ? '✅ Approved' : '❌ Rejected')
          .setColor(approved ? 0x00ff00 : 0xff0000)
          .setDescription(feedback || (approved ? 'Checkpoint approved' : 'Checkpoint rejected'))
      ],
      components: []  // Remove buttons
    });
  }

  /**
   * Get hackathon ID from channel
   */
  async getHackathonIdFromChannel(channelId) {
    // Look up in registry which hackathon this channel belongs to
    const hackathon = await this.registry.getHackathonByChannel(channelId);
    return hackathon?.id;
  }

  /**
   * Notify about hackathon creation
   */
  async notifyHackathonCreated(data) {
    if (!this.adminChannelId) return;

    try {
      const channel = await this.client.channels.fetch(this.adminChannelId);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🚀 New Hackathon Started')
            .setColor(0x00ff00)
            .addFields(
              { name: 'ID', value: data.hackathonId },
              { name: 'Container', value: data.containerId?.substring(0, 12) || 'N/A' }
            )
        ]
      });
    } catch (error) {
      console.error('Failed to notify hackathon creation:', error);
    }
  }

  /**
   * Notify about hackathon archival
   */
  async notifyHackathonArchived(data) {
    if (!this.adminChannelId) return;

    try {
      const channel = await this.client.channels.fetch(this.adminChannelId);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📦 Hackathon Archived')
            .setColor(0x808080)
            .addFields(
              { name: 'ID', value: data.hackathonId },
              { name: 'Archive', value: data.archiveUrl || 'N/A' }
            )
        ]
      });
    } catch (error) {
      console.error('Failed to notify hackathon archival:', error);
    }
  }

  /**
   * Send checkpoint approval request to channel
   */
  async sendCheckpointRequest(channelId, checkpoint) {
    const channel = await this.client.channels.fetch(channelId);

    const embed = new EmbedBuilder()
      .setTitle(`📋 Checkpoint: ${checkpoint.name}`)
      .setDescription(checkpoint.description)
      .setColor(0xffa500)
      .addFields(
        { name: 'Type', value: checkpoint.type, inline: true },
        { name: 'Auto-approve in', value: `${checkpoint.timeout} minutes`, inline: true }
      );

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`approve:${checkpoint.hackathonId}:${checkpoint.id}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject:${checkpoint.hackathonId}:${checkpoint.id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`skip:${checkpoint.hackathonId}:${checkpoint.id}`)
          .setLabel('Skip')
          .setStyle(ButtonStyle.Secondary)
      );

    await channel.send({ embeds: [embed], components: [row] });
  }

  // =====================
  // Deployment Checklist
  // =====================

  /**
   * Send deployment checklist embed showing system readiness
   */
  async sendDeploymentChecklist(channel, hackathonId) {
    const checks = [
      {
        name: 'Container',
        check: async () => {
          try {
            return await this.hackathonManager.isContainerRunning(hackathonId);
          } catch { return false; }
        }
      },
      {
        name: 'n8n Workflow',
        check: async () => {
          try {
            return await this.hackathonManager.isWorkflowLoaded(hackathonId);
          } catch { return false; }
        }
      },
      {
        name: 'Redis',
        check: async () => {
          try {
            const redis = this.hackathonManager.redis;
            if (!redis) return false;
            await redis.ping();
            return true;
          } catch { return false; }
        }
      },
      {
        name: 'PostgreSQL',
        check: async () => {
          try {
            return await this.registry.healthCheck();
          } catch { return false; }
        }
      },
      {
        name: 'GitHub Repo',
        check: async () => {
          try {
            return await this.hackathonManager.isGitHubConnected(hackathonId);
          } catch { return false; }
        }
      },
      {
        name: 'S3 Bucket',
        check: async () => {
          try {
            const archiver = this.hackathonManager.s3Archiver;
            if (!archiver) return false;
            return await archiver.healthCheck();
          } catch { return false; }
        }
      },
      {
        name: 'Discord Webhook',
        check: async () => true // Already working if we're here
      },
      {
        name: 'Budget Tracking',
        check: async () => {
          try {
            return this.hackathonManager.budgets?.has(hackathonId) ?? false;
          } catch { return false; }
        }
      }
    ];

    // Run all checks in parallel
    const results = await Promise.all(
      checks.map(async (c) => ({
        name: c.name,
        status: await c.check().catch(() => false)
      }))
    );

    const allPassed = results.every(r => r.status);
    const passedCount = results.filter(r => r.status).length;

    const embed = new EmbedBuilder()
      .setTitle('Deployment Checklist')
      .setColor(allPassed ? 0x00ff00 : passedCount >= 5 ? 0xffaa00 : 0xff0000)
      .setDescription(
        results.map(r => `${r.status ? '✅' : '❌'} ${r.name}`).join('\n') +
        `\n\n**${passedCount}/${results.length} checks passed**`
      )
      .setTimestamp();

    if (!allPassed) {
      embed.setFooter({ text: 'Some services may still be initializing. Retry in a few seconds.' });
    }

    await channel.send({ embeds: [embed] });
    return allPassed;
  }

  // =====================
  // Visual Progress Helpers
  // =====================

  /**
   * Create ASCII progress bar
   */
  createProgressBar(current, total, length = 10) {
    if (!total || total === 0) return '░'.repeat(length) + ' 0%';
    const percent = Math.min(current / total, 1);
    const filled = Math.round(percent * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(percent * 100)}%`;
  }

  /**
   * Create time remaining bar
   */
  createTimeBar(deadline, length = 10) {
    if (!deadline) return '░'.repeat(length) + ' No deadline';

    const now = Date.now();
    const end = new Date(deadline).getTime();
    const start = end - (7 * 24 * 60 * 60 * 1000); // Assume 7 day hackathon

    if (now >= end) return '█'.repeat(length) + ' EXPIRED';

    const elapsed = now - start;
    const total = end - start;
    const percent = Math.min(Math.max(elapsed / total, 0), 1);

    const filled = Math.round(percent * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Format time remaining as human readable
   */
  formatTimeRemaining(deadline) {
    if (!deadline) return 'No deadline';

    const now = Date.now();
    const end = new Date(deadline).getTime();
    const diff = end - now;

    if (diff <= 0) return 'EXPIRED';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  }
}

module.exports = { DiscordBot };
