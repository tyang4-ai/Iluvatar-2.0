/**
 * ILUVATAR 2.0 - JSON Validator Unit Tests
 *
 * Tests JSON parsing with progressive repair strategies and schema validation
 * Validates circuit breaker pattern for handling repeated failures
 */

const { expect } = require('chai');
const sinon = require('sinon');
const {
  JSONValidator,
  CircuitBreaker,
  CircuitBreakerRegistry,
  SchemaValidator,
  CircuitOpenError,
  JSONValidationError,
  CIRCUIT_STATES,
  AGENT_SCHEMAS
} = require('../../core/json-validator');

describe('JSON Validator', function() {
  let validator;

  beforeEach(function() {
    validator = new JSONValidator();
  });

  describe('Direct JSON Parsing', function() {
    it('should parse valid JSON directly', async function() {
      const validJson = '{"name": "test", "value": 42}';
      const result = await validator.parseWithRetry(validJson);

      expect(result).to.deep.equal({ name: 'test', value: 42 });
      expect(validator.stats.directParse).to.equal(1);
    });

    it('should parse valid JSON array', async function() {
      const validJson = '[1, 2, 3, "four"]';
      const result = await validator.parseWithRetry(validJson);

      expect(result).to.deep.equal([1, 2, 3, 'four']);
    });

    it('should handle nested objects', async function() {
      const nested = '{"outer": {"inner": {"deep": true}}}';
      const result = await validator.parseWithRetry(nested);

      expect(result.outer.inner.deep).to.equal(true);
    });
  });

  describe('Markdown Extraction', function() {
    it('should extract JSON from ```json code blocks', async function() {
      const markdown = `Here is the response:
\`\`\`json
{"extracted": true}
\`\`\`
End of response.`;

      const result = await validator.parseWithRetry(markdown);
      expect(result).to.deep.equal({ extracted: true });
      expect(validator.stats.extractedFromMarkdown).to.equal(1);
    });

    it('should extract JSON from generic ``` code blocks', async function() {
      const markdown = `Response:
\`\`\`
{"from_generic": "block"}
\`\`\``;

      const result = await validator.parseWithRetry(markdown);
      expect(result).to.deep.equal({ from_generic: 'block' });
    });

    it('should find raw JSON object in text', async function() {
      const mixed = 'Some text before {"found": "json"} and after';

      const result = await validator.parseWithRetry(mixed);
      expect(result).to.deep.equal({ found: 'json' });
    });

    it('should find raw JSON array in text', async function() {
      const mixed = 'Array here: [1, 2, 3] rest of text';

      const result = await validator.parseWithRetry(mixed);
      expect(result).to.deep.equal([1, 2, 3]);
    });
  });

  describe('JSON Cleaning', function() {
    it('should remove trailing commas', async function() {
      const withTrailing = '{"key": "value",}';
      const result = await validator.parseWithRetry(withTrailing);

      expect(result).to.deep.equal({ key: 'value' });
      expect(validator.stats.cleanedParse).to.equal(1);
    });

    it('should remove single-line comments', async function() {
      const withComments = `{
        "key": "value" // this is a comment
      }`;
      const result = await validator.parseWithRetry(withComments);

      expect(result).to.deep.equal({ key: 'value' });
    });

    it('should remove multi-line comments', async function() {
      const withComments = `{
        /* this is a
           multi-line comment */
        "key": "value"
      }`;
      const result = await validator.parseWithRetry(withComments);

      expect(result).to.deep.equal({ key: 'value' });
    });

    it('should fix unquoted keys', async function() {
      const unquoted = '{unquoted_key: "value"}';
      const result = await validator.parseWithRetry(unquoted);

      expect(result).to.deep.equal({ unquoted_key: 'value' });
    });

    it('should remove BOM character', async function() {
      const withBom = '\uFEFF{"clean": true}';
      const result = await validator.parseWithRetry(withBom);

      expect(result).to.deep.equal({ clean: true });
    });
  });

  describe('Error Handling', function() {
    it('should throw JSONValidationError for invalid JSON', async function() {
      const invalid = 'this is not json at all';

      try {
        await validator.parseWithRetry(invalid);
        expect.fail('Should have thrown JSONValidationError');
      } catch (error) {
        expect(error).to.be.instanceOf(JSONValidationError);
        expect(error.rawOutput).to.equal(invalid);
        expect(validator.stats.failed).to.equal(1);
      }
    });

    it('should emit failed event on parse failure', async function() {
      const failed = sinon.spy();
      validator.on('failed', failed);

      try {
        await validator.parseWithRetry('not json', { agent: 'test-agent' });
      } catch (e) {
        // Expected
      }

      expect(failed.calledOnce).to.be.true;
      expect(failed.firstCall.args[0].agent).to.equal('test-agent');
    });

    it('should emit parsed event on success', async function() {
      const parsed = sinon.spy();
      validator.on('parsed', parsed);

      await validator.parseWithRetry('{"valid": true}', { agent: 'test-agent' });

      expect(parsed.calledOnce).to.be.true;
      expect(parsed.firstCall.args[0].strategy).to.equal('direct');
    });
  });

  describe('Statistics', function() {
    it('should track parsing statistics', async function() {
      await validator.parseWithRetry('{"direct": true}');
      await validator.parseWithRetry('```json\n{"markdown": true}\n```');
      await validator.parseWithRetry('{trailing: "comma",}');

      const stats = validator.getStats();

      expect(stats.directParse).to.equal(1);
      expect(stats.extractedFromMarkdown).to.equal(1);
      expect(stats.cleanedParse).to.equal(1);
      expect(stats.total).to.equal(3);
    });

    it('should calculate success rate', async function() {
      await validator.parseWithRetry('{"success": true}');
      try { await validator.parseWithRetry('invalid'); } catch (e) {}
      await validator.parseWithRetry('{"success": true}');

      const stats = validator.getStats();

      expect(stats.successRate).to.equal('66.67%');
    });

    it('should reset statistics', function() {
      validator.stats.directParse = 10;
      validator.stats.failed = 5;

      validator.resetStats();

      expect(validator.stats.directParse).to.equal(0);
      expect(validator.stats.failed).to.equal(0);
    });
  });
});

