/**
 * ILUVATAR - Novel Manager
 *
 * Manages novel lifecycle: creation, chapter progression, and state tracking.
 * Uses StateManager for persistence with per-novel scoping.
 *
 * Novel States:
 *   - planning: Gandalf is creating the outline
 *   - writing: Frodo is writing chapters
 *   - reviewing: Elrond is critiquing
 *   - revising: Frodo is revising based on feedback
 *   - completed: Novel is finished
 *   - paused: User paused the novel
 */

const crypto = require('crypto');

// Novel status constants
const NOVEL_STATUS = {
  PLANNING: 'planning',
  WRITING: 'writing',
  REVIEWING: 'reviewing',
  REVISING: 'revising',
  COMPLETED: 'completed',
  PAUSED: 'paused'
};

// Revision mode constants
const REVISION_MODE = {
  NONE: null,
  ACTIVE: 'active',           // Currently revising a recalled chapter
  CASCADE_PENDING: 'cascade'  // Waiting for user to decide on cascade
};

// Default quality settings
const DEFAULT_CONFIG = {
  passThreshold: 70,      // Minimum score to pass critique (0-100)
  maxRevisions: 3         // Max revision attempts before forcing pass
};

// Empty story bible template
const EMPTY_STORY_BIBLE = {
  characters: {},        // Character profiles indexed by ID
  relationships: [],     // Relationships between characters
  plotThreads: [],       // Active plot threads and foreshadowing
  worldFacts: [],        // Consistent world-building facts
  timeline: [],          // Major events by chapter
  chekhovs: []           // Items/facts that must pay off later
};

class NovelManager {
  /**
   * @param {Object} stateManager - StateManager instance for persistence
   * @param {Object} config - Optional configuration
   * @param {number} config.passThreshold - Score needed to pass critique (0-100)
   * @param {number} config.maxRevisions - Max revisions before forcing pass
   */
  constructor(stateManager, config = {}) {
    if (!stateManager) {
      throw new Error('NovelManager requires a StateManager instance');
    }
    this.state = stateManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a unique novel ID
   * Format: novel-{timestamp}-{random}
   */
  generateNovelId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `novel-${timestamp}-${random}`;
  }

  /**
   * Get the scope key for a novel
   */
  getScope(novelId) {
    return `novel:${novelId}`;
  }

  /**
   * Create a new novel project
   *
   * @param {Object} config - Novel configuration
   * @param {string} config.title - Working title
   * @param {string} config.genre - Genre (xianxia, scifi, thriller, etc.)
   * @param {string} config.language - Output language (zh = Chinese, en = English)
   * @param {string} config.pov - Point of view character
   * @param {string} config.premise - Brief premise/concept
   * @param {number} config.targetChapters - Target number of chapters
   * @param {number} config.targetWordsPerChapter - Target words per chapter
   * @param {string} config.discordChannelId - Dedicated Discord channel ID
   * @param {string} config.discordChannelName - Discord channel name
   * @returns {Promise<Object>} Created novel metadata
   */
  async createNovel(config) {
    const novelId = this.generateNovelId();
    const scope = this.getScope(novelId);
    const now = new Date().toISOString();

    const novel = {
      id: novelId,
      title: config.title || 'Untitled Novel',
      genre: config.genre || 'xianxia',
      language: config.language || 'zh',
      pov: config.pov || 'third_limited',
      premise: config.premise || '',
      targetChapters: config.targetChapters || 100,
      targetWordsPerChapter: config.targetWordsPerChapter || 3000,
      // Style customization
      tone: config.tone || null,                    // dark, light, comedic, serious, epic
      styleReference: config.styleReference || null, // "Write like X author"
      autoCritique: config.autoCritique || false,   // Auto-run Elrond after each chapter
      status: NOVEL_STATUS.PLANNING,
      currentChapter: 0,
      outlineApproved: false,
      // Channel mapping
      discordChannelId: config.discordChannelId || null,
      discordChannelName: config.discordChannelName || null,
      // Recall/revision tracking
      revisionTarget: null,      // Chapter being revised (null = none, 0 = outline)
      revisionMode: REVISION_MODE.NONE,
      cascadePending: [],        // Chapters that may need regeneration after recall
      createdAt: now,
      updatedAt: now
    };

    // Initialize novel state
    await this.state.set(scope, 'metadata', novel);
    await this.state.set(scope, 'outline', null);
    await this.state.set(scope, 'chapters', {});
    await this.state.set(scope, 'critiques', {});
    await this.state.set(scope, 'revisions', {});
    await this.state.set(scope, 'feedback', []);
    await this.state.set(scope, 'storyBible', { ...EMPTY_STORY_BIBLE });

    // Register in global novel index
    await this.state.writeWithRetry('novel-manager', 'global', async (currentState) => {
      const novels = currentState.novels || {};
      novels[novelId] = {
        id: novelId,
        title: novel.title,
        status: novel.status,
        discordChannelId: novel.discordChannelId,
        createdAt: now
      };
      return { novels };
    });

    // Store reverse lookup: channel -> novel
    if (config.discordChannelId) {
      await this.state.set('global', `channel:${config.discordChannelId}`, novelId);
    }

    console.log(`[NovelManager] Created novel: ${novelId} - "${novel.title}"`);
    return novel;
  }

  /**
   * Get novel metadata
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object|null>} Novel metadata or null if not found
   */
  async getNovel(novelId) {
    const scope = this.getScope(novelId);
    return await this.state.get(scope, 'metadata');
  }

  /**
   * Get full novel state (metadata + outline + chapters)
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object>} Full novel state
   */
  async getNovelState(novelId) {
    const scope = this.getScope(novelId);

    const [metadata, outline, chapters, critiques, revisions] = await Promise.all([
      this.state.get(scope, 'metadata'),
      this.state.get(scope, 'outline'),
      this.state.get(scope, 'chapters'),
      this.state.get(scope, 'critiques'),
      this.state.get(scope, 'revisions')
    ]);

    if (!metadata) {
      return null;
    }

    // Merge chapters from hash with individual chapter keys (N8N saves to individual keys)
    const mergedChapters = { ...(chapters || {}) };
    const individualChapters = await this.getIndividualChapters(novelId);
    for (const [chapterNum, chapterData] of Object.entries(individualChapters)) {
      // Individual keys take precedence (N8N's latest writes)
      mergedChapters[chapterNum] = chapterData;
    }

    // Similarly merge critiques
    const mergedCritiques = { ...(critiques || {}) };
    const individualCritiques = await this.getIndividualCritiques(novelId);
    for (const [chapterNum, critiqueData] of Object.entries(individualCritiques)) {
      mergedCritiques[chapterNum] = critiqueData;
    }

    return {
      metadata,
      outline,
      chapters: mergedChapters,
      critiques: mergedCritiques,
      revisions: revisions || {},
      stats: {
        chaptersWritten: Object.keys(mergedChapters).length,
        chaptersReviewed: Object.keys(mergedCritiques).length,
        chaptersRevised: Object.keys(revisions || {}).length
      }
    };
  }

