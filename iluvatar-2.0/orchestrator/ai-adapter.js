/**
 * ILUVATAR 3.0 - AI Adapter
 *
 * Unified interface for multiple AI providers.
 * Handles rate limiting, retries, fallbacks, and cost tracking.
 *
 * Features:
 * - Circuit breaker pattern for resilience
 * - Exponential backoff retry logic
 * - Context budget tracking (80% threshold triggers warning)
 * - JSON validation with Haiku fixer
 *
 * Supported Providers:
 * - Anthropic (Claude)
 * - OpenAI (GPT-4)
 * - Local models via Ollama
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const EventEmitter = require('events');
const { CircuitBreakerRegistry, JSONValidator, CIRCUIT_STATES } = require('../core/json-validator');

// Context limits by model (in tokens)
const CONTEXT_LIMITS = {
  'claude-opus-4-20250514': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'default': 100000
};

class AIAdapter extends EventEmitter {
  constructor(modelConfig, options = {}) {
    super();

    this.modelConfig = modelConfig;
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      retryBackoffMultiplier: options.retryBackoffMultiplier || 2,
      timeout: options.timeout || 300000, // 5 minutes - agents need time for complex tasks
      contextWarningThreshold: options.contextWarningThreshold || 0.8, // 80%
      ...options
    };

    // Initialize provider clients
    this.providers = {};
    this.initializeProviders();

    // Rate limiting state
    this.rateLimitState = {
      anthropic: { requests: [], tokens: [] },
      openai: { requests: [], tokens: [] }
    };

    // Usage tracking
    this.usage = {
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost: 0,
      by_model: {},
      by_agent: {}
    };

    // Circuit breaker registry (one per agent)
    this.circuitBreakers = new CircuitBreakerRegistry({
      threshold: options.circuitBreakerThreshold || 3,
      resetTimeout: options.circuitBreakerResetTimeout || 60000,
      redis: options.redis || null
    });

    // JSON validator with Haiku fixer
    this.jsonValidator = new JSONValidator({
      maxRetries: 3,
      aiAdapter: this
    });

    // Context tracking per agent session
    this.contextUsage = {};
  }

  /**
   * Initialize provider clients
   */
  initializeProviders() {
    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.providers.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    // Ollama (local)
    if (process.env.OLLAMA_HOST) {
      this.providers.local = {
        host: process.env.OLLAMA_HOST || 'http://localhost:11434'
      };
    }
  }

  /**
   * Send a message to an AI model
   *
   * @param {Object} request - Request configuration
   * @param {string} request.model - Model ID
   * @param {Array} request.messages - Conversation messages
   * @param {string} request.system - System prompt
   * @param {Array} request.tools - Available tools
   * @param {number} request.max_tokens - Max output tokens
   * @param {number} request.temperature - Temperature setting
   * @param {string} request.agent - Agent name (for tracking)
   * @param {boolean} request.useCircuitBreaker - Whether to use circuit breaker (default: true)
   * @returns {Promise<Object>} Response with content and usage
   */
  async chat(request) {
    const {
      model,
      messages,
      system,
      tools,
      max_tokens = 4096,
      temperature = 0.7,
      agent,
      useCircuitBreaker = true
    } = request;

    const modelSpec = this.modelConfig.getModelSpec(model);
    if (!modelSpec) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Get circuit breaker for this agent (if enabled)
    const circuit = useCircuitBreaker && agent
      ? this.circuitBreakers.getCircuit(agent)
      : null;

    // Wrap the actual call in circuit breaker if available
    const executeWithCircuitBreaker = async () => {
      return this.executeWithRetry(request, modelSpec);
    };

    try {
      if (circuit) {
        return await circuit.execute(executeWithCircuitBreaker, {
          agent,
          model
        });
      } else {
        return await executeWithCircuitBreaker();
      }
    } catch (error) {
      // Emit circuit breaker trip for external handling
      if (error.name === 'CircuitOpenError') {
        this.emit('circuit_open', {
          agent,
          model,
          error: error.message
        });
      }
      throw error;
    }
  }

  /**
   * Execute request with retry logic and exponential backoff
   */
  async executeWithRetry(request, modelSpec) {
    const {
      model,
      messages,
      system,
      tools,
      max_tokens,
      temperature,
      agent
    } = request;

    // Check rate limits
    await this.waitForRateLimit(modelSpec.provider);

    // Try primary model, then fallbacks
    const fallbackChain = [model, ...this.modelConfig.getFallbackChain(model)];

    let lastError;
    for (const currentModel of fallbackChain) {
      // Retry loop with exponential backoff
      let retryCount = 0;
      const maxRetries = this.options.maxRetries;

      while (retryCount <= maxRetries) {
        try {
          const response = await this.executeRequest({
            model: currentModel,
            messages,
            system,
            tools,
            max_tokens,
            temperature
          });

          // Track usage
          this.trackUsage(currentModel, agent, response.usage);

          // Emit usage event
          this.emit('usage', {
            model: currentModel,
            agent,
            usage: response.usage,
            cost: this.modelConfig.calculateCost(
              currentModel,
              response.usage.input_tokens,
              response.usage.output_tokens
            )
          });

          return response;

        } catch (error) {
          lastError = error;
          retryCount++;

          // Determine if error is retryable
          const isRetryable = this.isRetryableError(error);

          if (isRetryable && retryCount <= maxRetries) {
            // Calculate backoff delay
            const delay = this.calculateBackoff(retryCount, error);
            console.warn(`[${agent || 'unknown'}] Attempt ${retryCount}/${maxRetries} failed for ${currentModel}: ${error.message}. Retrying in ${delay}ms...`);
            await this.sleep(delay);
            continue;
          }

          // Not retryable or max retries reached, try next model
          console.warn(`[${agent || 'unknown'}] Model ${currentModel} failed after ${retryCount} attempts: ${error.message}`);
          break;
        }
      }

      // Try next model in fallback chain
      if (currentModel !== fallbackChain[fallbackChain.length - 1]) {
        console.log(`[${agent || 'unknown'}] Falling back from ${currentModel}...`);
      }
    }

    throw new Error(`All models failed after retries. Last error: ${lastError?.message}`);
  }

  /**
   * Determine if an error is retryable
   */
  isRetryableError(error) {
    // Rate limit
    if (error.status === 429) return true;

    // Server errors
    if (error.status >= 500 && error.status < 600) return true;

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;

    // Anthropic overloaded
    if (error.message?.includes('overloaded')) return true;

    return false;
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoff(retryCount, error) {
    // If rate limited with retry-after header, use that
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
    }

    // Exponential backoff with jitter
    const baseDelay = this.options.retryDelay;
    const multiplier = this.options.retryBackoffMultiplier;
    const exponentialDelay = baseDelay * Math.pow(multiplier, retryCount - 1);

    // Add jitter (±20%)
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);

    return Math.min(exponentialDelay + jitter, 60000); // Cap at 60 seconds
  }

  /**
   * Execute request to specific provider
   */
  async executeRequest(request) {
    const { model, messages, system, tools, max_tokens, temperature } = request;
    const modelSpec = this.modelConfig.getModelSpec(model);

    switch (modelSpec.provider) {
      case 'anthropic':
        return this.executeAnthropicRequest(request);
      case 'openai':
        return this.executeOpenAIRequest(request);
      case 'local':
        return this.executeLocalRequest(request);
      default:
        throw new Error(`Unknown provider: ${modelSpec.provider}`);
    }
  }

  /**
   * Execute Anthropic (Claude) request
   */
  async executeAnthropicRequest(request) {
    const { model, messages, system, tools, max_tokens, temperature } = request;

    if (!this.providers.anthropic) {
      throw new Error('Anthropic provider not configured');
    }

    const anthropicRequest = {
      model: model,
      max_tokens: max_tokens,
      temperature: temperature,
      messages: this.formatMessagesForAnthropic(messages)
    };

    if (system) {
      anthropicRequest.system = system;
    }

    if (tools && tools.length > 0) {
      anthropicRequest.tools = this.formatToolsForAnthropic(tools);
    }

    const response = await this.providers.anthropic.messages.create(anthropicRequest);

    return {
      content: this.extractAnthropicContent(response),
      tool_calls: this.extractAnthropicToolCalls(response),
      stop_reason: response.stop_reason,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      },
      raw: response
    };
  }

  /**
   * Execute OpenAI request
   */
  async executeOpenAIRequest(request) {
    const { model, messages, system, tools, max_tokens, temperature } = request;

    if (!this.providers.openai) {
      throw new Error('OpenAI provider not configured');
    }

    const openaiMessages = this.formatMessagesForOpenAI(messages, system);

    const openaiRequest = {
      model: model,
      max_tokens: max_tokens,
      temperature: temperature,
      messages: openaiMessages
    };

    if (tools && tools.length > 0) {
      openaiRequest.tools = this.formatToolsForOpenAI(tools);
    }

    const response = await this.providers.openai.chat.completions.create(openaiRequest);

    return {
      content: response.choices[0]?.message?.content || '',
      tool_calls: response.choices[0]?.message?.tool_calls || [],
      stop_reason: response.choices[0]?.finish_reason,
      usage: {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens
      },
      raw: response
    };
  }

  /**
   * Execute local model request (Ollama)
   */
  async executeLocalRequest(request) {
    const { model, messages, system, max_tokens, temperature } = request;

    const ollamaHost = this.providers.local?.host || 'http://localhost:11434';

    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.replace('local-', ''),
        messages: this.formatMessagesForOllama(messages, system),
        options: {
          temperature: temperature,
          num_predict: max_tokens
        },
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || '',
      tool_calls: [],
      stop_reason: 'stop',
      usage: {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0
      },
      raw: data
    };
  }

  /**
   * Format messages for Anthropic
   */
  formatMessagesForAnthropic(messages) {
    return messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }));
  }

  /**
   * Format messages for OpenAI
   */
  formatMessagesForOpenAI(messages, system) {
    const formatted = [];

    if (system) {
      formatted.push({ role: 'system', content: system });
    }

    formatted.push(...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    return formatted;
  }

  /**
   * Format messages for Ollama
   */
  formatMessagesForOllama(messages, system) {
    const formatted = [];

    if (system) {
      formatted.push({ role: 'system', content: system });
    }

    formatted.push(...messages);

    return formatted;
  }

  /**
   * Format tools for Anthropic
   */
  formatToolsForAnthropic(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters || tool.input_schema
    }));
  }

  /**
   * Format tools for OpenAI
   */
  formatToolsForOpenAI(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || tool.input_schema
      }
    }));
  }

  /**
   * Extract content from Anthropic response
   */
  extractAnthropicContent(response) {
    const textBlocks = response.content.filter(block => block.type === 'text');
    return textBlocks.map(block => block.text).join('');
  }

  /**
   * Extract tool calls from Anthropic response
   */
  extractAnthropicToolCalls(response) {
    return response.content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        name: block.name,
        arguments: block.input
      }));
  }

  /**
   * Wait for rate limit
   */
  async waitForRateLimit(provider) {
    const limits = this.modelConfig.getRateLimits(provider);
    const state = this.rateLimitState[provider];

    if (!state) return;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    state.requests = state.requests.filter(t => t > oneMinuteAgo);

    // Check if at limit
    if (state.requests.length >= limits.requests_per_minute) {
      const oldestRequest = state.requests[0];
      const waitTime = oldestRequest + 60000 - now;

      if (waitTime > 0) {
        console.log(`Rate limit reached for ${provider}. Waiting ${waitTime}ms...`);
        await this.sleep(waitTime);
      }
    }

    // Record this request
    state.requests.push(now);
  }

  /**
   * Track usage
   */
  trackUsage(model, agent, usage) {
    this.usage.total_requests++;
    this.usage.total_input_tokens += usage.input_tokens;
    this.usage.total_output_tokens += usage.output_tokens;

    const cost = this.modelConfig.calculateCost(
      model,
      usage.input_tokens,
      usage.output_tokens
    );
    this.usage.total_cost += cost.total_cost;

    // By model
    if (!this.usage.by_model[model]) {
      this.usage.by_model[model] = { requests: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
    }
    this.usage.by_model[model].requests++;
    this.usage.by_model[model].input_tokens += usage.input_tokens;
    this.usage.by_model[model].output_tokens += usage.output_tokens;
    this.usage.by_model[model].cost += cost.total_cost;

    // By agent
    if (agent) {
      if (!this.usage.by_agent[agent]) {
        this.usage.by_agent[agent] = { requests: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
      }
      this.usage.by_agent[agent].requests++;
      this.usage.by_agent[agent].input_tokens += usage.input_tokens;
      this.usage.by_agent[agent].output_tokens += usage.output_tokens;
      this.usage.by_agent[agent].cost += cost.total_cost;

      // Track context budget per agent session
      this.trackContextBudget(model, agent, usage);
    }
  }

  /**
   * Track context budget and emit warning at threshold
   */
  trackContextBudget(model, agent, usage) {
    // Initialize context tracking for this agent
    if (!this.contextUsage[agent]) {
      this.contextUsage[agent] = {
        total_input_tokens: 0,
        total_output_tokens: 0,
        model,
        warnings_emitted: 0
      };
    }

    const ctx = this.contextUsage[agent];
    ctx.total_input_tokens += usage.input_tokens;
    ctx.total_output_tokens += usage.output_tokens;
    ctx.model = model;

    // Get context limit for the model
    const contextLimit = CONTEXT_LIMITS[model] || CONTEXT_LIMITS.default;

    // Calculate usage percentage (input tokens are what matters for context window)
    const usagePercent = ctx.total_input_tokens / contextLimit;

    // Emit warning at 80% (configurable)
    if (usagePercent >= this.options.contextWarningThreshold) {
      ctx.warnings_emitted++;

      this.emit('context_warning', {
        agent,
        model,
        usagePercent: (usagePercent * 100).toFixed(1) + '%',
        input_tokens: ctx.total_input_tokens,
        context_limit: contextLimit,
        warnings_emitted: ctx.warnings_emitted,
        recommendation: 'trigger_shadowfax_compression'
      });

      console.warn(`[${agent}] Context usage at ${(usagePercent * 100).toFixed(1)}% (${ctx.total_input_tokens}/${contextLimit} tokens). Consider triggering Shadowfax compression.`);
    }
  }

  /**
   * Get context usage for an agent
   */
  getContextUsage(agent) {
    return this.contextUsage[agent] || null;
  }

  /**
   * Reset context usage for an agent (after compression)
   */
  resetContextUsage(agent) {
    if (this.contextUsage[agent]) {
      this.contextUsage[agent] = {
        total_input_tokens: 0,
        total_output_tokens: 0,
        model: this.contextUsage[agent].model,
        warnings_emitted: 0
      };
    }
  }

  /**
   * Get all context usage stats
   */
  getAllContextUsage() {
    const stats = {};
    for (const [agent, ctx] of Object.entries(this.contextUsage)) {
      const limit = CONTEXT_LIMITS[ctx.model] || CONTEXT_LIMITS.default;
      stats[agent] = {
        ...ctx,
        context_limit: limit,
        usage_percent: ((ctx.total_input_tokens / limit) * 100).toFixed(1) + '%'
      };
    }
    return stats;
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      ...this.usage,
      total_cost_formatted: `$${this.usage.total_cost.toFixed(4)}`
    };
  }

  /**
   * Reset usage tracking
   */
  resetUsage() {
    this.usage = {
      total_requests: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost: 0,
      by_model: {},
      by_agent: {}
    };
  }

  /**
   * Check provider health
   */
  async checkHealth() {
    const health = {
      anthropic: false,
      openai: false,
      local: false
    };

    // Check Anthropic
    if (this.providers.anthropic) {
      try {
        await this.providers.anthropic.messages.create({
          model: 'claude-haiku-3',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }]
        });
        health.anthropic = true;
      } catch (error) {
        health.anthropic = false;
      }
    }

    // Check OpenAI
    if (this.providers.openai) {
      try {
        await this.providers.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }]
        });
        health.openai = true;
      } catch (error) {
        health.openai = false;
      }
    }

    // Check local
    if (this.providers.local) {
      try {
        const response = await fetch(`${this.providers.local.host}/api/tags`);
        health.local = response.ok;
      } catch (error) {
        health.local = false;
      }
    }

    return health;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =====================
  // JSON Validation API
  // =====================

  /**
   * Parse JSON with progressive repair strategies
   *
   * @param {string} output - Raw output from agent
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed JSON
   */
  async parseJSON(output, options = {}) {
    return this.jsonValidator.parseWithRetry(output, options);
  }

  /**
   * Get JSON validator statistics
   */
  getJSONValidatorStats() {
    return this.jsonValidator.getStats();
  }

  // =====================
  // Circuit Breaker API
  // =====================

  /**
   * Get circuit breaker for an agent
   */
  getCircuitBreaker(agent) {
    return this.circuitBreakers.getCircuit(agent);
  }

  /**
   * Get all circuit breaker states
   */
  getCircuitBreakerStates() {
    return this.circuitBreakers.getAllStates();
  }

  /**
   * Get circuits that are currently open
   */
  getOpenCircuits() {
    return this.circuitBreakers.getOpenCircuits();
  }

  /**
   * Reset a specific circuit breaker
   */
  resetCircuitBreaker(agent) {
    const circuit = this.circuitBreakers.getCircuit(agent);
    circuit.reset();
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers() {
    this.circuitBreakers.resetAll();
  }
}

module.exports = {
  AIAdapter,
  CONTEXT_LIMITS
};
