/**
 * ILUVATAR - Bible Retriever
 *
 * Hybrid retrieval system for the Story Bible:
 * 1. Embed query using OpenAI text-embedding-3-small
 * 2. Find relevant entries by cosine similarity
 * 3. Fetch full entries from Redis
 *
 * This keeps context windows manageable by only including
 * the most relevant parts of the bible in agent prompts.
 */

const OpenAI = require('openai');

class BibleRetriever {
  /**
   * @param {Object} novelManager - NovelManager instance
   * @param {Object} options - Configuration
   * @param {number} options.topK - Max entries to return per category
   * @param {number} options.similarityThreshold - Minimum cosine similarity (0-1)
   */
  constructor(novelManager, options = {}) {
    this.novelManager = novelManager;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = 'text-embedding-3-small';  // 1536 dimensions, $0.00002/1K tokens
    this.dimensions = 512;  // Reduce dimensions to save storage (still good quality)
    this.topK = options.topK || 15;
    this.similarityThreshold = options.similarityThreshold || 0.6;
  }

  /**
   * Get embedding for text using OpenAI API
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text) {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: text.replace(/\n/g, ' ').substring(0, 8000),  // Replace newlines, limit length
      dimensions: this.dimensions  // Shorten embedding to save space
    });
    return response.data[0].embedding;
  }

  /**
   * Compute cosine similarity between two vectors
   * Since OpenAI embeddings are normalized, dot product = cosine similarity
   */
  cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Build text representation of a bible entry for embedding
   */
  entryToText(type, entry) {
    switch (type) {
      case 'character':
        return `Character: ${entry.name}. ${entry.aliases?.join(', ') || ''}. ${entry.description || ''}. Traits: ${entry.traits?.join(', ') || ''}`;
      case 'plotThread':
        return `Plot thread: ${entry.title}. ${entry.foreshadowing?.map(f => f.hint).join('. ') || ''}`;
      case 'chekhov':
        return `Chekhov's gun: ${entry.item}. ${entry.notes || ''}`;
      case 'worldFact':
        return `World fact (${entry.category || 'general'}): ${entry.fact}`;
      default:
        return JSON.stringify(entry);
    }
  }

  /**
   * Index entire bible for a novel
   * Call this after major bible updates or on first retrieval
   */
  async indexBible(novelId) {
    const bible = await this.novelManager.getStoryBible(novelId);
    const index = { characters: {}, plotThreads: {}, chekhovs: [], worldFacts: [] };

    console.log(`[BibleRetriever] Indexing bible for ${novelId}...`);

    // Index characters
    for (const [id, char] of Object.entries(bible.characters || {})) {
      const text = this.entryToText('character', char);
      const embedding = await this.embed(text);
      index.characters[id] = { text, embedding };
    }

    // Index plot threads
    for (const thread of bible.plotThreads || []) {
      const text = this.entryToText('plotThread', thread);
      const embedding = await this.embed(text);
      index.plotThreads[thread.id] = { text, embedding };
    }

    // Index chekhovs
    for (let i = 0; i < (bible.chekhovs || []).length; i++) {
      const text = this.entryToText('chekhov', bible.chekhovs[i]);
      const embedding = await this.embed(text);
      index.chekhovs.push({ index: i, text, embedding });
    }

    // Index world facts
    for (let i = 0; i < (bible.worldFacts || []).length; i++) {
      const text = this.entryToText('worldFact', bible.worldFacts[i]);
      const embedding = await this.embed(text);
      index.worldFacts.push({ index: i, text, embedding });
    }

    // Save index to Redis
    const scope = this.novelManager.getScope(novelId);
    await this.novelManager.state.set(scope, 'bibleIndex', index);

    console.log(`[BibleRetriever] Indexed bible for ${novelId}: ${Object.keys(index.characters).length} characters, ${Object.keys(index.plotThreads).length} threads, ${index.chekhovs.length} chekhovs, ${index.worldFacts.length} facts`);
    return index;
  }

