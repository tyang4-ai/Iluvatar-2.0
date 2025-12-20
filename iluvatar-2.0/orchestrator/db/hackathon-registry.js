/**
 * ILUVATAR 3.0 - Hackathon Registry
 *
 * PostgreSQL database interface for hackathon management.
 * Stores hackathon metadata, team info, and credentials.
 */

const { Pool } = require('pg');

class HackathonRegistry {
  constructor(connectionString) {
    this.connectionString = connectionString || process.env.DATABASE_URL;
    this.pool = null;
  }

  /**
   * Initialize database connection and schema
   */
  async initialize() {
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Test connection
    await this.pool.query('SELECT NOW()');

    // Create tables if not exist
    await this.createTables();
  }

  /**
   * Create database tables
   */
  async createTables() {
    const createTablesSQL = `
      -- Hackathons table
      CREATE TABLE IF NOT EXISTS hackathons (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        deadline TIMESTAMP NOT NULL,
        budget DECIMAL(10, 2) NOT NULL,
        budget_spent DECIMAL(10, 4) DEFAULT 0,
        discord_channel_id VARCHAR(100),
        owner_id VARCHAR(100) NOT NULL,
        parsed_rules JSONB,
        certifications JSONB,
        status VARCHAR(50) DEFAULT 'initializing',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        archived_at TIMESTAMP,
        archive_url TEXT
      );

      -- Hackathon members table
      CREATE TABLE IF NOT EXISTS hackathon_members (
        id SERIAL PRIMARY KEY,
        hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,
        user_id VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hackathon_id, user_id)
      );

      -- Tool credentials table (encrypted)
      CREATE TABLE IF NOT EXISTS hackathon_tools (
        id SERIAL PRIMARY KEY,
        hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,
        tool_name VARCHAR(100) NOT NULL,
        credentials JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hackathon_id, tool_name)
      );

      -- Hackathon events log
      CREATE TABLE IF NOT EXISTS hackathon_events (
        id SERIAL PRIMARY KEY,
        hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Resources table (curated links, repos, docs)
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        title VARCHAR(255),
        description TEXT,
        category VARCHAR(32),
        tags TEXT[],
        parent_id INTEGER REFERENCES resources(id),
        submitted_by VARCHAR(64),
        approved_by VARCHAR(64),
        approved_at TIMESTAMP,
        status VARCHAR(16) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Per-agent-per-hackathon session contexts
      CREATE TABLE IF NOT EXISTS hackathon_agent_contexts (
        hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,
        agent_id VARCHAR(32) NOT NULL,
        context JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (hackathon_id, agent_id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_hackathons_status ON hackathons(status);
      CREATE INDEX IF NOT EXISTS idx_hackathons_owner ON hackathons(owner_id);
      CREATE INDEX IF NOT EXISTS idx_hackathons_channel ON hackathons(discord_channel_id);
      CREATE INDEX IF NOT EXISTS idx_members_user ON hackathon_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_events_hackathon ON hackathon_events(hackathon_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON hackathon_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
      CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
      CREATE INDEX IF NOT EXISTS idx_agent_contexts_hackathon ON hackathon_agent_contexts(hackathon_id);
    `;

    await this.pool.query(createTablesSQL);
  }