describe('Schema Validator', function() {
  let schemaValidator;

  beforeEach(function() {
    schemaValidator = new SchemaValidator();
  });

  describe('Built-in Agent Schemas', function() {
    it('should validate valid Gandalf output', function() {
      const gandalfOutput = {
        ideas: [
          { title: 'Idea 1', description: 'Description 1' },
          { title: 'Idea 2', description: 'Description 2' }
        ],
        recommended_idea_index: 0,
        platform_recommendation: {
          platform: 'web',
          reasoning: 'Best for hackathon'
        }
      };

      const result = schemaValidator.validate(gandalfOutput, 'gandalf');

      expect(result.valid).to.be.true;
      expect(result.errors).to.be.empty;
    });

    it('should reject invalid Gandalf output - missing required fields', function() {
      const invalidOutput = {
        ideas: []
      };

      const result = schemaValidator.validate(invalidOutput, 'gandalf');

      expect(result.valid).to.be.false;
      expect(result.errors.length).to.be.greaterThan(0);
    });

    it('should validate valid Denethor output', function() {
      const denethorOutput = {
        backend_work_queue: [
          { file_path: 'src/api.js', priority: 1 }
        ],
        frontend_work_queue: [
          { file_path: 'src/App.tsx', priority: 1 }
        ],
        backend_clones: 2,
        frontend_clones: 2
      };

      const result = schemaValidator.validate(denethorOutput, 'denethor');

      expect(result.valid).to.be.true;
    });

    it('should reject Denethor output with invalid clone count', function() {
      const invalidOutput = {
        backend_work_queue: [],
        frontend_work_queue: [],
        backend_clones: 0, // Must be >= 1
        frontend_clones: 1
      };

      const result = schemaValidator.validate(invalidOutput, 'denethor');

      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.path.includes('backend_clones'))).to.be.true;
    });

    it('should validate valid Gimli output', function() {
      const gimliOutput = {
        file_path: 'src/server.js',
        content: 'const express = require("express");'
      };

      const result = schemaValidator.validate(gimliOutput, 'gimli');

      expect(result.valid).to.be.true;
    });
  });

  describe('Custom Schemas', function() {
    it('should add and validate custom schema', function() {
      const customSchema = {
        type: 'object',
        required: ['custom_field'],
        properties: {
          custom_field: { type: 'string', minLength: 1 }
        }
      };

      schemaValidator.addSchema('custom', customSchema);

      expect(schemaValidator.hasSchema('custom')).to.be.true;

      const result = schemaValidator.validate({ custom_field: 'test' }, 'custom');
      expect(result.valid).to.be.true;
    });

    it('should skip validation for unknown schemas', function() {
      const result = schemaValidator.validate({ any: 'data' }, 'unknown_agent');

      expect(result.valid).to.be.true;
      expect(result.skipped).to.be.true;
    });
  });

  describe('Type Validation', function() {
    beforeEach(function() {
      schemaValidator.addSchema('test', {
        type: 'object',
        properties: {
          stringField: { type: 'string', minLength: 2 },
          numberField: { type: 'number', minimum: 0, maximum: 100 },
          boolField: { type: 'boolean' },
          arrayField: { type: 'array', minItems: 1 }
        }
      });
    });

    it('should validate string types', function() {
      const result = schemaValidator.validate({ stringField: 'valid' }, 'test');
      expect(result.valid).to.be.true;
    });

    it('should reject string with minLength violation', function() {
      const result = schemaValidator.validate({ stringField: 'x' }, 'test');
      expect(result.valid).to.be.false;
    });

    it('should validate number range', function() {
      const valid = schemaValidator.validate({ numberField: 50 }, 'test');
      expect(valid.valid).to.be.true;

      const tooLow = schemaValidator.validate({ numberField: -1 }, 'test');
      expect(tooLow.valid).to.be.false;

      const tooHigh = schemaValidator.validate({ numberField: 101 }, 'test');
      expect(tooHigh.valid).to.be.false;
    });

    it('should validate boolean types', function() {
      const valid = schemaValidator.validate({ boolField: true }, 'test');
      expect(valid.valid).to.be.true;

      const invalid = schemaValidator.validate({ boolField: 'true' }, 'test');
      expect(invalid.valid).to.be.false;
    });

    it('should validate array minItems', function() {
      const valid = schemaValidator.validate({ arrayField: [1] }, 'test');
      expect(valid.valid).to.be.true;

      const invalid = schemaValidator.validate({ arrayField: [] }, 'test');
      expect(invalid.valid).to.be.false;
    });
  });
});

