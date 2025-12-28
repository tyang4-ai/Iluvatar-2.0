# Skill: Add Tests

This guide explains the testing patterns used in the ILUVATAR system.

## Overview

The project uses Mocha + Chai for testing with four test categories:
- **Unit tests**: Isolated module testing with mocks
- **Integration tests**: Full pipeline with real connections
- **Chaos tests**: Failure injection and recovery
- **E2E tests**: End-to-end user flows

## Test Location

```
tests/
├── unit/           # Isolated tests with mocks
├── integration/    # Full pipeline tests
├── chaos/          # Failure injection tests
└── e2e/            # End-to-end tests
```

## Running Tests

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:e2e      # E2E tests (5 min timeout)
npm run test:chaos    # Chaos tests (5 min timeout)
```

## Unit Test Pattern

Unit tests mock external dependencies (Redis, APIs) and test in isolation.

### Template

```javascript
/**
 * ILUVATAR 2.0 - [Module Name] Tests
 *
 * Tests [what this test file covers]
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { YourModule } = require('../../core/your-module');

describe('YourModule', function() {
  let module;
  let redisMock;

  beforeEach(function() {
    // Create mocks
    redisMock = {
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub(),
      hget: sinon.stub(),
      hset: sinon.stub(),
      publish: sinon.stub(),
      subscribe: sinon.stub()
    };

    // Initialize module with mocks
    module = new YourModule({ redis: redisMock });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('methodName', function() {
    it('should return expected result', async function() {
      // Arrange
      redisMock.get.resolves('stored-value');

      // Act
      const result = await module.methodName('input');

      // Assert
      expect(result).to.equal('expected');
      expect(redisMock.get.calledWith('expected-key')).to.be.true;
    });

    it('should throw on invalid input', async function() {
      try {
        await module.methodName(null);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).to.include('Invalid input');
      }
    });
  });
});
```

### Example: State Manager Test

```javascript
describe('State Manager', function() {
  describe('Read Operations', function() {
    it('should read all state keys', async function() {
      redisMock.multi.returns({
        get: sinon.stub().returnsThis(),
        hgetall: sinon.stub().returnsThis(),
        exec: sinon.stub().resolves([
          [null, '5'],  // version
          [null, { key1: 'value1', key2: 'value2' }]  // data
        ])
      });

      const result = await stateManager.read('agent-1', ['*']);

      expect(result.version).to.equal(5);
      expect(result.data).to.deep.equal({ key1: 'value1', key2: 'value2' });
    });
  });
});
```

## Integration Test Pattern

Integration tests use real Redis/PostgreSQL connections.

### Template

```javascript
/**
 * ILUVATAR 2.0 - [Feature] Integration Tests
 *
 * Tests [full workflow or feature]
 * NOTE: Requires running Redis/PostgreSQL.
 */

const { expect } = require('chai');
const Redis = require('ioredis');
const { StateManager } = require('../../core/state-manager');
const { MessageBus } = require('../../core/message-bus');

describe('Full Pipeline', function() {
  let redis;
  let stateManager;
  let messageBus;
  let available = false;

  before(async function() {
    try {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        connectTimeout: 3000
      });

      await redis.ping();
      available = true;

      stateManager = new StateManager(redis);
      messageBus = new MessageBus(redis);

      // Clear state
      await redis.flushall();
    } catch (err) {
      console.log('⚠️ Skipping - Redis not available');
      available = false;
    }
  });

  after(async function() {
    if (redis) await redis.quit();
  });

  beforeEach(function() {
    if (!available) this.skip();
  });

  it('should handle agent handoff', async function() {
    // Set initial state
    await stateManager.update('agent-1', { step: 'ideation' }, 0);

    // Simulate agent 1 completing
    await messageBus.publish('agent:agent-2', {
      from: 'agent-1',
      type: 'handoff',
      payload: { ideas: [{ title: 'Idea 1' }] }
    });

    // Verify state updated
    const { data } = await stateManager.read('agent-2', ['step']);
    expect(data.step).to.equal('ideation');
  });
});
```

## Chaos Test Pattern

Chaos tests inject failures to verify recovery mechanisms.

### Template

```javascript
/**
 * ILUVATAR 2.0 - Chaos Tests
 *
 * Tests failure injection and recovery
 */

const { expect } = require('chai');
const sinon = require('sinon');

describe('Agent Failure Recovery', function() {
  this.timeout(30000);  // Allow time for retries

  it('should retry on transient API failure', async function() {
    const apiCall = sinon.stub();

    // Fail twice, then succeed
    apiCall.onFirstCall().rejects(new Error('Rate limited'));
    apiCall.onSecondCall().rejects(new Error('Rate limited'));
    apiCall.onThirdCall().resolves({ success: true });

    const result = await retryWithBackoff(apiCall, { maxRetries: 3 });

    expect(result.success).to.be.true;
    expect(apiCall.callCount).to.equal(3);
  });

  it('should escalate after max retries', async function() {
    const apiCall = sinon.stub().rejects(new Error('Permanent failure'));
    const escalate = sinon.stub();

    try {
      await retryWithBackoff(apiCall, {
        maxRetries: 3,
        onMaxRetries: escalate
      });
    } catch (err) {
      expect(escalate.calledOnce).to.be.true;
    }
  });

  it('should recover state after container restart', async function() {
    // Simulate checkpoint
    await checkpointSystem.save('agent-1', { step: 'coding', progress: 50 });

    // Simulate container restart (new instance)
    const newInstance = new CheckpointSystem(redis);

    // Verify recovery
    const recovered = await newInstance.recover('agent-1');
    expect(recovered.step).to.equal('coding');
    expect(recovered.progress).to.equal(50);
  });
});
```

## Test Utilities

### Mock Message Bus

```javascript
function createMockMessageBus() {
  const messages = [];
  return {
    publish: sinon.stub().callsFake((channel, msg) => {
      messages.push({ channel, msg });
    }),
    getMessages: () => messages,
    clear: () => messages.length = 0
  };
}
```

### Mock Redis

```javascript
function createMockRedis() {
  const store = new Map();
  return {
    get: sinon.stub().callsFake(key => store.get(key)),
    set: sinon.stub().callsFake((key, val) => store.set(key, val)),
    del: sinon.stub().callsFake(key => store.delete(key)),
    hget: sinon.stub(),
    hset: sinon.stub(),
    publish: sinon.stub(),
    subscribe: sinon.stub()
  };
}
```

## Assertions

Common Chai assertions:

```javascript
// Equality
expect(result).to.equal('value');
expect(obj).to.deep.equal({ key: 'value' });

// Truthiness
expect(result).to.be.true;
expect(result).to.be.false;
expect(result).to.be.null;
expect(result).to.exist;

// Arrays/Objects
expect(array).to.have.lengthOf(3);
expect(array).to.include('item');
expect(obj).to.have.property('key');
expect(obj).to.have.property('key', 'value');

// Errors
expect(() => fn()).to.throw('message');
expect(promise).to.be.rejectedWith('message');

// Sinon spies
expect(spy.calledOnce).to.be.true;
expect(spy.calledWith('arg')).to.be.true;
expect(spy.callCount).to.equal(3);
```

## Checklist

- [ ] Test file created in appropriate directory
- [ ] JSDoc header with description
- [ ] beforeEach/afterEach for setup/teardown
- [ ] Mocks created for external dependencies
- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases tested
- [ ] Tests pass: `npm test`
