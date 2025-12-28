-- =============================================================================
-- ILUVATAR 2.0 - PostgreSQL Database Initialization
-- =============================================================================
-- Long-term storage for user preferences, hackathon history, and learnings
-- Managed by Bilbo (preferences) and Galadriel (history/learnings)

-- -----------------------------------------------------------------------------
-- User Preferences Table
-- -----------------------------------------------------------------------------
-- Stores learned user preferences for tech stacks, deployment platforms, etc.
-- Managed by Bilbo agent
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    preference_key VARCHAR(255) NOT NULL,
    preference_value JSONB NOT NULL,
    confidence_score DECIMAL(3, 2) DEFAULT 1.00,  -- 0.00 to 1.00
    times_chosen INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, preference_key)
);

-- -----------------------------------------------------------------------------
-- Hackathon History Table
-- -----------------------------------------------------------------------------
-- Stores complete record of past hackathon attempts
-- Managed by Galadriel agent
CREATE TABLE IF NOT EXISTS hackathon_history (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    hackathon_name VARCHAR(255),
    theme VARCHAR(255),
    deadline TIMESTAMP,
    duration_hours INTEGER,
    budget_allocated DECIMAL(10, 2),
    budget_spent DECIMAL(10, 2),
    tech_stack JSONB,
    platform VARCHAR(100),
    result VARCHAR(50),  -- 'won', 'placed', 'submitted', 'incomplete', 'abandoned'
    final_url TEXT,
    github_repo TEXT,
    demo_video_url TEXT,
    judges_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Learnings Database Table
-- -----------------------------------------------------------------------------
-- AI-generated insights from completed hackathons
-- Managed by Galadriel agent
CREATE TABLE IF NOT EXISTS learnings (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(255) REFERENCES hackathon_history(hackathon_id),
    learning_type VARCHAR(50),  -- 'success', 'failure', 'pattern', 'optimization', 'pitfall'
    category VARCHAR(100),  -- 'tech_stack', 'time_management', 'debugging', 'deployment', 'ideation'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    action_items JSONB,
    evidence JSONB,  -- Supporting data: metrics, timestamps, errors
    confidence_score DECIMAL(3, 2),  -- 0.00 to 1.00
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Cost Tracking Table
-- -----------------------------------------------------------------------------
-- Detailed token usage and cost per agent/model
-- Managed by Budget Tracker core service
CREATE TABLE IF NOT EXISTS cost_tracking (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(255) REFERENCES hackathon_history(hackathon_id),
    agent_name VARCHAR(100),
    model VARCHAR(50),  -- 'opus', 'sonnet', 'haiku'
    operation VARCHAR(100),  -- 'ideation', 'code_generation', 'review', etc.
    input_tokens INTEGER,
    output_tokens INTEGER,
    thinking_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 4),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Agent Performance Metrics Table
-- -----------------------------------------------------------------------------
-- Track agent success rates, completion times, error rates
-- Used for optimization and debugging
CREATE TABLE IF NOT EXISTS agent_metrics (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(255) REFERENCES hackathon_history(hackathon_id),
    agent_name VARCHAR(100),
    operation VARCHAR(100),
    status VARCHAR(50),  -- 'success', 'failed', 'retried'
    execution_time_seconds INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- File Generation Tracking Table
-- -----------------------------------------------------------------------------
-- Track all files generated during hackathons
-- Used for velocity calculation and debugging
CREATE TABLE IF NOT EXISTS file_tracking (
    id SERIAL PRIMARY KEY,
    hackathon_id VARCHAR(255) REFERENCES hackathon_history(hackathon_id),
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),  -- 'backend', 'frontend', 'test', 'config'
    agent_name VARCHAR(100),
    lines_of_code INTEGER,
    status VARCHAR(50),  -- 'completed', 'reviewed', 'tested'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- Indexes for Performance
-- -----------------------------------------------------------------------------
CREATE INDEX idx_preferences_user ON user_preferences(user_id);
CREATE INDEX idx_preferences_key ON user_preferences(preference_key);

CREATE INDEX idx_history_user ON hackathon_history(user_id);
CREATE INDEX idx_history_result ON hackathon_history(result);
CREATE INDEX idx_history_date ON hackathon_history(created_at DESC);

CREATE INDEX idx_learnings_hackathon ON learnings(hackathon_id);
CREATE INDEX idx_learnings_category ON learnings(category);
CREATE INDEX idx_learnings_type ON learnings(learning_type);

CREATE INDEX idx_cost_hackathon ON cost_tracking(hackathon_id);
CREATE INDEX idx_cost_agent ON cost_tracking(agent_name);
CREATE INDEX idx_cost_model ON cost_tracking(model);

CREATE INDEX idx_metrics_hackathon ON agent_metrics(hackathon_id);
CREATE INDEX idx_metrics_agent ON agent_metrics(agent_name);
CREATE INDEX idx_metrics_status ON agent_metrics(status);

CREATE INDEX idx_files_hackathon ON file_tracking(hackathon_id);
CREATE INDEX idx_files_type ON file_tracking(file_type);

-- -----------------------------------------------------------------------------
-- Sample Data for Testing
-- -----------------------------------------------------------------------------
INSERT INTO user_preferences (user_id, preference_key, preference_value, confidence_score, times_chosen) VALUES
('user123', 'preferred_frontend', '{"framework": "Next.js", "ui_library": "Tailwind CSS", "state_management": "React Context"}', 0.95, 8),
('user123', 'preferred_backend', '{"language": "Python", "framework": "FastAPI", "orm": "SQLAlchemy"}', 0.90, 6),
('user123', 'preferred_database', '{"type": "PostgreSQL", "reasoning": "Reliable, full-featured"}', 0.85, 5),
('user123', 'preferred_deployment', '{"platform": "Vercel", "reasoning": "Fast, easy Next.js deployment"}', 0.92, 7);

-- Example hackathon
INSERT INTO hackathon_history (
    hackathon_id, user_id, hackathon_name, theme, deadline, duration_hours,
    budget_allocated, budget_spent, tech_stack, platform, result, github_repo
) VALUES (
    'hack-example-001',
    'user123',
    'MLH Hack the Future 2024',
    'Improve education with AI',
    '2024-06-15 23:59:00',
    48,
    50.00,
    38.50,
    '{"frontend": "Next.js", "backend": "FastAPI", "database": "PostgreSQL", "ai": "Claude Opus"}',
    'Vercel',
    'submitted',
    'https://github.com/user123/ai-study-buddy'
);

-- Example learnings
INSERT INTO learnings (
    hackathon_id, learning_type, category, title, description,
    action_items, confidence_score
) VALUES
(
    'hack-example-001',
    'success',
    'ideation',
    'Adaptive quiz difficulty was a differentiator',
    'Judges commented positively on the real-time difficulty adjustment feature',
    '["Prioritize unique interactive features in ideation", "Focus on demoable wow moments"]',
    0.95
),
(
    'hack-example-001',
    'optimization',
    'time_management',
    'Backend took 2 hours longer than estimated',
    'Database schema changes required refactoring. Initial estimate was too optimistic.',
    '["Add 20% time buffer to backend estimates", "Finalize DB schema before coding"]',
    0.85
);
