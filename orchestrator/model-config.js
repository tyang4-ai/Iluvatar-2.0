/**
 * ILUVATAR 3.0 - Model Configuration
 *
 * Centralized configuration for all AI model providers and their models.
 * Supports Anthropic Claude, OpenAI, and local models.
 *
 * Features:
 * - Provider abstraction
 * - Model tier definitions (Opus, Sonnet, Haiku)
 * - Pricing information
 * - Rate limit configuration
 * - Fallback chains
 */

// Model pricing per 1M tokens (as of 2024)
const PRICING = {
  // Anthropic Claude
  'claude-opus-4': { input: 15.00, output: 75.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-haiku-3': { input: 0.25, output: 1.25 },

  // OpenAI (fallback)
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },

  // Local models (free but slower)
  'llama-3-70b': { input: 0, output: 0 },
  'mixtral-8x7b': { input: 0, output: 0 }
};

// Model capabilities and context windows
const MODEL_SPECS = {
  'claude-opus-4': {
    provider: 'anthropic',
    context_window: 200000,
    max_output: 8192,
    supports_vision: true,
    supports_tools: true,
    tier: 'opus'
  },
  'claude-sonnet-4': {
    provider: 'anthropic',
    context_window: 200000,
    max_output: 8192,
    supports_vision: true,
    supports_tools: true,
    tier: 'sonnet'
  },
  'claude-haiku-3': {
    provider: 'anthropic',
    context_window: 200000,
    max_output: 4096,
    supports_vision: true,
    supports_tools: true,
    tier: 'haiku'
  },
  'gpt-4-turbo': {
    provider: 'openai',
    context_window: 128000,
    max_output: 4096,
    supports_vision: true,
    supports_tools: true,
    tier: 'opus'
  },
  'gpt-4o': {
    provider: 'openai',
    context_window: 128000,
    max_output: 4096,
    supports_vision: true,
    supports_tools: true,
    tier: 'sonnet'
  },
  'gpt-4o-mini': {
    provider: 'openai',
    context_window: 128000,
    max_output: 4096,
    supports_vision: true,
    supports_tools: true,
    tier: 'haiku'
  }
};

// Agent to model tier mapping
const AGENT_TIERS = {
  // Haiku tier (fast, cheap)
  'Shadowfax': 'haiku',
  'Quickbeam': 'haiku',
  'Gollum': 'haiku',

  // Sonnet tier (balanced)
  'Denethor': 'sonnet',
  'Merry': 'sonnet',
  'Pippin': 'sonnet',
  'Bilbo': 'sonnet',
  'Galadriel': 'sonnet',
  'Elrond': 'sonnet',
  'Thorin': 'sonnet',
  'Eomer': 'sonnet',
  'Haldir': 'sonnet',
  'Historian': 'sonnet',
  'Scribe': 'sonnet',
  'Faramir': 'sonnet',

  // Opus tier (complex reasoning)
  'Gandalf': 'opus',
  'Radagast': 'opus',
  'Treebeard': 'opus',
  'Arwen': 'opus',
  'Gimli': 'opus',
  'Legolas': 'opus',
  'Aragorn': 'opus',
  'Eowyn': 'opus',
  'Saruman': 'opus',
  'Sauron': 'opus'
};

// Rate limits per provider (requests per minute)
const RATE_LIMITS = {
  anthropic: {
    requests_per_minute: 50,
    tokens_per_minute: 100000
  },
  openai: {
    requests_per_minute: 60,
    tokens_per_minute: 150000
  },
  local: {
    requests_per_minute: 1000,  // No real limit
    tokens_per_minute: 1000000
  }
};

class ModelConfig {
  constructor(options = {}) {
    this.primaryProvider = options.primaryProvider || 'anthropic';
    this.fallbackProvider = options.fallbackProvider || 'openai';
    this.enableLocalFallback = options.enableLocalFallback || false;

    // Default model selections per tier
    this.tierModels = {
      opus: options.opusModel || 'claude-opus-4',
      sonnet: options.sonnetModel || 'claude-sonnet-4',
      haiku: options.haikuModel || 'claude-haiku-3'
    };

    // Fallback chains
    this.fallbackChains = {
      'claude-opus-4': ['gpt-4-turbo', 'llama-3-70b'],
      'claude-sonnet-4': ['gpt-4o', 'mixtral-8x7b'],
      'claude-haiku-3': ['gpt-4o-mini', 'mixtral-8x7b']
    };
  }

