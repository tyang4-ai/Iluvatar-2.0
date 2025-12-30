/**
 * ILUVATAR - S3 Storage
 *
 * Handles backup, export, and training data storage using AWS S3.
 *
 * Structure in S3:
 *   iluvatar-novels/
 *   ├── novels/
 *   │   └── {novelId}/
 *   │       ├── state.json          # Full novel state backup
 *   │       ├── outline.md          # Gandalf's outline
 *   │       └── chapters/
 *   │           ├── chapter-001.md  # Exported chapters
 *   │           └── chapter-002.md
 *   ├── training/
 *   │   └── preferences/
 *   │       └── {novelId}/
 *   │           └── chapter-{n}-v{version}.json  # Preference pairs for DPO
 *   └── backups/
 *       └── {date}/
 *           └── full-backup.json    # Daily full backups
 */

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

class S3Storage {
  /**
   * @param {Object} config - S3 configuration
   * @param {string} config.bucket - S3 bucket name
   * @param {string} config.region - AWS region (default: us-west-1)
   * @param {string} config.accessKeyId - AWS access key (optional, uses env/IAM if not provided)
   * @param {string} config.secretAccessKey - AWS secret key (optional)
   */
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.S3_BUCKET || 'iluvatar-novels';
    this.region = config.region || process.env.AWS_REGION || 'us-west-1';

    const clientConfig = { region: this.region };