  /**
   * Get relevant bible entries for a chapter
   * Main method: hybrid retrieval (vector search -> fetch full from Redis)
   *
   * @param {string} novelId - Novel ID
   * @param {number} chapterNum - Chapter number (0 = outline/planning)
   * @returns {Promise<Object>} Filtered story bible with only relevant entries
   */
  async getRelevantBible(novelId, chapterNum) {
    const scope = this.novelManager.getScope(novelId);

    // Get the chapter outline to use as query
    const state = await this.novelManager.getNovelState(novelId);
    if (!state) throw new Error(`Novel not found: ${novelId}`);

    // Build query from chapter outline or premise
    let queryText;
    if (chapterNum === 0) {
      // For outline/planning, use premise
      queryText = state.metadata.premise || state.metadata.title;
    } else {
      // Get chapter outline from the outline data
      const outline = state.outline;
      const chapterOutline = outline?.chapters?.[chapterNum - 1];
      queryText = chapterOutline?.summary || chapterOutline?.title || `Chapter ${chapterNum}`;

      // Also include previous chapter's summary for continuity context
      if (chapterNum > 1 && outline?.chapters?.[chapterNum - 2]) {
        queryText = `Previous: ${outline.chapters[chapterNum - 2].summary || ''}. Current: ${queryText}`;
      }
    }

    // Get query embedding
    const queryEmbedding = await this.embed(queryText);

    // Get index from Redis
    let index = await this.novelManager.state.get(scope, 'bibleIndex');
    if (!index) {
      // Index doesn't exist yet, create it
      index = await this.indexBible(novelId);
    }

    // Find relevant entries by cosine similarity
    const relevantIds = {
      characters: [],
      plotThreads: [],
      chekhovs: [],
      worldFacts: []
    };

    // Search characters
    for (const [id, entry] of Object.entries(index.characters || {})) {
      const sim = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim >= this.similarityThreshold) {
        relevantIds.characters.push({ id, score: sim });
      }
    }

