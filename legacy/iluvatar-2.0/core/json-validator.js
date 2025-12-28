/**
 * ILUVATAR 3.0 - JSON Validator & Circuit Breaker
 *
 * Handles malformed JSON from agent outputs with progressive repair strategies:
 * 1. Direct JSON.parse
 * 2. Extract from markdown code blocks
 * 3. Clean common issues (trailing commas, comments)
 * 4. Call Haiku to fix malformed JSON
 *
 * Also includes JSON Schema validation using Ajv to catch structurally valid
 * but semantically incorrect responses (wrong-but-valid JSON).
 *
 * Circuit breaker prevents cascade failures when agents repeatedly produce bad output.
 */

const EventEmitter = require('events');

// Agent output schemas for validation
// These define the required fields for each planning agent's output
const AGENT_SCHEMAS = {
  gandalf: {
    $id: 'gandalf-output',
    type: 'object',
    required: ['ideas', 'recommended_idea_index', 'platform_recommendation'],
    properties: {
      ideas: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['title', 'description'],
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            feasibility: { type: 'string' }
          }
        }
      },
      recommended_idea_index: { type: 'number', minimum: 0 },
      platform_recommendation: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          reasoning: { type: 'string' }
        }
      }
    }
  },

  radagast: {
    $id: 'radagast-output',
    type: 'object',
    required: ['architecture', 'phase_allocation', 'time_tracking'],
    properties: {
      architecture: {
        type: 'object',
        required: ['tech_stack', 'file_structure'],
        properties: {
          tech_stack: { type: 'array', items: { type: 'string' } },
          file_structure: { type: 'object' },
          dependencies: { type: 'object' }
        }
      },
      phase_allocation: {
        type: 'object',
        properties: {
          backend_percentage: { type: 'number', minimum: 0, maximum: 100 },
          frontend_percentage: { type: 'number', minimum: 0, maximum: 100 }
        }
      },
      time_tracking: {
        type: 'object',
        properties: {
          estimated_hours: { type: 'number', minimum: 0 }
        }
      },
      crunch_mode_triggers: { type: 'array', items: { type: 'object' } }
    }
  },

  denethor: {
    $id: 'denethor-output',
    type: 'object',
    required: ['backend_work_queue', 'frontend_work_queue', 'backend_clones', 'frontend_clones'],
    properties: {
      backend_work_queue: {
        type: 'array',
        items: {
          type: 'object',
          required: ['file_path', 'priority'],
          properties: {
            file_path: { type: 'string' },
            priority: { type: 'number' },
            description: { type: 'string' },
            dependencies: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      frontend_work_queue: {
        type: 'array',
        items: {
          type: 'object',
          required: ['file_path', 'priority'],
          properties: {
            file_path: { type: 'string' },
            priority: { type: 'number' },
            description: { type: 'string' },
            dependencies: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      backend_clones: { type: 'number', minimum: 1 },
      frontend_clones: { type: 'number', minimum: 1 }
    }
  },

  gimli: {
    $id: 'gimli-output',
    type: 'object',
    required: ['file_path', 'content'],
    properties: {
      file_path: { type: 'string', minLength: 1 },
      content: { type: 'string' },
      language: { type: 'string' },
      dependencies: { type: 'array', items: { type: 'string' } }
    }
  },

  legolas: {
    $id: 'legolas-output',
    type: 'object',
    required: ['file_path', 'content'],
    properties: {
      file_path: { type: 'string', minLength: 1 },
      content: { type: 'string' },
      component_type: { type: 'string' },
      styles_included: { type: 'boolean' }
    }
  }
};

/**
 * Simple JSON Schema validator
 * (Lightweight alternative to Ajv for basic validation)
 */
class SchemaValidator {
  constructor() {
    this.schemas = new Map();

    // Pre-load agent schemas
    for (const [name, schema] of Object.entries(AGENT_SCHEMAS)) {
      this.schemas.set(name.toLowerCase(), schema);
    }
  }

  /**
   * Validate data against a schema
   * @param {Object} data - Data to validate
   * @param {string} schemaName - Name of schema to validate against
   * @returns {Object} { valid: boolean, errors: Array }
   */
  validate(data, schemaName) {
    const schema = this.schemas.get(schemaName.toLowerCase());

    if (!schema) {
      return { valid: true, errors: [], skipped: true };
    }

    const errors = [];
    this._validateObject(data, schema, '', errors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _validateObject(data, schema, path, errors) {
    // Check type
    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        errors.push({ path: path || 'root', message: 'Expected object', received: typeof data });
        return;
      }

      // Check required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in data)) {
            errors.push({ path: `${path}.${field}`.replace(/^\./, ''), message: `Missing required field: ${field}` });
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in data) {
            this._validateObject(data[key], propSchema, `${path}.${key}`.replace(/^\./, ''), errors);
          }
        }
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(data)) {
        errors.push({ path: path || 'root', message: 'Expected array', received: typeof data });
        return;
      }

      if (schema.minItems !== undefined && data.length < schema.minItems) {
        errors.push({ path, message: `Array must have at least ${schema.minItems} items`, received: data.length });
      }

      // Validate items
      if (schema.items && data.length > 0) {
        data.forEach((item, index) => {
          this._validateObject(item, schema.items, `${path}[${index}]`, errors);
        });
      }
    } else if (schema.type === 'string') {
      if (typeof data !== 'string') {
        errors.push({ path, message: 'Expected string', received: typeof data });
        return;
      }
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push({ path, message: `String must be at least ${schema.minLength} characters` });
      }
    } else if (schema.type === 'number') {
      if (typeof data !== 'number') {
        errors.push({ path, message: 'Expected number', received: typeof data });
        return;
      }
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push({ path, message: `Number must be >= ${schema.minimum}`, received: data });
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push({ path, message: `Number must be <= ${schema.maximum}`, received: data });
      }
    } else if (schema.type === 'boolean') {
      if (typeof data !== 'boolean') {
        errors.push({ path, message: 'Expected boolean', received: typeof data });
      }
    }
  }

  /**
   * Add a custom schema
   */
  addSchema(name, schema) {
    this.schemas.set(name.toLowerCase(), schema);
  }

  /**
   * Check if a schema exists
   */
  hasSchema(name) {
    return this.schemas.has(name.toLowerCase());
  }
}

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',     // Normal operation - requests flow through
  OPEN: 'OPEN',         // Tripped - requests fail immediately
  HALF_OPEN: 'HALF_OPEN' // Testing - allow one request to see if recovered
};

