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
      pov: config.pov || 'protagonist',
      premise: config.premise || '',
      targetChapters: config.targetChapters || 100,
      targetWordsPerChapter: config.targetWordsPerChapter || 3000,
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

    return {
      metadata,
      outline,
      chapters: chapters || {},
      critiques: critiques || {},
      revisions: revisions || {},
      stats: {
        chaptersWritten: Object.keys(chapters || {}).length,
        chaptersReviewed: Object.keys(critiques || {}).length,
        chaptersRevised: Object.keys(revisions || {}).length
      }
    };
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

    await this.state.writeWithRetry('novel-manager', scope, async (currentState) => {
      const metadata = currentState.metadata;
      const chapters = currentState.chapters || {};

      if (!metadata) {
        throw new Error(`Novel not found: ${novelId}`);
      }

      if (!chapters[chapterNum]) {
        throw new Error(`Chapter ${chapterNum} not found`);
      }

      // Mark chapter as approved
      chapters[chapterNum].approved = true;
      chapters[chapterNum].approvedAt = new Date().toISOString();

      // Advance current chapter if this was the current one
      if (chapterNum === metadata.currentChapter) {
        metadata.currentChapter = chapterNum + 1;
      }

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
}

module.exports = {
  NovelManager,
  NOVEL_STATUS,
  REVISION_MODE,
  DEFAULT_CONFIG,
  EMPTY_STORY_BIBLE
};
