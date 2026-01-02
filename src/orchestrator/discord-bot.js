/**
 * ILUVATAR - Discord Bot
 *
 * Provides slash commands for novel management with human-in-the-loop.
 * Triggers N8N workflows and reports results back to Discord.
 *
 * Channel Types:
 *   - Library channel: /novel create, /novel list, /novel read
 *   - Novel channels: All other commands (context-aware, no novel_id needed)
 *
 * Commands:
 *   /novel create   - Start a new novel project (creates dedicated channel)
 *   /novel list     - List all novels (library only)
 *   /novel read     - Read a chapter from any novel (library only)
 *   /novel status   - Check novel status
 *   /novel write    - Generate next chapter (requires approved outline)
 *   /novel feedback - Send feedback to revise the current outline/chapter
 *   /novel approve  - Approve current outline/chapter
 *   /novel critique - Get Elrond's evaluation of the latest chapter
 *   /novel recall   - Go back to revise an earlier chapter
 *   /novel cascade  - Regenerate chapters after recall
 *   /novel bible    - View the story bible
 *   /novel pause    - Pause generation
 *   /novel resume   - Resume generation
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes, ChannelType, PermissionFlagsBits } = require('discord.js');

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
        .addSubcommand(sub =>
          sub.setName('feedback')
            .setDescription('Send feedback to revise the current outline or chapter')
            .addStringOption(opt =>
              opt.setName('comment')
                .setDescription('Your feedback or revision request')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (leave empty for latest)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('approve')
            .setDescription('Approve current outline or chapter, proceed to next step')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (leave empty for latest)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('critique')
            .setDescription('Get Elrond\'s evaluation of the latest chapter')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (leave empty for latest)')
                .setRequired(false))
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number (leave empty for latest)')
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
            .setDescription('View the story bible')
            .addStringOption(opt =>
              opt.setName('section')
                .setDescription('Bible section to view')
                .setRequired(false)
                .addChoices(
                  { name: 'Characters', value: 'characters' },
                  { name: 'Relationships', value: 'relationships' },
                  { name: 'Plot Threads', value: 'plotThreads' },
                  { name: 'World Facts', value: 'worldFacts' },
                  { name: 'Timeline', value: 'timeline' },
                  { name: 'Chekhov\'s Guns', value: 'chekhovs' }
                ))
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID (required in library channel)')
                .setRequired(false))
        )
        .addSubcommand(sub =>
          sub.setName('read')
            .setDescription('Read a chapter from any novel (library only)')
            .addStringOption(opt =>
              opt.setName('novel_id')
                .setDescription('Novel ID')
                .setRequired(true))
            .addIntegerOption(opt =>
              opt.setName('chapter')
                .setDescription('Chapter number (0 = outline)')
                .setRequired(true))
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
          case 'feedback':
            await this.handleFeedback(interaction);
            break;
          case 'approve':
            await this.handleApprove(interaction);
            break;
          case 'critique':
            await this.handleCritique(interaction);
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
          case 'read':
            await this.handleRead(interaction);
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

    // Create the novel in our system first
    const novel = await this.novelManager.createNovel({
      title,
      genre,
      premise,
      language
    });

    // Create a dedicated Discord channel for this novel
    const channel = await this.createNovelChannel(interaction.guild, novel);

    // Update novel metadata with the channel ID
    if (channel) {
      await this.novelManager.updateNovelMetadata(novel.id, { channelId: channel.id });
    }

    const embed = new EmbedBuilder()
      .setTitle('📖 Novel Created')
      .setColor(0x00ff00)
      .addFields(
        { name: 'Title', value: novel.title, inline: true },
        { name: 'Genre', value: novel.genre, inline: true },
        { name: 'Language', value: novel.language, inline: true },
        { name: 'Novel ID', value: `\`${novel.id}\``, inline: false },
        { name: 'Status', value: novel.status, inline: true },
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
          { name: 'Status', value: 'Planning', inline: true }
        )
        .setFooter({ text: `Novel ID: ${novel.id}` })
        .setTimestamp();

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
      action = 'revise';
      nextStep = `Frodo will revise chapter ${metadata.currentChapter}`;
      chapterNum = metadata.currentChapter;
    } else {
      action = 'write';
      chapterNum = await this.novelManager.getNextChapterNum(novelId);
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
      )
      .setFooter({ text: 'Results will be posted to this channel when ready' });

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
   * Handle /novel feedback - Send feedback to revise outline or chapter
   */
  async handleFeedback(interaction) {
    let novelId = interaction.options.getString('novel_id');
    const comment = interaction.options.getString('comment');

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

    const { metadata } = state;

    // Determine what we're giving feedback on
    let feedbackTarget;
    let action;

    if (metadata.status === 'planning' || !state.outline) {
      // No outline yet - can't give feedback
      await interaction.editReply('No outline exists yet. Use `/novel write` to generate one first.');
      return;
    } else if (!metadata.outlineApproved) {
      // Outline exists but not approved - feedback is for outline
      feedbackTarget = 'outline';
      action = 'revise_outline';
    } else {
      // Outline approved - feedback is for current chapter
      feedbackTarget = `chapter ${metadata.currentChapter}`;
      action = 'revise_chapter';
    }

    // Store feedback in novel manager (which uses Redis)
    await this.novelManager.storeFeedback(novelId, {
      target: feedbackTarget,
      comment,
      timestamp: new Date().toISOString()
    });

    // Get the channel to post results to (novel's dedicated channel or current channel)
    const callbackChannelId = metadata.discordChannelId || interaction.channelId;

    // Get bible context for revisions (if bible retriever is available)
    let bibleContext = null;
    if (this.novelManager.bibleRetriever && action === 'revise_chapter') {
      try {
        const relevantBible = await this.novelManager.bibleRetriever.getRelevantBible(novelId, metadata.currentChapter);
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
      feedback: comment,
      chapterNum: metadata.currentChapter,
      bibleContext
    }, callbackChannelId);

    const embed = new EmbedBuilder()
      .setTitle('💬 Feedback Submitted')
      .setColor(0xffaa00)
      .addFields(
        { name: 'Novel', value: metadata.title, inline: true },
        { name: 'Target', value: feedbackTarget, inline: true },
        { name: 'Feedback', value: comment.substring(0, 200) + (comment.length > 200 ? '...' : ''), inline: false }
      )
      .setFooter({ text: 'Revision in progress. Results will be posted when ready.' });

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle /novel approve - Approve current outline or chapter
   */
  async handleApprove(interaction) {
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

    const { metadata } = state;

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
    } else {
      // Approving current chapter
      approvalTarget = `Chapter ${metadata.currentChapter}`;
      const nextChapter = metadata.currentChapter + 1;
      if (nextChapter > metadata.targetChapters) {
        nextStep = 'All chapters complete! Novel is finished.';
        await this.novelManager.markCompleted(novelId);
      } else {
        nextStep = `Use \`/novel write\` to generate Chapter ${nextChapter}.`;
        await this.novelManager.approveChapter(novelId, metadata.currentChapter);
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
   */
  async handleCritique(interaction) {
    let novelId = interaction.options.getString('novel_id');
    let chapterNum = interaction.options.getInteger('chapter');

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
   * Handle /novel read - Read a chapter from any novel
   */
  async handleRead(interaction) {
    const novelId = interaction.options.getString('novel_id');
    const chapterNum = interaction.options.getInteger('chapter');

    await interaction.deferReply();

    const state = await this.novelManager.getNovelState(novelId);
    if (!state) {
      await interaction.editReply(`Novel not found: ${novelId}`);
      return;
    }

    let content;
    let title;

    if (chapterNum === 0) {
      // Reading outline
      if (!state.outline) {
        await interaction.editReply('No outline exists yet for this novel.');
        return;
      }
      title = `📋 Outline: ${state.metadata.title}`;
      content = state.outline.raw || state.outline.synopsis || JSON.stringify(state.outline, null, 2);
    } else {
      // Reading chapter
      const chapter = state.chapters[chapterNum];
      if (!chapter) {
        await interaction.editReply(`Chapter ${chapterNum} not found. Written chapters: 1-${state.stats.chaptersWritten}`);
        return;
      }
      title = `📖 ${state.metadata.title} - Chapter ${chapterNum}`;
      content = chapter.content || chapter.raw || 'No content available';
    }

    // Discord has a 4096 character limit for embed descriptions
    // Split into multiple embeds if needed
    const chunks = this.splitContent(content, 4000);

    const embeds = chunks.map((chunk, i) => {
      const embed = new EmbedBuilder()
        .setColor(0x9932cc)
        .setDescription(chunk);

      if (i === 0) {
        embed.setTitle(title);
      }
      if (i === chunks.length - 1) {
        embed.setFooter({ text: `Novel ID: ${novelId}` });
      }

      return embed;
    });

    // Send first embed as reply, rest as follow-ups
    await interaction.editReply({ embeds: [embeds[0]] });
    for (let i = 1; i < embeds.length; i++) {
      await interaction.followUp({ embeds: [embeds[i]] });
    }
  }

  /**
   * Split content into chunks for Discord
   */
  splitContent(content, maxLength) {
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
      let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
      if (breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('\n', maxLength);
      }
      if (breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf('. ', maxLength);
      }
      if (breakPoint < maxLength / 2) {
        breakPoint = maxLength;
      }

      chunks.push(remaining.substring(0, breakPoint));
      remaining = remaining.substring(breakPoint).trim();
    }

    return chunks;
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