describe('Circuit Breaker', function() {
  let circuit;

  beforeEach(function() {
    circuit = new CircuitBreaker({
      id: 'test-circuit',
      threshold: 3,
      resetTimeout: 100 // 100ms for faster tests
    });
  });

  describe('Initial State', function() {
    it('should start in CLOSED state', function() {
      expect(circuit.state).to.equal(CIRCUIT_STATES.CLOSED);
    });

    it('should have zero failures', function() {
      expect(circuit.failures).to.equal(0);
    });

    it('should report correct state', function() {
      const state = circuit.getState();

      expect(state.id).to.equal('test-circuit');
      expect(state.state).to.equal(CIRCUIT_STATES.CLOSED);
      expect(state.failures).to.equal(0);
      expect(state.threshold).to.equal(3);
    });
  });

  describe('Success Tracking', function() {
    it('should reset failure count on success', function() {
      circuit.recordFailure(new Error('test'));
      circuit.recordFailure(new Error('test'));
      expect(circuit.failures).to.equal(2);

      circuit.recordSuccess();

      expect(circuit.failures).to.equal(0);
    });

    it('should execute successful function', async function() {
      const result = await circuit.execute(async () => 'success');

      expect(result).to.equal('success');
      expect(circuit.successes).to.equal(1);
    });
  });

  describe('Failure Tracking', function() {
    it('should increment failure count', function() {
      circuit.recordFailure(new Error('test 1'));
      circuit.recordFailure(new Error('test 2'));

      expect(circuit.failures).to.equal(2);
    });

    it('should record last failure details', function() {
      circuit.recordFailure(new Error('specific error'), { agent: 'test-agent' });

      expect(circuit.lastFailure.error).to.equal('specific error');
      expect(circuit.lastFailure.context.agent).to.equal('test-agent');
    });

    it('should emit failure event', function() {
      const failureSpy = sinon.spy();
      circuit.on('failure', failureSpy);

      circuit.recordFailure(new Error('test'));

      expect(failureSpy.calledOnce).to.be.true;
    });
  });

  describe('Circuit Trip', function() {
    it('should trip after threshold failures', function() {
      circuit.recordFailure(new Error('1'));
      circuit.recordFailure(new Error('2'));
      expect(circuit.state).to.equal(CIRCUIT_STATES.CLOSED);

      circuit.recordFailure(new Error('3')); // Threshold reached

      expect(circuit.state).to.equal(CIRCUIT_STATES.OPEN);
    });

    it('should emit trip event', function() {
      const tripSpy = sinon.spy();
      circuit.on('trip', tripSpy);

      circuit.recordFailure(new Error('1'));
      circuit.recordFailure(new Error('2'));
      circuit.recordFailure(new Error('3'));

      expect(tripSpy.calledOnce).to.be.true;
    });

    it('should throw CircuitOpenError when open', async function() {
      // Trip the circuit
      circuit.transitionTo(CIRCUIT_STATES.OPEN);

      try {
        await circuit.execute(async () => 'test');
        expect.fail('Should have thrown CircuitOpenError');
      } catch (error) {
        expect(error).to.be.instanceOf(CircuitOpenError);
        expect(error.circuitId).to.equal('test-circuit');
      }
    });
  });

  describe('Half-Open State', function() {
    it('should transition to HALF_OPEN after timeout', async function() {
      circuit.transitionTo(CIRCUIT_STATES.OPEN);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      try {
        await circuit.execute(async () => 'test');
      } catch (e) {
        // May fail but should have transitioned
      }

      expect(circuit.state).to.be.oneOf([CIRCUIT_STATES.HALF_OPEN, CIRCUIT_STATES.CLOSED]);
    });

    it('should close circuit on success in HALF_OPEN', async function() {
      circuit.transitionTo(CIRCUIT_STATES.HALF_OPEN);

      await circuit.execute(async () => 'success');

      expect(circuit.state).to.equal(CIRCUIT_STATES.CLOSED);
    });

    it('should reopen circuit on failure in HALF_OPEN', function() {
      circuit.transitionTo(CIRCUIT_STATES.HALF_OPEN);

      circuit.recordFailure(new Error('test'));

      expect(circuit.state).to.equal(CIRCUIT_STATES.OPEN);
    });

    it('should emit recovered event when closing from HALF_OPEN', function() {
      const recoveredSpy = sinon.spy();
      circuit.on('recovered', recoveredSpy);

      circuit.transitionTo(CIRCUIT_STATES.HALF_OPEN);
      circuit.recordSuccess();

      expect(recoveredSpy.calledOnce).to.be.true;
    });
  });

  describe('Manual Reset', function() {
    it('should reset to CLOSED state', function() {
      circuit.transitionTo(CIRCUIT_STATES.OPEN);
      circuit.failures = 10;

      circuit.reset();

      expect(circuit.state).to.equal(CIRCUIT_STATES.CLOSED);
      expect(circuit.failures).to.equal(0);
    });

    it('should emit reset event', function() {
      const resetSpy = sinon.spy();
      circuit.on('reset', resetSpy);

      circuit.reset();

      expect(resetSpy.calledOnce).to.be.true;
    });
  });

  describe('State Transitions', function() {
    it('should emit stateChange event', function() {
      const changeSpy = sinon.spy();
      circuit.on('stateChange', changeSpy);

      circuit.transitionTo(CIRCUIT_STATES.OPEN);

      expect(changeSpy.calledOnce).to.be.true;
      expect(changeSpy.firstCall.args[0].from).to.equal(CIRCUIT_STATES.CLOSED);
      expect(changeSpy.firstCall.args[0].to).to.equal(CIRCUIT_STATES.OPEN);
    });
  });
});

