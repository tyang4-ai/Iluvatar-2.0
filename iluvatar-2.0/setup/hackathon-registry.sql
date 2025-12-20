-- =============================================================================
-- ILUVATAR 3.0 - Multi-Tenant Hackathon Registry
-- =============================================================================
-- PostgreSQL schema for the orchestrator service.
-- Supports multiple concurrent hackathons with team permissions and tool credentials.
--
-- This schema extends init-db.sql (2.0) for multi-tenant operations.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hackathons Table
-- -----------------------------------------------------------------------------
-- Core registry for all hackathons (active, paused, archived)
CREATE TABLE IF NOT EXISTS hackathons (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Timing
    deadline TIMESTAMP NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP,

    -- Budget
    budget DECIMAL(10, 2) NOT NULL,
    budget_spent DECIMAL(10, 4) DEFAULT 0,
    budget_warning_threshold DECIMAL(3, 2) DEFAULT 0.80,  -- 80%

    -- Discord Integration
    discord_channel_id VARCHAR(100),
    discord_guild_id VARCHAR(100),

    -- Ownership
    owner_id VARCHAR(100) NOT NULL,

    -- Hackathon Rules (parsed from PDF)
    parsed_rules JSONB,
    -- Example: {
    --   "theme": "AI for Social Good",
    --   "requirements": ["Must use ML", "3 team members max"],
    --   "judging_criteria": ["Innovation", "Technical Complexity", "Impact"],
    --   "prizes": ["$10,000 grand prize"],
    --   "tech_requirements": ["Must be web-based"],
    --   "submission_requirements": ["Devpost", "2-min video"],
    --   "raw_text": "..."
    -- }

    -- Status
    status VARCHAR(50) DEFAULT 'initializing',
    -- Valid statuses: initializing, active, paused, crunch_mode, archived, deleted

    -- Container Reference
    container_id VARCHAR(100),
    container_status VARCHAR(50),  -- running, stopped, error

    -- Archive Reference
    archive_url TEXT,
    archive_bucket VARCHAR(255),
    archive_key TEXT,

    -- GitHub Integration
    github_repo_url TEXT,
    github_repo_name VARCHAR(255),

    -- Deployment
    deployment_url TEXT,
    deployment_platform VARCHAR(50)  -- vercel, railway, aws
);

