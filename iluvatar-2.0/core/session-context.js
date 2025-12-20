/**
 * ILUVATAR 2.0 - Session Context Manager
 *
 * Manages per-agent-per-hackathon session contexts.
 * Replaces auto-compacting with manual context writing.
 * Each agent maintains its own context for each hackathon.
 */

const { getLogger } = require('./logging');

class SessionContextManager {
  constructor(registry) {
    this.registry = registry; // HackathonRegistry instance
    this.logger = getLogger('SessionContext');
    this.cache = new Map(); // In-memory cache: `${hackathonId}:${agentId}` -> context
  }

  /**
   * Get cache key for hackathon-agent pair
   */
  _getCacheKey(hackathonId, agentId) {
    return `${hackathonId}:${agentId}`;
  }

  /**
   * Load context for an agent in a hackathon
   * Returns cached version if available, otherwise loads from DB
   */
  async loadContext(hackathonId, agentId) {
    const cacheKey = this._getCacheKey(hackathonId, agentId);

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Load from database
    const record = await this.registry.getAgentContext(hackathonId, agentId);
    const context = record?.context || this._createEmptyContext(agentId);

    // Cache it
    this.cache.set(cacheKey, context);

    return context;
  }

  /**
   * Create empty context structure for new agent-hackathon pairs
   */
  _createEmptyContext(agentId) {
    return {
      agent_id: agentId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      summary: '',
      key_decisions: [],
      pending_tasks: [],
      important_files: [],
      learned_patterns: [],
      notes: []
    };
  }

  /**
   * Save context for an agent in a hackathon
   * This is the manual trigger that replaces auto-compacting
   */
  async saveContext(hackathonId, agentId, context) {
    const cacheKey = this._getCacheKey(hackathonId, agentId);

    // Update timestamp
    context.updated_at = new Date().toISOString();

    // Save to database
    await this.registry.saveAgentContext(hackathonId, agentId, context);

    // Update cache
    this.cache.set(cacheKey, context);

    this.logger.info('Context saved', {
      hackathon_id: hackathonId,
      agent_id: agentId,
      summary_length: context.summary?.length || 0,
      decisions_count: context.key_decisions?.length || 0
    });

    return context;
  }

  /**
   * Update specific fields in context without full replacement
   */
  async updateContext(hackathonId, agentId, updates) {
    const context = await this.loadContext(hackathonId, agentId);

    // Merge updates
    Object.assign(context, updates);

    return this.saveContext(hackathonId, agentId, context);
  }

  /**
   * Add a key decision to context
   */
  async addDecision(hackathonId, agentId, decision) {
    const context = await this.loadContext(hackathonId, agentId);

    context.key_decisions = context.key_decisions || [];
    context.key_decisions.push({
      timestamp: new Date().toISOString(),
      decision: decision
    });

    return this.saveContext(hackathonId, agentId, context);
  }

  /**
   * Add a note to context
   */
  async addNote(hackathonId, agentId, note) {
    const context = await this.loadContext(hackathonId, agentId);

    context.notes = context.notes || [];
    context.notes.push({
      timestamp: new Date().toISOString(),
      note: note
    });

    return this.saveContext(hackathonId, agentId, context);
  }

  /**
   * Update summary (main context content)
   */
  async updateSummary(hackathonId, agentId, summary) {
    return this.updateContext(hackathonId, agentId, { summary });
  }

  /**
   * Add important file reference
   */
  async addImportantFile(hackathonId, agentId, filePath, description) {
    const context = await this.loadContext(hackathonId, agentId);

    context.important_files = context.important_files || [];

    // Avoid duplicates
    const exists = context.important_files.some(f => f.path === filePath);
    if (!exists) {
      context.important_files.push({
        path: filePath,
        description: description,
        added_at: new Date().toISOString()
      });
    }

    return this.saveContext(hackathonId, agentId, context);
  }

  /**
   * Add learned pattern (for code agents)
   */
  async addLearnedPattern(hackathonId, agentId, pattern) {
    const context = await this.loadContext(hackathonId, agentId);

    context.learned_patterns = context.learned_patterns || [];
    context.learned_patterns.push({
      timestamp: new Date().toISOString(),
      pattern: pattern
    });

    return this.saveContext(hackathonId, agentId, context);
  }

  /**
   * Get all contexts for a hackathon (for Shadowfax overview)
   */
  async getAllContexts(hackathonId) {
    const records = await this.registry.getAllAgentContexts(hackathonId);
    return records.map(r => r.context);
  }

  /**
   * Clear cache for a hackathon (e.g., when hackathon ends)
   */
  clearHackathonCache(hackathonId) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${hackathonId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Generate context prompt for an agent
   * Returns formatted context for inclusion in agent system prompt
   */
  async getContextPrompt(hackathonId, agentId) {
    const context = await this.loadContext(hackathonId, agentId);

    if (!context.summary && (!context.key_decisions || context.key_decisions.length === 0)) {
      return ''; // No context yet
    }

    let prompt = '\n## SESSION CONTEXT\n\n';

    if (context.summary) {
      prompt += `### Summary\n${context.summary}\n\n`;
    }

    if (context.key_decisions && context.key_decisions.length > 0) {
      prompt += '### Key Decisions Made\n';
      for (const d of context.key_decisions.slice(-10)) { // Last 10 decisions
        prompt += `- ${d.decision}\n`;
      }
      prompt += '\n';
    }

    if (context.important_files && context.important_files.length > 0) {
      prompt += '### Important Files\n';
      for (const f of context.important_files) {
        prompt += `- \`${f.path}\`: ${f.description}\n`;
      }
      prompt += '\n';
    }

    if (context.learned_patterns && context.learned_patterns.length > 0) {
      prompt += '### Learned Patterns\n';
      for (const p of context.learned_patterns.slice(-5)) { // Last 5 patterns
        prompt += `- ${p.pattern}\n`;
      }
      prompt += '\n';
    }

    if (context.notes && context.notes.length > 0) {
      prompt += '### Recent Notes\n';
      for (const n of context.notes.slice(-5)) { // Last 5 notes
        prompt += `- ${n.note}\n`;
      }
    }

    return prompt;
  }
}

module.exports = { SessionContextManager };