/**
 * Custom error for circuit breaker open state
 */
class CircuitOpenError extends Error {
  constructor(circuitId, message) {
    super(message || `Circuit ${circuitId} is OPEN - refusing requests`);
    this.name = 'CircuitOpenError';
    this.circuitId = circuitId;
  }
}

/**
 * Custom error for JSON validation failures
 */
class JSONValidationError extends Error {
  constructor(originalError, rawOutput, attempts) {
    super(`JSON validation failed after ${attempts} attempts: ${originalError.message}`);
    this.name = 'JSONValidationError';
    this.originalError = originalError;
    this.rawOutput = rawOutput;
    this.attempts = attempts;
  }
}

/**
 * Circuit Breaker implementation
 *
 * Protects against repeated failures by "tripping" after a threshold
 * and refusing requests until reset or half-open test succeeds.
 */
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.id = options.id || 'default';
    this.threshold = options.threshold || 3;          // Failures before tripping
    this.resetTimeout = options.resetTimeout || 60000; // Time to wait before half-open
    this.halfOpenMax = options.halfOpenMax || 1;       // Max requests in half-open

    this.state = CIRCUIT_STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenRequests = 0;
    this.lastFailure = null;
    this.lastStateChange = Date.now();

    // Redis client for publishing circuit events (injected)
    this.redis = options.redis || null;
  }

  /**
   * Get current circuit state
   */
  getState() {
    return {
      id: this.id,
      state: this.state,
      failures: this.failures,
      threshold: this.threshold,
      lastFailure: this.lastFailure,
      lastStateChange: this.lastStateChange
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, context = {}) {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CIRCUIT_STATES.OPEN) {
      const timeSinceOpen = Date.now() - this.lastStateChange;

      if (timeSinceOpen >= this.resetTimeout) {
        this.transitionTo(CIRCUIT_STATES.HALF_OPEN);
      } else {
        throw new CircuitOpenError(this.id, `Circuit is OPEN. Will test again in ${Math.ceil((this.resetTimeout - timeSinceOpen) / 1000)}s`);
      }
    }

    // In half-open, limit requests
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      if (this.halfOpenRequests >= this.halfOpenMax) {
        throw new CircuitOpenError(this.id, 'Circuit is HALF_OPEN and testing - additional requests refused');
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error, context);
      throw error;
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess() {
    this.successes++;

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      // Success in half-open = close the circuit
      this.transitionTo(CIRCUIT_STATES.CLOSED);
      this.emit('recovered', { id: this.id });
    }

    // Reset failure count on success
    this.failures = 0;
  }

  /**
   * Record a failed execution
   */
  recordFailure(error, context = {}) {
    this.failures++;
    this.lastFailure = {
      timestamp: Date.now(),
      error: error.message,
      context
    };

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      // Failure in half-open = reopen
      this.transitionTo(CIRCUIT_STATES.OPEN);
    } else if (this.failures >= this.threshold) {
      this.trip(error, context);
    }

    this.emit('failure', {
      id: this.id,
      failures: this.failures,
      threshold: this.threshold,
      error: error.message
    });
  }

  /**
   * Trip the circuit breaker (transition to OPEN)
   */
  trip(error, context = {}) {
    this.transitionTo(CIRCUIT_STATES.OPEN);

    const tripEvent = {
      id: this.id,
      failures: this.failures,
      error: error?.message,
      rawOutput: context.rawOutput,
      agent: context.agent,
      timestamp: Date.now()
    };

    this.emit('trip', tripEvent);

    // Publish to Redis if available
    if (this.redis) {
      this.publishToRedis(tripEvent);
    }
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === CIRCUIT_STATES.HALF_OPEN) {
      this.halfOpenRequests = 0;
    }

    if (newState === CIRCUIT_STATES.CLOSED) {
      this.failures = 0;
    }

    this.emit('stateChange', {
      id: this.id,
      from: oldState,
      to: newState,
      timestamp: this.lastStateChange
    });
  }

  /**
   * Manually reset the circuit
   */
  reset() {
    this.failures = 0;
    this.halfOpenRequests = 0;
    this.transitionTo(CIRCUIT_STATES.CLOSED);
    this.emit('reset', { id: this.id });
  }

  /**
   * Publish circuit trip to Redis for workflow coordination
   */
  async publishToRedis(tripEvent) {
    try {
      await this.redis.publish('circuit:tripped', JSON.stringify(tripEvent));

      // Also store the raw output for manual inspection
      await this.redis.hset(
        'circuit:failures',
        `${this.id}:${tripEvent.timestamp}`,
        JSON.stringify({
          ...tripEvent,
          rawOutput: tripEvent.rawOutput?.substring(0, 10000) // Truncate large outputs
        })
      );
    } catch (err) {
      console.error('Failed to publish circuit trip to Redis:', err.message);
    }
  }
}

