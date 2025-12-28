/**
 * ILUVATAR 2.0 - Message Bus Unit Tests
 *
 * Tests Redis pub/sub messaging, channel routing, and error handling
 */

const { expect } = require('chai');
const sinon = require('sinon');
const Redis = require('ioredis');

// Create a single subscriber mock that gets reused
const mockSubscriber = {
  subscribe: sinon.stub().resolves(),
  unsubscribe: sinon.stub().resolves(),
  on: sinon.stub(),
  quit: sinon.stub().resolves()
};

// Mock Redis before requiring MessageBus
const mockRedis = {
  publish: sinon.stub().resolves(1),
  lpush: sinon.stub().resolves(1),
  lrange: sinon.stub().resolves([]),
  lrem: sinon.stub().resolves(1),
  zadd: sinon.stub().resolves(1),
  zcard: sinon.stub().resolves(0),
  zrevrange: sinon.stub().resolves([]),
  zremrangebyscore: sinon.stub().resolves(0),
  hincrby: sinon.stub().resolves(1),
  hgetall: sinon.stub().resolves({}),
  subscribe: sinon.stub().resolves(),
  unsubscribe: sinon.stub().resolves(),
  on: sinon.stub(),
  duplicate: sinon.stub().returns(mockSubscriber),
  quit: sinon.stub().resolves()
};

// Stub the Redis constructor
const RedisStub = sinon.stub().returns(mockRedis);