describe('Circuit Breaker Registry', function() {
  let registry;

  beforeEach(function() {
    registry = new CircuitBreakerRegistry({
      threshold: 3,
      resetTimeout: 60000
    });
  });

  it('should create new circuits on demand', function() {
    const circuit1 = registry.getCircuit('agent1');
    const circuit2 = registry.getCircuit('agent2');

    expect(circuit1.id).to.equal('agent1');
    expect(circuit2.id).to.equal('agent2');
    expect(circuit1).to.not.equal(circuit2);
  });

  it('should return same circuit for same id', function() {
    const first = registry.getCircuit('same');
    const second = registry.getCircuit('same');

    expect(first).to.equal(second);
  });

  it('should get all circuit states', function() {
    registry.getCircuit('a');
    registry.getCircuit('b');

    const states = registry.getAllStates();

    expect(Object.keys(states)).to.include('a');
    expect(Object.keys(states)).to.include('b');
  });

  it('should reset all circuits', function() {
    const c1 = registry.getCircuit('c1');
    const c2 = registry.getCircuit('c2');

    c1.transitionTo(CIRCUIT_STATES.OPEN);
    c2.transitionTo(CIRCUIT_STATES.OPEN);

    registry.resetAll();

    expect(c1.state).to.equal(CIRCUIT_STATES.CLOSED);
    expect(c2.state).to.equal(CIRCUIT_STATES.CLOSED);
  });

  it('should get open circuits', function() {
    const c1 = registry.getCircuit('open1');
    const c2 = registry.getCircuit('closed1');
    const c3 = registry.getCircuit('open2');

    c1.transitionTo(CIRCUIT_STATES.OPEN);
    c3.transitionTo(CIRCUIT_STATES.OPEN);

    const openCircuits = registry.getOpenCircuits();

    expect(openCircuits.length).to.equal(2);
    expect(openCircuits.map(c => c.id)).to.include('open1');
    expect(openCircuits.map(c => c.id)).to.include('open2');
  });
});

describe('Integrated JSON Validation with Schema', function() {
  let validator;

  beforeEach(function() {
    validator = new JSONValidator();
  });

  it('should parse and validate in one step', async function() {
    const gandalfJson = JSON.stringify({
      ideas: [{ title: 'Test', description: 'Test idea' }],
      recommended_idea_index: 0,
      platform_recommendation: { platform: 'web' }
    });

    const result = await validator.parseAndValidate(gandalfJson, 'gandalf');

    expect(result.ideas).to.have.length(1);
    expect(validator.stats.schemaValidated).to.equal(1);
  });

  it('should throw on schema validation failure', async function() {
    const invalidGandalf = JSON.stringify({
      ideas: [] // Empty array, violates minItems
    });

    try {
      await validator.parseAndValidate(invalidGandalf, 'gandalf');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(JSONValidationError);
      expect(error.schemaErrors).to.exist;
    }
  });

  it('should emit schemaValidationFailed event', async function() {
    const failedSpy = sinon.spy();
    validator.on('schemaValidationFailed', failedSpy);

    try {
      await validator.parseAndValidate('{"ideas": []}', 'gandalf');
    } catch (e) {}

    expect(failedSpy.calledOnce).to.be.true;
  });
});
