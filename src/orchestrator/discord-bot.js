/**
 * ILUVATAR - Discord Bot
 *
 * Provides slash commands for novel management.
 * Triggers N8N workflows and reports results back to Discord.
 *
 * Commands:
 *   /novel create - Start a new novel project
 *   /novel status - Check current novel state
 *   /novel write  - Generate next chapter (or outline if none exists)
 *   /novel pause  - Pause generation
 *   /novel resume - Resume generation
 *   /novel list   - List all novels
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');

class IluvatarBot {
  /**
   * @param {Object} config - Bot configuration
   * @param {string} config.token - Discord bot token
   * @param {string} config.clientId - Discord application client ID
   * @param {string} config.guildId - Discord server ID (for dev/testing)
   * @param {string} config.n8nWebhookUrl - N8N webhook URL
   * @param {Object} config.novelManager - NovelManager instance
   */
  constructor(config) {
    this.token = config.token || process.env.DISCORD_TOKEN;
    this.clientId = config.clientId || process.env.DISCORD_CLIENT_ID;
    this.guildId = config.guildId || process.env.DISCORD_GUILD_ID;
    this.n8nWebhookUrl = config.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL;
    this.novelManager = config.novelManager;

    if (!this.token) throw new Error('Discord token required');
    if (!this.clientId) throw new Error('Discord client ID required');
    if (!this.novelManager) throw new Error('NovelManager instance required');

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds]
    });

    this.setupEventHandlers();
  }

  /**
   * Define slash commands
   */
  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('novel')
        .setDescription('Novel management commands')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create a new novel project')
            .addStringOption(opt =>
              opt.setName('title')
                .setDescription('Working title for the novel')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('genre')
                .setDescription('Genre')
                .setRequired(false)
                .addChoices(
                  { name: 'Xianxia', value: 'xianxia' },
                  { name: 'Sci-Fi', value: 'scifi' },
                  { name: 'Thriller', value: 'thriller' },
                  { name: 'Fantasy', value: 'fantasy' },
                  { name: 'Romance', value: 'romance' }
                ))
            .addStringOption(opt =>
              opt.setName('premise')
                .setDescription('Brief premise or concept')
                .setRequired(false))
            .addStringOption(opt =>
              opt.setName('language')
                .setDescription('Novel language (entire novel uses one language)')
                .setRequired(false)
                .addChoices(
                  { name: 'Chinese (中文)', value: 'zh' },
                  { name: 'English', value: 'en' }
                ))
        )
        .addSubcommand(sub =>
          sub.setName('status')
            .setDescription('Check novel status')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (leave empty for latest)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('write')
            .setDescription('Generate next chapter (or outline if none)')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (leave empty for latest)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('pause')
            .setDescription('Pause novel generation')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID')
                .setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('resume')
            .setDescription('Resume novel generation')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID')
                .setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List all novels')
        )
        .toJSON()
    ];
  }

  /**
   * Register slash commands with Discord
   */
  async registerCommands() {
    const rest = new REST({ version: '10' }).setToken(this.token);

    try {
      console.log('[Discord] Registering slash commands...');

      if (this.guildId) {
        // Register to specific guild (instant, good for development)
        await rest.put(
          Routes.applicationGuildCommands(this.clientId, this.guildId),
          { body: this.getCommands() }
        );
        console.log(`[Discord] Commands registered to guild ${this.guildId}`);
      } else {
        // Register globally (takes up to 1 hour to propagate)
        await rest.put(
          Routes.applicationCommands(this.clientId),
          { body: this.getCommands() }
        );
        console.log('[Discord] Commands registered globally');
      }
    } catch (err) {
      console.error('[Discord] Failed to register commands:', err);
      throw err;
    }
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`[Discord] Bot logged in as ${this.client.user.tag}`);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== 'novel') return;

      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
          case 'create':
            await this.handleCreate(interaction);
            break;
          case 'status':
            await this.handleStatus(interaction);
            break;
          case 'write':
            await this.handleWrite(interaction);
            break;
          case 'pause':
            await this.handlePause(interaction);
            break;
          case 'resume':
            await this.handleResume(interaction);
            break;
          case 'list':
            await this.handleList(interaction);
            break;
          default:
            await interaction.reply({ content: 'Unknown command', ephemeral: true });
        }
      } catch (err) {
        console.error(`[Discord] Error handling ${subcommand}:`, err);
        const errorMsg = `Error: ${err.message}`;

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorMsg });
        } else {
          await interaction.reply({ content: errorMsg, ephemeral: true });
        }
      }
    });
  }

  /**
   * Handle /novel create
   */
  async handleCreate(interaction) {
    const title = interaction.options.getString('title');
    const genre = interaction.options.getString('genre') || 'xianxia';
    const premise = interaction.options.getString('premise') || '';
    const language = interaction.options.getString('language') || 'zh';

    await interaction.deferReply();

    const novel = await this.novelManager.createNovel({
      title,
      genre,
      premise,
      language
    });

    const embed = new EmbedBuilder()
      .setTitle('📖 Novel Created')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Title', value: novel.title, inline: true },
        { name: 'Genre', value: novel.genre, inline: true },
        { name: 'Language', value: novel.language, inline: true },
        { name: 'Novel ID', value: `\`${novel.id}\``, inline: false },
        { name: 'Status', value: novel.status, inline: true }
      )
      .setFooter({ text: 'Use /novel write to generate the outline' });

    if (premise) {
      embed.setDescription(premise);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel status
   */
  async handleStatus(interaction) {
    let novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();

    // If no ID provided, get the latest novel
    if (!novelId) {
      const novels = await this.novelManager.listNovels();
      if (novels.length === 0) {
        await interaction.editReply('No novels found. Use `/novel create` to start one.');
        return;
      }
      novelId = novels[0].id;
    }

    const state = await this.novelManager.getNovelState(novelId);

    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata, stats } = state;

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${metadata.title}`)
      .setColor(this.getStatusColor(metadata.status))
      .addFields(
        { name: 'Status', value: metadata.status, inline: true },
        { name: 'Genre', value: metadata.genre, inline: true },
        { name: 'Language', value: metadata.language, inline: true },
        { name: 'Chapters Written', value: `${stats.chaptersWritten}/${metadata.targetChapters}`, inline: true },
        { name: 'Chapters Reviewed', value: String(stats.chaptersReviewed), inline: true },
        { name: 'Current Chapter', value: String(metadata.currentChapter), inline: true },
        { name: 'Novel ID', value: `\`${metadata.id}\``, inline: false }
      )
      .setTimestamp(new Date(metadata.updatedAt));

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel write
   */
  async handleWrite(interaction) {
    let novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();

    // If no ID provided, get the latest novel
    if (!novelId) {
      const novels = await this.novelManager.listNovels();
      if (novels.length === 0) {
        await interaction.editReply('No novels found. Use `/novel create` to start one.');
        return;
      }
      novelId = novels[0].id;
    }

    const state = await this.novelManager.getNovelState(novelId);

    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    // Determine what to do based on status
    const { metadata } = state;
    let action;
    let nextStep;

    if (metadata.status === 'planning' || !state.outline) {
      action = 'outline';
      nextStep = 'Gandalf will create the outline';
    } else if (metadata.status === 'revising') {
      action = 'revise';
      nextStep = `Frodo will revise chapter ${metadata.currentChapter}`;
    } else {
      action = 'write';
      const nextChapter = await this.novelManager.getNextChapterNum(novelId);
      nextStep = `Frodo will write chapter ${nextChapter}`;
    }

    // Trigger N8N workflow
    await this.triggerN8N({
      action,
      novelId,
      metadata
    });

    const embed = new EmbedBuilder()
      .setTitle('✍️ Generation Started')
      .setColor(0x0099ff)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Action', value: action, inline: true },
        { name: 'Next Step', value: nextStep, inline: false }
      )
      .setFooter({ text: 'Check back with /novel status for updates' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel pause
   */
  async handlePause(interaction) {
    const novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();
    await this.novelManager.pauseNovel(novelId);

    await interaction.editReply(`⏸️ Novel \`${novelId}\` paused.`);
  }

  /**
   * Handle /novel resume
   */
  async handleResume(interaction) {
    const novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();
    await this.novelManager.resumeNovel(novelId);

    const novel = await this.novelManager.getNovel(novelId);
    await interaction.editReply(`▶️ Novel \`${novelId}\` resumed. Status: ${novel.status}`);
  }

  /**
   * Handle /novel list
   */
  async handleList(interaction) {
    await interaction.deferReply();

    const novels = await this.novelManager.listNovels();

    if (novels.length === 0) {
      await interaction.editReply('No novels found. Use `/novel create` to start one.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 Your Novels')
      .setColor(0x9932cc);

    for (const novel of novels.slice(0, 10)) { // Show max 10
      embed.addFields({
        name: novel.title || novel.id,
        value: `Status: ${novel.status} | ID: \`${novel.id}\``,
        inline: false
      });
    }

    if (novels.length > 10) {
      embed.setFooter({ text: `...and ${novels.length - 10} more` });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Trigger N8N workflow via webhook
   */
  async triggerN8N(payload) {
    if (!this.n8nWebhookUrl) {
      console.log('[Discord] N8N webhook not configured, skipping trigger');
      return;
    }

    try {
      const response = await fetch(this.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`N8N webhook failed: ${response.status}`);
      }

      console.log(`[Discord] Triggered N8N: ${payload.action} for ${payload.novelId}`);
    } catch (err) {
      console.error('[Discord] Failed to trigger N8N:', err);
      throw err;
    }
  }

  /**
   * Get color based on status
   */
  getStatusColor(status) {
    const colors = {
      planning: 0xffa500,  // Orange
      writing: 0x00ff00,   // Green
      reviewing: 0x0099ff, // Blue
      revising: 0xffff00,  // Yellow
      completed: 0x9932cc, // Purple
      paused: 0x808080     // Gray
    };
    return colors[status] || 0xffffff;
  }

  /**
   * Start the bot
   */
  async start() {
    await this.registerCommands();
    await this.client.login(this.token);
    console.log('[Discord] Bot started');
  }

  /**
   * Stop the bot
   */
  async stop() {
    this.client.destroy();
    console.log('[Discord] Bot stopped');
  }
}

module.exports = { IluvatarBot };