describe('MessageBus Unit Tests', function() {
  let MessageBus;
  let messageBus;

  before(function() {
    // Clear require cache and stub Redis
    delete require.cache[require.resolve('../../core/message-bus')];
  });

  beforeEach(function() {
    // Reset all Redis stubs completely
    Object.values(mockRedis).forEach(stub => {
      if (stub.reset) stub.reset();
    });

    // Reset all subscriber stubs completely
    Object.values(mockSubscriber).forEach(stub => {
      if (stub.reset) stub.reset();
    });

    // Re-configure stub return values (must be done after reset)
    mockRedis.publish.resolves(1);
    mockRedis.lpush.resolves(1);
    mockRedis.lrange.resolves([]);
    mockRedis.lrem.resolves(1);
    mockRedis.zadd.resolves(1);
    mockRedis.zcard.resolves(0);
    mockRedis.zrevrange.resolves([]);
    mockRedis.zremrangebyscore.resolves(0);
    mockRedis.hincrby.resolves(1);
    mockRedis.hgetall.resolves({});
    mockRedis.quit.resolves();
    mockRedis.duplicate.returns(mockSubscriber);

    mockSubscriber.subscribe.resolves();
    mockSubscriber.unsubscribe.resolves();
    mockSubscriber.quit.resolves();

    // Create MessageBus with mock Redis
    const { MessageBus: MB } = require('../../core/message-bus');
    MessageBus = MB;
    messageBus = new MessageBus(mockRedis);
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('Constructor', function() {
    it('should initialize with default Redis settings', function() {
      expect(messageBus.redis).to.equal(mockRedis);
      expect(messageBus.subscriptions).to.be.instanceOf(Map);
    });

    it('should use provided Redis client', function() {
      const customSubscriber = {
        subscribe: sinon.stub().resolves(),
        unsubscribe: sinon.stub().resolves(),
        on: sinon.stub(),
        quit: sinon.stub().resolves()
      };
      const customRedis = {
        custom: true,
        duplicate: sinon.stub().returns(customSubscriber)
      };
      const bus = new MessageBus(customRedis);
      expect(bus.redis).to.equal(customRedis);
    });
  });

  describe('publish()', function() {
    it('should publish message to correct agent channel', async function() {
      const message = {
        from: 'Gandalf',
        to: 'Radagast',
        type: 'ideation_complete',
        payload: { ideas: ['idea1', 'idea2'] }
      };

      mockRedis.publish.resolves(1);
      mockRedis.lpush.resolves(1);
      mockRedis.zadd.resolves(1);
      mockRedis.hincrby.resolves(1);

      const messageId = await messageBus.publish(message);

      expect(messageId).to.be.a('string');
      expect(mockRedis.publish.calledOnce).to.be.true;
      expect(mockRedis.publish.firstCall.args[0]).to.equal('agent:Radagast');
    });

    it('should add timestamp and id to message', async function() {
      const message = {
        from: 'Gimli',
        to: 'Elrond',
        type: 'review_request',
        payload: { file: 'api.py' }
      };

      mockRedis.publish.resolves(1);

      await messageBus.publish(message);

      const publishedMessage = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(publishedMessage).to.have.property('timestamp');
      expect(publishedMessage).to.have.property('id');
      expect(publishedMessage.priority).to.equal('normal');
    });

    it('should store message in recipient inbox', async function() {
      const message = {
        from: 'Legolas',
        to: 'Aragorn',
        type: 'component_complete',
        payload: {}
      };

      mockRedis.lpush.resolves(1);

      await messageBus.publish(message);

      expect(mockRedis.lpush.calledOnce).to.be.true;
      expect(mockRedis.lpush.firstCall.args[0]).to.equal('inbox:Aragorn');
    });

    it('should log message to audit trail', async function() {
      const message = {
        from: 'Thorin',
        to: 'Haldir',
        type: 'tests_passed',
        payload: { passed: 42 }
      };

      mockRedis.zadd.resolves(1);

      await messageBus.publish(message);

      expect(mockRedis.zadd.calledWith('messages:log', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should track message metrics', async function() {
      const message = {
        from: 'Shadowfax',
        to: 'Quickbeam',
        type: 'context_compressed',
        payload: {}
      };

      mockRedis.hincrby.resolves(1);

      await messageBus.publish(message);

      expect(mockRedis.hincrby.calledWith('messages:stats', 'sent:Shadowfax', 1)).to.be.true;
      expect(mockRedis.hincrby.calledWith('messages:stats', 'received:Quickbeam', 1)).to.be.true;
    });

    it('should handle priority messages', async function() {
      const message = {
        from: 'Treebeard',
        to: 'Pippin',
        type: 'critical_error',
        payload: { error: 'test' },
        priority: 'critical'
      };

      await messageBus.publish(message);

      const publishedMessage = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(publishedMessage.priority).to.equal('critical');
    });
  });

  describe('broadcast()', function() {
    it('should publish to broadcast channel', async function() {
      const message = {
        from: 'Merry',
        type: 'hackathon_started',
        payload: { hackathon_id: 'hack-123' }
      };

      mockRedis.publish.resolves(5);

      const messageId = await messageBus.broadcast(message);

      expect(messageId).to.be.a('string');
      expect(mockRedis.publish.calledOnce).to.be.true;
      expect(mockRedis.publish.firstCall.args[0]).to.equal('agent:broadcast');
    });

    it('should set "to" field to "*"', async function() {
      const message = {
        from: 'Denethor',
        type: 'work_distributed',
        payload: {}
      };

      await messageBus.broadcast(message);

      const broadcastedMessage = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(broadcastedMessage.to).to.equal('*');
    });
  });

  describe('subscribe()', function() {
    it('should subscribe to agent-specific channel', async function() {
      const handler = sinon.stub();
      await messageBus.subscribe('Pippin', handler);

      expect(mockSubscriber.subscribe.calledWith('agent:Pippin')).to.be.true;
    });

    it('should subscribe to broadcast channel', async function() {
      const handler = sinon.stub();
      await messageBus.subscribe('Gandalf', handler);

      expect(mockSubscriber.subscribe.calledWith('agent:broadcast')).to.be.true;
    });

    it('should store handler in subscriptions map', async function() {
      const handler = sinon.stub();
      await messageBus.subscribe('Radagast', handler);

      expect(messageBus.subscriptions.has('Radagast')).to.be.true;
      expect(messageBus.subscriptions.get('Radagast')).to.equal(handler);
    });
  });

  describe('unsubscribe()', function() {
    it('should unsubscribe from agent channel', async function() {
      messageBus.subscriptions.set('Bilbo', () => {});

      await messageBus.unsubscribe('Bilbo');

      expect(mockSubscriber.unsubscribe.calledWith('agent:Bilbo')).to.be.true;
      expect(messageBus.subscriptions.has('Bilbo')).to.be.false;
    });
  });

  describe('getStats()', function() {
    it('should return message statistics', async function() {
      mockRedis.hgetall.resolves({
        'sent:Gandalf': '10',
        'received:Radagast': '8',
        'processed:Radagast': '7'
      });
      mockRedis.zcard.onFirstCall().resolves(100);
      mockRedis.zcard.onSecondCall().resolves(95);

      const stats = await messageBus.getStats();

      expect(stats).to.have.property('total_messages', 100);
      expect(stats).to.have.property('processed_messages', 95);
      expect(stats).to.have.property('success_rate', '95.00%');
      expect(stats).to.have.property('by_agent');
    });

    it('should handle empty stats', async function() {
      mockRedis.hgetall.resolves({});
      mockRedis.zcard.resolves(0);

      const stats = await messageBus.getStats();

      expect(stats.total_messages).to.equal(0);
      expect(stats.success_rate).to.equal('0%');
    });
  });

  describe('getRecentMessages()', function() {
    it('should return recent messages', async function() {
      const mockMessages = [
        JSON.stringify({ id: '1', from: 'A', to: 'B' }),
        JSON.stringify({ id: '2', from: 'C', to: 'D' })
      ];
      mockRedis.zrevrange.resolves(mockMessages);

      const messages = await messageBus.getRecentMessages(10);

      expect(messages).to.have.lengthOf(2);
      expect(messages[0]).to.have.property('id', '1');
    });

    it('should respect limit parameter', async function() {
      await messageBus.getRecentMessages(25);

      expect(mockRedis.zrevrange.calledWith('messages:log', 0, 24)).to.be.true;
    });
  });

  describe('getFailedMessages()', function() {
    it('should return failed messages for agent', async function() {
      const mockFailed = [
        JSON.stringify({ id: 'f1', error: 'timeout' }),
        JSON.stringify({ id: 'f2', error: 'handler_error' })
      ];
      mockRedis.lrange.resolves(mockFailed);

      const failed = await messageBus.getFailedMessages('Gimli');

      expect(mockRedis.lrange.calledWith('inbox:Gimli:failed', 0, -1)).to.be.true;
      expect(failed).to.have.lengthOf(2);
    });
  });

  describe('retryFailedMessages()', function() {
    it('should throw error if no handler registered', async function() {
      mockRedis.lrange.resolves([JSON.stringify({ id: '1' })]);

      try {
        await messageBus.retryFailedMessages('UnknownAgent');
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('No handler registered');
      }
    });

    it('should retry and remove successful messages', async function() {
      const failedMsg = JSON.stringify({ id: 'f1', type: 'test' });
      mockRedis.lrange.resolves([failedMsg]);

      const handler = sinon.stub().resolves();
      messageBus.subscriptions.set('Legolas', handler);

      const result = await messageBus.retryFailedMessages('Legolas');

      expect(handler.calledOnce).to.be.true;
      expect(result.retried).to.equal(1);
      expect(result.remaining).to.equal(0);
    });
  });

  describe('cleanup()', function() {
    it('should remove old messages', async function() {
      mockRedis.zremrangebyscore.resolves(50);

      const result = await messageBus.cleanup(7);

      expect(result).to.have.property('removed_from_log');
      expect(result).to.have.property('removed_from_processed');
    });

    it('should calculate correct cutoff timestamp', async function() {
      const days = 3;
      await messageBus.cleanup(days);

      const cutoffArg = mockRedis.zremrangebyscore.firstCall.args[2];
      const expectedCutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(cutoffArg).to.be.closeTo(expectedCutoff, 1000);
    });
  });

  describe('close()', function() {
    it('should close both Redis connections', async function() {
      await messageBus.close();

      expect(mockRedis.quit.calledOnce).to.be.true;
      expect(mockSubscriber.quit.calledOnce).to.be.true;
    });
  });
});