  /**
   * Get model for a specific agent
   */
  getModelForAgent(agentName) {
    const tier = AGENT_TIERS[agentName];
    if (!tier) {
      console.warn(`Unknown agent: ${agentName}, defaulting to sonnet tier`);
      return this.tierModels.sonnet;
    }
    return this.tierModels[tier];
  }

  /**
   * Get model tier for an agent
   */
  getTierForAgent(agentName) {
    return AGENT_TIERS[agentName] || 'sonnet';
  }

  /**
   * Get model specifications
   */
  getModelSpec(modelId) {
    return MODEL_SPECS[modelId] || null;
  }

  /**
   * Get model pricing
   */
  getModelPricing(modelId) {
    return PRICING[modelId] || { input: 0, output: 0 };
  }

  /**
   * Calculate cost for token usage
   */
  calculateCost(modelId, inputTokens, outputTokens) {
    const pricing = this.getModelPricing(modelId);
    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;
    return {
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: inputCost + outputCost
    };
  }

  /**
   * Get fallback models for a model
   */
  getFallbackChain(modelId) {
    return this.fallbackChains[modelId] || [];
  }

  /**
   * Get rate limits for a provider
   */
  getRateLimits(provider) {
    return RATE_LIMITS[provider] || RATE_LIMITS.anthropic;
  }

  /**
   * Get all available models
   */
  getAvailableModels() {
    return Object.keys(MODEL_SPECS).map(modelId => ({
      id: modelId,
      ...MODEL_SPECS[modelId],
      pricing: PRICING[modelId]
    }));
  }

  /**
   * Get models by tier
   */
  getModelsByTier(tier) {
    return Object.entries(MODEL_SPECS)
      .filter(([_, spec]) => spec.tier === tier)
      .map(([modelId, spec]) => ({
        id: modelId,
        ...spec,
        pricing: PRICING[modelId]
      }));
  }

  /**
   * Get models by provider
   */
  getModelsByProvider(provider) {
    return Object.entries(MODEL_SPECS)
      .filter(([_, spec]) => spec.provider === provider)
      .map(([modelId, spec]) => ({
        id: modelId,
        ...spec,
        pricing: PRICING[modelId]
      }));
  }

  /**
   * Check if model supports a capability
   */
  modelSupports(modelId, capability) {
    const spec = MODEL_SPECS[modelId];
    if (!spec) return false;

    switch (capability) {
      case 'vision':
        return spec.supports_vision;
      case 'tools':
        return spec.supports_tools;
      default:
        return false;
    }
  }

  /**
   * Get recommended model for task type
   */
  getRecommendedModel(taskType) {
    const recommendations = {
      'ideation': 'claude-opus-4',
      'architecture': 'claude-opus-4',
      'debugging': 'claude-opus-4',
      'code_generation': 'claude-opus-4',
      'code_review': 'claude-sonnet-4',
      'testing': 'claude-sonnet-4',
      'deployment': 'claude-sonnet-4',
      'monitoring': 'claude-haiku-3',
      'context_compression': 'claude-haiku-3',
      'simple_queries': 'claude-haiku-3'
    };

    return recommendations[taskType] || 'claude-sonnet-4';
  }

  /**
   * Export configuration for hackathon container
   */
  exportForContainer() {
    return {
      primary_provider: this.primaryProvider,
      fallback_provider: this.fallbackProvider,
      tier_models: this.tierModels,
      agent_tiers: AGENT_TIERS,
      pricing: PRICING,
      rate_limits: RATE_LIMITS
    };
  }
}

module.exports = {
  ModelConfig,
  PRICING,
  MODEL_SPECS,
  AGENT_TIERS,
  RATE_LIMITS
};
