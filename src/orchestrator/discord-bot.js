/**
 * ILUVATAR - Discord Bot
 *
 * Provides slash commands for novel management with human-in-the-loop.
 * Triggers N8N workflows and reports results back to Discord.
 *
 * Channel Types:
 *   - Library channel: /novel create, /novel list, /novel delete
 *   - Novel channels: /novel write, feedback, approve, critique, recall, cascade, pause, resume
 *   - Both channels: /novel status, bible, read_* commands (library requires novel_id)
 *
 * Commands:
 *   /novel create              - Start a new novel project (library only)
 *   /novel list                - List all novels (library only)
 *   /novel delete              - Delete a novel and its channel (library only)
 *   /novel status              - Check novel status
 *   /novel write               - Generate next chapter (novel channel only)
 *   /novel feedback            - Send feedback to revise (novel channel only)
 *   /novel approve             - Approve current outline/chapter (novel channel only)
 *   /novel critique            - Get Elrond's evaluation (novel channel only)
 *   /novel plan_chapter        - Have Gandalf plan chapter(s) in detail (novel channel only)
 *   /novel plan_book           - Have Gandalf revise/expand full outline (novel channel only)
 *   /novel recall              - Go back to revise an earlier chapter (novel channel only)
 *   /novel cascade             - Regenerate chapters after recall (novel channel only)
 *   /novel bible               - View the story bible
 *   /novel pause               - Pause generation (novel channel only)
 *   /novel resume              - Resume generation (novel channel only)
 *   /novel read_chapter        - Read a specific chapter
 *   /novel read_outline        - Read the full outline
 *   /novel preview             - Preview chapter summary from outline
 *   /novel read_section        - Read a range of chapters (e.g., 1-10)
 *   /novel read_all            - Read the entire novel
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes, ChannelType, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const http = require('http');

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
    this.callbackPort = config.callbackPort || process.env.BOT_CALLBACK_PORT || 3001;

    if (!this.token) throw new Error('Discord token required');
    if (!this.clientId) throw new Error('Discord client ID required');
    if (!this.novelManager) throw new Error('NovelManager instance required');

    // Channel IDs (set during ensureLibraryChannel)
    this.libraryChannelId = null;
    this.novelsCategoryId = null;
    this.callbackServer = null;

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
                .setDescription('Working title (leave empty for auto-generated)')
                .setRequired(false))
            .addStringOption(opt =>
              opt.setName('genre')
                .setDescription('Genre')
                .setRequired(false)
                .addChoices(
                  { name: 'Xianxia (修仙)', value: 'xianxia' },
                  { name: 'Wuxia (武侠)', value: 'wuxia' },
                  { name: 'Sci-Fi', value: 'scifi' },
                  { name: 'Thriller', value: 'thriller' },
                  { name: 'Fantasy', value: 'fantasy' },
                  { name: 'Romance', value: 'romance' },
                  { name: 'Mystery', value: 'mystery' },
                  { name: 'Horror', value: 'horror' },
                  { name: 'Historical Fiction', value: 'historical' },
                  { name: 'Slice of Life', value: 'slice_of_life' },
                  { name: 'LitRPG', value: 'litrpg' },
                  { name: 'Urban Fantasy', value: 'urban_fantasy' },
                  { name: 'Action/Adventure', value: 'action' }
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
            .addIntegerOption(opt =>
              opt.setName('chapters')
                .setDescription('Target chapter count (default: 100)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(500))
            .addIntegerOption(opt =>
              opt.setName('words_per_chapter')
                .setDescription('Target words per chapter (default: 3000)')
                .setRequired(false)
                .setMinValue(500)
                .setMaxValue(10000))
            .addStringOption(opt =>
              opt.setName('pov')
                .setDescription('Point of view style')
                .setRequired(false)
                .addChoices(
                  { name: 'Third Person Limited', value: 'third_limited' },
                  { name: 'First Person', value: 'first_person' },
                  { name: 'Third Person Omniscient', value: 'omniscient' }
                ))
            .addStringOption(opt =>
              opt.setName('tone')
                .setDescription('Story tone/mood')
                .setRequired(false)
                .addChoices(
                  { name: 'Dark/Gritty', value: 'dark' },
                  { name: 'Light/Hopeful', value: 'light' },
                  { name: 'Comedic', value: 'comedic' },
                  { name: 'Serious/Dramatic', value: 'serious' },
                  { name: 'Epic/Grand', value: 'epic' }
                ))
            .addStringOption(opt =>
              opt.setName('style_reference')
                .setDescription('Write like this author/book (e.g., "金庸", "Brandon Sanderson")')
                .setRequired(false))
            .addBooleanOption(opt =>
              opt.setName('auto_critique')
                .setDescription('Auto-run Elrond critique after each chapter (default: false)')
                .setRequired(false))
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
            .setDescription('Generate next chapter (or outline if none) - use in novel channel')
        )
        .addSubcommand(sub =>
          sub.setName('pause')
            .setDescription('Pause novel generation - use in novel channel')
        )
        .addSubcommand(sub =>
          sub.setName('resume')
            .setDescription('Resume novel generation - use in novel channel')
        )
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List all novels')
        )
        .addSubcommand(sub =>
          sub.setName('feedback')
            .setDescription('Send feedback to revise the current outline or chapter - use in novel channel')
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number to revise (default: latest written chapter)')
                .setRequired(false))
            .addStringOption(opt =>
              opt.setName('comment')
                .setDescription('Your feedback or revision request (optional if use_critique is true)')
                .setRequired(false))
            .addBooleanOption(opt =>
              opt.setName('use_critique')
                .setDescription('Use Elrond\'s stored critique as feedback (default: true)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('approve')
            .setDescription('Approve current outline or chapter - use in novel channel')
        )
        .addSubcommand(sub =>
          sub.setName('critique')
            .setDescription('Get Elrond\'s evaluation - use in novel channel')
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number (leave empty for latest)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('plan_chapter')
            .setDescription('Get Gandalf to plan upcoming chapter(s) in detail - use in novel channel')
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number to plan (default: next unwritten chapter)')
                .setRequired(false))
            .addIntegerOption(opt =>
              opt.setName('count')
                .setDescription('Number of chapters to plan (default: 1, max: 5)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('plan_book')
            .setDescription('Have Gandalf revise/expand the entire book outline - use in novel channel')
            .addStringOption(opt =>
              opt.setName('instructions')
                .setDescription('What changes or expansions to make to the outline')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('recall')
            .setDescription('Go back to revise an earlier chapter')
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter to revise (0 = outline)')
                .setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('cascade')
            .setDescription('Regenerate all chapters after the recalled one')
        )
        .addSubcommand(sub =>
          sub.setName('skip_cascade')
            .setDescription('Keep later chapters as-is after recall revision')
        )
        .addSubcommand(sub =>
          sub.setName('bible')
            .setDescription('View or import the story bible')
            .addStringOption(opt =>
              opt.setName('section')
                .setDescription('Bible section to view, or "import" to parse from outline')
                .setRequired(false)
                .addChoices(
                  { name: 'Characters', value: 'characters' },
                  { name: 'Relationships', value: 'relationships' },
                  { name: 'Plot Threads', value: 'plotThreads' },
                  { name: 'World Facts', value: 'worldFacts' },
                  { name: 'Timeline', value: 'timeline' },
                  { name: 'Chekhov\'s Guns', value: 'chekhovs' },
                  { name: '📥 Import from Outline', value: 'import' }
                ))
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('read_chapter')
            .setDescription('Read a specific chapter (library: any novel, novel channel: this novel)')
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('read_outline')
            .setDescription('Read the full outline')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        // read_chapter_summary removed - use /novel preview instead
        .addSubcommand(sub =>
          sub.setName('read_section')
            .setDescription('Read a range of chapters')
            .addIntegerOption(opt =>
              opt.setName('from')
                .setDescription('Starting chapter number')
                .setRequired(true))
            .addIntegerOption(opt =>
              opt.setName('to')
                .setDescription('Ending chapter number')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('read_all')
            .setDescription('Read the entire novel (all chapters)')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('delete')
            .setDescription('Delete a novel and its channel (library only)')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID to delete')
                .setRequired(true))
        )
        // QoL Commands (Phase 4)
        .addSubcommand(sub =>
          sub.setName('next')
            .setDescription('Shows what to do next based on current novel state')
        )
        .addSubcommand(sub =>
          sub.setName('help')
            .setDescription('Lists all available commands with descriptions')
        )
        .addSubcommand(sub =>
          sub.setName('settings')
            .setDescription('View or update novel settings')
            .addStringOption(opt =>
              opt.setName('setting')
                .setDescription('Setting to update (e.g., chapters:50, tone:dark)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('preview')
            .setDescription('Preview upcoming chapter summary from outline')
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number to preview')
                .setRequired(false))
        )
        // Phase 5: Export & Advanced Features
        .addSubcommand(sub =>
          sub.setName('export')
            .setDescription('Export novel or training data as a downloadable file')
            .addStringOption(opt =>
              opt.setName('format')
                .setDescription('Export format')
                .setRequired(false)
                .addChoices(
                  { name: 'Markdown (.md)', value: 'markdown' },
                  { name: 'Plain Text (.txt)', value: 'txt' },
                  { name: 'DPO Training (revision pairs)', value: 'dpo' },
                  { name: 'SFT Training (chapters)', value: 'sft' },
                  { name: 'Reward Model (scores)', value: 'reward' }
                ))
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        // Phase 6: ML Data Collection - rate command removed to stay at 25 subcommand limit
        // Users can use /novel critique for scoring, or export reward data from critique scores
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
   * Ensure library channel and novels category exist
   * Called on bot startup
   */
  async ensureLibraryChannel(guild) {
    try {
      // Find or create the ILUVATAR Novels category
      let category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name === 'ILUVATAR Novels'
      );

      if (!category) {
        category = await guild.channels.create({
          name: 'ILUVATAR Novels',
          type: ChannelType.GuildCategory
        });
        console.log('[Discord] Created ILUVATAR Novels category');
      }
      this.novelsCategoryId = category.id;

      // Find or create the library channel
      let library = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === 'library' && c.parentId === category.id
      );

      if (!library) {
        library = await guild.channels.create({
          name: 'library',
          type: ChannelType.GuildText,
          parent: category.id,
          topic: 'ILUVATAR Library - Create, list, read, and manage all novels here'
        });
        console.log('[Discord] Created library channel');

        // Send welcome message
        const { EmbedBuilder } = require('discord.js');
        const welcomeEmbed = new EmbedBuilder()
          .setTitle('📚 ILUVATAR Library')
          .setColor(0x9932cc)
          .setDescription('Welcome to the ILUVATAR Novel Writer!\n\nThis is the library channel where you can manage all your novels.')
          .addFields(
            { name: 'Create a Novel', value: '`/novel create title:\"Your Title\"`', inline: false },
            { name: 'List All Novels', value: '`/novel list`', inline: false },
            { name: 'Read Any Chapter', value: '`/novel read novel_id:xxx chapter:1`', inline: false },
            { name: 'Check Status', value: '`/novel status novel_id:xxx`', inline: false },
            { name: 'Delete a Novel', value: '`/novel delete novel_id:xxx`', inline: false }
          )
          .setFooter({ text: 'Novel-specific commands are used in their dedicated channels' });

        await library.send({ embeds: [welcomeEmbed] });
      }
      this.libraryChannelId = library.id;

      console.log(`[Discord] Library channel: #${library.name} (${library.id})`);
      console.log(`[Discord] Novels category: ${category.name} (${category.id})`);

    } catch (err) {
      console.error('[Discord] Failed to ensure library channel:', err);
    }
  }

  /**
   * Check if a channel is the library channel
   */
  isLibraryChannel(channelId) {
    return channelId === this.libraryChannelId;
  }

  /**
   * Check if a channel is a novel-specific channel
   */
  async isNovelChannel(channelId) {
    const novelId = await this.novelManager.getNovelByChannel(channelId);
    return novelId !== null;
  }

  /**
   * Get channel type for command gating
   * @returns {'library' | 'novel' | 'other'}
   */
  async getChannelType(channelId) {
    if (this.isLibraryChannel(channelId)) {
      return 'library';
    }
    if (await this.isNovelChannel(channelId)) {
      return 'novel';
    }
    return 'other';
  }

  /**
   * Validate if a command can be used in the current channel
   * Returns error message if invalid, null if valid
   */
  async validateCommandChannel(subcommand, channelId) {
    const channelType = await this.getChannelType(channelId);

    // Commands only allowed in library channel
    const libraryOnlyCommands = ['create', 'list', 'delete'];
    if (libraryOnlyCommands.includes(subcommand)) {
      if (channelType !== 'library') {
        return `\`/novel ${subcommand}\` can only be used in the <#${this.libraryChannelId}> channel.`;
      }
      return null;
    }

    // Commands only allowed in novel channels
    const novelOnlyCommands = ['write', 'feedback', 'approve', 'critique', 'plan_chapter', 'plan_book', 'recall', 'cascade', 'skip_cascade', 'pause', 'resume'];

    // Commands that work in both library and novel channels
    // In library: requires novel_id parameter
    // In novel channel: auto-resolves from channel
    const dualChannelCommands = ['read_chapter', 'read_outline', 'read_section', 'read_all', 'export'];
    if (dualChannelCommands.includes(subcommand)) {
      // These commands work in both channels, validation happens in the handler
      return null;
    }

    if (novelOnlyCommands.includes(subcommand)) {
      if (channelType !== 'novel') {
        if (channelType === 'library') {
          return `\`/novel ${subcommand}\` must be used in a novel's dedicated channel. Create a novel first with \`/novel create\`.`;
        }
        return `\`/novel ${subcommand}\` must be used in a novel's dedicated channel.`;
      }
      return null;
    }

    // Commands allowed in both (status, bible)
    // These work anywhere but may require novel_id in library channel
    return null;
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`[Discord] Bot logged in as ${this.client.user.tag}`);

      // Ensure library channel exists
      if (this.guildId) {
        const guild = await this.client.guilds.fetch(this.guildId);
        await this.ensureLibraryChannel(guild);
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== 'novel') return;

      const subcommand = interaction.options.getSubcommand();

      // Validate channel access
      const channelError = await this.validateCommandChannel(subcommand, interaction.channelId);
      if (channelError) {
        await interaction.reply({ content: channelError, ephemeral: true });
        return;
      }

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
          case 'feedback':
            await this.handleFeedback(interaction);
            break;
          case 'approve':
            await this.handleApprove(interaction);
            break;
          case 'critique':
            await this.handleCritique(interaction);
            break;
          case 'plan_chapter':
            await this.handlePlanChapter(interaction);
            break;
          case 'plan_book':
            await this.handlePlanBook(interaction);
            break;
          case 'recall':
            await this.handleRecall(interaction);
            break;
          case 'cascade':
            await this.handleCascade(interaction, true);
            break;
          case 'skip_cascade':
            await this.handleCascade(interaction, false);
            break;
          case 'bible':
            await this.handleBible(interaction);
            break;
          case 'read_chapter':
            await this.handleReadChapter(interaction);
            break;
          case 'read_outline':
            await this.handleReadOutline(interaction);
            break;
          // read_chapter_summary removed - use 'preview' instead
          case 'read_section':
            await this.handleReadSection(interaction);
            break;
          case 'read_all':
            await this.handleReadAll(interaction);
            break;
          case 'delete':
            await this.handleDelete(interaction);
            break;
          // QoL Commands (Phase 4)
          case 'next':
            await this.handleNext(interaction);
            break;
          case 'help':
            await this.handleHelp(interaction);
            break;
          case 'settings':
            await this.handleSettings(interaction);
            break;
          case 'preview':
            await this.handlePreview(interaction);
            break;
          // Phase 5: Export & Advanced Features
          case 'export':
            await this.handleExport(interaction);
            break;
          // Phase 6: rate command removed - use critique for scoring
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
    const genre = interaction.options.getString('genre') || 'xianxia';
    const premise = interaction.options.getString('premise') || '';
    const language = interaction.options.getString('language') || 'zh';

    // Auto-generate title if not provided
    const providedTitle = interaction.options.getString('title');
    const title = providedTitle || `Untitled ${genre.charAt(0).toUpperCase() + genre.slice(1)} Novel`;

    // New customization options
    const targetChapters = interaction.options.getInteger('chapters') || 100;
    const targetWordsPerChapter = interaction.options.getInteger('words_per_chapter') || 3000;
    const pov = interaction.options.getString('pov') || 'third_limited';
    const tone = interaction.options.getString('tone') || null;
    const styleReference = interaction.options.getString('style_reference') || null;
    const autoCritique = interaction.options.getBoolean('auto_critique') || false;

    await interaction.deferReply();

    // Create the novel in our system first
    const novel = await this.novelManager.createNovel({
      title,
      genre,
      premise,
      language,
      targetChapters,
      targetWordsPerChapter,
      pov,
      tone,
      styleReference,
      autoCritique
    });

    // Create a dedicated Discord channel for this novel
    const channel = await this.createNovelChannel(interaction.guild, novel);

    // Link channel to novel (sets up bidirectional mapping)
    if (channel) {
      await this.novelManager.linkChannel(novel.id, channel.id, channel.name);
    }

    // Format POV for display
    const povDisplay = {
      'third_limited': 'Third Person Limited',
      'first_person': 'First Person',
      'omniscient': 'Third Person Omniscient'
    }[novel.pov] || novel.pov;

    // Build settings summary
    const settingsSummary = [
      `📚 ${novel.targetChapters} chapters`,
      `📝 ${novel.targetWordsPerChapter} words/chapter`,
      `👁️ ${povDisplay}`
    ];
    if (novel.tone) settingsSummary.push(`🎭 ${novel.tone}`);
    if (novel.styleReference) settingsSummary.push(`✍️ Style: ${novel.styleReference}`);
    if (novel.autoCritique) settingsSummary.push(`🔄 Auto-critique enabled`);

    const embed = new EmbedBuilder()
      .setTitle('📖 Novel Created')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Title', value: novel.title, inline: true },
        { name: 'Genre', value: novel.genre, inline: true },
        { name: 'Language', value: novel.language === 'zh' ? 'Chinese (中文)' : 'English', inline: true },
        { name: 'Novel ID', value: `\`${novel.id}\``, inline: false },
        { name: 'Settings', value: settingsSummary.join('\n'), inline: false },
        { name: 'Channel', value: channel ? `<#${channel.id}>` : 'Not created', inline: true }
      )
      .setFooter({ text: 'Use /novel write to generate the outline' });

    if (premise) {
      embed.setDescription(premise);
    }

    await interaction.editReply({ embeds: [embed] });

    // Send a welcome message to the new channel
    if (channel) {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`📖 ${novel.title}`)
        .setColor(0x9932cc)
        .setDescription(premise || 'A new novel begins...')
        .addFields(
          { name: 'Genre', value: novel.genre, inline: true },
          { name: 'Language', value: novel.language === 'zh' ? 'Chinese (中文)' : 'English', inline: true },
          { name: 'POV', value: povDisplay, inline: true },
          { name: 'Target', value: `${novel.targetChapters} chapters @ ${novel.targetWordsPerChapter} words each`, inline: false }
        )
        .setFooter({ text: `Novel ID: ${novel.id} | Use /novel write to generate outline` })
        .setTimestamp();

      if (novel.tone || novel.styleReference) {
        const styleNotes = [];
        if (novel.tone) styleNotes.push(`Tone: ${novel.tone}`);
        if (novel.styleReference) styleNotes.push(`Style reference: ${novel.styleReference}`);
        welcomeEmbed.addFields({ name: 'Style Notes', value: styleNotes.join('\n'), inline: false });
      }

      await channel.send({ embeds: [welcomeEmbed] });
    }
  }

  /**
   * Create a dedicated Discord channel for a novel
   * Creates under "ILUVATAR Novels" category (creates category if needed)
   */
  async createNovelChannel(guild, novel) {
    if (!guild) {
      console.log('[Discord] No guild available for channel creation');
      return null;
    }

    try {
      // Find or create the ILUVATAR Novels category
      let category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name === 'ILUVATAR Novels'
      );

      if (!category) {
        category = await guild.channels.create({
          name: 'ILUVATAR Novels',
          type: ChannelType.GuildCategory
        });
        console.log('[Discord] Created ILUVATAR Novels category');
      }

      // Create channel name from novel title (Discord-safe)
      // Remove special characters, replace spaces with hyphens, lowercase
      const channelName = novel.title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '') // Keep alphanumeric, Chinese chars, spaces, hyphens
        .replace(/\s+/g, '-')                       // Spaces to hyphens
        .substring(0, 90);                          // Max 100 chars, leave room for prefix

      const channel = await guild.channels.create({
        name: `novel-${channelName}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Novel: ${novel.title} | ID: ${novel.id} | Genre: ${novel.genre}`
      });

      console.log(`[Discord] Created channel #${channel.name} for novel ${novel.id}`);
      return channel;

    } catch (err) {
      console.error('[Discord] Failed to create novel channel:', err);
      return null;
    }
  }

  /**
   * Send a message to a novel's dedicated channel
   *
   * @param {string} novelId - Novel ID
   * @param {Object} embed - Discord EmbedBuilder object
   */
  async sendToNovelChannel(novelId, embed) {
    try {
      const novel = await this.novelManager.getNovel(novelId);
      if (!novel || !novel.channelId) {
        console.log(`[Discord] No channel for novel ${novelId}`);
        return;
      }

      const channel = await this.client.channels.fetch(novel.channelId);
      if (channel) {
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`[Discord] Failed to send to novel channel:`, err);
    }
  }

  /**
   * Handle /novel status
   */
  async handleStatus(interaction) {
    let novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();

    // If no ID provided, try channel first, then latest novel
    if (!novelId) {
      novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    }
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

    // Get actual chapter count from state.chapters (N8N saves directly, metadata may be stale)
    const writtenChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
    const actualChapterCount = writtenChapters.length > 0 ? Math.max(...writtenChapters) : 0;

    // Build progress bar
    const progress = Math.min(100, Math.round((actualChapterCount / metadata.targetChapters) * 100));
    const progressBarLength = 20;
    const filledLength = Math.round((progress / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

    // Calculate word count estimate
    const estimatedWords = actualChapterCount * metadata.targetWordsPerChapter;
    const targetWords = metadata.targetChapters * metadata.targetWordsPerChapter;

    // Format POV for display
    const povDisplay = {
      'third_limited': 'Third Limited',
      'first_person': 'First Person',
      'omniscient': 'Omniscient'
    }[metadata.pov] || metadata.pov;

    // Build status text
    let statusText = metadata.status.charAt(0).toUpperCase() + metadata.status.slice(1);
    if (metadata.status === 'revising' && metadata.revisionTarget !== null) {
      statusText += ` (Chapter ${metadata.revisionTarget})`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${metadata.title}`)
      .setColor(this.getStatusColor(metadata.status))
      .setDescription(`**Progress:** ${progressBar} ${progress}%\n` +
        `**${metadata.currentChapter}** of **${metadata.targetChapters}** chapters | ~${estimatedWords.toLocaleString()} of ${targetWords.toLocaleString()} words`)
      .addFields(
        { name: 'Status', value: statusText, inline: true },
        { name: 'Genre', value: metadata.genre, inline: true },
        { name: 'Language', value: metadata.language === 'zh' ? '中文' : 'EN', inline: true },
        { name: 'POV', value: povDisplay, inline: true },
        { name: 'Outline', value: metadata.outlineApproved ? '✅ Approved' : '⏳ Pending', inline: true },
        { name: 'Words/Chapter', value: metadata.targetWordsPerChapter.toLocaleString(), inline: true }
      );

    // Add style info if set
    const styleInfo = [];
    if (metadata.tone) styleInfo.push(`Tone: ${metadata.tone}`);
    if (metadata.styleReference) styleInfo.push(`Style: ${metadata.styleReference}`);
    if (metadata.autoCritique) styleInfo.push('Auto-critique: ON');
    if (styleInfo.length > 0) {
      embed.addFields({ name: 'Style', value: styleInfo.join(' | '), inline: false });
    }

    embed.addFields({ name: 'Novel ID', value: `\`${metadata.id}\``, inline: false })
      .setFooter({ text: `Last updated` })
      .setTimestamp(new Date(metadata.updatedAt));

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel write
   * (Novel channel only - novel ID from channel)
   */
  async handleWrite(interaction) {
    await interaction.deferReply();

    // Get novel from channel (validated by command gating)
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
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
    let chapterNum;

    if (metadata.status === 'planning' || !state.outline) {
      action = 'outline';
      nextStep = 'Gandalf will create the outline';
    } else if (!metadata.outlineApproved) {
      // Outline exists but not approved yet
      await interaction.editReply(
        `📋 Outline exists but needs approval.\n` +
        `Use \`/novel status\` to review it, then \`/novel approve\` to proceed.\n` +
        `Or use \`/novel feedback\` to request changes.`
      );
      return;
    } else if (metadata.status === 'revising') {
      action = 'revise_chapter';
      // Get actual chapter count from state.chapters (N8N saves directly, metadata may be stale)
      const revisedChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
      chapterNum = revisedChapters.length > 0 ? Math.max(...revisedChapters) : metadata.currentChapter;
      nextStep = `Frodo will revise chapter ${chapterNum}`;
    } else {
      action = 'write';
      // Get actual chapter count from state.chapters (N8N saves directly, metadata may be stale)
      const writtenChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
      const latestChapter = writtenChapters.length > 0 ? Math.max(...writtenChapters) : 0;
      chapterNum = latestChapter + 1;

      // Check if chapter plan exists (REQUIRED before writing)
      const chapterPlan = await this.novelManager.state.get(`novel:${novelId}`, `chapterPlan_${chapterNum}`);
      if (!chapterPlan) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle('📋 Chapter Plan Required')
            .setColor(0xf39c12)
            .setDescription(`You need to plan chapter ${chapterNum} before writing it.`)
            .addFields(
              { name: 'Next Step', value: `Use \`/novel plan_chapter chapter:${chapterNum}\` to create a detailed plan first.` },
              { name: 'Why?', value: 'Detailed chapter planning improves story consistency and quality.' }
            )]
        });
        return;
      }

      nextStep = `Frodo will write chapter ${chapterNum}`;
    }

    // Get the channel to post results to (novel's dedicated channel or current channel)
    const callbackChannelId = metadata.discordChannelId || interaction.channelId;

    // Get bible context for the chapter (if bible retriever is available)
    let bibleContext = null;
    if (this.novelManager.bibleRetriever && action !== 'outline') {
      try {
        const relevantBible = await this.novelManager.bibleRetriever.getRelevantBible(novelId, chapterNum);
        bibleContext = this.novelManager.bibleRetriever.formatForPrompt(relevantBible);
      } catch (err) {
        console.error('[Discord] Failed to get bible context:', err);
        // Continue without bible context
      }
    }

    // Trigger N8N workflow
    await this.triggerN8N({
      action,
      novelId,
      metadata,
      chapterNum,
      bibleContext
    }, callbackChannelId);

    const embed = new EmbedBuilder()
      .setTitle('✍️ Generation Started')
      .setColor(0x0099ff)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Action', value: action, inline: true },
        { name: 'Next Step', value: nextStep, inline: false }
      );

    // Show auto-critique indicator for chapter writes
    if (action === 'write' && metadata.autoCritique) {
      embed.addFields({ name: '🔄 Auto-Critique', value: 'Elrond will evaluate after writing', inline: false });
    }

    embed.setFooter({ text: 'Results will be posted to this channel when ready' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel pause
   * (Novel channel only - novel ID from channel)
   */
  async handlePause(interaction) {
    await interaction.deferReply();

    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    // Get state before pausing to show what was interrupted
    const stateBefore = await this.novelManager.getNovelState(novelId);
    const previousStatus = stateBefore?.metadata?.status || 'unknown';

    await this.novelManager.pauseNovel(novelId);
    const state = await this.novelManager.getNovelState(novelId);
    const { metadata } = state;

    // Build progress info
    const progress = Math.min(100, Math.round((metadata.currentChapter / metadata.targetChapters) * 100));
    const progressBarLength = 15;
    const filledLength = Math.round((progress / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

    const embed = new EmbedBuilder()
      .setTitle('⏸️ Novel Paused')
      .setColor(0xffa500)
      .addFields(
        { name: 'Title', value: metadata.title, inline: true },
        { name: 'Previous Status', value: previousStatus, inline: true },
        { name: 'Progress', value: `${progressBar} ${progress}%`, inline: false },
        { name: 'Chapters Written', value: `${metadata.currentChapter} / ${metadata.targetChapters}`, inline: true },
        { name: 'Outline', value: metadata.outlineApproved ? '✅ Approved' : (state.outline ? '⏳ Pending approval' : '❌ Not created'), inline: true }
      )
      .setFooter({ text: 'Use /novel resume to continue' });

    // Show what was in progress
    if (previousStatus === 'writing') {
      embed.addFields({ name: 'Interrupted', value: `Was writing Chapter ${metadata.currentChapter + 1}`, inline: false });
    } else if (previousStatus === 'revising') {
      embed.addFields({ name: 'Interrupted', value: `Was revising content`, inline: false });
    } else if (previousStatus === 'planning') {
      embed.addFields({ name: 'Interrupted', value: `Was generating outline`, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel resume
   * (Novel channel only - novel ID from channel)
   */
  async handleResume(interaction) {
    await interaction.deferReply();

    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    // Get state before resuming
    const stateBefore = await this.novelManager.getNovelState(novelId);
    if (stateBefore?.metadata?.status !== 'paused') {
      await interaction.editReply(`Novel is not paused. Current status: ${stateBefore?.metadata?.status || 'unknown'}`);
      return;
    }

    await this.novelManager.resumeNovel(novelId);
    const state = await this.novelManager.getNovelState(novelId);
    const { metadata, outline } = state;

    // Build progress info
    const progress = Math.min(100, Math.round((metadata.currentChapter / metadata.targetChapters) * 100));
    const progressBarLength = 15;
    const filledLength = Math.round((progress / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

    // Determine next action
    let nextAction = '';
    if (!outline) {
      nextAction = 'Use `/novel write` to generate the outline';
    } else if (!metadata.outlineApproved) {
      nextAction = 'Use `/novel approve` to approve the outline, or `/novel feedback` to revise it';
    } else if (metadata.currentChapter < metadata.targetChapters) {
      nextAction = `Use \`/novel write\` to write Chapter ${metadata.currentChapter + 1}`;
    } else {
      nextAction = 'Novel is complete! Use `/novel export` to download it';
    }

    const embed = new EmbedBuilder()
      .setTitle('▶️ Novel Resumed')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Title', value: metadata.title, inline: true },
        { name: 'Status', value: metadata.status, inline: true },
        { name: 'Progress', value: `${progressBar} ${progress}%`, inline: false },
        { name: 'Chapters Written', value: `${metadata.currentChapter} / ${metadata.targetChapters}`, inline: true },
        { name: 'Next Step', value: nextAction, inline: false }
      )
      .setFooter({ text: 'Ready to continue!' });

    await interaction.editReply({ embeds: [embed] });
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
   * Handle /novel feedback - Send feedback to revise outline or chapter
   * (Novel channel only - novel ID from channel)
   *
   * Options:
   * - chapter: Chapter number to revise (defaults to latest written chapter)
   * - comment: Manual feedback text (optional if use_critique is true)
   * - use_critique: If true, loads Elrond's stored critique as feedback
   */
  async handleFeedback(interaction) {
    const chapterOption = interaction.options.getInteger('chapter');
    const comment = interaction.options.getString('comment');
    const useCritique = interaction.options.getBoolean('use_critique') ?? true;

    await interaction.deferReply();

    // Get novel from channel (validated by command gating)
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata } = state;

    // Determine what we're giving feedback on
    let feedbackTarget;
    let action;
    let originalContent;
    let targetChapter;

    if (metadata.status === 'planning' || !state.outline) {
      // No outline yet - can't give feedback
      await interaction.editReply('No outline exists yet. Use `/novel write` to generate one first.');
      return;
    } else if (!metadata.outlineApproved) {
      // Outline exists but not approved - feedback is for outline
      feedbackTarget = 'outline';
      action = 'revise_outline';
      originalContent = state.outline?.raw || JSON.stringify(state.outline);
      targetChapter = null;
    } else {
      // Outline approved - feedback is for a chapter
      // Determine which chapter to target
      if (chapterOption) {
        targetChapter = chapterOption;
      } else {
        // Find the latest written chapter
        const writtenChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
        if (writtenChapters.length === 0) {
          await interaction.editReply('No chapters written yet. Use `/novel write` first.');
          return;
        }
        targetChapter = Math.max(...writtenChapters);
      }

      feedbackTarget = `chapter ${targetChapter}`;
      action = 'revise_chapter';
      // Note: chapter keys are strings, targetChapter might be a number
      const ch = state.chapters?.[String(targetChapter)];

      // Extract content - handle Claude API response format {data: [{type: "text", text: "..."}]}
      if (typeof ch === 'string') {
        originalContent = ch;
      } else if (ch?.data && Array.isArray(ch.data)) {
        const textBlock = ch.data.find(item => item.type === 'text');
        originalContent = textBlock?.text || '';
      } else {
        originalContent = ch?.content || ch?.text || '';
      }

      if (!originalContent) {
        await interaction.editReply(`Chapter ${targetChapter} hasn't been written yet.`);
        return;
      }
    }

    // Build the feedback text
    let feedbackText = comment || '';

    // If use_critique is true, load Elrond's stored critique
    if (useCritique && action === 'revise_chapter') {
      try {
        const critique = await this.novelManager.getCritique(novelId, targetChapter);
        if (critique) {
          // Extract text if it's in Claude API format
          let critiqueText = critique;
          if (typeof critique === 'object') {
            if (critique.data && Array.isArray(critique.data)) {
              const textBlock = critique.data.find(item => item.type === 'text');
              critiqueText = textBlock?.text || JSON.stringify(critique);
            } else if (critique.text) {
              critiqueText = critique.text;
            } else {
              critiqueText = JSON.stringify(critique);
            }
          }

          // Combine critique with any manual comment
          if (feedbackText) {
            feedbackText = `## Elrond's Critique\n${critiqueText}\n\n## Additional Instructions\n${feedbackText}`;
          } else {
            feedbackText = critiqueText;
          }
          console.log(`[Discord] Loaded stored critique for chapter ${targetChapter}`);
        } else {
          await interaction.editReply(`No critique found for chapter ${targetChapter}. Run \`/novel critique chapter:${targetChapter}\` first.`);
          return;
        }
      } catch (err) {
        console.error('[Discord] Failed to load critique:', err);
        await interaction.editReply(`Failed to load critique: ${err.message}`);
        return;
      }
    } else if (useCritique && action === 'revise_outline') {
      await interaction.editReply('Critique is only available for chapters, not outlines. Please provide manual feedback.');
      return;
    }

    // Validate we have some feedback
    if (!feedbackText) {
      await interaction.editReply('Please provide feedback using the `comment` option, or set `use_critique: true` to use Elrond\'s stored critique.');
      return;
    }

    // Store feedback in novel manager (which uses Redis)
    await this.novelManager.storeFeedback(novelId, {
      target: feedbackTarget,
      comment: feedbackText,
      timestamp: new Date().toISOString()
    });

    // Store revision pair for DPO training (Phase 6)
    // This captures the original content before revision
    if (originalContent) {
      await this.novelManager.storeRevisionPair(novelId, {
        target: action === 'revise_outline' ? 'outline' : 'chapter',
        chapterNum: targetChapter,
        original: originalContent,
        feedback: feedbackText,
        metadata
      });
    }

    // Get the channel to post results to (novel's dedicated channel or current channel)
    const callbackChannelId = metadata.discordChannelId || interaction.channelId;

    // Get bible context for all revisions (if bible retriever is available)
    // For outline revision, use chapter 0 to query based on premise
    // For chapter revision, use the target chapter number
    let bibleContext = null;
    if (this.novelManager.bibleRetriever) {
      try {
        const chapterForQuery = action === 'revise_outline' ? 0 : targetChapter;
        const relevantBible = await this.novelManager.bibleRetriever.getRelevantBible(novelId, chapterForQuery);
        bibleContext = this.novelManager.bibleRetriever.formatForPrompt(relevantBible);
      } catch (err) {
        console.error('[Discord] Failed to get bible context:', err);
      }
    }

    // Trigger N8N to process the revision
    await this.triggerN8N({
      action,
      novelId,
      metadata,
      feedback: feedbackText,
      chapterNum: targetChapter,
      bibleContext
    }, callbackChannelId);

    // Build embed description based on feedback source
    const feedbackSource = useCritique ? 'Elrond\'s Critique' + (comment ? ' + Manual' : '') : 'Manual';
    const feedbackPreview = feedbackText.substring(0, 200) + (feedbackText.length > 200 ? '...' : '');

    const embed = new EmbedBuilder()
      .setTitle('💬 Feedback Submitted')
      .setColor(0xffaa00)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Target', value: feedbackTarget, inline: true },
        { name: 'Source', value: feedbackSource, inline: true },
        { name: 'Feedback', value: feedbackPreview, inline: false }
      )
      .setFooter({ text: 'Revision in progress. Results will be posted when ready.' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel approve - Approve current outline or chapter
   * (Novel channel only - novel ID from channel)
   */
  async handleApprove(interaction) {
    await interaction.deferReply();

    // Get novel from channel (validated by command gating)
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata } = state;

    // Get actual chapter count from state.chapters (N8N saves directly, metadata may be stale)
    const writtenChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
    const latestChapter = writtenChapters.length > 0 ? Math.max(...writtenChapters) : 0;

    // Determine what we're approving
    let approvalTarget;
    let nextStep;

    if (!state.outline) {
      await interaction.editReply('No outline exists yet. Use `/novel write` to generate one first.');
      return;
    } else if (!metadata.outlineApproved) {
      // Approving the outline
      approvalTarget = 'Outline';
      nextStep = 'Ready for chapter writing. Use `/novel write` to generate Chapter 1.';
      await this.novelManager.approveOutline(novelId);
    } else if (latestChapter === 0) {
      // Outline approved but no chapters written yet
      await interaction.editReply('Outline is already approved. Use `/novel write` to generate Chapter 1 first.');
      return;
    } else {
      // Approving the latest written chapter
      approvalTarget = `Chapter ${latestChapter}`;
      const nextChapter = latestChapter + 1;
      if (nextChapter > metadata.targetChapters) {
        nextStep = 'All chapters complete! Novel is finished.';
        await this.novelManager.markCompleted(novelId);
      } else {
        nextStep = `Use \`/novel write\` to generate Chapter ${nextChapter}.`;
        await this.novelManager.approveChapter(novelId, latestChapter);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Approved')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Approved', value: approvalTarget, inline: true },
        { name: 'Next Step', value: nextStep, inline: false }
      );

    await interaction.editReply({ embeds: [embed] });

    // Also post to the novel's channel
    await this.sendToNovelChannel(novelId, embed);
  }

  /**
   * Handle /novel critique - Get Elrond's evaluation
   * (Novel channel only - novel ID from channel)
   */
  async handleCritique(interaction) {
    let chapterNum = interaction.options.getInteger('chapter');

    await interaction.deferReply();

    // Get novel from channel (validated by command gating)
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata, stats } = state;

    // If no chapter specified, use the current/latest chapter
    if (!chapterNum) {
      chapterNum = stats.chaptersWritten || metadata.currentChapter;
    }

    if (chapterNum < 1 || chapterNum > stats.chaptersWritten) {
      await interaction.editReply(`Invalid chapter number. Written chapters: 1-${stats.chaptersWritten}`);
      return;
    }

    // Get the channel to post results to (novel's dedicated channel or current channel)
    const callbackChannelId = metadata.discordChannelId || interaction.channelId;

    // Get bible context for Elrond to check consistency
    let bibleContext = null;
    if (this.novelManager.bibleRetriever) {
      try {
        const relevantBible = await this.novelManager.bibleRetriever.getRelevantBible(novelId, chapterNum);
        bibleContext = this.novelManager.bibleRetriever.formatForPrompt(relevantBible);
      } catch (err) {
        console.error('[Discord] Failed to get bible context:', err);
      }
    }

    // Trigger N8N to get critique
    await this.triggerN8N({
      action: 'critique',
      novelId,
      metadata,
      chapterNum,
      bibleContext
    }, callbackChannelId);

    const embed = new EmbedBuilder()
      .setTitle('🔍 Critique Requested')
      .setColor(0x9932cc)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Chapter', value: String(chapterNum), inline: true }
      )
      .setFooter({ text: 'Elrond is evaluating. Results will be posted when ready.' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel plan_chapter - Have Gandalf plan upcoming chapter(s) in detail
   * (Novel channel only - novel ID from channel)
   */
  async handlePlanChapter(interaction) {
    let chapterNum = interaction.options.getInteger('chapter');
    let count = interaction.options.getInteger('count') || 1;

    // Cap at 5 chapters
    count = Math.min(count, 5);

    await interaction.deferReply();

    // Get novel from channel (validated by command gating)
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata, stats } = state;

    // Must have an approved outline first
    if (!state.outline || !metadata.outlineApproved) {
      await interaction.editReply(
        'You need an approved outline first. Use `/novel write` to generate an outline, then `/novel approve` to approve it.'
      );
      return;
    }

    // Default to next unwritten chapter
    if (!chapterNum) {
      chapterNum = (stats.chaptersWritten || 0) + 1;
    }

    // Validate chapter range
    const endChapter = chapterNum + count - 1;
    if (chapterNum < 1 || endChapter > metadata.targetChapters) {
      await interaction.editReply(
        `Invalid chapter range. Novel has ${metadata.targetChapters} planned chapters.`
      );
      return;
    }

    // Get the channel to post results to
    const callbackChannelId = metadata.discordChannelId || interaction.channelId;

    // Get bible context for planning
    let bibleContext = null;
    if (this.novelManager.bibleRetriever) {
      try {
        const relevantBible = await this.novelManager.bibleRetriever.getRelevantBible(novelId, chapterNum);
        bibleContext = this.novelManager.bibleRetriever.formatForPrompt(relevantBible);
      } catch (err) {
        console.error('[Discord] Failed to get bible context:', err);
      }
    }

    // Get previous chapter plans for context (last 2 chapters max)
    let previousPlansContext = null;
    if (chapterNum > 1) {
      try {
        const previousPlans = {};
        // Get at most 2 previous chapter plans
        const startChapter = Math.max(1, chapterNum - 2);
        for (let i = startChapter; i < chapterNum; i++) {
          // state.get() falls back to string key: novel:{novelId}:chapterPlan_{i}
          const plan = await this.novelManager.state.get(`novel:${novelId}`, `chapterPlan_${i}`);
          if (plan) {
            // Extract text from Claude API response format if needed
            let planText = typeof plan === 'string' ? plan : JSON.stringify(plan);
            if (typeof plan === 'object' && plan.data && Array.isArray(plan.data)) {
              const textBlock = plan.data.find(item => item.type === 'text');
              planText = textBlock?.text || planText;
            }
            previousPlans[i] = planText;
          }
        }
        if (Object.keys(previousPlans).length > 0) {
          // Format previous plans for the prompt
          const planEntries = Object.entries(previousPlans)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([num, plan]) => `### Chapter ${num} Plan\n${plan}`)
            .join('\n\n');
          previousPlansContext = '## PREVIOUS CHAPTER PLANS\n' + planEntries;
        }
      } catch (err) {
        console.error('[Discord] Failed to get previous chapter plans:', err);
      }
    }

    // Trigger N8N with plan_chapter action
    await this.triggerN8N({
      action: 'plan_chapter',
      novelId,
      metadata,
      chapterNum,
      chapterCount: count,
      bibleContext,
      previousPlansContext
    }, callbackChannelId);

    const chapterRange = count > 1 ? `chapters ${chapterNum}-${endChapter}` : `chapter ${chapterNum}`;
    const embed = new EmbedBuilder()
      .setTitle('📋 Chapter Planning Started')
      .setColor(0x3498db)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Planning', value: chapterRange, inline: true }
      )
      .setFooter({ text: 'Gandalf is planning. Detailed outline will be posted when ready.' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel plan_book - Have Gandalf revise/expand the entire outline
   * (Novel channel only - novel ID from channel)
   */
  async handlePlanBook(interaction) {
    const instructions = interaction.options.getString('instructions') || '';

    await interaction.deferReply();

    // Get novel from channel (validated by command gating)
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Could not find novel for this channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata } = state;

    // Must have an outline to revise
    if (!state.outline) {
      await interaction.editReply(
        'No outline exists yet. Use `/novel write` to generate one first.'
      );
      return;
    }

    // Get the channel to post results to
    const callbackChannelId = metadata.discordChannelId || interaction.channelId;

    // Get bible context for re-planning (if bible retriever is available)
    // Use chapter 0 to query based on premise for outline-level planning
    let bibleContext = null;
    if (this.novelManager.bibleRetriever) {
      try {
        const relevantBible = await this.novelManager.bibleRetriever.getRelevantBible(novelId, 0);
        bibleContext = this.novelManager.bibleRetriever.formatForPrompt(relevantBible);
      } catch (err) {
        console.error('[Discord] Failed to get bible context for plan_book:', err);
      }
    }

    // Use revise_outline action with special instructions
    await this.triggerN8N({
      action: 'revise_outline',
      novelId,
      metadata,
      feedback: instructions || 'Please review and expand the outline, adding more detail to chapter summaries and improving the overall story structure.',
      isPlanBook: true,  // Flag to indicate this is a full re-plan, not just revision
      bibleContext
    }, callbackChannelId);

    const embed = new EmbedBuilder()
      .setTitle('📚 Book Planning Started')
      .setColor(0x9b59b6)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Instructions', value: instructions || 'Expand and improve outline', inline: false }
      )
      .setFooter({ text: 'Gandalf is re-planning the book. Updated outline will be posted when ready.' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Resolve novel context from channel or provided ID
   * For novel channels, auto-resolves the novel ID
   *
   * @param {Object} interaction - Discord interaction
   * @param {string|null} providedId - Novel ID from command option (optional)
   * @returns {Promise<{novelId: string, state: Object}|null>}
   */
  async resolveNovelContext(interaction, providedId = null) {
    let novelId = providedId;

    // If no ID provided, try to get from channel mapping
    if (!novelId) {
      novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    }

    // If still no ID, get the latest novel
    if (!novelId) {
      const novels = await this.novelManager.listNovels();
      if (novels.length === 0) {
        return null;
      }
      novelId = novels[0].id;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      return null;
    }

    return { novelId, state };
  }

  /**
   * Handle /novel recall - Go back to revise an earlier chapter
   */
  async handleRecall(interaction) {
    const chapterNum = interaction.options.getInteger('chapter');

    await interaction.deferReply();

    // Get novel from channel
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('This command must be used in a novel channel.');
      return;
    }

    try {
      const result = await this.novelManager.recallChapter(novelId, chapterNum);

      const embed = new EmbedBuilder()
        .setTitle(`🔙 Recalled ${chapterNum === 0 ? 'Outline' : `Chapter ${chapterNum}`}`)
        .setColor(0xffaa00)
        .setDescription(result.message);

      if (result.cascadePending.length > 0) {
        embed.addFields(
          { name: 'Affected Chapters', value: result.cascadePending.join(', '), inline: true },
          { name: 'Next Steps', value: 'Use `/novel feedback` to submit revisions.\nThen use `/novel cascade` to regenerate affected chapters, or `/novel skip_cascade` to keep them as-is.', inline: false }
        );
      } else {
        embed.addFields(
          { name: 'Next Step', value: 'Use `/novel feedback` to submit your revisions.', inline: false }
        );
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply(`Error: ${err.message}`);
    }
  }

  /**
   * Handle /novel cascade or /novel skip_cascade
   */
  async handleCascade(interaction, doCascade) {
    await interaction.deferReply();

    // Get novel from channel
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('This command must be used in a novel channel.');
      return;
    }

    try {
      await this.novelManager.completeRecall(novelId, doCascade);

      const state = await this.novelManager.getNovelState(novelId);
      const { metadata } = state;

      if (doCascade) {
        const embed = new EmbedBuilder()
          .setTitle('🔄 Cascade Started')
          .setColor(0x0099ff)
          .setDescription(`Regenerating chapters starting from ${metadata.currentChapter + 1}`)
          .addFields(
            { name: 'Novel', value: metadata.title, inline: true },
            { name: 'Next Step', value: 'Use `/novel write` to generate each chapter in sequence.', inline: false }
          );

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('⏭️ Cascade Skipped')
          .setColor(0x00ff00)
          .setDescription('Later chapters kept as-is. Revision complete.')
          .addFields(
            { name: 'Novel', value: metadata.title, inline: true },
            { name: 'Current Chapter', value: String(metadata.currentChapter), inline: true }
          );

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      await interaction.editReply(`Error: ${err.message}`);
    }
  }

  /**
   * Handle /novel bible - View the story bible
   */
  async handleBible(interaction) {
    let novelId = interaction.options.getString('novel_id');
    const section = interaction.options.getString('section');

    await interaction.deferReply();

    // Try to get novel from channel if not provided
    if (!novelId) {
      novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    }

    // Still no ID? Error
    if (!novelId) {
      await interaction.editReply('Please provide a novel_id or use this command in a novel channel.');
      return;
    }

    const bible = await this.novelManager.getStoryBible(novelId);
    const metadata = await this.novelManager.getNovel(novelId);

    if (!metadata) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📚 Story Bible: ${metadata.title}`)
      .setColor(0x9932cc);

    // If specific section requested, show just that
    if (section) {
      switch (section) {
        case 'characters':
          const chars = Object.values(bible.characters || {});
          if (chars.length === 0) {
            embed.setDescription('No characters yet.');
          } else {
            for (const char of chars.slice(0, 10)) {
              embed.addFields({
                name: `${char.name}${char.status ? ` (${char.status})` : ''}`,
                value: char.description || char.traits?.join(', ') || 'No description',
                inline: true
              });
            }
            if (chars.length > 10) {
              embed.setFooter({ text: `...and ${chars.length - 10} more characters` });
            }
          }
          break;

        case 'relationships':
          const rels = bible.relationships || [];
          if (rels.length === 0) {
            embed.setDescription('No relationships yet.');
          } else {
            const relText = rels.slice(0, 15).map(r =>
              `${r.from} → ${r.to}: ${r.type}`
            ).join('\n');
            embed.setDescription(relText);
          }
          break;

        case 'plotThreads':
          const threads = bible.plotThreads || [];
          if (threads.length === 0) {
            embed.setDescription('No plot threads yet.');
          } else {
            for (const thread of threads.slice(0, 10)) {
              embed.addFields({
                name: `${thread.title}${thread.resolved ? ' ✓' : ''}`,
                value: thread.foreshadowing?.length
                  ? `Foreshadowing: ${thread.foreshadowing.length} hints`
                  : 'No foreshadowing yet',
                inline: true
              });
            }
          }
          break;

        case 'worldFacts':
          const facts = bible.worldFacts || [];
          if (facts.length === 0) {
            embed.setDescription('No world facts yet.');
          } else {
            const factText = facts.slice(0, 15).map(f =>
              `[${f.category || 'general'}] ${f.fact}`
            ).join('\n');
            embed.setDescription(factText);
          }
          break;

        case 'timeline':
          const events = bible.timeline || [];
          if (events.length === 0) {
            embed.setDescription('No timeline events yet.');
          } else {
            const timelineText = events.slice(-15).map(e =>
              `Ch${e.chapter}: ${e.event}`
            ).join('\n');
            embed.setDescription(timelineText);
          }
          break;

        case 'chekhovs':
          const guns = bible.chekhovs || [];
          if (guns.length === 0) {
            embed.setDescription('No Chekhov\'s guns yet.');
          } else {
            for (const gun of guns.slice(0, 10)) {
              embed.addFields({
                name: `${gun.item}${gun.payoff ? ` ✓ (ch${gun.payoff})` : ''}`,
                value: `Introduced: ch${gun.introduced}${gun.notes ? ` | ${gun.notes}` : ''}`,
                inline: true
              });
            }
          }
          break;

        case 'import':
          // Import Story Bible from outline
          try {
            const result = await this.novelManager.importStoryBibleFromOutline(novelId);

            embed.setTitle(`📥 Story Bible Import: ${metadata.title}`)
              .setColor(result.success ? 0x00ff00 : 0xff9900)
              .setDescription(result.message);

            if (result.success) {
              embed.addFields(
                { name: 'Characters', value: String(result.counts.characters), inline: true },
                { name: 'Plot Threads', value: String(result.counts.plotThreads), inline: true },
                { name: 'World Facts', value: String(result.counts.worldFacts), inline: true },
                { name: "Chekhov's Guns", value: String(result.counts.chekhovs), inline: true }
              );
              embed.setFooter({ text: 'Use /novel bible to view the imported data' });
            }
          } catch (err) {
            console.error('[Discord] handleBible import error:', err);
            embed.setTitle(`📥 Story Bible Import Failed`)
              .setColor(0xff0000)
              .setDescription(`Error: ${err.message}`);
          }
          break;
      }
    } else {
      // Show overview
      embed.setDescription('Use `/novel bible section:<name>` to view a specific section.');
      embed.addFields(
        { name: 'Characters', value: String(Object.keys(bible.characters || {}).length), inline: true },
        { name: 'Relationships', value: String((bible.relationships || []).length), inline: true },
        { name: 'Plot Threads', value: String((bible.plotThreads || []).length), inline: true },
        { name: 'World Facts', value: String((bible.worldFacts || []).length), inline: true },
        { name: 'Timeline Events', value: String((bible.timeline || []).length), inline: true },
        { name: 'Chekhov\'s Guns', value: String((bible.chekhovs || []).length), inline: true }
      );
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Resolve novel ID from channel or provided parameter
   * Works for dual-channel commands (library or novel channel)
   */
  async resolveNovelIdForRead(interaction) {
    let novelId = interaction.options.getString('novel_id');

    // If no ID provided, try to get from channel
    if (!novelId) {
      novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    }

    // If still no ID and we're in library channel, error
    if (!novelId && this.isLibraryChannel(interaction.channelId)) {
      return { error: 'Please provide a `novel_id` when using this command in the library channel.' };
    }

    if (!novelId) {
      return { error: 'Could not determine which novel to read. Please provide a `novel_id`.' };
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      return { error: `Novel not found: ${novelId}` };
    }

    return { novelId, state };
  }

  /**
   * Handle /novel read_chapter - Read a specific chapter
   */
  async handleReadChapter(interaction) {
    const chapterNum = interaction.options.getInteger('chapter');

    await interaction.deferReply();

    const result = await this.resolveNovelIdForRead(interaction);
    if (result.error) {
      await interaction.editReply(result.error);
      return;
    }

    const { novelId, state } = result;
    const { metadata, stats } = state;

    // Get chapter
    const chapter = state.chapters ? state.chapters[chapterNum] : null;
    if (!chapter) {
      if (!stats.chaptersWritten || stats.chaptersWritten === 0) {
        await interaction.editReply('No chapters written yet. Use `/novel write` to generate the first chapter.');
      } else {
        await interaction.editReply(`Chapter ${chapterNum} not found. Written chapters: 1-${stats.chaptersWritten}`);
      }
      return;
    }

    const title = `📖 ${metadata.title} - Chapter ${chapterNum}: ${chapter.title || ''}`;
    const content = chapter.content || chapter.raw || 'No content available';

    await this.sendContentAsEmbeds(interaction, title, content, {
      footer: `Chapter ${chapterNum}/${stats.chaptersWritten} | Novel ID: ${novelId}`
    });
  }

  /**
   * Handle /novel read_outline - Read the full outline
   */
  async handleReadOutline(interaction) {
    try {
      await interaction.deferReply();
      console.log('[Discord] handleReadOutline: deferred');
    } catch (e) {
      console.error('[Discord] handleReadOutline: deferReply failed:', e.message);
      return;
    }

    const result = await this.resolveNovelIdForRead(interaction);
    if (result.error) {
      await interaction.editReply(result.error);
      return;
    }

    const { novelId, state } = result;
    const { metadata } = state;

    if (!state.outline) {
      await interaction.editReply('No outline exists yet. Use `/novel write` to generate one.');
      return;
    }

    const title = `📋 Outline: ${metadata.title}`;
    // Extract text from Claude extended thinking format if present
    let content;
    let outline = state.outline;

    // Handle double-encoded JSON (stored as string)
    if (typeof outline === 'string') {
      try {
        outline = JSON.parse(outline);
      } catch (e) {
        // It's a plain string, use as-is
        content = outline;
      }
    }

    if (!content) {
      if (outline?.data && Array.isArray(outline.data)) {
        const textItem = outline.data.find(item => item.type === 'text');
        content = textItem?.text || 'No text content found in outline';
      } else {
        content = outline?.raw || outline?.content || outline?.synopsis ||
          JSON.stringify(outline, null, 2);
      }
    }

    console.log(`[Discord] Read outline: content length = ${content?.length || 0}`);

    const footerHints = [];
    if (!metadata.outlineApproved) {
      footerHints.push('`/novel approve` to approve | `/novel feedback` to revise');
    }
    footerHints.push(`Novel ID: ${novelId}`);

    try {
      // Use followUp for multiple embeds instead of editReply
      await this.sendContentAsFollowUps(interaction, title, content, {
        footer: footerHints.join(' | ')
      });
    } catch (e) {
      console.error('[Discord] handleReadOutline: failed:', e.message);
      // Try simple reply as fallback
      try {
        await interaction.editReply(`Error displaying outline: ${e.message}\n\nContent preview: ${content?.substring(0, 500)}...`);
      } catch (e2) {
        console.error('[Discord] handleReadOutline: fallback editReply also failed:', e2.message);
      }
    }
  }

  // handleReadChapterSummary removed - use handlePreview instead

  /**
   * Handle /novel read_section - Read a range of chapters
   */
  async handleReadSection(interaction) {
    const fromChapter = interaction.options.getInteger('from');
    const toChapter = interaction.options.getInteger('to');

    await interaction.deferReply();

    if (fromChapter > toChapter) {
      await interaction.editReply('`from` chapter must be less than or equal to `to` chapter.');
      return;
    }

    if (toChapter - fromChapter > 10) {
      await interaction.editReply('Please request at most 10 chapters at a time to avoid message limits.');
      return;
    }

    const result = await this.resolveNovelIdForRead(interaction);
    if (result.error) {
      await interaction.editReply(result.error);
      return;
    }

    const { novelId, state } = result;
    const { metadata, stats } = state;

    if (!stats.chaptersWritten || stats.chaptersWritten === 0) {
      await interaction.editReply('No chapters written yet.');
      return;
    }

    // Collect all chapters in range
    const chaptersContent = [];
    for (let i = fromChapter; i <= toChapter; i++) {
      const chapter = state.chapters ? state.chapters[i] : null;
      if (chapter) {
        const chapterTitle = chapter.title || `Chapter ${i}`;
        const content = chapter.content || chapter.raw || '';
        chaptersContent.push(`# Chapter ${i}: ${chapterTitle}\n\n${content}`);
      }
    }

    if (chaptersContent.length === 0) {
      await interaction.editReply(`No chapters found in range ${fromChapter}-${toChapter}. Written chapters: 1-${stats.chaptersWritten}`);
      return;
    }

    const title = `📖 ${metadata.title} - Chapters ${fromChapter}-${toChapter}`;
    const fullContent = chaptersContent.join('\n\n---\n\n');

    await this.sendContentAsEmbeds(interaction, title, fullContent, {
      footer: `${chaptersContent.length} chapters | Novel ID: ${novelId}`
    });
  }

  /**
   * Handle /novel read_all - Read the entire novel
   */
  async handleReadAll(interaction) {
    await interaction.deferReply();

    const result = await this.resolveNovelIdForRead(interaction);
    if (result.error) {
      await interaction.editReply(result.error);
      return;
    }

    const { novelId, state } = result;
    const { metadata, stats } = state;

    if (!stats.chaptersWritten || stats.chaptersWritten === 0) {
      await interaction.editReply('No chapters written yet. Use `/novel write` to generate chapters.');
      return;
    }

    // Warn if too many chapters
    if (stats.chaptersWritten > 20) {
      await interaction.editReply(
        `This novel has ${stats.chaptersWritten} chapters which would generate too many messages. ` +
        `Please use \`/novel read_section from:1 to:10\` to read in parts.`
      );
      return;
    }

    // Collect all chapters
    const chaptersContent = [];
    for (let i = 1; i <= stats.chaptersWritten; i++) {
      const chapter = state.chapters ? state.chapters[i] : null;
      if (chapter) {
        const chapterTitle = chapter.title || `Chapter ${i}`;
        const content = chapter.content || chapter.raw || '';
        chaptersContent.push(`# Chapter ${i}: ${chapterTitle}\n\n${content}`);
      }
    }

    const title = `📖 ${metadata.title} - Complete Novel`;
    const fullContent = chaptersContent.join('\n\n---\n\n');

    await this.sendContentAsEmbeds(interaction, title, fullContent, {
      footer: `${chaptersContent.length} chapters | Novel ID: ${novelId}`
    });
  }

  /**
   * Helper: Send content split into multiple embeds
   */
  async sendContentAsEmbeds(interaction, title, content, options = {}) {
    // Discord limits: title=256, description=4096, footer=2048, total embed=6000
    const safeTitle = title?.substring(0, 256) || 'Content';
    const safeFooter = options.footer?.substring(0, 2048);

    console.log(`[Discord] sendContentAsEmbeds: title="${safeTitle}" (${safeTitle.length} chars)`);
    console.log(`[Discord] sendContentAsEmbeds: content length=${content?.length || 0}`);
    console.log(`[Discord] sendContentAsEmbeds: footer="${safeFooter}" (${safeFooter?.length || 0} chars)`);

    const chunks = this.splitContent(content, 4000);
    console.log(`[Discord] sendContentAsEmbeds: split into ${chunks.length} chunks`);
    chunks.forEach((chunk, i) => {
      console.log(`[Discord] sendContentAsEmbeds: chunk[${i}] length=${chunk.length}`);
    });

    const embeds = chunks.map((chunk, i) => {
      const embed = new EmbedBuilder()
        .setColor(0x9932cc)
        .setDescription(chunk);

      if (i === 0) {
        embed.setTitle(safeTitle);
      }
      if (i === chunks.length - 1 && safeFooter) {
        embed.setFooter({ text: safeFooter });
      }

      return embed;
    });

    // Send first embed as reply, rest as follow-ups
    console.log(`[Discord] sendContentAsEmbeds: sending first embed...`);
    await interaction.editReply({ embeds: [embeds[0]] });
    console.log(`[Discord] sendContentAsEmbeds: first embed sent successfully`);

    for (let i = 1; i < embeds.length; i++) {
      console.log(`[Discord] sendContentAsEmbeds: sending followUp embed ${i}...`);
      await interaction.followUp({ embeds: [embeds[i]] });
      console.log(`[Discord] sendContentAsEmbeds: followUp embed ${i} sent successfully`);
    }
  }

  /**
   * Helper: Send content as multiple followUp messages (avoids editReply rate limits)
   * Use this for long content that needs multiple chunks
   */
  async sendContentAsFollowUps(interaction, title, content, options = {}) {
    // Discord limits: title=256, description=4096, footer=2048
    const safeTitle = title?.substring(0, 256) || 'Content';
    const safeFooter = options.footer?.substring(0, 2048);

    console.log(`[Discord] sendContentAsFollowUps: title="${safeTitle}" (${safeTitle.length} chars)`);
    console.log(`[Discord] sendContentAsFollowUps: content length=${content?.length || 0}`);

    // Use smaller chunks (2000) to avoid potential Discord issues with Chinese text
    const chunks = this.splitContent(content, 2000);
    console.log(`[Discord] sendContentAsFollowUps: split into ${chunks.length} chunks`);
    chunks.forEach((c, i) => console.log(`[Discord] sendContentAsFollowUps: chunk[${i}] = ${c.length} chars`));

    // Send first chunk as editReply (to clear the "thinking" state)
    const firstEmbed = new EmbedBuilder()
      .setColor(0x9932cc)
      .setTitle(safeTitle)
      .setDescription(chunks[0]);

    if (chunks.length === 1 && safeFooter) {
      firstEmbed.setFooter({ text: safeFooter });
    }

    console.log(`[Discord] sendContentAsFollowUps: sending first embed via editReply...`);
    await interaction.editReply({ embeds: [firstEmbed] });
    console.log(`[Discord] sendContentAsFollowUps: first embed sent`);

    // Send remaining chunks as followUp (separate messages)
    for (let i = 1; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setColor(0x9932cc)
        .setDescription(chunks[i]);

      if (i === chunks.length - 1 && safeFooter) {
        embed.setFooter({ text: safeFooter });
      }

      console.log(`[Discord] sendContentAsFollowUps: sending followUp ${i}...`);
      await interaction.followUp({ embeds: [embed] });
      console.log(`[Discord] sendContentAsFollowUps: followUp ${i} sent`);
    }
  }

  /**
   * Handle /novel delete - Delete a novel and its channel
   */
  async handleDelete(interaction) {
    const novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();

    // Check if this is the library channel
    if (!this.isLibraryChannel(interaction.channelId)) {
      await interaction.editReply('❌ `/novel delete` can only be used in the library channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata } = state;
    const title = metadata.title;

    // Delete the novel channel if it exists
    console.log(`[Discord] Delete: metadata.discordChannelId = ${metadata.discordChannelId}`);
    if (metadata.discordChannelId) {
      try {
        const channel = await this.client.channels.fetch(metadata.discordChannelId);
        if (channel) {
          await channel.delete(`Novel "${title}" deleted by ${interaction.user.tag}`);
          console.log(`[Discord] Deleted channel for novel ${novelId}`);
        } else {
          console.log(`[Discord] Channel not found: ${metadata.discordChannelId}`);
        }
      } catch (err) {
        console.error(`[Discord] Failed to delete channel:`, err.message);
        // Continue with novel deletion even if channel deletion fails
      }
    } else {
      console.log(`[Discord] No channel ID stored for novel ${novelId}`);
    }

    // Delete the novel from storage
    await this.novelManager.deleteNovel(novelId);

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Novel Deleted')
      .setColor(0xff0000)
      .addFields(
        { name: 'Title', value: title, inline: true },
        { name: 'Novel ID', value: novelId, inline: true }
      )
      .setFooter({ text: `Deleted by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  // ==========================================
  // QoL Commands (Phase 4)
  // ==========================================

  /**
   * Handle /novel next - Shows what to do next based on novel state
   * Works in both library and novel channels
   */
  async handleNext(interaction) {
    await interaction.deferReply();

    // Try to get novel from channel first, then from latest
    let novelId = await this.novelManager.getNovelByChannel(interaction.channelId);

    if (!novelId) {
      // In library channel - get most recent novel
      const novels = await this.novelManager.listNovels();
      if (novels.length === 0) {
        await interaction.editReply(
          '📚 **No novels yet!**\n\n' +
          'Start by creating your first novel:\n' +
          '```\n/novel create title:My Novel genre:fantasy premise:A hero rises...\n```'
        );
        return;
      }
      // Get the most recently updated novel
      novelId = novels.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      )[0].id;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply('Could not find novel state.');
      return;
    }

    const { metadata } = state;

    // Get actual chapter count from state.chapters (N8N saves directly, metadata may be stale)
    const writtenChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
    const latestChapter = writtenChapters.length > 0 ? Math.max(...writtenChapters) : 0;

    let nextStep = '';
    let command = '';
    let context = '';

    // Determine next step based on state
    if (metadata.status === 'paused') {
      nextStep = '▶️ Resume the novel';
      command = '/novel resume';
      context = 'The novel is currently paused.';
    } else if (!state.outline) {
      nextStep = '📝 Generate the outline';
      command = '/novel write';
      context = 'No outline exists yet. Gandalf will create the initial outline.';
    } else if (!metadata.outlineApproved) {
      nextStep = '✅ Review and approve the outline';
      command = '/novel approve';
      context = 'The outline is ready for review. Read it with `/novel read_outline`, then approve or give feedback.';
    } else if (metadata.revisionMode === 'active') {
      nextStep = '🔄 Complete the revision';
      command = '/novel write';
      context = `You're revising chapter ${metadata.revisionTarget}. Use /novel write to continue.`;
    } else if (metadata.cascadePending && metadata.cascadePending.length > 0) {
      nextStep = '🌊 Handle cascade regeneration';
      command = '/novel cascade or /novel skip_cascade';
      context = `${metadata.cascadePending.length} later chapters may need regeneration after your revision.`;
    } else {
      // Normal writing flow - use actual chapter count, not metadata.currentChapter
      const nextChapter = latestChapter + 1;
      if (nextChapter > metadata.targetChapters) {
        nextStep = '🎉 Novel complete!';
        command = '/novel export format:markdown';
        context = 'All chapters written. You can export your novel or continue editing.';
      } else {
        nextStep = `✍️ Write chapter ${nextChapter}`;
        command = '/novel write';
        context = `${latestChapter} of ${metadata.targetChapters} chapters completed.`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`📍 Next Step: ${nextStep}`)
      .setColor(0x00bfff)
      .setDescription(context)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Status', value: metadata.status, inline: true },
        { name: 'Command', value: `\`${command}\``, inline: false }
      )
      .setFooter({ text: 'Use /novel help for all available commands' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel help - Lists all commands
   */
  async handleHelp(interaction) {
    const helpText = `
**📚 ILUVATAR Novel Commands**

**Creating & Managing**
• \`/novel create\` - Create a new novel with customizable settings
• \`/novel status\` - Check current novel status and progress
• \`/novel list\` - List all novels
• \`/novel delete\` - Delete a novel (library only)

**Writing Flow**
• \`/novel write\` - Generate outline or next chapter
• \`/novel approve\` - Approve current outline/chapter
• \`/novel feedback\` - Request revisions with feedback
• \`/novel critique\` - Get Elrond's quality evaluation

**Planning**
• \`/novel plan_chapter\` - Plan upcoming chapters in detail
• \`/novel plan_book\` - Revise/expand the entire outline

**Revisions**
• \`/novel recall\` - Go back to revise an earlier chapter
• \`/novel cascade\` - Regenerate affected chapters after recall
• \`/novel skip_cascade\` - Keep later chapters as-is

**Reading**
• \`/novel read_outline\` - Read the full outline
• \`/novel read_chapter\` - Read a specific chapter
• \`/novel read_section\` - Read a range of chapters
• \`/novel read_all\` - Read entire novel
• \`/novel preview\` - Preview upcoming chapter from outline
• \`/novel bible\` - View story bible (characters, plots, etc.)

**Utilities**
• \`/novel next\` - Shows what to do next
• \`/novel settings\` - View/update novel settings
• \`/novel pause\` / \`/novel resume\` - Pause/resume generation
• \`/novel export\` - Download novel (md/txt) or training data (dpo/sft/reward)

**Typical Workflow:**
1. \`/novel create\` → 2. \`/novel write\` (outline) → 3. \`/novel approve\` → 4. \`/novel write\` (chapters) → 5. Repeat until done!
`;

    const embed = new EmbedBuilder()
      .setTitle('📖 Novel Command Reference')
      .setColor(0x9932cc)
      .setDescription(helpText)
      .setFooter({ text: 'Use /novel next to see your current next step' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /**
   * Handle /novel settings - View or update novel settings
   */
  async handleSettings(interaction) {
    const settingArg = interaction.options.getString('setting');

    await interaction.deferReply();

    // Get novel from channel
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Use this command in a novel channel, or specify novel_id.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply('Novel not found.');
      return;
    }

    const { metadata } = state;

    // If no setting provided, show current settings
    if (!settingArg) {
      const povDisplay = {
        'third_limited': 'Third Person Limited',
        'first_person': 'First Person',
        'omniscient': 'Third Person Omniscient'
      }[metadata.pov] || metadata.pov;

      const settingsText = [
        `**Title:** ${metadata.title}`,
        `**Genre:** ${metadata.genre}`,
        `**Language:** ${metadata.language === 'zh' ? 'Chinese (中文)' : 'English'}`,
        `**Target Chapters:** ${metadata.targetChapters}`,
        `**Words/Chapter:** ${metadata.targetWordsPerChapter}`,
        `**POV:** ${povDisplay}`,
        `**Tone:** ${metadata.tone || 'Not set'}`,
        `**Style Reference:** ${metadata.styleReference || 'Not set'}`,
        `**Auto-Critique:** ${metadata.autoCritique ? 'Enabled' : 'Disabled'}`
      ].join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`⚙️ Settings: ${metadata.title}`)
        .setColor(0x808080)
        .setDescription(settingsText)
        .addFields(
          { name: 'Update a setting', value: '`/novel settings setting:chapters:50`', inline: false }
        )
        .setFooter({ text: `Novel ID: ${novelId}` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Parse setting:value format
    const [settingName, ...valueParts] = settingArg.split(':');
    const value = valueParts.join(':');

    if (!value) {
      await interaction.editReply(`Invalid format. Use: \`/novel settings setting:name:value\`\nExample: \`/novel settings setting:chapters:50\``);
      return;
    }

    // Map of allowed settings and their types
    const allowedSettings = {
      'chapters': { field: 'targetChapters', type: 'number', min: 5, max: 500 },
      'words_per_chapter': { field: 'targetWordsPerChapter', type: 'number', min: 500, max: 10000 },
      'tone': { field: 'tone', type: 'string', allowed: ['dark', 'light', 'comedic', 'serious', 'epic'] },
      'pov': { field: 'pov', type: 'string', allowed: ['third_limited', 'first_person', 'omniscient'] },
      'style_reference': { field: 'styleReference', type: 'string' },
      'auto_critique': { field: 'autoCritique', type: 'boolean' }
    };

    const setting = allowedSettings[settingName];
    if (!setting) {
      await interaction.editReply(`Unknown setting: ${settingName}\nAllowed: ${Object.keys(allowedSettings).join(', ')}`);
      return;
    }

    // Validate and convert value
    let newValue;
    if (setting.type === 'number') {
      newValue = parseInt(value);
      if (isNaN(newValue) || newValue < setting.min || newValue > setting.max) {
        await interaction.editReply(`Invalid value for ${settingName}. Must be a number between ${setting.min} and ${setting.max}.`);
        return;
      }
    } else if (setting.type === 'boolean') {
      newValue = value.toLowerCase() === 'true' || value === '1';
    } else {
      if (setting.allowed && !setting.allowed.includes(value)) {
        await interaction.editReply(`Invalid value for ${settingName}. Allowed: ${setting.allowed.join(', ')}`);
        return;
      }
      newValue = value;
    }

    // Update the setting
    await this.novelManager.updateSetting(novelId, setting.field, newValue);

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Setting Updated')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Setting', value: settingName, inline: true },
        { name: 'New Value', value: String(newValue), inline: true }
      )
      .setFooter({ text: `Novel: ${metadata.title}` });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel preview - Preview chapter summary from outline
   */
  async handlePreview(interaction) {
    const chapterArg = interaction.options.getInteger('chapter');

    await interaction.deferReply();

    // Get novel from channel
    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Use this command in a novel channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state || !state.outline) {
      await interaction.editReply('No outline exists yet. Use `/novel write` to generate one.');
      return;
    }

    const { metadata, outline } = state;

    // Determine which chapter to preview
    const chapterNum = chapterArg || (metadata.currentChapter + 1);

    // Parse chapters from outline
    const chapters = outline.chapters || [];

    if (chapterNum < 1 || chapterNum > chapters.length) {
      await interaction.editReply(`Chapter ${chapterNum} not found in outline. Outline has ${chapters.length} chapters.`);
      return;
    }

    const chapter = chapters[chapterNum - 1];
    const chapterTitle = chapter.title || `Chapter ${chapterNum}`;
    const chapterSummary = chapter.summary || chapter.description || 'No summary available.';

    const embed = new EmbedBuilder()
      .setTitle(`📖 Preview: Chapter ${chapterNum}`)
      .setColor(0x00bfff)
      .addFields(
        { name: 'Title', value: chapterTitle, inline: false },
        { name: 'Summary', value: chapterSummary.substring(0, 1000) + (chapterSummary.length > 1000 ? '...' : ''), inline: false }
      )
      .setFooter({ text: `${metadata.title} | Chapter ${chapterNum} of ${chapters.length}` });

    // Show previous/next context
    if (chapterNum > 1) {
      const prevChapter = chapters[chapterNum - 2];
      embed.addFields({
        name: `← Previous: Ch ${chapterNum - 1}`,
        value: (prevChapter.title || 'Untitled').substring(0, 100),
        inline: true
      });
    }
    if (chapterNum < chapters.length) {
      const nextChapter = chapters[chapterNum];
      embed.addFields({
        name: `Next: Ch ${chapterNum + 1} →`,
        value: (nextChapter.title || 'Untitled').substring(0, 100),
        inline: true
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel export - Export novel or training data as downloadable file
   * (Both channels - library requires novel_id)
   */
  async handleExport(interaction) {
    const format = interaction.options.getString('format') || 'markdown';
    let novelId = interaction.options.getString('novel_id');

    await interaction.deferReply();

    // Get novel ID from channel if not provided
    if (!novelId) {
      novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    }

    if (!novelId) {
      await interaction.editReply('Please provide a novel_id or use this command in a novel channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    // Handle training data exports (Phase 6)
    if (['dpo', 'sft', 'reward'].includes(format)) {
      return this.handleTrainingExport(interaction, novelId, format, state);
    }

    const { metadata, outline, chapters } = state;

    // Build the export content
    let content = '';
    const ext = format === 'markdown' ? 'md' : 'txt';
    const divider = format === 'markdown' ? '\n---\n\n' : '\n\n' + '='.repeat(50) + '\n\n';

    // Title and metadata header
    if (format === 'markdown') {
      content += `# ${metadata.title}\n\n`;
      content += `> **Genre:** ${metadata.genre}  \n`;
      content += `> **Language:** ${metadata.language === 'zh' ? 'Chinese (中文)' : 'English'}  \n`;
      if (metadata.pov) content += `> **POV:** ${metadata.pov}  \n`;
      if (metadata.tone) content += `> **Tone:** ${metadata.tone}  \n`;
      if (metadata.styleReference) content += `> **Style:** ${metadata.styleReference}  \n`;
      content += `> **Chapters:** ${metadata.currentChapter} / ${metadata.targetChapters}  \n`;
      content += `> **Status:** ${metadata.status}  \n`;
      content += `> **Exported:** ${new Date().toISOString().split('T')[0]}  \n\n`;
    } else {
      content += `${metadata.title}\n`;
      content += '='.repeat(metadata.title.length) + '\n\n';
      content += `Genre: ${metadata.genre}\n`;
      content += `Language: ${metadata.language === 'zh' ? 'Chinese' : 'English'}\n`;
      if (metadata.pov) content += `POV: ${metadata.pov}\n`;
      if (metadata.tone) content += `Tone: ${metadata.tone}\n`;
      if (metadata.styleReference) content += `Style: ${metadata.styleReference}\n`;
      content += `Chapters: ${metadata.currentChapter} / ${metadata.targetChapters}\n`;
      content += `Status: ${metadata.status}\n`;
      content += `Exported: ${new Date().toISOString().split('T')[0]}\n\n`;
    }

    content += divider;

    // Add outline summary if exists
    if (outline) {
      if (format === 'markdown') {
        content += `## Outline\n\n`;
        if (outline.premise) content += `**Premise:** ${outline.premise}\n\n`;
        if (outline.synopsis) content += `**Synopsis:** ${outline.synopsis}\n\n`;
      } else {
        content += `OUTLINE\n`;
        content += '-'.repeat(40) + '\n\n';
        if (outline.premise) content += `Premise: ${outline.premise}\n\n`;
        if (outline.synopsis) content += `Synopsis: ${outline.synopsis}\n\n`;
      }
      content += divider;
    }

    // Add chapters
    const chapterList = chapters || {};
    const chapterNumbers = Object.keys(chapterList)
      .map(k => parseInt(k))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (chapterNumbers.length === 0) {
      content += format === 'markdown'
        ? '*No chapters written yet.*\n'
        : 'No chapters written yet.\n';
    } else {
      for (const num of chapterNumbers) {
        const chapter = chapterList[num];
        const chapterContent = typeof chapter === 'string' ? chapter : (chapter.content || chapter.text || '');
        const chapterTitle = (typeof chapter === 'object' && chapter.title) ? chapter.title : `Chapter ${num}`;

        if (format === 'markdown') {
          content += `## Chapter ${num}: ${chapterTitle}\n\n`;
          content += chapterContent + '\n\n';
        } else {
          content += `CHAPTER ${num}: ${chapterTitle}\n`;
          content += '-'.repeat(40) + '\n\n';
          content += chapterContent + '\n\n';
        }
        content += divider;
      }
    }

    // Create file attachment
    const safeTitle = metadata.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 50);
    const filename = `${safeTitle}_export.${ext}`;
    const buffer = Buffer.from(content, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: filename });

    // Stats for the embed
    const wordCount = content.split(/\s+/).length;
    const charCount = content.length;

    const embed = new EmbedBuilder()
      .setTitle('📥 Novel Exported')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Title', value: metadata.title, inline: true },
        { name: 'Format', value: format.toUpperCase(), inline: true },
        { name: 'Chapters', value: `${chapterNumbers.length}`, inline: true },
        { name: 'Words', value: wordCount.toLocaleString(), inline: true },
        { name: 'Characters', value: charCount.toLocaleString(), inline: true }
      )
      .setFooter({ text: `Novel ID: ${novelId}` });

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  }

  /**
   * Handle training data export (dpo, sft, reward formats)
   * Called from handleExport when format is a training type
   */
  async handleTrainingExport(interaction, novelId, format, state) {
    const { metadata } = state;

    try {
      const trainingData = await this.novelManager.getTrainingData(novelId, format);

      if (trainingData.length === 0) {
        const hints = {
          dpo: 'Use `/novel feedback` to create revision pairs.',
          sft: 'Use `/novel write` to generate chapters first.',
          reward: 'Use `/novel critique` or `/novel rate` to add scores.'
        };
        await interaction.editReply(`No ${format.toUpperCase()} training data available for this novel.\n${hints[format]}`);
        return;
      }

      // Format as JSONL (JSON Lines) - one JSON object per line
      const content = trainingData.map(item => JSON.stringify(item)).join('\n');

      const safeTitle = metadata.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 50);
      const filename = `${safeTitle}_${format}_training.jsonl`;
      const buffer = Buffer.from(content, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: filename });

      const formatDescriptions = {
        dpo: 'DPO (Direct Preference Optimization) - revision pairs',
        sft: 'SFT (Supervised Fine-Tuning) - chapters with context',
        reward: 'Reward Model - chapters with scores'
      };

      const embed = new EmbedBuilder()
        .setTitle('📊 Training Data Exported')
        .setColor(0x9932cc)
        .addFields(
          { name: 'Novel', value: metadata.title, inline: true },
          { name: 'Format', value: formatDescriptions[format], inline: false },
          { name: 'Records', value: `${trainingData.length}`, inline: true },
          { name: 'File Format', value: 'JSONL (JSON Lines)', inline: true }
        )
        .setFooter({ text: `Novel ID: ${novelId} | Ready for ML training` });

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (err) {
      console.error(`[Discord] Training export error:`, err);
      await interaction.editReply(`Error exporting training data: ${err.message}`);
    }
  }

  /**
   * Handle /novel rate - Rate a chapter for ML training
   * (Novel channel only)
   */
  async handleRate(interaction) {
    const chapterNum = interaction.options.getInteger('chapter');
    const score = interaction.options.getInteger('score');
    const comment = interaction.options.getString('comment');

    await interaction.deferReply();

    const novelId = await this.novelManager.getNovelByChannel(interaction.channelId);
    if (!novelId) {
      await interaction.editReply('Use this command in a novel channel.');
      return;
    }

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    const { metadata, chapters } = state;

    // Check if chapter exists
    const ch = chapters?.[chapterNum];
    if (!ch) {
      await interaction.editReply(`Chapter ${chapterNum} doesn't exist yet. Written chapters: ${metadata.currentChapter}`);
      return;
    }

    // Store the preference/rating
    await this.novelManager.storePreference(novelId, {
      type: 'rating',
      chapterNum,
      score,
      userId: interaction.user.id,
      comment: comment || null
    });

    // Get emoji based on score
    const emoji = score >= 8 ? '🌟' : score >= 6 ? '👍' : score >= 4 ? '😐' : '👎';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Chapter ${chapterNum} Rated`)
      .setColor(score >= 7 ? 0x00ff00 : score >= 4 ? 0xffaa00 : 0xff0000)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Score', value: `${score}/10`, inline: true }
      );

    if (comment) {
      embed.addFields({ name: 'Comment', value: comment.substring(0, 200), inline: false });
    }

    embed.setFooter({ text: 'Rating stored for ML training • Use /novel export format:reward to export' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Split content into chunks for Discord
   */
  splitContent(content, maxLength) {
    if (!content || content.length === 0) {
      return ['No content available'];
    }

    if (content.length <= maxLength) {
      return [content];
    }

    const chunks = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point (paragraph or sentence)
      // lastIndexOf returns -1 if not found, so check for <= 0
      let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
      if (breakPoint <= 0 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('\n', maxLength);
      }
      if (breakPoint <= 0 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('. ', maxLength);
      }
      if (breakPoint <= 0 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('。', maxLength);  // Chinese period
      }
      if (breakPoint <= 0 || breakPoint < maxLength / 2) {
        // Force break at maxLength as last resort
        breakPoint = maxLength;
      }

      const chunk = remaining.substring(0, breakPoint).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      remaining = remaining.substring(breakPoint).trim();
    }

    // Safety: ensure we have at least one non-empty chunk
    return chunks.length > 0 ? chunks : ['No content available'];
  }

  /**
   * Trigger N8N workflow via webhook
   * Includes callback information so N8N can post results to the correct channel
   *
   * @param {Object} payload - Webhook payload
   * @param {string} channelId - Discord channel ID to post results to
   */
  async triggerN8N(payload, channelId = null) {
    if (!this.n8nWebhookUrl) {
      console.log('[Discord] N8N webhook not configured, skipping trigger');
      return;
    }

    // Add callback information
    const fullPayload = {
      ...payload,
      callback: {
        discordChannelId: channelId,
        botToken: this.token  // N8N can use this to post via Discord API
      }
    };

    try {
      const response = await fetch(this.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload)
      });

      if (!response.ok) {
        throw new Error(`N8N webhook failed: ${response.status}`);
      }

      console.log(`[Discord] Triggered N8N: ${payload.action} for ${payload.novelId} -> channel ${channelId}`);
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
    await this.startCallbackServer();
    console.log('[Discord] Bot started');
  }

  /**
   * Start HTTP server for N8N callbacks
   * N8N calls this after saving chapters to sync metadata
   */
  async startCallbackServer() {
    this.callbackServer = http.createServer(async (req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/sync-chapter') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const { novelId, chapterNum } = data;

            if (!novelId || !chapterNum) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing novelId or chapterNum' }));
              return;
            }

            await this.novelManager.syncChapterMetadata(novelId, parseInt(chapterNum));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, novelId, chapterNum }));
          } catch (err) {
            console.error('[Callback] Error syncing chapter:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.callbackServer.listen(this.callbackPort, () => {
      console.log(`[Callback] Server listening on port ${this.callbackPort}`);
    });
  }

  /**
   * Stop the bot
   */
  async stop() {
    if (this.callbackServer) {
      this.callbackServer.close();
    }
    this.client.destroy();
    console.log('[Discord] Bot stopped');
  }
}

module.exports = { IluvatarBot };
