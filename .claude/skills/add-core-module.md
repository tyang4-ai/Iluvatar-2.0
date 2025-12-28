# Skill: Add a Core Module

This guide explains how to add a shared core module to the ILUVATAR system.

## Overview

Core modules are shared utilities used across the orchestrator and agents. They live in `/iluvatar-2.0/core/` and handle:
- State management
- Logging
- Message passing
- Error handling
- Checkpoints

## Existing Core Modules

| Module | Purpose |
|--------|---------|
| `state-manager.js` | Redis state with optimistic locking |
| `message-bus.js` | Agent-to-agent pub/sub |
| `logging.js` | Structured logging with trace IDs |
| `checkpoint-system.js` | Human approval workflow |
| `error-handler.js` | Error recovery and escalation |
| `event-dispatcher.js` | Event routing |
| `budget-tracker.js` | API cost tracking |
| `time-tracker.js` | Velocity and timing metrics |

## Step 1: Create the Module File

Create a new file in `/iluvatar-2.0/core/`:

```javascript
/**
 * ILUVATAR 2.0 - [Module Name]
 *
 * [Brief description of what this module does]
 * [Key features or integration points]
 */

const Redis = require('ioredis');

class YourModule {
  constructor(options = {}) {
    this.redis = options.redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });
  }

  /**
   * [Method description]
   * @param {string} param1 - Description
   * @returns {Promise<Object>} Description
   */
  async methodName(param1) {
    // Implementation
  }
}

module.exports = { YourModule };
```

## Step 2: Follow Existing Patterns

### Pattern: Optimistic Locking (from state-manager.js)

```javascript
async update(agentId, changes, expectedVersion) {
  const lockKey = 'state:write_lock';
  const lockValue = `${agentId}:${Date.now()}`;

  // Try to acquire lock
  const acquired = await this.redis.set(lockKey, lockValue, 'NX', 'PX', 5000);
  if (!acquired) {
    throw new ConflictError('State is locked by another agent');
  }

  try {
    // Check version
    const currentVersion = parseInt(await this.redis.get('state:version')) || 0;
    if (currentVersion !== expectedVersion) {
      throw new ConflictError('State has been modified');
    }

    // Apply changes
    // ...

    // Increment version
    await this.redis.incr('state:version');
  } finally {
    await this.redis.del(lockKey);
  }
}
```

### Pattern: Structured Logging (from logging.js)

```javascript
log(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    trace_id: context.trace_id || this.defaultTraceId,
    agent: context.agent,
    ...context
  };

  console.log(JSON.stringify(entry));

  // Also write to Redis for persistence
  this.redis.lpush('logs', JSON.stringify(entry));
}
```

### Pattern: Pub/Sub Messaging (from message-bus.js)

```javascript
async publish(channel, message) {
  await this.redis.publish(channel, JSON.stringify({
    timestamp: new Date().toISOString(),
    ...message
  }));
}

async subscribe(channel, callback) {
  const subscriber = this.redis.duplicate();
  await subscriber.subscribe(channel);

  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      callback(JSON.parse(message));
    }
  });

  return subscriber;
}
```

## Step 3: Add Unit Tests

Create a corresponding test file in `/iluvatar-2.0/tests/unit/`:

```javascript
/**
 * ILUVATAR 2.0 - [Module Name] Tests
 *
 * Tests [module functionality]
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { YourModule } = require('../../core/your-module');

describe('YourModule', function() {
  let module;
  let redisMock;

  beforeEach(function() {
    redisMock = {
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub()
    };

    module = new YourModule({ redis: redisMock });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('methodName', function() {
    it('should [expected behavior]', async function() {
      redisMock.get.resolves('value');

      const result = await module.methodName('param');

      expect(result).to.equal('expected');
      expect(redisMock.get.calledOnce).to.be.true;
    });

    it('should handle errors gracefully', async function() {
      redisMock.get.rejects(new Error('Connection failed'));

      try {
        await module.methodName('param');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err.message).to.include('Connection failed');
      }
    });
  });
});
```

## Step 4: Export from Index (if applicable)

If the module should be easily importable, add to an index:

```javascript
// core/index.js
const { StateManager } = require('./state-manager');
const { MessageBus } = require('./message-bus');
const { YourModule } = require('./your-module');

module.exports = {
  StateManager,
  MessageBus,
  YourModule
};
```

## Step 5: Use in Orchestrator

Import and use in the orchestrator:

```javascript
// orchestrator/index.js
const { YourModule } = require('../core/your-module');

const yourModule = new YourModule();
await yourModule.methodName('param');
```

## Integration with n8n

If the module needs to be called from n8n workflows, expose via the orchestrator's Express API:

```javascript
// orchestrator/index.js
app.post('/api/your-module', async (req, res) => {
  try {
    const result = await yourModule.methodName(req.body.param);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

## Checklist

- [ ] Module file created with JSDoc header
- [ ] Follows existing patterns (locking, logging, pub/sub)
- [ ] Unit tests added in `/tests/unit/`
- [ ] Exported if needed
- [ ] Used in orchestrator
- [ ] API endpoint if needed for n8n
- [ ] Tests pass: `npm run test:unit`
