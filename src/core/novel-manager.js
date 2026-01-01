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

// Default quality settings
const DEFAULT_CONFIG = {
  passThreshold: 70,      // Minimum score to pass critique (0-100)
  maxRevisions: 3         // Max revision attempts before forcing pass
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

    // Register in global novel index
    await this.state.writeWithRetry('novel-manager', 'global', async (currentState) => {
      const novels = currentState.novels || {};
      novels[novelId] = {
        id: novelId,
        title: novel.title,
        status: novel.status,
        createdAt: now
      };
      return { novels };
    });

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
}

module.exports = {
  NovelManager,
  NOVEL_STATUS,
  DEFAULT_CONFIG
};