/**
 * JSON Validator with progressive repair strategies
 */
class JSONValidator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxRetries = options.maxRetries || 3;
    this.aiAdapter = options.aiAdapter || null; // For Haiku fixer
    this.schemaValidator = new SchemaValidator(); // For schema validation

    // Track parsing statistics
    this.stats = {
      directParse: 0,
      extractedFromMarkdown: 0,
      cleanedParse: 0,
      haikuFixed: 0,
      schemaValidated: 0,
      schemaFailed: 0,
      failed: 0
    };
  }

  /**
   * Parse JSON with progressive repair strategies
   *
   * @param {string} output - Raw output from agent (may contain JSON)
   * @param {Object} options - Parsing options
   * @param {string} options.agent - Agent name for tracking
   * @param {Object} options.expectedSchema - Optional schema hint for Haiku
   * @returns {Promise<Object>} Parsed JSON object
   */
  async parseWithRetry(output, options = {}) {
    const { agent, expectedSchema } = options;
    const attempts = [];

    // Strategy 1: Direct parse
    try {
      const result = JSON.parse(output);
      this.stats.directParse++;
      this.emit('parsed', { strategy: 'direct', agent });
      return result;
    } catch (e1) {
      attempts.push({ strategy: 'direct', error: e1.message });
    }

    // Strategy 2: Extract from markdown code blocks
    const extracted = this.extractFromMarkdown(output);
    if (extracted) {
      try {
        const result = JSON.parse(extracted);
        this.stats.extractedFromMarkdown++;
        this.emit('parsed', { strategy: 'markdown', agent });
        return result;
      } catch (e2) {
        attempts.push({ strategy: 'markdown', error: e2.message });
      }
    }

    // Strategy 3: Clean common issues
    const cleaned = this.cleanJSON(output);
    try {
      const result = JSON.parse(cleaned);
      this.stats.cleanedParse++;
      this.emit('parsed', { strategy: 'cleaned', agent });
      return result;
    } catch (e3) {
      attempts.push({ strategy: 'cleaned', error: e3.message });
    }

    // Strategy 4: Use Haiku to fix (if adapter available)
    if (this.aiAdapter) {
      try {
        const fixed = await this.fixWithHaiku(output, expectedSchema);
        const result = JSON.parse(fixed);
        this.stats.haikuFixed++;
        this.emit('parsed', { strategy: 'haiku', agent });
        return result;
      } catch (e4) {
        attempts.push({ strategy: 'haiku', error: e4.message });
      }
    }

    // All strategies failed
    this.stats.failed++;
    const finalError = new JSONValidationError(
      new Error(attempts.map(a => `${a.strategy}: ${a.error}`).join('; ')),
      output,
      attempts.length
    );

    this.emit('failed', {
      agent,
      attempts,
      rawOutput: output.substring(0, 500) // First 500 chars for debugging
    });

    throw finalError;
  }

  /**
   * Extract JSON from markdown code blocks
   */
  extractFromMarkdown(output) {
    // Try ```json blocks first
    const jsonBlockMatch = output.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1].trim();
    }

    // Try generic ``` blocks
    const genericBlockMatch = output.match(/```\s*([\s\S]*?)\s*```/);
    if (genericBlockMatch) {
      const content = genericBlockMatch[1].trim();
      // Check if it looks like JSON
      if (content.startsWith('{') || content.startsWith('[')) {
        return content;
      }
    }

    // Try to find raw JSON object/array
    const jsonMatch = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return jsonMatch[1];
    }

    return null;
  }

  /**
   * Clean common JSON issues
   */
  cleanJSON(output) {
    let cleaned = output;

    // Remove potential markdown/text wrapping
    cleaned = this.extractFromMarkdown(cleaned) || cleaned;

    // Remove single-line comments
    cleaned = cleaned.replace(/\/\/.*$/gm, '');

    // Remove multi-line comments
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove trailing commas before } or ]
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    // Fix unquoted keys (basic attempt)
    cleaned = cleaned.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Remove BOM and other invisible characters
    cleaned = cleaned.replace(/^\uFEFF/, '');

    // Trim whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Use Claude Haiku to fix malformed JSON
   */
  async fixWithHaiku(malformedJson, expectedSchema = null) {
    if (!this.aiAdapter) {
      throw new Error('AI adapter not available for Haiku fixer');
    }

    const schemaHint = expectedSchema
      ? `\n\nExpected schema: ${JSON.stringify(expectedSchema, null, 2)}`
      : '';

    const response = await this.aiAdapter.chat({
      model: 'claude-3-haiku-20240307',
      messages: [{
        role: 'user',
        content: `Fix this malformed JSON. Return ONLY valid JSON, no explanations or markdown.

Malformed input:
${malformedJson.substring(0, 8000)}${schemaHint}`
      }],
      max_tokens: 4096,
      temperature: 0,
      agent: 'json-fixer'
    });

    // Extract just the JSON from response
    let fixed = response.content.trim();

    // Remove any markdown if Haiku wrapped it
    const extracted = this.extractFromMarkdown(fixed);
    if (extracted) {
      fixed = extracted;
    }

    return fixed;
  }

  /**
   * Get parsing statistics
   */
  getStats() {
    const total = Object.values(this.stats).reduce((a, b) => a + b, 0);
    return {
      ...this.stats,
      total,
      successRate: total > 0 ? ((total - this.stats.failed) / total * 100).toFixed(2) + '%' : 'N/A'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      directParse: 0,
      extractedFromMarkdown: 0,
      cleanedParse: 0,
      haikuFixed: 0,
      schemaValidated: 0,
      schemaFailed: 0,
      failed: 0
    };
  }

  /**
   * Validate parsed JSON against agent schema
   *
   * @param {Object} data - Parsed JSON data
   * @param {string} agentName - Name of the agent (gandalf, radagast, denethor, etc.)
   * @returns {Object} { valid: boolean, errors: Array }
   */
  validateSchema(data, agentName) {
    const result = this.schemaValidator.validate(data, agentName);

    if (result.valid) {
      this.stats.schemaValidated++;
    } else if (!result.skipped) {
      this.stats.schemaFailed++;
    }

    this.emit('schemaValidation', {
      agent: agentName,
      valid: result.valid,
      errors: result.errors,
      skipped: result.skipped
    });

    return result;
  }

  /**
   * Parse JSON and validate against schema in one step
   *
   * @param {string} output - Raw output from agent
   * @param {string} agentName - Name of the agent for schema validation
   * @param {Object} options - Additional parsing options
   * @returns {Promise<Object>} Parsed and validated JSON
   * @throws {JSONValidationError} If parsing fails or schema validation fails
   */
  async parseAndValidate(output, agentName, options = {}) {
    // First parse the JSON
    const parsed = await this.parseWithRetry(output, { ...options, agent: agentName });

    // Then validate against schema
    const validation = this.validateSchema(parsed, agentName);

    if (!validation.valid && !validation.skipped) {
      const schemaError = new JSONValidationError(
        new Error(`Schema validation failed: ${validation.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`),
        JSON.stringify(parsed, null, 2),
        1
      );
      schemaError.schemaErrors = validation.errors;
      schemaError.parsedData = parsed;

      this.emit('schemaValidationFailed', {
        agent: agentName,
        errors: validation.errors,
        data: parsed
      });

      throw schemaError;
    }

    return parsed;
  }

  /**
   * Check if a schema exists for an agent
   */
  hasSchema(agentName) {
    return this.schemaValidator.hasSchema(agentName);
  }

  /**
   * Add a custom schema for an agent
   */
  addSchema(agentName, schema) {
    this.schemaValidator.addSchema(agentName, schema);
  }
}