    // Only add credentials if explicitly provided (otherwise uses env/IAM role)
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      };
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Save novel state as backup
   *
   * @param {string} novelId - Novel ID
   * @param {Object} state - Full novel state from NovelManager
   * @returns {Promise<string>} S3 key where backup was saved
   */
  async backupNovelState(novelId, state) {
    const key = `novels/${novelId}/state.json`;
    const body = JSON.stringify(state, null, 2);

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      Metadata: {
        'novel-id': novelId,
        'backup-time': new Date().toISOString(),
        'chapters-count': String(state.stats?.chaptersWritten || 0)
      }
    }));

    console.log(`[S3Storage] Backed up novel state: ${key}`);
    return key;
  }

  /**
   * Restore novel state from backup
   *
   * @param {string} novelId - Novel ID
   * @returns {Promise<Object|null>} Novel state or null if not found
   */
  async restoreNovelState(novelId) {
    const key = `novels/${novelId}/state.json`;

    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));

      const body = await response.Body.transformToString();
      console.log(`[S3Storage] Restored novel state: ${key}`);
      return JSON.parse(body);

    } catch (err) {
      if (err.name === 'NoSuchKey') {
        console.log(`[S3Storage] No backup found for novel: ${novelId}`);
        return null;
      }
      throw err;
    }
  }

  /**
   * Export a chapter as markdown
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number
   * @param {Object} chapter - Chapter data
   * @returns {Promise<string>} S3 key
   */
  async exportChapter(novelId, chapterNum, chapter) {
    const paddedNum = String(chapterNum).padStart(3, '0');
    const key = `novels/${novelId}/chapters/chapter-${paddedNum}.md`;

    const markdown = `# ${chapter.title || `Chapter ${chapterNum}`}

${chapter.content}

---
*Word count: ${chapter.wordCount || 'unknown'}*
*Version: ${chapter.version || 1}*
*Generated: ${chapter.savedAt || new Date().toISOString()}*
`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: markdown,
      ContentType: 'text/markdown'
    }));

    console.log(`[S3Storage] Exported chapter: ${key}`);
    return key;
  }

  /**
   * Save outline as markdown
   *
   * @param {string} novelId - Novel ID
   * @param {Object} outline - Outline data
   * @returns {Promise<string>} S3 key
   */
  async exportOutline(novelId, outline) {
    const key = `novels/${novelId}/outline.md`;

    const markdown = `# Novel Outline

## Synopsis
${outline.synopsis || 'No synopsis'}

## Chapters
${(outline.chapters || []).map((ch, i) => `${i + 1}. ${ch.title || ch.summary || 'Untitled'}`).join('\n')}

## Characters
${(outline.characters || []).map(c => `- **${c.name}**: ${c.description || 'No description'}`).join('\n')}

---
*Generated: ${outline.savedAt || new Date().toISOString()}*
`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: markdown,
      ContentType: 'text/markdown'
    }));

    console.log(`[S3Storage] Exported outline: ${key}`);
    return key;
  }

  /**
   * Save a preference pair for DPO training
   *
   * This stores the (original, revised) pair that Elrond evaluated.
   * These pairs are used later to train the reward model and fine-tune Frodo.
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number
   * @param {Object} preference - Preference data
   * @param {string} preference.original - Original chapter content
   * @param {string} preference.revised - Revised chapter content
   * @param {number} preference.originalScore - Elrond's score for original
   * @param {number} preference.revisedScore - Elrond's score for revision
   * @param {Object} preference.critique - Elrond's critique
   * @returns {Promise<string>} S3 key
   */
  async savePreferencePair(novelId, chapterNum, preference) {
    const timestamp = Date.now();
    const key = `training/preferences/${novelId}/chapter-${chapterNum}-${timestamp}.json`;

    const data = {
      novelId,
      chapterNum,
      timestamp: new Date().toISOString(),
      original: {
        content: preference.original,
        score: preference.originalScore
      },
      revised: {
        content: preference.revised,
        score: preference.revisedScore
      },
      critique: preference.critique,
      // DPO format: chosen is the higher-scored version
      chosen: preference.revisedScore > preference.originalScore ? 'revised' : 'original',
      rejected: preference.revisedScore > preference.originalScore ? 'original' : 'revised'
    };

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    }));

    console.log(`[S3Storage] Saved preference pair: ${key}`);
    return key;
  }

  /**
   * List all preference pairs for a novel (for training)
   *
   * @param {string} novelId - Novel ID (optional, lists all if not provided)
   * @returns {Promise<Array>} List of preference pair keys
   */
  async listPreferencePairs(novelId = null) {
    const prefix = novelId
      ? `training/preferences/${novelId}/`
      : 'training/preferences/';

    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix
    }));

    return (response.Contents || []).map(obj => obj.Key);
  }

  /**
   * Get a preference pair by key
   *
   * @param {string} key - S3 key
   * @returns {Promise<Object>} Preference pair data
   */
  async getPreferencePair(key) {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    }));

    const body = await response.Body.transformToString();
    return JSON.parse(body);
  }

  /**
   * Create a full backup of all novels
   *
   * @param {Array} novels - Array of novel states
   * @returns {Promise<string>} S3 key
   */
  async createFullBackup(novels) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `backups/${date}/full-backup.json`;

    const backup = {
      createdAt: new Date().toISOString(),
      novelCount: novels.length,
      novels
    };

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(backup, null, 2),
      ContentType: 'application/json'
    }));

    console.log(`[S3Storage] Created full backup: ${key} (${novels.length} novels)`);
    return key;
  }

  /**
   * List available backups
   *
   * @returns {Promise<Array>} List of backup keys
   */
  async listBackups() {
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: 'backups/'
    }));

    return (response.Contents || [])
      .map(obj => ({
        key: obj.Key,
        date: obj.Key.split('/')[1],
        size: obj.Size,
        lastModified: obj.LastModified
      }))
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  }

  /**
   * Restore from a full backup
   *
   * @param {string} key - Backup S3 key
   * @returns {Promise<Object>} Backup data
   */
  async restoreFullBackup(key) {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    }));

    const body = await response.Body.transformToString();
    console.log(`[S3Storage] Restored full backup: ${key}`);
    return JSON.parse(body);
  }

  /**
   * Delete a novel's S3 data
   *
   * @param {string} novelId - Novel ID
   */
  async deleteNovelData(novelId) {
    const prefix = `novels/${novelId}/`;

    // List all objects for this novel
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix
    }));

    // Delete each object
    for (const obj of (response.Contents || [])) {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: obj.Key
      }));
    }

    console.log(`[S3Storage] Deleted all data for novel: ${novelId}`);
  }

  /**
   * Export all chapters of a novel as a combined document
   *
   * @param {string} novelId - Novel ID
   * @param {Object} state - Full novel state
   * @returns {Promise<string>} S3 key
   */
  async exportFullNovel(novelId, state) {
    const key = `novels/${novelId}/full-novel.md`;

    let markdown = `# ${state.metadata?.title || 'Untitled Novel'}

*Genre: ${state.metadata?.genre || 'Unknown'}*
*POV: ${state.metadata?.pov || 'Unknown'}*

---

`;

    // Add outline
    if (state.outline) {
      markdown += `## Synopsis\n\n${state.outline.synopsis || 'No synopsis'}\n\n---\n\n`;
    }

    // Add chapters in order
    const chapterNums = Object.keys(state.chapters || {})
      .map(Number)
      .sort((a, b) => a - b);

    for (const num of chapterNums) {
      const chapter = state.chapters[num];
      markdown += `## Chapter ${num}: ${chapter.title || 'Untitled'}\n\n`;
      markdown += `${chapter.content}\n\n`;
      markdown += `---\n\n`;
    }

    markdown += `\n*Generated by ILUVATAR on ${new Date().toISOString()}*\n`;

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: markdown,
      ContentType: 'text/markdown'
    }));

    console.log(`[S3Storage] Exported full novel: ${key}`);
    return key;
  }
}

module.exports = { S3Storage };