  /**
   * Get chapters from individual Redis keys (N8N saves chapters this way)
   * Keys are like: novel:xyz:chapter:1, novel:xyz:chapter:2, etc.
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object>} Object with chapter numbers as keys
   */
  async getIndividualChapters(novelId) {
    const pattern = `novel:${novelId}:chapter:*`;
    const keys = await this.state.redis.keys(pattern);
    const chapters = {};

    for (const key of keys) {
      const match = key.match(/chapter:(\d+)$/);
      if (match) {
        const chapterNum = match[1];
        const data = await this.state.redis.get(key);
        if (data) {
          try {
            chapters[chapterNum] = JSON.parse(data);
          } catch {
            // If not JSON, wrap the string
            chapters[chapterNum] = { content: data };
          }
        }
      }
    }

    return chapters;
  }

  /**
   * Get critiques from individual Redis keys (N8N saves critiques this way)
   * Keys are like: novel:xyz:critique:1, novel:xyz:critique:2, etc.
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object>} Object with chapter numbers as keys
   */
  async getIndividualCritiques(novelId) {
    const pattern = `novel:${novelId}:critique:*`;
    const keys = await this.state.redis.keys(pattern);
    const critiques = {};

    for (const key of keys) {
      const match = key.match(/critique:(\d+)$/);
      if (match) {
        const chapterNum = match[1];
        const data = await this.state.redis.get(key);
        if (data) {
          try {
            critiques[chapterNum] = JSON.parse(data);
          } catch {
            critiques[chapterNum] = { content: data };
          }
        }
      }
    }

    return critiques;
  }

  /**
   * Update novel metadata (partial update)
   *
   * @param {string} novelId - Novel ID
   * @param {Object} updates - Fields to update (merged with existing metadata)
   * @returns {Promise<Object>} Updated metadata
   */
  async updateNovelMetadata(novelId, updates) {
    const scope = this.getScope(novelId);

    const result = await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      const updatedMetadata = {
        ...metadata,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      return { metadata: updatedMetadata };
    });