/**
 * Circuit Breaker Registry
 *
 * Manages multiple circuit breakers (one per agent or service)
 */
class CircuitBreakerRegistry {
  constructor(options = {}) {
    this.circuits = new Map();
    this.defaultOptions = {
      threshold: options.threshold || 3,
      resetTimeout: options.resetTimeout || 60000,
      redis: options.redis || null
    };
  }

  /**
   * Get or create a circuit breaker for an ID
   */
  getCircuit(id) {
    if (!this.circuits.has(id)) {
      this.circuits.set(id, new CircuitBreaker({
        id,
        ...this.defaultOptions
      }));
    }
    return this.circuits.get(id);
  }

  /**
   * Get all circuit states
   */
  getAllStates() {
    const states = {};
    for (const [id, circuit] of this.circuits) {
      states[id] = circuit.getState();
    }
    return states;
  }

  /**
   * Reset all circuits
   */
  resetAll() {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }

  /**
   * Get circuits in OPEN state
   */
  getOpenCircuits() {
    const open = [];
    for (const [id, circuit] of this.circuits) {
      if (circuit.state === CIRCUIT_STATES.OPEN) {
        open.push(circuit.getState());
      }
    }
    return open;
  }
}

module.exports = {
  JSONValidator,
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  JSONValidationError,
  SchemaValidator,
  CIRCUIT_STATES,
  AGENT_SCHEMAS
};