-- -----------------------------------------------------------------------------
-- Hackathon Members Table
-- -----------------------------------------------------------------------------
-- Team permissions: owner, admin, member, viewer
CREATE TABLE IF NOT EXISTS hackathon_members (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    discord_username VARCHAR(255),

    -- Role determines permissions
    role VARCHAR(50) DEFAULT 'member',
    -- Roles:
    --   owner: Full control, can delete hackathon
    --   admin: Can pause/resume, approve checkpoints, modify budget
    --   member: Can suggest, view status
    --   viewer: Read-only access

    -- Permissions (JSON for flexibility)
    permissions JSONB DEFAULT '{}',
    -- Example: {
    --   "can_approve_checkpoints": true,
    --   "can_pause": true,
    --   "can_modify_budget": false,
    --   "can_archive": false
    -- }

    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    invited_by VARCHAR(100),

    UNIQUE(hackathon_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Hackathon Tools Table (Encrypted Credentials)
-- -----------------------------------------------------------------------------
-- Per-hackathon tool credentials (GitHub tokens, API keys, etc.)
-- NOTE: credentials column should store encrypted values in production
CREATE TABLE IF NOT EXISTS hackathon_tools (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,

    -- Credentials stored as JSONB (encrypt in application layer)
    credentials JSONB NOT NULL,
    -- Example for github: {
    --   "token": "ghp_xxx...",
    --   "username": "user123",
    --   "repo_access": ["read", "write", "admin"]
    -- }
    -- Example for vercel: {
    --   "token": "xxx...",
    --   "team_id": "team_abc"
    -- }

    -- Tool status
    is_enabled BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(hackathon_id, tool_name)
);

-- -----------------------------------------------------------------------------
-- Hackathon Events Log
-- -----------------------------------------------------------------------------
-- Audit trail for all hackathon events
CREATE TABLE IF NOT EXISTS hackathon_events (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,

    event_type VARCHAR(100) NOT NULL,
    -- Event types:
    --   created, started, paused, resumed, archived, deleted
    --   checkpoint_reached, checkpoint_approved, checkpoint_rejected
    --   budget_warning, budget_exceeded
    --   container_started, container_stopped, container_error
    --   agent_task_started, agent_task_completed, agent_task_failed
    --   deployment_started, deployment_completed, deployment_failed
    --   error_escalated, error_resolved

    event_data JSONB,
    -- Event-specific data

    -- Who triggered the event
    triggered_by VARCHAR(100),  -- user_id or 'system' or agent name
    triggered_by_type VARCHAR(50),  -- user, system, agent

    -- Severity for filtering
    severity VARCHAR(20) DEFAULT 'info',  -- debug, info, warning, error, critical

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Checkpoint Records
-- -----------------------------------------------------------------------------
-- Track all checkpoint approvals/rejections
CREATE TABLE IF NOT EXISTS hackathon_checkpoints (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,

    checkpoint_type VARCHAR(100) NOT NULL,
    -- Types: architecture_review, mvp_core_complete, first_user_flow,
    --        frontend_integration, pre_submission, micro_* (5 micro checkpoints)

    checkpoint_name VARCHAR(255),
    checkpoint_data JSONB,  -- Artifact/deliverable associated with checkpoint

    status VARCHAR(50) DEFAULT 'pending',
    -- pending, approved, rejected, auto_approved, timed_out

    -- Approval tracking
    auto_approve_timeout_minutes INTEGER DEFAULT 15,
    timeout_at TIMESTAMP,
    decided_at TIMESTAMP,
    decided_by VARCHAR(100),  -- user_id or 'auto' or 'timeout'

    -- If rejected, feedback for agents
    rejection_reason TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Agent Task Queue
-- -----------------------------------------------------------------------------
-- Track agent task assignments and completions
CREATE TABLE IF NOT EXISTS agent_tasks (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,

    agent_name VARCHAR(100) NOT NULL,
    task_type VARCHAR(100) NOT NULL,
    task_description TEXT,
    task_data JSONB,

    -- Execution tracking
    status VARCHAR(50) DEFAULT 'queued',
    -- queued, in_progress, completed, failed, retrying

    priority INTEGER DEFAULT 5,  -- 1 (highest) to 10 (lowest)

    -- Timing
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Results
    result JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Cost tracking
    tokens_used INTEGER,
    cost_usd DECIMAL(10, 4)
);

-- -----------------------------------------------------------------------------
-- Budget Breakdown by Model
-- -----------------------------------------------------------------------------
-- Detailed cost tracking per model type
CREATE TABLE IF NOT EXISTS budget_breakdown (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE CASCADE,

    model_name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,  -- anthropic, openai, local

    -- Token counts
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    total_thinking_tokens BIGINT DEFAULT 0,

    -- Costs
    total_cost_usd DECIMAL(12, 4) DEFAULT 0,

    -- Request counts
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,

    -- Tracking
    first_request_at TIMESTAMP,
    last_request_at TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(hackathon_id, model_name, provider)
);

-- -----------------------------------------------------------------------------
-- Global System Stats
-- -----------------------------------------------------------------------------
-- Aggregate statistics across all hackathons
CREATE TABLE IF NOT EXISTS system_stats (
    id SERIAL PRIMARY KEY,
    stat_date DATE UNIQUE DEFAULT CURRENT_DATE,

    -- Hackathon counts
    hackathons_created INTEGER DEFAULT 0,
    hackathons_completed INTEGER DEFAULT 0,
    hackathons_archived INTEGER DEFAULT 0,

    -- Cost totals
    total_budget_allocated DECIMAL(14, 2) DEFAULT 0,
    total_budget_spent DECIMAL(14, 4) DEFAULT 0,

    -- Usage
    total_api_requests INTEGER DEFAULT 0,
    total_tokens_used BIGINT DEFAULT 0,

    -- Container stats
    peak_concurrent_containers INTEGER DEFAULT 0,
    total_container_hours DECIMAL(10, 2) DEFAULT 0,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Container Registry
-- -----------------------------------------------------------------------------
-- Track all containers (for cleanup and monitoring)
CREATE TABLE IF NOT EXISTS container_registry (
    id SERIAL PRIMARY KEY,
    container_id VARCHAR(100) UNIQUE NOT NULL,
    hackathon_id VARCHAR(100) REFERENCES hackathons(id) ON DELETE SET NULL,

    -- Container info
    image_name VARCHAR(255) NOT NULL,
    image_tag VARCHAR(100),

    -- Status
    status VARCHAR(50) DEFAULT 'created',
    -- created, starting, running, paused, stopping, stopped, error, removed

    -- Resources
    memory_limit VARCHAR(20),
    cpu_limit VARCHAR(20),

    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,

    -- Cleanup tracking
    marked_for_cleanup BOOLEAN DEFAULT false,
    cleanup_reason TEXT
);

-- -----------------------------------------------------------------------------
-- Indexes for Performance
-- -----------------------------------------------------------------------------

-- Hackathons
CREATE INDEX IF NOT EXISTS idx_hackathons_status ON hackathons(status);
CREATE INDEX IF NOT EXISTS idx_hackathons_owner ON hackathons(owner_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_channel ON hackathons(discord_channel_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_deadline ON hackathons(deadline);
CREATE INDEX IF NOT EXISTS idx_hackathons_created ON hackathons(created_at DESC);

-- Members
CREATE INDEX IF NOT EXISTS idx_members_user ON hackathon_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_role ON hackathon_members(role);

-- Tools
CREATE INDEX IF NOT EXISTS idx_tools_enabled ON hackathon_tools(is_enabled);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_hackathon ON hackathon_events(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON hackathon_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON hackathon_events(severity);
CREATE INDEX IF NOT EXISTS idx_events_created ON hackathon_events(created_at DESC);

-- Checkpoints
CREATE INDEX IF NOT EXISTS idx_checkpoints_hackathon ON hackathon_checkpoints(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status ON hackathon_checkpoints(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_type ON hackathon_checkpoints(checkpoint_type);

-- Agent Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_hackathon ON agent_tasks(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON agent_tasks(agent_name);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON agent_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_queued ON agent_tasks(queued_at);

-- Budget Breakdown
CREATE INDEX IF NOT EXISTS idx_budget_hackathon ON budget_breakdown(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_budget_model ON budget_breakdown(model_name);

-- Container Registry
CREATE INDEX IF NOT EXISTS idx_containers_status ON container_registry(status);
CREATE INDEX IF NOT EXISTS idx_containers_hackathon ON container_registry(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_containers_cleanup ON container_registry(marked_for_cleanup);

-- -----------------------------------------------------------------------------
-- Views for Common Queries
-- -----------------------------------------------------------------------------

-- Active hackathons with member count
CREATE OR REPLACE VIEW v_active_hackathons AS
SELECT
    h.*,
    COUNT(DISTINCT m.user_id) as member_count,
    ROUND(h.budget_spent / NULLIF(h.budget, 0) * 100, 2) as budget_percent_used,
    EXTRACT(EPOCH FROM (h.deadline - CURRENT_TIMESTAMP)) / 3600 as hours_remaining
FROM hackathons h
LEFT JOIN hackathon_members m ON h.id = m.hackathon_id
WHERE h.status IN ('active', 'crunch_mode', 'paused')
GROUP BY h.id;

-- Recent events (last 24 hours)
CREATE OR REPLACE VIEW v_recent_events AS
SELECT
    e.*,
    h.name as hackathon_name
FROM hackathon_events e
JOIN hackathons h ON e.hackathon_id = h.id
WHERE e.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY e.created_at DESC;

-- Budget summary per hackathon
CREATE OR REPLACE VIEW v_budget_summary AS
SELECT
    h.id,
    h.name,
    h.budget,
    h.budget_spent,
    ROUND(h.budget - h.budget_spent, 2) as budget_remaining,
    ROUND(h.budget_spent / NULLIF(h.budget, 0) * 100, 2) as percent_used,
    COALESCE(bb.breakdown, '[]'::jsonb) as model_breakdown
FROM hackathons h
LEFT JOIN (
    SELECT
        hackathon_id,
        jsonb_agg(jsonb_build_object(
            'model', model_name,
            'provider', provider,
            'cost', total_cost_usd,
            'requests', request_count
        )) as breakdown
    FROM budget_breakdown
    GROUP BY hackathon_id
) bb ON h.id = bb.hackathon_id
WHERE h.status != 'deleted';

-- Pending checkpoints
CREATE OR REPLACE VIEW v_pending_checkpoints AS
SELECT
    c.*,
    h.name as hackathon_name,
    h.discord_channel_id,
    EXTRACT(EPOCH FROM (c.timeout_at - CURRENT_TIMESTAMP)) / 60 as minutes_until_timeout
FROM hackathon_checkpoints c
JOIN hackathons h ON c.hackathon_id = h.id
WHERE c.status = 'pending'
ORDER BY c.timeout_at ASC;

-- Container status overview
CREATE OR REPLACE VIEW v_container_status AS
SELECT
    cr.container_id,
    cr.status,
    cr.hackathon_id,
    h.name as hackathon_name,
    h.status as hackathon_status,
    cr.created_at,
    cr.started_at,
    CASE
        WHEN cr.started_at IS NOT NULL AND cr.stopped_at IS NULL
        THEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cr.started_at)) / 3600
        WHEN cr.started_at IS NOT NULL AND cr.stopped_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cr.stopped_at - cr.started_at)) / 3600
        ELSE 0
    END as runtime_hours
FROM container_registry cr
LEFT JOIN hackathons h ON cr.hackathon_id = h.id
WHERE NOT cr.marked_for_cleanup;

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Function to update hackathon budget_spent
CREATE OR REPLACE FUNCTION update_hackathon_budget()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE hackathons
    SET budget_spent = (
        SELECT COALESCE(SUM(total_cost_usd), 0)
        FROM budget_breakdown
        WHERE hackathon_id = NEW.hackathon_id
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.hackathon_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update budget_spent
DROP TRIGGER IF EXISTS trg_update_budget ON budget_breakdown;
CREATE TRIGGER trg_update_budget
AFTER INSERT OR UPDATE ON budget_breakdown
FOR EACH ROW
EXECUTE FUNCTION update_hackathon_budget();

-- Function to auto-set updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp trigger to relevant tables
DROP TRIGGER IF EXISTS trg_hackathons_timestamp ON hackathons;
CREATE TRIGGER trg_hackathons_timestamp
BEFORE UPDATE ON hackathons
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_tools_timestamp ON hackathon_tools;
CREATE TRIGGER trg_tools_timestamp
BEFORE UPDATE ON hackathon_tools
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Function to log status changes
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO hackathon_events (
            hackathon_id,
            event_type,
            event_data,
            triggered_by,
            triggered_by_type,
            severity
        ) VALUES (
            NEW.id,
            'status_changed',
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status
            ),
            'system',
            'system',
            CASE
                WHEN NEW.status = 'deleted' THEN 'warning'
                WHEN NEW.status = 'crunch_mode' THEN 'warning'
                ELSE 'info'
            END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_status ON hackathons;
CREATE TRIGGER trg_log_status
AFTER UPDATE ON hackathons
FOR EACH ROW
EXECUTE FUNCTION log_status_change();

-- =============================================================================
-- End of ILUVATAR 3.0 Schema
-- =============================================================================