  /**
   * Create a new hackathon
   */
  async createHackathon(data) {
    const {
      id,
      name,
      description,
      deadline,
      budget,
      discord_channel_id,
      owner_id,
      member_ids,
      parsed_rules,
      status
    } = data;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert hackathon
      const result = await client.query(`
        INSERT INTO hackathons (id, name, description, deadline, budget, discord_channel_id, owner_id, parsed_rules, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [id, name, description, deadline, budget, discord_channel_id, owner_id, JSON.stringify(parsed_rules), status]);

      const hackathon = result.rows[0];

      // Add owner as member
      await client.query(`
        INSERT INTO hackathon_members (hackathon_id, user_id, role)
        VALUES ($1, $2, 'owner')
      `, [id, owner_id]);

      // Add other members
      if (member_ids && member_ids.length > 0) {
        for (const userId of member_ids) {
          if (userId !== owner_id) {
            await client.query(`
              INSERT INTO hackathon_members (hackathon_id, user_id, role)
              VALUES ($1, $2, 'member')
            `, [id, userId]);
          }
        }
      }

      // Log creation event
      await client.query(`
        INSERT INTO hackathon_events (hackathon_id, event_type, event_data)
        VALUES ($1, 'created', $2)
      `, [id, JSON.stringify({ owner_id, budget, deadline })]);

      await client.query('COMMIT');

      return hackathon;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get hackathon by ID
   */
  async getHackathon(id) {
    const result = await this.pool.query(`
      SELECT h.*,
             array_agg(DISTINCT m.user_id) FILTER (WHERE m.user_id IS NOT NULL) as member_ids
      FROM hackathons h
      LEFT JOIN hackathon_members m ON h.id = m.hackathon_id
      WHERE h.id = $1
      GROUP BY h.id
    `, [id]);

    return result.rows[0] || null;
  }

  /**
   * Get hackathon by Discord channel
   */
  async getHackathonByChannel(channelId) {
    const result = await this.pool.query(`
      SELECT * FROM hackathons WHERE discord_channel_id = $1
    `, [channelId]);

    return result.rows[0] || null;
  }

  /**
   * List hackathons with filters
   */
  async listHackathons(options = {}) {
    const { status, owner_id, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM hackathons WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    if (owner_id) {
      params.push(owner_id);
      query += ` AND owner_id = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Update hackathon status
   */
  async updateHackathonStatus(id, status, additionalData = {}) {
    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [id, status];

    if (additionalData.archived_at) {
      params.push(additionalData.archived_at);
      updates.push(`archived_at = $${params.length}`);
    }

    if (additionalData.archive_url) {
      params.push(additionalData.archive_url);
      updates.push(`archive_url = $${params.length}`);
    }

    if (additionalData.final_budget_spent !== undefined) {
      params.push(additionalData.final_budget_spent);
      updates.push(`budget_spent = $${params.length}`);
    }

    await this.pool.query(`
      UPDATE hackathons SET ${updates.join(', ')} WHERE id = $1
    `, params);

    // Log status change
    await this.pool.query(`
      INSERT INTO hackathon_events (hackathon_id, event_type, event_data)
      VALUES ($1, 'status_changed', $2)
    `, [id, JSON.stringify({ status, ...additionalData })]);
  }

  /**
   * Update hackathon budget spent
   */
  async updateBudgetSpent(id, spent) {
    await this.pool.query(`
      UPDATE hackathons SET budget_spent = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id, spent]);
  }

  /**
   * Store tool credentials for hackathon
   */
  async storeToolCredentials(hackathonId, credentials) {
    for (const [toolName, toolCreds] of Object.entries(credentials)) {
      await this.pool.query(`
        INSERT INTO hackathon_tools (hackathon_id, tool_name, credentials)
        VALUES ($1, $2, $3)
        ON CONFLICT (hackathon_id, tool_name)
        DO UPDATE SET credentials = $3, updated_at = CURRENT_TIMESTAMP
      `, [hackathonId, toolName, JSON.stringify(toolCreds)]);
    }
  }

  /**
   * Get tool credentials for hackathon
   */
  async getToolCredentials(hackathonId, toolName = null) {
    let query = 'SELECT tool_name, credentials FROM hackathon_tools WHERE hackathon_id = $1';
    const params = [hackathonId];

    if (toolName) {
      query += ' AND tool_name = $2';
      params.push(toolName);
    }

    const result = await this.pool.query(query, params);

    if (toolName) {
      return result.rows[0]?.credentials || null;
    }

    const credentials = {};
    for (const row of result.rows) {
      credentials[row.tool_name] = row.credentials;
    }
    return credentials;
  }

  /**
   * Add member to hackathon
   */
  async addMember(hackathonId, userId, role = 'member') {
    await this.pool.query(`
      INSERT INTO hackathon_members (hackathon_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (hackathon_id, user_id) DO UPDATE SET role = $3
    `, [hackathonId, userId, role]);
  }

  /**
   * Remove member from hackathon
   */
  async removeMember(hackathonId, userId) {
    await this.pool.query(`
      DELETE FROM hackathon_members WHERE hackathon_id = $1 AND user_id = $2
    `, [hackathonId, userId]);
  }

  /**
   * Get hackathon members
   */
  async getMembers(hackathonId) {
    const result = await this.pool.query(`
      SELECT user_id, role, joined_at FROM hackathon_members WHERE hackathon_id = $1
    `, [hackathonId]);

    return result.rows;
  }

  /**
   * Log hackathon event
   */
  async logEvent(hackathonId, eventType, eventData) {
    await this.pool.query(`
      INSERT INTO hackathon_events (hackathon_id, event_type, event_data)
      VALUES ($1, $2, $3)
    `, [hackathonId, eventType, JSON.stringify(eventData)]);
  }

  /**
   * Get hackathon events
   */
  async getEvents(hackathonId, options = {}) {
    const { limit = 100, eventType } = options;

    let query = 'SELECT * FROM hackathon_events WHERE hackathon_id = $1';
    const params = [hackathonId];

    if (eventType) {
      query += ' AND event_type = $2';
      params.push(eventType);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Delete hackathon (soft delete - archive)
   */
  async deleteHackathon(id) {
    await this.pool.query(`
      UPDATE hackathons SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'paused') as paused_count,
        COUNT(*) FILTER (WHERE status = 'archived') as archived_count,
        COUNT(*) as total_count,
        SUM(budget) as total_budget,
        SUM(budget_spent) as total_spent
      FROM hackathons
      WHERE status != 'deleted'
    `);

    return result.rows[0];
  }

  // ==================== RESOURCES METHODS ====================

  /**
   * Submit a resource for approval
   */
  async submitResource(data) {
    const { url, title, description, category, tags, submitted_by, parent_id } = data;
    const result = await this.pool.query(`
      INSERT INTO resources (url, title, description, category, tags, submitted_by, parent_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [url, title, description, category, tags || [], submitted_by, parent_id || null]);
    return result.rows[0];
  }

  /**
   * Approve a resource
   */
  async approveResource(id, approved_by) {
    const result = await this.pool.query(`
      UPDATE resources
      SET status = 'approved', approved_by = $2, approved_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, approved_by]);
    return result.rows[0];
  }

  /**
   * Reject a resource
   */
  async rejectResource(id, rejected_by) {
    const result = await this.pool.query(`
      UPDATE resources
      SET status = 'rejected', approved_by = $2
      WHERE id = $1
      RETURNING *
    `, [id, rejected_by]);
    return result.rows[0];
  }

  /**
   * List resources with filters
   */
  async listResources(options = {}) {
    const { status = 'approved', category, limit = 50, offset = 0 } = options;
    let query = 'SELECT * FROM resources WHERE status = $1';
    const params = [status];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get pending resources for approval
   */
  async getPendingResources() {
    const result = await this.pool.query(`
      SELECT * FROM resources WHERE status = 'pending' ORDER BY created_at ASC
    `);
    return result.rows;
  }

  /**
   * Search resources by keyword
   */
  async searchResources(keyword) {
    const result = await this.pool.query(`
      SELECT * FROM resources
      WHERE status = 'approved'
        AND (title ILIKE $1 OR description ILIKE $1 OR $2 = ANY(tags))
      ORDER BY created_at DESC
    `, [`%${keyword}%`, keyword]);
    return result.rows;
  }

  /**
   * Get resource by ID
   */
  async getResource(id) {
    const result = await this.pool.query(`
      SELECT * FROM resources WHERE id = $1
    `, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get child resources (for repo organization)
   */
  async getChildResources(parentId) {
    const result = await this.pool.query(`
      SELECT * FROM resources WHERE parent_id = $1 AND status = 'approved'
      ORDER BY title ASC
    `, [parentId]);
    return result.rows;
  }

  // ==================== AGENT CONTEXT METHODS ====================

  /**
   * Save agent context for a hackathon
   */
  async saveAgentContext(hackathonId, agentId, context) {
    const result = await this.pool.query(`
      INSERT INTO hackathon_agent_contexts (hackathon_id, agent_id, context, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (hackathon_id, agent_id)
      DO UPDATE SET context = $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [hackathonId, agentId, JSON.stringify(context)]);
    return result.rows[0];
  }

  /**
   * Get agent context for a hackathon
   */
  async getAgentContext(hackathonId, agentId) {
    const result = await this.pool.query(`
      SELECT * FROM hackathon_agent_contexts
      WHERE hackathon_id = $1 AND agent_id = $2
    `, [hackathonId, agentId]);
    return result.rows[0] || null;
  }

  /**
   * Get all agent contexts for a hackathon
   */
  async getAllAgentContexts(hackathonId) {
    const result = await this.pool.query(`
      SELECT * FROM hackathon_agent_contexts
      WHERE hackathon_id = $1
      ORDER BY agent_id
    `, [hackathonId]);
    return result.rows;
  }

  /**
   * Delete agent context
   */
  async deleteAgentContext(hackathonId, agentId) {
    await this.pool.query(`
      DELETE FROM hackathon_agent_contexts
      WHERE hackathon_id = $1 AND agent_id = $2
    `, [hackathonId, agentId]);
  }

  /**
   * Update certifications for a hackathon
   */
  async updateCertifications(id, certifications) {
    await this.pool.query(`
      UPDATE hackathons SET certifications = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id, JSON.stringify(certifications)]);
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = { HackathonRegistry };