    return result.metadata;
  }

  /**
   * Update novel status
   *
   * @param {string} novelId - Novel ID
   * @param {string} status - New status (use NOVEL_STATUS constants)
   */
  async updateStatus(novelId, status) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      metadata.status = status;
      metadata.updatedAt = new Date().toISOString();

      return { metadata };
    });

    // Update global index
    await this.state.writeWithRetry('novel-manager', 'global', async (currentState) => {
      const novels = currentState.novels || {};
      if (novels[novelId]) {
        novels[novelId].status = status;
      }
      return { novels };
    });

    console.log(`[NovelManager] Novel ${novelId} status -> ${status}`);
  }

  /**
   * Save outline from Gandalf
   *
   * @param {string} novelId - Novel ID
   * @param {Object} outline - Outline data
   * @param {string} outline.synopsis - Story synopsis
   * @param {Array} outline.chapters - Chapter summaries
   * @param {Array} outline.characters - Character profiles
   * @param {string} outline.raw - Raw text output from Gandalf
   */
  async saveOutline(novelId, outline) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      metadata.status = NOVEL_STATUS.WRITING;
      metadata.updatedAt = new Date().toISOString();

      return {
        metadata,
        outline: {
          ...outline,
          savedAt: new Date().toISOString()
        }
      };
    });

    console.log(`[NovelManager] Saved outline for ${novelId}`);
  }

  /**
   * Save a chapter from Frodo
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number (1-indexed)
   * @param {Object} chapter - Chapter data
   * @param {string} chapter.title - Chapter title
   * @param {string} chapter.content - Chapter content
   * @param {number} chapter.wordCount - Word count
   * @param {string} chapter.raw - Raw text output from Frodo
   */
  async saveChapter(novelId, chapterNum, chapter) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      const chapters = currentState.chapters || {};

      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      chapters[chapterNum] = {
        ...chapter,
        chapterNum,
        version: 1,
        savedAt: new Date().toISOString()
      };

      metadata.currentChapter = Math.max(metadata.currentChapter, chapterNum);
      metadata.status = NOVEL_STATUS.REVIEWING;
      metadata.updatedAt = new Date().toISOString();

      return { metadata, chapters };
    });

    console.log(`[NovelManager] Saved chapter ${chapterNum} for ${novelId}`);
  }

  /**
   * Sync metadata after N8N saves a chapter directly to Redis
   * This updates currentChapter and stats based on actual chapter keys
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number that was saved
   */
  async syncChapterMetadata(novelId, chapterNum) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      // Update currentChapter to the max of what we have
      metadata.currentChapter = Math.max(metadata.currentChapter || 0, chapterNum);
      metadata.status = NOVEL_STATUS.REVIEWING;
      metadata.updatedAt = new Date().toISOString();

      return { metadata };
    });

    console.log(`[NovelManager] Synced chapter metadata for ${novelId}: currentChapter=${chapterNum}`);
  }

  /**
   * Save critique from Elrond
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number
   * @param {Object} critique - Critique data
   * @param {number} critique.score - Quality score (0-100)
   * @param {Array} critique.strengths - List of strengths
   * @param {Array} critique.weaknesses - List of weaknesses
   * @param {string} critique.revision - Suggested revision
   * @param {string} critique.raw - Raw text output from Elrond
   */
  async saveCritique(novelId, chapterNum, critique) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      const critiques = currentState.critiques || {};
      const chapters = currentState.chapters || {};
      const revisions = currentState.revisions || {};

      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      critiques[chapterNum] = {
        ...critique,
        chapterNum,
        savedAt: new Date().toISOString()
      };

      // Check revision count for this chapter
      const revisionCount = revisions[chapterNum]?.length || 0;
      const currentVersion = chapters[chapterNum]?.version || 1;
      const totalAttempts = currentVersion;

      // Decide: pass, revise, or force pass
      const passed = critique.score >= this.config.passThreshold;
      const maxedOut = totalAttempts >= this.config.maxRevisions;

      if (passed) {
        metadata.status = NOVEL_STATUS.WRITING;
        console.log(`[NovelManager] Chapter ${chapterNum} PASSED (score: ${critique.score})`);
      } else if (maxedOut) {
        metadata.status = NOVEL_STATUS.WRITING;
        console.log(`[NovelManager] Chapter ${chapterNum} FORCE PASSED after ${totalAttempts} attempts (score: ${critique.score})`);
      } else {
        metadata.status = NOVEL_STATUS.REVISING;
        console.log(`[NovelManager] Chapter ${chapterNum} needs revision (score: ${critique.score}, attempt ${totalAttempts}/${this.config.maxRevisions})`);
      }

      metadata.updatedAt = new Date().toISOString();

      return { metadata, critiques };
    });
  }

  /**
   * Save a revision from Frodo (after Elrond's feedback)
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number
   * @param {Object} revision - Revised chapter data (same structure as chapter)
   */
  async saveRevision(novelId, chapterNum, revision) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      const chapters = currentState.chapters || {};
      const revisions = currentState.revisions || {};

      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      // Store old version in revisions history
      const oldChapter = chapters[chapterNum];
      if (oldChapter) {
        if (!revisions[chapterNum]) {
          revisions[chapterNum] = [];
        }
        revisions[chapterNum].push(oldChapter);
      }

      // Update chapter with revision
      chapters[chapterNum] = {
        ...revision,
        chapterNum,
        version: (oldChapter?.version || 0) + 1,
        savedAt: new Date().toISOString()
      };

      metadata.status = NOVEL_STATUS.REVIEWING;
      metadata.updatedAt = new Date().toISOString();

      return { metadata, chapters, revisions };
    });

    console.log(`[NovelManager] Saved revision for chapter ${chapterNum}`);
  }

  /**
   * Get a specific chapter
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number
   * @returns {Promise<Object|null>} Chapter data or null
   */
  async getChapter(novelId, chapterNum) {
    const scope = this.getScope(novelId);
    const chapters = await this.state.get(scope, 'chapters');
    return chapters?.[chapterNum] || null;
  }

  /**
   * Get critique for a chapter
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number
   * @returns {Promise<Object|null>} Critique data or null
   */
  async getCritique(novelId, chapterNum) {
    const scope = this.getScope(novelId);
    const critiques = await this.state.get(scope, 'critiques');
    return critiques?.[chapterNum] || null;
  }

  /**
   * Check if novel is complete
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<boolean>} True if all target chapters are written
   */
  async isComplete(novelId) {
    const novel = await this.getNovel(novelId);
    if (!novel) return false;

    const scope = this.getScope(novelId);
    const chapters = await this.state.get(scope, 'chapters');
    const chaptersWritten = Object.keys(chapters || {}).length;

    return chaptersWritten >= novel.targetChapters;
  }

  /**
   * Mark novel as completed
   *
   * @param {string} novelId - Novel ID
   */
  async completeNovel(novelId) {
    await this.updateStatus(novelId, NOVEL_STATUS.COMPLETED);
    console.log(`[NovelManager] Novel ${novelId} marked as COMPLETED`);
  }

  /**
   * Pause a novel
   *
   * @param {string} novelId - Novel ID
   */
  async pauseNovel(novelId) {
    await this.updateStatus(novelId, NOVEL_STATUS.PAUSED);
  }

  /**
   * Resume a paused novel
   *
   * @param {string} novelId - Novel ID
   */
  async resumeNovel(novelId) {
    const novel = await this.getNovel(novelId);
    if (!novel) {
      throw new Error(`Novel not found: ${novelId}`);
    }

    // Determine what status to resume to based on current state
    const state = await this.getNovelState(novelId);
    let newStatus;

    if (!state.outline) {
      newStatus = NOVEL_STATUS.PLANNING;
    } else if (state.stats.chaptersWritten < novel.targetChapters) {
      newStatus = NOVEL_STATUS.WRITING;
    } else {
      newStatus = NOVEL_STATUS.COMPLETED;
    }

    await this.updateStatus(novelId, newStatus);
  }

  /**
   * List all novels
   *
   * @returns {Promise<Array>} Array of novel summaries
   */
  async listNovels() {
    const globalState = await this.state.get('global', 'novels');
    if (!globalState) return [];

    return Object.values(globalState).sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  /**
   * Delete a novel (careful!)
   *
   * @param {string} novelId - Novel ID
   */
  async deleteNovel(novelId) {
    const scope = this.getScope(novelId);

    // Clear novel scope
    await this.state.clear(scope);

    // Remove from global index
    await this.state.writeWithRetry('novel-manager', 'global', async (currentState) => {
      const novels = currentState.novels || {};
      delete novels[novelId];
      return { novels };
    });

    console.log(`[NovelManager] Deleted novel: ${novelId}`);
  }

  /**
   * Update a single setting for a novel
   *
   * @param {string} novelId - Novel ID
   * @param {string} field - Metadata field to update
   * @param {*} value - New value
   */
  async updateSetting(novelId, field, value) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      metadata[field] = value;
      metadata.updatedAt = new Date().toISOString();

      return { metadata };
    });

    console.log(`[NovelManager] Updated setting ${field}=${value} for novel ${novelId}`);
  }

  /**
   * Get next chapter number to write
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<number>} Next chapter number (1-indexed)
   */
  async getNextChapterNum(novelId) {
    const novel = await this.getNovel(novelId);
    if (!novel) {
      throw new Error(`Novel not found: ${novelId}`);
    }
    return novel.currentChapter + 1;
  }

  /**
   * Store human feedback for later revision
   *
   * @param {string} novelId - Novel ID
   * @param {Object} feedback - Feedback object
   * @param {string} feedback.target - What the feedback is for (outline, chapter X)
   * @param {string} feedback.comment - The feedback comment
   * @param {string} feedback.timestamp - When feedback was given
   */
  async storeFeedback(novelId, feedback) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const feedbackList = currentState.feedback || [];
      feedbackList.push(feedback);
      return { feedback: feedbackList };
    });

    console.log(`[NovelManager] Stored feedback for ${novelId}: ${feedback.target}`);
  }

  /**
   * Get latest feedback for a novel
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object|null>} Latest feedback or null
   */
  async getLatestFeedback(novelId) {
    const scope = this.getScope(novelId);
    const feedbackList = await this.state.get(scope, 'feedback');
    if (!feedbackList || feedbackList.length === 0) {
      return null;
    }
    return feedbackList[feedbackList.length - 1];
  }

  /**
   * Approve the outline, allowing chapter writing to proceed
   *
   * @param {string} novelId - Novel ID
   */
  async approveOutline(novelId) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      metadata.outlineApproved = true;
      metadata.status = NOVEL_STATUS.WRITING;
      metadata.updatedAt = new Date().toISOString();

      return { metadata };
    });

    console.log(`[NovelManager] Outline approved for ${novelId}`);
  }

  /**
   * Approve a chapter, marking it as final and advancing to next
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number to approve
   */
  async approveChapter(novelId, chapterNum) {
    const scope = this.getScope(novelId);

    // First check if chapter exists (either in hash or individual key)
    const individualChapters = await this.getIndividualChapters(novelId);
    const hashChapters = await this.state.get(scope, 'chapters') || {};

    const chapterExists = individualChapters[chapterNum] || hashChapters[chapterNum];
    if (!chapterExists) {
      throw new Error(`Chapter ${chapterNum} not found`);
    }

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      const chapters = currentState.chapters || {};

      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      // Initialize chapter entry if it doesn't exist in hash (N8N stored it separately)
      if (!chapters[chapterNum]) {
        chapters[chapterNum] = {};
      }

      // Mark chapter as approved
      chapters[chapterNum].approved = true;
      chapters[chapterNum].approvedAt = new Date().toISOString();

      // Update current chapter to move past this one
      metadata.currentChapter = Math.max(metadata.currentChapter || 0, chapterNum);
      metadata.status = NOVEL_STATUS.WRITING;
      metadata.updatedAt = new Date().toISOString();

      return { metadata, chapters };
    });

    console.log(`[NovelManager] Chapter ${chapterNum} approved for ${novelId}`);
  }

  /**
   * Mark novel as completed
   *
   * @param {string} novelId - Novel ID
   */
  async markCompleted(novelId) {
    await this.updateStatus(novelId, NOVEL_STATUS.COMPLETED);
    console.log(`[NovelManager] Novel ${novelId} marked as COMPLETED`);
  }

  // ============================================================
  // CHANNEL MAPPING METHODS
  // ============================================================

  /**
   * Get novel ID from Discord channel ID
   *
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<string|null>} Novel ID or null if not a novel channel
   */
  async getNovelByChannel(channelId) {
    return await this.state.get('global', `channel:${channelId}`);
  }

  /**
   * Link a Discord channel to a novel
   *
   * @param {string} novelId - Novel ID
   * @param {string} channelId - Discord channel ID
   * @param {string} channelName - Discord channel name
   */
  async linkChannel(novelId, channelId, channelName) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      metadata.discordChannelId = channelId;
      metadata.discordChannelName = channelName;
      metadata.updatedAt = new Date().toISOString();

      return { metadata };
    });

    // Store reverse lookup
    await this.state.set('global', `channel:${channelId}`, novelId);

    // Update global index
    await this.state.writeWithRetry('novel-manager', 'global', async (currentState) => {
      const novels = currentState.novels || {};
      if (novels[novelId]) {
        novels[novelId].discordChannelId = channelId;
      }
      return { novels };
    });

    console.log(`[NovelManager] Linked channel ${channelName} to novel ${novelId}`);
  }

  // ============================================================
  // RECALL / REVISION METHODS
  // ============================================================

  /**
   * Recall a chapter for revision (go back to edit an earlier chapter)
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter to recall (0 = outline)
   * @returns {Promise<Object>} Recall result with chapter content
   */
  async recallChapter(novelId, chapterNum) {
    const scope = this.getScope(novelId);
    const state = await this.getNovelState(novelId);

    if (!state) {
      throw new Error(`Novel not found: ${novelId}`);
    }

    // Validate chapter exists
    if (chapterNum === 0) {
      if (!state.outline) {
        throw new Error('No outline to recall');
      }
    } else if (!state.chapters[chapterNum]) {
      throw new Error(`Chapter ${chapterNum} not found`);
    }

    // Calculate which chapters would need cascade
    const cascadePending = [];
    if (chapterNum < state.metadata.currentChapter) {
      for (let i = chapterNum + 1; i <= state.metadata.currentChapter; i++) {
        if (state.chapters[i]) {
          cascadePending.push(i);
        }
      }
    }

    // Update metadata with recall state
    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      metadata.revisionTarget = chapterNum;
      metadata.revisionMode = REVISION_MODE.ACTIVE;
      metadata.cascadePending = cascadePending;
      metadata.previousChapter = metadata.currentChapter; // Save where we were
      metadata.status = NOVEL_STATUS.REVISING;
      metadata.updatedAt = new Date().toISOString();
      return { metadata };
    });

    console.log(`[NovelManager] Recalled ${chapterNum === 0 ? 'outline' : `chapter ${chapterNum}`} for ${novelId}`);

    return {
      novelId,
      target: chapterNum,
      content: chapterNum === 0 ? state.outline : state.chapters[chapterNum],
      cascadePending,
      message: cascadePending.length > 0
        ? `Recalled ${chapterNum === 0 ? 'outline' : `chapter ${chapterNum}`}. After revision, ${cascadePending.length} chapter(s) may need regeneration.`
        : `Recalled ${chapterNum === 0 ? 'outline' : `chapter ${chapterNum}`} for revision.`
    };
  }

  /**
   * Complete recall revision and decide on cascade
   *
   * @param {string} novelId - Novel ID
   * @param {boolean} doCascade - Whether to regenerate affected chapters
   */
  async completeRecall(novelId, doCascade = false) {
    const scope = this.getScope(novelId);
    const novel = await this.getNovel(novelId);

    if (!novel) {
      throw new Error(`Novel not found: ${novelId}`);
    }

    if (novel.revisionMode !== REVISION_MODE.ACTIVE) {
      throw new Error('No active recall to complete');
    }

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;

      if (doCascade && metadata.cascadePending.length > 0) {
        // Set up for cascade regeneration
        metadata.revisionMode = REVISION_MODE.CASCADE_PENDING;
        metadata.currentChapter = metadata.revisionTarget; // Reset to revision point
        metadata.status = NOVEL_STATUS.WRITING;
      } else {
        // No cascade, just return to where we were
        metadata.revisionTarget = null;
        metadata.revisionMode = REVISION_MODE.NONE;
        metadata.cascadePending = [];
        metadata.currentChapter = metadata.previousChapter || metadata.currentChapter;
        metadata.status = NOVEL_STATUS.WRITING;
      }

      delete metadata.previousChapter;
      metadata.updatedAt = new Date().toISOString();
      return { metadata };
    });

    console.log(`[NovelManager] Completed recall for ${novelId}, cascade: ${doCascade}`);
  }

  /**
   * Mark a cascade chapter as regenerated
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter that was regenerated
   */
  async markCascadeComplete(novelId, chapterNum) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;

      // Remove from pending
      metadata.cascadePending = metadata.cascadePending.filter(c => c !== chapterNum);

      // If all cascade done, clear revision mode
      if (metadata.cascadePending.length === 0) {
        metadata.revisionMode = REVISION_MODE.NONE;
        metadata.revisionTarget = null;
      }

      metadata.updatedAt = new Date().toISOString();
      return { metadata };
    });
  }

  // ============================================================
  // STORY BIBLE METHODS
  // ============================================================

  /**
   * Get the story bible for a novel
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object>} Story bible
   */
  async getStoryBible(novelId) {
    const scope = this.getScope(novelId);
    const bible = await this.state.get(scope, 'storyBible');
    return bible || { ...EMPTY_STORY_BIBLE };
  }

  /**
   * Add or update a character in the story bible
   *
   * @param {string} novelId - Novel ID
   * @param {Object} character - Character data
   */
  async upsertCharacter(novelId, character) {
    const scope = this.getScope(novelId);
    const charId = character.id || `char-${Date.now()}`;

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      bible.characters[charId] = {
        ...character,
        id: charId,
        updatedAt: new Date().toISOString()
      };
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Updated character ${charId} in story bible for ${novelId}`);
    return charId;
  }

  /**
   * Add a relationship between characters
   *
   * @param {string} novelId - Novel ID
   * @param {Object} relationship - Relationship data
   */
  async addRelationship(novelId, relationship) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      bible.relationships.push({
        ...relationship,
        addedAt: new Date().toISOString()
      });
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Added relationship in story bible for ${novelId}`);
  }

  /**
   * Add a plot thread / foreshadowing
   *
   * @param {string} novelId - Novel ID
   * @param {Object} thread - Plot thread data
   */
  async addPlotThread(novelId, thread) {
    const scope = this.getScope(novelId);
    const threadId = thread.id || `thread-${Date.now()}`;

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      bible.plotThreads.push({
        ...thread,
        id: threadId,
        foreshadowing: thread.foreshadowing || [],
        resolved: null,
        addedAt: new Date().toISOString()
      });
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Added plot thread ${threadId} for ${novelId}`);
    return threadId;
  }

  /**
   * Add foreshadowing to an existing plot thread
   *
   * @param {string} novelId - Novel ID
   * @param {string} threadId - Plot thread ID
   * @param {Object} hint - Foreshadowing hint { chapter, hint }
   */
  async addForeshadowing(novelId, threadId, hint) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      const thread = bible.plotThreads.find(t => t.id === threadId);
      if (!thread) {
        throw new Error(`Plot thread not found: ${threadId}`);
      }
      thread.foreshadowing.push(hint);
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Added foreshadowing to thread ${threadId} for ${novelId}`);
  }

  /**
   * Add a world fact
   *
   * @param {string} novelId - Novel ID
   * @param {Object} fact - { fact, category }
   */
  async addWorldFact(novelId, fact) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      bible.worldFacts.push({
        ...fact,
        addedAt: new Date().toISOString()
      });
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Added world fact for ${novelId}`);
  }

  /**
   * Add a timeline event
   *
   * @param {string} novelId - Novel ID
   * @param {Object} event - { chapter, event, characters }
   */
  async addTimelineEvent(novelId, event) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      bible.timeline.push(event);
      // Keep timeline sorted by chapter
      bible.timeline.sort((a, b) => a.chapter - b.chapter);
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Added timeline event for ${novelId}`);
  }

  /**
   * Add a Chekhov's gun (item/fact that must pay off later)
   *
   * @param {string} novelId - Novel ID
   * @param {Object} chekhov - { item, introduced, notes }
   */
  async addChekhov(novelId, chekhov) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      bible.chekhovs.push({
        ...chekhov,
        payoff: null,
        addedAt: new Date().toISOString()
      });
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Added Chekhov's gun for ${novelId}`);
  }

  /**
   * Import Story Bible from outline text
   * Parses the STORY BIBLE section from Gandalf's outline output and saves to Redis
   *
   * @param {string} novelId - Novel ID
   * @param {string} outlineText - Raw outline text (optional - if not provided, reads from Redis)
   * @returns {Promise<Object>} Import result with counts
   */
  async importStoryBibleFromOutline(novelId, outlineText = null) {
    const scope = this.getScope(novelId);

    // If no outline text provided, get it from Redis
    if (!outlineText) {
      const outline = await this.state.get(scope, 'outline');
      if (!outline) {
        throw new Error('No outline found for this novel');
      }
      // Outline could be stored in various formats:
      // 1. Plain string
      // 2. Object with .raw property
      // 3. Object with .content property
      // 4. Claude API response format: { data: [{ type: "text", text: "..." }] }
      if (typeof outline === 'string') {
        outlineText = outline;
      } else if (outline.raw) {
        outlineText = outline.raw;
      } else if (outline.content) {
        outlineText = outline.content;
      } else if (outline.data && Array.isArray(outline.data)) {
        // Claude API response format - find the text block
        const textBlock = outline.data.find(item => item.type === 'text');
        outlineText = textBlock?.text || JSON.stringify(outline);
      } else {
        outlineText = JSON.stringify(outline);
      }
    }

    // Parse the outline
    const parsedBible = parseStoryBibleFromOutline(outlineText);

    // Check if we got anything
    const charCount = Object.keys(parsedBible.characters).length;
    const threadCount = parsedBible.plotThreads.length;
    const factCount = parsedBible.worldFacts.length;
    const chekhovCount = parsedBible.chekhovs.length;

    if (charCount === 0 && threadCount === 0 && factCount === 0 && chekhovCount === 0) {
      console.log(`[NovelManager] No Story Bible data found in outline for ${novelId}`);
      return {
        success: false,
        message: 'No Story Bible section found in outline',
        counts: { characters: 0, plotThreads: 0, worldFacts: 0, chekhovs: 0 }
      };
    }

    // Save to Redis using updateStoryBible
    await this.updateStoryBible(novelId, parsedBible);

    console.log(`[NovelManager] Imported Story Bible for ${novelId}: ${charCount} characters, ${threadCount} threads, ${factCount} facts, ${chekhovCount} chekhovs`);

    return {
      success: true,
      message: `Imported ${charCount} characters, ${threadCount} plot threads, ${factCount} world facts, ${chekhovCount} Chekhov's guns`,
      counts: {
        characters: charCount,
        plotThreads: threadCount,
        worldFacts: factCount,
        chekhovs: chekhovCount
      }
    };
  }

  /**
   * Mark a Chekhov's gun as paid off
   *
   * @param {string} novelId - Novel ID
   * @param {string} item - Item name
   * @param {number} payoffChapter - Chapter where it paid off
   */
  async resolveChekhov(novelId, item, payoffChapter) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };
      const chekhov = bible.chekhovs.find(c => c.item === item);
      if (chekhov) {
        chekhov.payoff = payoffChapter;
      }
      return { storyBible: bible };
    });

    console.log(`[NovelManager] Resolved Chekhov's gun "${item}" in chapter ${payoffChapter}`);
  }

  /**
   * Update story bible from agent output (bulk update)
   * Used by Gandalf/Frodo to update bible after generating content
   *
   * @param {string} novelId - Novel ID
   * @param {Object} updates - Partial story bible updates
   */
  async updateStoryBible(novelId, updates) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const bible = currentState.storyBible || { ...EMPTY_STORY_BIBLE };

      // Merge characters
      if (updates.characters) {
        for (const [id, char] of Object.entries(updates.characters)) {
          bible.characters[id] = { ...bible.characters[id], ...char, id };
        }
      }

      // Append relationships (avoid duplicates)
      if (updates.relationships) {
        for (const rel of updates.relationships) {
          const exists = bible.relationships.some(
            r => r.from === rel.from && r.to === rel.to && r.type === rel.type
          );
          if (!exists) {
            bible.relationships.push(rel);
          }
        }
      }

      // Append plot threads
      if (updates.plotThreads) {
        for (const thread of updates.plotThreads) {
          const existing = bible.plotThreads.find(t => t.id === thread.id);
          if (existing) {
            Object.assign(existing, thread);
          } else {
            bible.plotThreads.push(thread);
          }
        }
      }

      // Append world facts (avoid duplicates)
      if (updates.worldFacts) {
        for (const fact of updates.worldFacts) {
          const exists = bible.worldFacts.some(f => f.fact === fact.fact);
          if (!exists) {
            bible.worldFacts.push(fact);
          }
        }
      }

      // Append timeline events
      if (updates.timeline) {
        for (const event of updates.timeline) {
          bible.timeline.push(event);
        }
        bible.timeline.sort((a, b) => a.chapter - b.chapter);
      }

      // Append chekhovs
      if (updates.chekhovs) {
        for (const chekhov of updates.chekhovs) {
          const existing = bible.chekhovs.find(c => c.item === chekhov.item);
          if (existing) {
            Object.assign(existing, chekhov);
          } else {
            bible.chekhovs.push(chekhov);
          }
        }
      }

      return { storyBible: bible };
    });

    console.log(`[NovelManager] Updated story bible for ${novelId}`);
  }

  // ==================== ML Training Data Methods (Phase 6) ====================

  /**
   * Store a revision pair for DPO training
   * Called BEFORE triggering revision to capture original content
   *
   * @param {string} novelId - Novel ID
   * @param {Object} pair - Revision pair data
   * @param {string} pair.target - 'outline' or 'chapter'
   * @param {number} [pair.chapterNum] - Chapter number (if target is 'chapter')
   * @param {string} pair.original - Original content before revision
   * @param {string} pair.feedback - User's revision feedback
   * @param {Object} pair.metadata - Novel metadata at time of revision
   */
  async storeRevisionPair(novelId, pair) {
    const scope = this.getScope(novelId);
    const timestamp = new Date().toISOString();

    const revisionRecord = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      target: pair.target,
      chapterNum: pair.chapterNum || null,
      original: pair.original,
      feedback: pair.feedback,
      metadata: {
        genre: pair.metadata.genre,
        language: pair.metadata.language,
        pov: pair.metadata.pov,
        tone: pair.metadata.tone,
        styleReference: pair.metadata.styleReference
      },
      timestamp,
      revised: null  // Will be filled after revision completes
    };

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const revisionPairs = currentState.revisionPairs || [];
      revisionPairs.push(revisionRecord);
      return { revisionPairs };
    });

    console.log(`[NovelManager] Stored revision pair ${revisionRecord.id} for ${novelId}`);
    return revisionRecord.id;
  }

  /**
   * Complete a revision pair by adding the revised content
   * Called AFTER revision completes
   *
   * @param {string} novelId - Novel ID
   * @param {string} revisionId - ID of the revision record
   * @param {string} revisedContent - The revised content
   */
  async completeRevisionPair(novelId, revisionId, revisedContent) {
    const scope = this.getScope(novelId);

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const revisionPairs = currentState.revisionPairs || [];
      const pair = revisionPairs.find(p => p.id === revisionId);
      if (pair) {
        pair.revised = revisedContent;
        pair.completedAt = new Date().toISOString();
      }
      return { revisionPairs };
    });

    console.log(`[NovelManager] Completed revision pair ${revisionId} for ${novelId}`);
  }

  /**
   * Store a user preference signal (from reactions or explicit rating)
   *
   * @param {string} novelId - Novel ID
   * @param {Object} pref - Preference data
   * @param {string} pref.type - 'reaction' or 'rating'
   * @param {number} pref.chapterNum - Chapter number
   * @param {number} pref.score - Score (-1 for 👎, 1 for 👍, or 1-10 for rating)
   * @param {string} [pref.userId] - Discord user ID
   * @param {string} [pref.comment] - Optional comment
   */
  async storePreference(novelId, pref) {
    const scope = this.getScope(novelId);
    const timestamp = new Date().toISOString();

    const prefRecord = {
      id: `pref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: pref.type,
      chapterNum: pref.chapterNum,
      score: pref.score,
      userId: pref.userId || null,
      comment: pref.comment || null,
      timestamp
    };

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const preferences = currentState.preferences || [];
      preferences.push(prefRecord);
      return { preferences };
    });

    console.log(`[NovelManager] Stored preference ${prefRecord.id} for ${novelId} ch${pref.chapterNum}`);
  }

  /**
   * Get all revision pairs for a novel (for DPO export)
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Array>} Array of revision pairs
   */
  async getRevisionPairs(novelId) {
    const scope = this.getScope(novelId);
    const pairs = await this.state.get(scope, 'revisionPairs');
    return pairs || [];
  }

  /**
   * Get all preferences for a novel (for reward model export)
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Array>} Array of preferences
   */
  async getPreferences(novelId) {
    const scope = this.getScope(novelId);
    const prefs = await this.state.get(scope, 'preferences');
    return prefs || [];
  }

  /**
   * Get training data export for a novel
   *
   * @param {string} novelId - Novel ID
   * @param {string} format - 'dpo', 'sft', or 'reward'
   * @returns {Promise<Array>} Training data in requested format
   */
  async getTrainingData(novelId, format = 'dpo') {
    const state = await this.getNovelState(novelId);
    if (!state) {
      throw new Error(`Novel not found: ${novelId}`);
    }

    const { metadata, chapters, outline, revisionPairs = [], preferences = [] } = state;

    switch (format) {
      case 'dpo':
        // Return completed revision pairs as (chosen, rejected)
        return revisionPairs
          .filter(p => p.revised && p.original)
          .map(p => ({
            novel_id: novelId,
            target: p.target,
            chapter_num: p.chapterNum,
            chosen: p.revised,
            rejected: p.original,
            feedback: p.feedback,
            metadata: p.metadata,
            timestamp: p.timestamp
          }));

      case 'sft':
        // Return chapters with metadata for supervised fine-tuning
        const chapterList = [];
        if (chapters) {
          const chapterNums = Object.keys(chapters).map(k => parseInt(k)).filter(n => !isNaN(n)).sort((a, b) => a - b);
          for (const num of chapterNums) {
            const ch = chapters[num];
            const content = typeof ch === 'string' ? ch : (ch.content || ch.text || '');
            chapterList.push({
              novel_id: novelId,
              chapter_num: num,
              instruction: `Write chapter ${num} of a ${metadata.tone || ''} ${metadata.genre} novel in ${metadata.language === 'zh' ? 'Chinese' : 'English'}.`,
              input: outline?.chapters?.[num - 1]?.summary || '',
              output: content,
              metadata: {
                genre: metadata.genre,
                language: metadata.language,
                pov: metadata.pov,
                tone: metadata.tone,
                styleReference: metadata.styleReference
              }
            });
          }
        }
        return chapterList;

      case 'reward':
        // Return chapters with critique scores and user preferences
        const rewardData = [];
        if (chapters) {
          const chapterNums = Object.keys(chapters).map(k => parseInt(k)).filter(n => !isNaN(n)).sort((a, b) => a - b);
          for (const num of chapterNums) {
            const ch = chapters[num];
            const content = typeof ch === 'string' ? ch : (ch.content || ch.text || '');
            const critique = state.critiques?.[num];
            const chapterPrefs = preferences.filter(p => p.chapterNum === num);

            // Calculate aggregate preference score
            const reactionVotes = chapterPrefs.filter(p => p.type === 'reaction');
            const ratings = chapterPrefs.filter(p => p.type === 'rating');

            rewardData.push({
              novel_id: novelId,
              chapter_num: num,
              chapter_text: content,
              critique_score: critique?.score || null,
              critique_text: critique?.text || critique?.content || null,
              reaction_votes: {
                up: reactionVotes.filter(p => p.score > 0).length,
                down: reactionVotes.filter(p => p.score < 0).length
              },
              avg_rating: ratings.length > 0 ? ratings.reduce((sum, p) => sum + p.score, 0) / ratings.length : null,
              metadata: {
                genre: metadata.genre,
                language: metadata.language,
                pov: metadata.pov,
                tone: metadata.tone,
                styleReference: metadata.styleReference
              }
            });
          }
        }
        return rewardData;

      default:
        throw new Error(`Unknown training format: ${format}`);
    }
  }
}

// ============================================================
// STORY BIBLE PARSER
// ============================================================

/**
 * Parse Story Bible data from outline text (Gandalf's output)
 * Extracts CHARACTERS, PLOT THREADS, WORLD FACTS, and CHEKHOVS sections
 *
 * @param {string} outlineText - Raw outline text from Gandalf
 * @returns {Object} Parsed story bible data matching EMPTY_STORY_BIBLE structure
 */
function parseStoryBibleFromOutline(outlineText) {
  if (!outlineText || typeof outlineText !== 'string') {
    console.log('[Parser] No outline text provided');
    return { ...EMPTY_STORY_BIBLE };
  }

  console.log(`[Parser] Parsing story bible from outline (${outlineText.length} chars)`);

  const bible = {
    characters: {},
    relationships: [],
    plotThreads: [],
    worldFacts: [],
    timeline: [],
    chekhovs: []
  };

  // Find STORY BIBLE section
  // Match everything from "## STORY BIBLE" until end of string or next "## " (not "###")
  // Since STORY BIBLE is typically the last major section, we use greedy matching
  const storyBibleMatch = outlineText.match(/##\s*STORY BIBLE\s*\n([\s\S]*)$/i);
  if (!storyBibleMatch) {
    console.log('[Parser] No STORY BIBLE section found');
    return bible;
  }

  const bibleSection = storyBibleMatch[1];
  console.log(`[Parser] Found STORY BIBLE section (${bibleSection.length} chars)`);

  // Parse CHARACTERS section
  const charactersMatch = bibleSection.match(/###\s*CHARACTERS\s*\n([\s\S]*?)(?=###|$)/i);
  if (charactersMatch) {
    const charactersText = charactersMatch[1];
    console.log(`[Parser] Found CHARACTERS section (${charactersText.length} chars)`);

    // Split by character entries (each starts with "- ID:" or "ID:")
    const charBlocks = charactersText.split(/(?=(?:^|\n)-?\s*ID:\s*char-)/i);

    for (const block of charBlocks) {
      if (!block.trim()) continue;

      const idMatch = block.match(/ID:\s*(char-\d+)/i);
      const nameMatch = block.match(/Name:\s*(.+?)(?:\n|$)/i);
      const aliasesMatch = block.match(/Aliases:\s*(.+?)(?:\n|$)/i);
      const descMatch = block.match(/Description:\s*(.+?)(?:\n|$)/i);
      const traitsMatch = block.match(/Traits:\s*(.+?)(?:\n|$)/i);
      const roleMatch = block.match(/Role:\s*(.+?)(?:\n|$)/i);
      const arcMatch = block.match(/Arc:\s*(.+?)(?:\n|$)/i);
      const statusMatch = block.match(/Status:\s*(.+?)(?:\n|$)/i);

      if (idMatch && nameMatch) {
        const charId = idMatch[1];
        bible.characters[charId] = {
          id: charId,
          name: nameMatch[1].trim(),
          aliases: aliasesMatch ? aliasesMatch[1].trim().split(/[,，、]/).map(a => a.trim()).filter(a => a) : [],
          description: descMatch ? descMatch[1].trim() : '',
          traits: traitsMatch ? traitsMatch[1].trim().split(/[,，、]/).map(t => t.trim()).filter(t => t) : [],
          role: roleMatch ? roleMatch[1].trim() : '',
          arc: arcMatch ? arcMatch[1].trim() : '',
          status: statusMatch ? statusMatch[1].trim() : 'alive',
          updatedAt: new Date().toISOString()
        };
        console.log(`[Parser] Parsed character: ${charId} - ${nameMatch[1].trim()}`);
      }
    }
  }

  // Parse PLOT THREADS section
  const plotThreadsMatch = bibleSection.match(/###\s*PLOT THREADS\s*\n([\s\S]*?)(?=###|$)/i);
  if (plotThreadsMatch) {
    const threadsText = plotThreadsMatch[1];
    console.log(`[Parser] Found PLOT THREADS section (${threadsText.length} chars)`);

    // Split by thread entries
    const threadBlocks = threadsText.split(/(?=(?:^|\n)-?\s*ID:\s*thread-)/i);

    for (const block of threadBlocks) {
      if (!block.trim()) continue;

      const idMatch = block.match(/ID:\s*(thread-\d+)/i);
      const titleMatch = block.match(/Title:\s*(.+?)(?:\n|$)/i);
      const descMatch = block.match(/Description:\s*(.+?)(?:\n|$)/i);
      const resolutionMatch = block.match(/Resolution:\s*(.+?)(?:\n|$)/i);

      if (idMatch && titleMatch) {
        bible.plotThreads.push({
          id: idMatch[1],
          title: titleMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : '',
          resolution: resolutionMatch ? resolutionMatch[1].trim() : '',
          foreshadowing: [],
          resolved: null,
          addedAt: new Date().toISOString()
        });
        console.log(`[Parser] Parsed plot thread: ${idMatch[1]} - ${titleMatch[1].trim()}`);
      }
    }
  }

  // Parse WORLD FACTS section
  const worldFactsMatch = bibleSection.match(/###\s*WORLD FACTS\s*\n([\s\S]*?)(?=###|$)/i);
  if (worldFactsMatch) {
    const factsText = worldFactsMatch[1];
    console.log(`[Parser] Found WORLD FACTS section (${factsText.length} chars)`);

    // Parse facts in format: "- [Category]: [Fact]" or "- Category: Fact"
    const factLines = factsText.split('\n');
    for (const line of factLines) {
      // Match "- [Category]: Fact" or "- Category: Fact"
      const factMatch = line.match(/^-\s*\[?([^\]:]+)\]?:\s*(.+)$/);
      if (factMatch) {
        bible.worldFacts.push({
          category: factMatch[1].trim(),
          fact: factMatch[2].trim(),
          addedAt: new Date().toISOString()
        });
        console.log(`[Parser] Parsed world fact: [${factMatch[1].trim()}]`);
      }
    }
  }

  // Parse CHEKHOVS section
  const chekhovsMatch = bibleSection.match(/###\s*CHEKHOVS\s*\n([\s\S]*?)(?=###|$)/i);
  if (chekhovsMatch) {
    const chekhovsText = chekhovsMatch[1];
    console.log(`[Parser] Found CHEKHOVS section (${chekhovsText.length} chars)`);

    // Split by chekhov entries
    const chekhovBlocks = chekhovsText.split(/(?=(?:^|\n)-?\s*Item:)/i);

    for (const block of chekhovBlocks) {
      if (!block.trim()) continue;

      const itemMatch = block.match(/Item:\s*(.+?)(?:\n|$)/i);
      const setupMatch = block.match(/Setup:\s*(.+?)(?:\n|$)/i);
      const payoffMatch = block.match(/Payoff:\s*(.+?)(?:\n|$)/i);

      if (itemMatch) {
        bible.chekhovs.push({
          item: itemMatch[1].trim(),
          introduced: setupMatch ? setupMatch[1].trim() : '',
          notes: payoffMatch ? payoffMatch[1].trim() : '',
          payoff: null,
          addedAt: new Date().toISOString()
        });
        console.log(`[Parser] Parsed Chekhov's gun: ${itemMatch[1].trim()}`);
      }
    }
  }

  // Summary
  console.log(`[Parser] Parsing complete:`);
  console.log(`  - Characters: ${Object.keys(bible.characters).length}`);
  console.log(`  - Plot threads: ${bible.plotThreads.length}`);
  console.log(`  - World facts: ${bible.worldFacts.length}`);
  console.log(`  - Chekhovs: ${bible.chekhovs.length}`);

  return bible;
}

module.exports = {
  NovelManager,
  NOVEL_STATUS,
  REVISION_MODE,
  DEFAULT_CONFIG,
  EMPTY_STORY_BIBLE,
  parseStoryBibleFromOutline
};
