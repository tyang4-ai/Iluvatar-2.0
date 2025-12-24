/**
 * ILUVATAR 2.0 - AI Adapter Unit Tests
 *
 * Tests the unified AI adapter interface for multiple providers
 * Validates retry logic, rate limiting, circuit breakers, and usage tracking
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { AIAdapter, CONTEXT_LIMITS } = require('../../orchestrator/ai-adapter');
const { CIRCUIT_STATES } = require('../../core/json-validator');

// Mock model config
const mockModelConfig = {
  getModelSpec: sinon.stub().returns({
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    contextWindow: 200000
  }),
  getFallbackChain: sinon.stub().returns([]),
  calculateCost: sinon.stub().returns({
    input_cost: 0.003,
    output_cost: 0.015,
    total_cost: 0.018
  }),
  getRateLimits: sinon.stub().returns({
    requests_per_minute: 60,
    tokens_per_minute: 100000
  })
};

describe('AI Adapter', function() {
  let adapter;
  let anthropicMock;

  beforeEach(function() {
    // Set environment for provider initialization
    process.env.ANTHROPIC_API_KEY = 'test-key';

    adapter = new AIAdapter(mockModelConfig, {
      maxRetries: 2,
      retryDelay: 10, // Short delay for tests
      circuitBreakerThreshold: 2,
      circuitBreakerResetTimeout: 100
    });

    // Mock the Anthropic client
    anthropicMock = {
      messages: {
        create: sinon.stub()
      }
    };
    adapter.providers.anthropic = anthropicMock;
  });

  afterEach(function() {
    delete process.env.ANTHROPIC_API_KEY;
    sinon.restore();
  });

  describe('Initialization', function() {
    it('should initialize with default options', function() {
      const defaultAdapter = new AIAdapter(mockModelConfig);

      expect(defaultAdapter.options.maxRetries).to.equal(3);
      expect(defaultAdapter.options.contextWarningThreshold).to.equal(0.8);
    });

    it('should initialize usage tracking', function() {
      expect(adapter.usage.total_requests).to.equal(0);
      expect(adapter.usage.total_input_tokens).to.equal(0);
      expect(adapter.usage.total_cost).to.equal(0);
    });

    it('should initialize circuit breaker registry', function() {
      expect(adapter.circuitBreakers).to.exist;
    });

    it('should initialize JSON validator', function() {
      expect(adapter.jsonValidator).to.exist;
    });
  });

  describe('Chat Request', function() {
    it('should make successful chat request', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      const response = await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Hi' }],
        agent: 'test-agent'
      });

      expect(response.content).to.equal('Hello!');
      expect(response.usage.input_tokens).to.equal(10);
      expect(response.usage.output_tokens).to.equal(5);
    });

    it('should track usage after successful request', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'tracking-agent'
      });

      expect(adapter.usage.total_requests).to.equal(1);
      expect(adapter.usage.total_input_tokens).to.equal(100);
      expect(adapter.usage.total_output_tokens).to.equal(50);
    });

    it('should emit usage event', async function() {
      const usageSpy = sinon.spy();
      adapter.on('usage', usageSpy);

      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'event-agent'
      });

      expect(usageSpy.calledOnce).to.be.true;
      expect(usageSpy.firstCall.args[0].agent).to.equal('event-agent');
    });
  });

  describe('Retry Logic', function() {
    it('should retry on retryable errors', async function() {
      anthropicMock.messages.create
        .onFirstCall().rejects({ status: 429, message: 'Rate limited' })
        .onSecondCall().resolves({
          content: [{ type: 'text', text: 'Success' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 }
        });

      const response = await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'retry-agent',
        useCircuitBreaker: false
      });

      expect(response.content).to.equal('Success');
      expect(anthropicMock.messages.create.callCount).to.equal(2);
    });

    it('should retry on server errors (5xx)', async function() {
      anthropicMock.messages.create
        .onFirstCall().rejects({ status: 500, message: 'Server error' })
        .onSecondCall().resolves({
          content: [{ type: 'text', text: 'Success' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 }
        });

      const response = await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'server-error-agent',
        useCircuitBreaker: false
      });

      expect(response.content).to.equal('Success');
    });

    it('should retry on overloaded error', async function() {
      anthropicMock.messages.create
        .onFirstCall().rejects({ message: 'API is overloaded' })
        .onSecondCall().resolves({
          content: [{ type: 'text', text: 'Success' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 }
        });

      const response = await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'overload-agent',
        useCircuitBreaker: false
      });

      expect(response.content).to.equal('Success');
    });

    it('should not retry on non-retryable errors', async function() {
      anthropicMock.messages.create.rejects({ status: 400, message: 'Bad request' });

      try {
        await adapter.chat({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Test' }],
          agent: 'no-retry-agent',
          useCircuitBreaker: false
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(anthropicMock.messages.create.callCount).to.equal(1);
      }
    });

    it('should fail after max retries', async function() {
      anthropicMock.messages.create.rejects({ status: 429, message: 'Rate limited' });

      try {
        await adapter.chat({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Test' }],
          agent: 'max-retry-agent',
          useCircuitBreaker: false
        });
        expect.fail('Should have thrown');
      } catch (error) {
        // maxRetries is 2, so 3 total attempts
        expect(anthropicMock.messages.create.callCount).to.equal(3);
      }
    });
  });

  describe('Backoff Calculation', function() {
    it('should use retry-after header when available', function() {
      const error = { status: 429, headers: { 'retry-after': '30' } };
      const delay = adapter.calculateBackoff(1, error);

      expect(delay).to.equal(30000);
    });

    it('should use exponential backoff', function() {
      const error = { status: 500 };
      // Run multiple times to get average behavior (jitter can cause single-run failures)
      let delay1Total = 0, delay2Total = 0, delay3Total = 0;
      const runs = 5;

      for (let i = 0; i < runs; i++) {
        delay1Total += adapter.calculateBackoff(1, error);
        delay2Total += adapter.calculateBackoff(2, error);
        delay3Total += adapter.calculateBackoff(3, error);
      }

      const avgDelay1 = delay1Total / runs;
      const avgDelay2 = delay2Total / runs;
      const avgDelay3 = delay3Total / runs;

      // Each retry should be roughly 2x the previous on average (with jitter tolerance)
      expect(avgDelay2).to.be.greaterThan(avgDelay1 * 1.3);
      expect(avgDelay3).to.be.greaterThan(avgDelay2 * 1.3);
    });

    it('should cap backoff at 60 seconds', function() {
      const error = { status: 500 };
      const delay = adapter.calculateBackoff(10, error);

      expect(delay).to.be.at.most(60000);
    });
  });

  describe('Circuit Breaker Integration', function() {
    it('should use circuit breaker for agent requests', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Success' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'circuit-agent'
      });

      const circuit = adapter.getCircuitBreaker('circuit-agent');
      expect(circuit.successes).to.equal(1);
    });

    it('should trip circuit after threshold failures', async function() {
      anthropicMock.messages.create.rejects({ status: 400, message: 'Bad' });

      const agent = 'trip-agent';

      // Make failures up to threshold
      for (let i = 0; i < 2; i++) {
        try {
          await adapter.chat({
            model: 'claude-3-sonnet-20240229',
            messages: [{ role: 'user', content: 'Test' }],
            agent
          });
        } catch (e) {}
      }

      const circuit = adapter.getCircuitBreaker(agent);
      expect(circuit.state).to.equal(CIRCUIT_STATES.OPEN);
    });

    it('should emit circuit_open event', async function() {
      const openSpy = sinon.spy();
      adapter.on('circuit_open', openSpy);

      anthropicMock.messages.create.rejects({ status: 400, message: 'Bad' });

      // Trip the circuit
      const circuit = adapter.getCircuitBreaker('emit-agent');
      circuit.transitionTo(CIRCUIT_STATES.OPEN);

      try {
        await adapter.chat({
          model: 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: 'Test' }],
          agent: 'emit-agent'
        });
      } catch (e) {}

      expect(openSpy.called).to.be.true;
    });

    it('should bypass circuit breaker when disabled', async function() {
      const circuit = adapter.getCircuitBreaker('bypass-agent');
      circuit.transitionTo(CIRCUIT_STATES.OPEN);

      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Success' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 }
      });

      // Should succeed even with open circuit
      const response = await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'bypass-agent',
        useCircuitBreaker: false
      });

      expect(response.content).to.equal('Success');
    });
  });

  describe('Context Budget Tracking', function() {
    it('should track context usage per agent', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50000, output_tokens: 1000 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'context-agent'
      });

      const usage = adapter.getContextUsage('context-agent');
      expect(usage.total_input_tokens).to.equal(50000);
      expect(usage.total_output_tokens).to.equal(1000);
    });

    it('should emit context_warning at threshold', async function() {
      const warningSpy = sinon.spy();
      adapter.on('context_warning', warningSpy);

      // High token usage to trigger warning (80% of 200k = 160k)
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 170000, output_tokens: 1000 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'high-context-agent'
      });

      expect(warningSpy.calledOnce).to.be.true;
      expect(warningSpy.firstCall.args[0].agent).to.equal('high-context-agent');
      expect(warningSpy.firstCall.args[0].recommendation).to.equal('trigger_shadowfax_compression');
    });

    it('should reset context usage', async function() {
      // Add some usage
      adapter.contextUsage['reset-agent'] = {
        total_input_tokens: 100000,
        total_output_tokens: 5000,
        model: 'test',
        warnings_emitted: 1
      };

      adapter.resetContextUsage('reset-agent');

      const usage = adapter.getContextUsage('reset-agent');
      expect(usage.total_input_tokens).to.equal(0);
      expect(usage.warnings_emitted).to.equal(0);
    });

    it('should get all context usage stats', async function() {
      adapter.contextUsage['agent-1'] = {
        total_input_tokens: 50000,
        total_output_tokens: 1000,
        model: 'claude-3-sonnet-20240229'
      };
      adapter.contextUsage['agent-2'] = {
        total_input_tokens: 100000,
        total_output_tokens: 2000,
        model: 'claude-3-sonnet-20240229'
      };

      const allUsage = adapter.getAllContextUsage();

      expect(allUsage['agent-1'].usage_percent).to.exist;
      expect(allUsage['agent-2'].usage_percent).to.exist;
    });
  });

  describe('Usage Statistics', function() {
    it('should track usage by model', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'model-track-agent'
      });

      const stats = adapter.getUsageStats();
      expect(stats.by_model['claude-3-sonnet-20240229']).to.exist;
      expect(stats.by_model['claude-3-sonnet-20240229'].requests).to.equal(1);
    });

    it('should track usage by agent', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'gandalf'
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'gandalf'
      });

      const stats = adapter.getUsageStats();
      expect(stats.by_agent['gandalf'].requests).to.equal(2);
    });

    it('should format total cost', async function() {
      anthropicMock.messages.create.resolves({
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await adapter.chat({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Test' }],
        agent: 'cost-agent'
      });

      const stats = adapter.getUsageStats();
      expect(stats.total_cost_formatted).to.match(/^\$\d+\.\d{4}$/);
    });

    it('should reset usage statistics', async function() {
      adapter.usage.total_requests = 100;
      adapter.usage.total_cost = 10;

      adapter.resetUsage();

      expect(adapter.usage.total_requests).to.equal(0);
      expect(adapter.usage.total_cost).to.equal(0);
    });
  });

  describe('JSON Parsing', function() {
    it('should parse valid JSON', async function() {
      const json = '{"test": true}';
      const result = await adapter.parseJSON(json);

      expect(result).to.deep.equal({ test: true });
    });

    it('should extract JSON from markdown', async function() {
      const markdown = '```json\n{"extracted": true}\n```';
      const result = await adapter.parseJSON(markdown);

      expect(result).to.deep.equal({ extracted: true });
    });

    it('should get JSON validator stats', async function() {
      await adapter.parseJSON('{"test": true}');

      const stats = adapter.getJSONValidatorStats();
      expect(stats.directParse).to.be.greaterThan(0);
    });
  });

  describe('Circuit Breaker Management', function() {
    it('should get circuit breaker states', function() {
      adapter.getCircuitBreaker('agent1');
      adapter.getCircuitBreaker('agent2');

      const states = adapter.getCircuitBreakerStates();

      expect(Object.keys(states)).to.include('agent1');
      expect(Object.keys(states)).to.include('agent2');
    });

    it('should get open circuits', function() {
      const c1 = adapter.getCircuitBreaker('open-agent');
      c1.transitionTo(CIRCUIT_STATES.OPEN);

      const openCircuits = adapter.getOpenCircuits();

      expect(openCircuits.length).to.equal(1);
      expect(openCircuits[0].id).to.equal('open-agent');
    });

    it('should reset specific circuit breaker', function() {
      const circuit = adapter.getCircuitBreaker('reset-circuit');
      circuit.transitionTo(CIRCUIT_STATES.OPEN);

      adapter.resetCircuitBreaker('reset-circuit');

      expect(circuit.state).to.equal(CIRCUIT_STATES.CLOSED);
    });

    it('should reset all circuit breakers', function() {
      const c1 = adapter.getCircuitBreaker('reset-all-1');
      const c2 = adapter.getCircuitBreaker('reset-all-2');
      c1.transitionTo(CIRCUIT_STATES.OPEN);
      c2.transitionTo(CIRCUIT_STATES.OPEN);

      adapter.resetAllCircuitBreakers();

      expect(c1.state).to.equal(CIRCUIT_STATES.CLOSED);
      expect(c2.state).to.equal(CIRCUIT_STATES.CLOSED);
    });
  });

  describe('Message Formatting', function() {
    it('should format messages for Anthropic', function() {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' }
      ];

      const formatted = adapter.formatMessagesForAnthropic(messages);

      expect(formatted).to.have.length(2);
      expect(formatted[0].role).to.equal('user');
      expect(formatted[1].role).to.equal('assistant');
    });

    it('should format messages for OpenAI', function() {
      const messages = [{ role: 'user', content: 'Hello' }];
      const system = 'You are a helpful assistant';

      const formatted = adapter.formatMessagesForOpenAI(messages, system);

      expect(formatted[0].role).to.equal('system');
      expect(formatted[0].content).to.equal(system);
      expect(formatted[1].role).to.equal('user');
    });

    it('should format tools for Anthropic', function() {
      const tools = [{
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } }
      }];

      const formatted = adapter.formatToolsForAnthropic(tools);

      expect(formatted[0].name).to.equal('read_file');
      expect(formatted[0].input_schema).to.exist;
    });

    it('should format tools for OpenAI', function() {
      const tools = [{
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } }
      }];

      const formatted = adapter.formatToolsForOpenAI(tools);

      expect(formatted[0].type).to.equal('function');
      expect(formatted[0].function.name).to.equal('read_file');
    });
  });

  describe('Response Extraction', function() {
    it('should extract text content from Anthropic response', function() {
      const response = {
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'World' }
        ]
      };

      const content = adapter.extractAnthropicContent(response);

      expect(content).to.equal('Hello World');
    });

    it('should extract tool calls from Anthropic response', function() {
      const response = {
        content: [
          { type: 'text', text: 'Using tool' },
          { type: 'tool_use', id: 'tool1', name: 'read_file', input: { path: '/test' } }
        ]
      };

      const toolCalls = adapter.extractAnthropicToolCalls(response);

      expect(toolCalls).to.have.length(1);
      expect(toolCalls[0].name).to.equal('read_file');
      expect(toolCalls[0].arguments.path).to.equal('/test');
    });
  });

  describe('Retryable Error Detection', function() {
    it('should identify 429 as retryable', function() {
      expect(adapter.isRetryableError({ status: 429 })).to.be.true;
    });

    it('should identify 5xx as retryable', function() {
      expect(adapter.isRetryableError({ status: 500 })).to.be.true;
      expect(adapter.isRetryableError({ status: 502 })).to.be.true;
      expect(adapter.isRetryableError({ status: 503 })).to.be.true;
    });

    it('should identify network errors as retryable', function() {
      expect(adapter.isRetryableError({ code: 'ECONNRESET' })).to.be.true;
      expect(adapter.isRetryableError({ code: 'ETIMEDOUT' })).to.be.true;
    });

    it('should identify overloaded as retryable', function() {
      expect(adapter.isRetryableError({ message: 'API is overloaded' })).to.be.true;
    });

    it('should not identify 4xx (except 429) as retryable', function() {
      expect(adapter.isRetryableError({ status: 400 })).to.be.false;
      expect(adapter.isRetryableError({ status: 401 })).to.be.false;
      expect(adapter.isRetryableError({ status: 404 })).to.be.false;
    });
  });
});

describe('Context Limits', function() {
  it('should have limits for Claude models', function() {
    expect(CONTEXT_LIMITS['claude-3-opus-20240229']).to.equal(200000);
    expect(CONTEXT_LIMITS['claude-3-sonnet-20240229']).to.equal(200000);
    expect(CONTEXT_LIMITS['claude-3-haiku-20240307']).to.equal(200000);
  });

  it('should have limits for OpenAI models', function() {
    expect(CONTEXT_LIMITS['gpt-4-turbo']).to.equal(128000);
    expect(CONTEXT_LIMITS['gpt-4o']).to.equal(128000);
  });

  it('should have default limit', function() {
    expect(CONTEXT_LIMITS['default']).to.equal(100000);
  });
});
