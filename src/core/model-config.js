/**
 * ILUVATAR - Model Configuration
 *
 * Defines which AI models each agent uses.
 * Allows easy swapping between providers and tracks cost tiers.
 *
 * Agent Names (LOTR-inspired):
 *   - Gandalf: Planning Agent (strategist, sees the big picture)
 *   - Frodo: Writing Agent (does the work, carries the burden)
 *   - Elrond: Critic Agent (wise judge, evaluates quality)
 */

const MODEL_TIERS = {
  // Tier 1: Expensive, high reasoning (planning, evaluation)
  OPUS: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.7,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075
  },

  // Tier 2: Mid-range (initial writing before fine-tuning)
  SONNET: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.8,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015
  },

  // Tier 3: Fast, cheap (simple tasks, JSON fixing)
  HAIKU: {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    maxTokens: 4096,
    temperature: 0.3,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125
  },

  // Tier 4: Local fine-tuned model (free after training)
  LOCAL: {
    provider: 'local',
    model: 'qwen2.5-14b-iluvatar',  // Will be your fine-tuned model
    maxTokens: 8192,
    temperature: 0.8,
    costPer1kInput: 0,
    costPer1kOutput: 0
  }
};

/**
 * Agent configurations
 *
 * Each agent has:
 *   - tier: Which model tier to use
 *   - role: Description for logging/debugging
 *   - outputFormat: 'text' (with markers) or 'json'
 *   - markers: Section markers for text parsing
 */
const AGENT_CONFIG = {
  gandalf: {
    tier: 'OPUS',
    role: 'Planning Agent - Novel structure, plot arcs, chapter outlines',
    outputFormat: 'text',
    markers: {
      title: '## TITLE',
      synopsis: '## SYNOPSIS',
      chapters: '## CHAPTERS',
      characters: '## CHARACTERS',
      notes: '## NOTES'
    }
  },

  frodo: {
    tier: 'SONNET',  // Will switch to LOCAL after fine-tuning
    role: 'Writing Agent - Generates actual chapter prose',
    outputFormat: 'text',
    markers: {
      title: '## CHAPTER TITLE',
      content: '## CONTENT',
      wordCount: '## WORD COUNT',
      notes: '## AUTHOR NOTES'
    }
  },

  elrond: {
    tier: 'OPUS',
    role: 'Critic Agent - Evaluates quality, generates training signal',
    outputFormat: 'text',
    markers: {
      score: '## SCORE',
      strengths: '## STRENGTHS',
      weaknesses: '## WEAKNESSES',
      revision: '## SUGGESTED REVISION',
      preference: '## PREFERENCE'  // For DPO training pairs
    }
  }
};

/**
 * Get full model config for an agent
 *
 * @param {string} agentName - 'gandalf', 'frodo', or 'elrond'
 * @returns {Object} Combined agent + model tier config
 */
function getAgentConfig(agentName) {
  const agent = AGENT_CONFIG[agentName.toLowerCase()];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}. Valid agents: gandalf, frodo, elrond`);
  }

  const tier = MODEL_TIERS[agent.tier];
  if (!tier) {
    throw new Error(`Unknown tier: ${agent.tier} for agent ${agentName}`);
  }

  return {
    name: agentName,
    ...agent,
    ...tier
  };
}

/**
 * Switch an agent to a different tier
 * Useful for switching Frodo to LOCAL after fine-tuning
 *
 * @param {string} agentName - Agent to switch
 * @param {string} newTier - New tier ('OPUS', 'SONNET', 'HAIKU', 'LOCAL')
 */
function switchAgentTier(agentName, newTier) {
  const agent = AGENT_CONFIG[agentName.toLowerCase()];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}`);
  }
  if (!MODEL_TIERS[newTier]) {
    throw new Error(`Unknown tier: ${newTier}`);
  }

  agent.tier = newTier;
  console.log(`[ModelConfig] Switched ${agentName} to ${newTier}`);
}

/**
 * Estimate cost for a request
 *
 * @param {string} agentName - Agent making the request
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} outputTokens - Estimated output tokens
 * @returns {number} Estimated cost in USD
 */
function estimateCost(agentName, inputTokens, outputTokens) {
  const config = getAgentConfig(agentName);
  const inputCost = (inputTokens / 1000) * config.costPer1kInput;
  const outputCost = (outputTokens / 1000) * config.costPer1kOutput;
  return inputCost + outputCost;
}

/**
 * Get all agent names
 */
function getAgentNames() {
  return Object.keys(AGENT_CONFIG);
}

module.exports = {
  MODEL_TIERS,
  AGENT_CONFIG,
  getAgentConfig,
  switchAgentTier,
  estimateCost,
  getAgentNames
};