    // Search plot threads
    for (const [id, entry] of Object.entries(index.plotThreads || {})) {
      const sim = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim >= this.similarityThreshold) {
        relevantIds.plotThreads.push({ id, score: sim });
      }
    }

    // Search chekhovs
    for (const entry of index.chekhovs || []) {
      const sim = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim >= this.similarityThreshold) {
        relevantIds.chekhovs.push({ index: entry.index, score: sim });
      }
    }

    // Search world facts
    for (const entry of index.worldFacts || []) {
      const sim = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (sim >= this.similarityThreshold) {
        relevantIds.worldFacts.push({ index: entry.index, score: sim });
      }
    }

    // Sort by score and take top K
    relevantIds.characters.sort((a, b) => b.score - a.score).splice(this.topK);
    relevantIds.plotThreads.sort((a, b) => b.score - a.score).splice(this.topK);
    relevantIds.chekhovs.sort((a, b) => b.score - a.score).splice(this.topK);
    relevantIds.worldFacts.sort((a, b) => b.score - a.score).splice(this.topK);

    // Fetch full entries from Redis
    const bible = await this.novelManager.getStoryBible(novelId);

    const result = {
      characters: Object.fromEntries(
        relevantIds.characters.map(r => [r.id, bible.characters[r.id]])
      ),
      // Include relationships for relevant characters
      relationships: bible.relationships.filter(r =>
        relevantIds.characters.some(c => c.id === r.from || c.id === r.to)
      ),
      // Only unresolved plot threads
      plotThreads: bible.plotThreads.filter(t =>
        relevantIds.plotThreads.some(r => r.id === t.id) && !t.resolved
      ),
      // Only unpaid Chekhov's guns
      chekhovs: relevantIds.chekhovs
        .map(r => bible.chekhovs[r.index])
        .filter(c => c && !c.payoff),
      worldFacts: relevantIds.worldFacts.map(r => bible.worldFacts[r.index]).filter(Boolean),
      // Always include recent timeline (last 5 events)
      timeline: bible.timeline.slice(-5)
    };

    console.log(`[BibleRetriever] Retrieved for ${novelId} ch${chapterNum}: ${Object.keys(result.characters).length} chars, ${result.plotThreads.length} threads, ${result.chekhovs.length} chekhovs, ${result.worldFacts.length} facts`);

    return result;
  }

  /**
   * Index only updated entries (called after updateStoryBible)
   * More efficient than full reindex for incremental updates
   *
   * @param {string} novelId - Novel ID
   * @param {Object} updates - The updates that were made
   */
  async indexUpdates(novelId, updates) {
    const scope = this.novelManager.getScope(novelId);
    let index = await this.novelManager.state.get(scope, 'bibleIndex') ||
      { characters: {}, plotThreads: {}, chekhovs: [], worldFacts: [] };

    console.log(`[BibleRetriever] Indexing updates for ${novelId}...`);

    // Re-index updated characters
    if (updates.characters) {
      const bible = await this.novelManager.getStoryBible(novelId);
      for (const id of Object.keys(updates.characters)) {
        const char = bible.characters[id];
        if (char) {
          const text = this.entryToText('character', char);
          const embedding = await this.embed(text);
          index.characters[id] = { text, embedding };
        }
      }
    }

    // For arrays (plotThreads, chekhovs, worldFacts), re-index the whole category
    // since additions are appended
    if (updates.plotThreads) {
      const bible = await this.novelManager.getStoryBible(novelId);
      index.plotThreads = {};
      for (const thread of bible.plotThreads) {
        const text = this.entryToText('plotThread', thread);
        const embedding = await this.embed(text);
        index.plotThreads[thread.id] = { text, embedding };
      }
    }

    if (updates.chekhovs) {
      const bible = await this.novelManager.getStoryBible(novelId);
      index.chekhovs = [];
      for (let i = 0; i < bible.chekhovs.length; i++) {
        const text = this.entryToText('chekhov', bible.chekhovs[i]);
        const embedding = await this.embed(text);
        index.chekhovs.push({ index: i, text, embedding });
      }
    }

    if (updates.worldFacts) {
      const bible = await this.novelManager.getStoryBible(novelId);
      index.worldFacts = [];
      for (let i = 0; i < bible.worldFacts.length; i++) {
        const text = this.entryToText('worldFact', bible.worldFacts[i]);
        const embedding = await this.embed(text);
        index.worldFacts.push({ index: i, text, embedding });
      }
    }

    await this.novelManager.state.set(scope, 'bibleIndex', index);
    console.log(`[BibleRetriever] Updated index for ${novelId}`);
  }

  /**
   * Format relevant bible as markdown for agent prompts
   *
   * @param {Object} relevantBible - Result from getRelevantBible
   * @returns {string} Markdown formatted context
   */
  formatForPrompt(relevantBible) {
    const lines = ['## STORY BIBLE CONTEXT\n'];

    // Characters
    if (Object.keys(relevantBible.characters).length > 0) {
      lines.push('### Characters\n');
      for (const [id, char] of Object.entries(relevantBible.characters)) {
        lines.push(`**${char.name}** (${id})`);
        if (char.aliases?.length) lines.push(`  - Aliases: ${char.aliases.join(', ')}`);
        if (char.description) lines.push(`  - ${char.description}`);
        if (char.traits?.length) lines.push(`  - Traits: ${char.traits.join(', ')}`);
        if (char.status) lines.push(`  - Status: ${char.status}`);
        lines.push('');
      }
    }

    // Relationships
    if (relevantBible.relationships.length > 0) {
      lines.push('### Relationships\n');
      for (const rel of relevantBible.relationships) {
        lines.push(`- ${rel.from} -> ${rel.to}: ${rel.type}${rel.notes ? ` (${rel.notes})` : ''}`);
      }
      lines.push('');
    }

    // Plot Threads
    if (relevantBible.plotThreads.length > 0) {
      lines.push('### Active Plot Threads\n');
      for (const thread of relevantBible.plotThreads) {
        lines.push(`**${thread.title}** (${thread.id})`);
        if (thread.foreshadowing?.length) {
          for (const hint of thread.foreshadowing) {
            lines.push(`  - Ch${hint.chapter}: "${hint.hint}"`);
          }
        }
        lines.push('');
      }
    }

    // Chekhov's Guns
    if (relevantBible.chekhovs.length > 0) {
      lines.push('### Unpaid Chekhov\'s Guns\n');
      for (const chekhov of relevantBible.chekhovs) {
        lines.push(`- **${chekhov.item}** (introduced ch${chekhov.introduced}): ${chekhov.notes || 'must pay off'}`);
      }
      lines.push('');
    }

    // World Facts
    if (relevantBible.worldFacts.length > 0) {
      lines.push('### World Facts\n');
      for (const fact of relevantBible.worldFacts) {
        lines.push(`- [${fact.category || 'general'}] ${fact.fact}`);
      }
      lines.push('');
    }

    // Timeline
    if (relevantBible.timeline.length > 0) {
      lines.push('### Recent Events\n');
      for (const event of relevantBible.timeline) {
        lines.push(`- Ch${event.chapter}: ${event.event}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

module.exports = { BibleRetriever };
