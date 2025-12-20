/**
 * ILUVATAR 2.0 - Event Dispatcher Unit Tests
 *
 * Tests the event routing system for multi-tier agent triggers
 * Validates event-driven, situational, and support agent orchestration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { EventDispatcher, AGENT_TRIGGERS } = require('../../orchestrator/event-dispatcher');

describe('Event Dispatcher', function() {
  let dispatcher;
  let mockRedis;
  let mockHttpClient;

  beforeEach(function() {
    mockRedis = {
      duplicate: sinon.stub().returns({
        subscribe: sinon.stub().resolves(),
        on: sinon.stub()
      }),
      publish: sinon.stub().resolves(),
      hget: sinon.stub().resolves(null),
      scard: sinon.stub().resolves(0),
      keys: sinon.stub().resolves([])
    };

    mockHttpClient = {
      post: sinon.stub().resolves({ status: 200, data: { success: true } })
    };

    dispatcher = new EventDispatcher({
      redis: mockRedis,
      n8nWebhookBase: 'http://test:5678/webhook',
      httpClient: mockHttpClient,
      situationalCheckInterval: 100000 // Long interval to prevent auto-run
    });
  });

  afterEach(function() {
    dispatcher.stop();
    sinon.restore();
  });

  describe('Agent Triggers Configuration', function() {
    it('should have all tier 2 event agents configured', function() {
      expect(AGENT_TRIGGERS.shadowfax).to.exist;
      expect(AGENT_TRIGGERS.galadriel).to.exist;
      expect(AGENT_TRIGGERS.elrond).to.exist;
      expect(AGENT_TRIGGERS.faramir).to.exist;
    });

    it('should have all tier 3 situational agents configured', function() {
      expect(AGENT_TRIGGERS.treebeard).to.exist;
      expect(AGENT_TRIGGERS.aragorn).to.exist;
      expect(AGENT_TRIGGERS.eowyn).to.exist;
    });

    it('should have all tier 4 support agents configured', function() {
      expect(AGENT_TRIGGERS.gollum).to.exist;
      expect(AGENT_TRIGGERS.pippin).to.exist;
      expect(AGENT_TRIGGERS.merry).to.exist;
      expect(AGENT_TRIGGERS.quickbeam).to.exist;
      expect(AGENT_TRIGGERS.bilbo).to.exist;
      expect(AGENT_TRIGGERS.arwen).to.exist;
      expect(AGENT_TRIGGERS.thorin).to.exist;
      expect(AGENT_TRIGGERS.eomer).to.exist;
      expect(AGENT_TRIGGERS.haldir).to.exist;
      expect(AGENT_TRIGGERS.historian).to.exist;
      expect(AGENT_TRIGGERS.scribe).to.exist;
      expect(AGENT_TRIGGERS.librarian).to.exist;
    });

    it('should have correct tier assignments', function() {
      expect(AGENT_TRIGGERS.shadowfax.tier).to.equal('event');
      expect(AGENT_TRIGGERS.treebeard.tier).to.equal('situational');
      expect(AGENT_TRIGGERS.gollum.tier).to.equal('support');
    });

    it('should have webhooks for all agents', function() {
      for (const [name, config] of Object.entries(AGENT_TRIGGERS)) {
        expect(config.webhook, `${name} should have webhook`).to.exist;
      }
    });
  });

  describe('Event Index Building', function() {
    it('should build event-to-agent index', function() {
      const index = dispatcher.eventAgentIndex;

      expect(index['context_warning']).to.exist;
      expect(index['file_written']).to.exist;
      expect(index['test_failed']).to.exist;
    });

    it('should map events to correct agents', function() {
      const contextWarningAgents = dispatcher.eventAgentIndex['context_warning'];
      expect(contextWarningAgents.some(a => a.agent === 'shadowfax')).to.be.true;
    });

    it('should handle multiple agents per event', function() {
      // file_written triggers galadriel, file_completed also triggers galadriel
      const fileWrittenAgents = dispatcher.eventAgentIndex['file_written'];
      expect(fileWrittenAgents.length).to.be.at.least(1);
    });
  });

  describe('Dispatcher Lifecycle', function() {
    it('should start and emit started event', async function() {
      const startedSpy = sinon.spy();
      dispatcher.on('started', startedSpy);

      await dispatcher.start();

      expect(startedSpy.calledOnce).to.be.true;
    });

    it('should stop and emit stopped event', async function() {
      const stoppedSpy = sinon.spy();
      dispatcher.on('stopped', stoppedSpy);

      await dispatcher.start();
      await dispatcher.stop();

      expect(stoppedSpy.calledOnce).to.be.true;
      expect(dispatcher.situationalTimer).to.be.null;
    });

    it('should subscribe to Redis channels on start', async function() {
      await dispatcher.start();

      const subscriber = mockRedis.duplicate();
      expect(subscriber.subscribe.called).to.be.true;
    });
  });

  describe('Hackathon Registration', function() {
    it('should register hackathon', function() {
      dispatcher.registerHackathon('hack-001', { name: 'Test Hackathon' });

      expect(dispatcher.activeHackathons.has('hack-001')).to.be.true;
      expect(dispatcher.activeHackathons.get('hack-001').name).to.equal('Test Hackathon');
    });

    it('should unregister hackathon', function() {
      dispatcher.registerHackathon('hack-002');
      dispatcher.unregisterHackathon('hack-002');

      expect(dispatcher.activeHackathons.has('hack-002')).to.be.false;
    });

    it('should add startedAt timestamp', function() {
      dispatcher.registerHackathon('hack-003');

      expect(dispatcher.activeHackathons.get('hack-003').startedAt).to.be.a('number');
    });
  });

  describe('Agent Triggering', function() {
    it('should trigger agent via webhook', async function() {
      await dispatcher.triggerAgent('shadowfax', { hackathon_id: 'test' });

      expect(mockHttpClient.post.calledOnce).to.be.true;
      expect(mockHttpClient.post.firstCall.args[0]).to.equal('http://test:5678/webhook/event/context-warning');
    });

    it('should include agent name and timestamp in payload', async function() {
      await dispatcher.triggerAgent('galadriel', { file: 'test.js' });

      const payload = mockHttpClient.post.firstCall.args[1];
      expect(payload.agent).to.equal('galadriel');
      expect(payload.triggered_at).to.exist;
      expect(payload.file).to.equal('test.js');
    });

    it('should emit agent_triggered event on success', async function() {
      const triggeredSpy = sinon.spy();
      dispatcher.on('agent_triggered', triggeredSpy);

      await dispatcher.triggerAgent('shadowfax', {});

      expect(triggeredSpy.calledOnce).to.be.true;
      expect(triggeredSpy.firstCall.args[0].agent).to.equal('shadowfax');
    });

    it('should emit agent_trigger_failed event on error', async function() {
      mockHttpClient.post.rejects(new Error('Network error'));

      const failedSpy = sinon.spy();
      dispatcher.on('agent_trigger_failed', failedSpy);

      try {
        await dispatcher.triggerAgent('shadowfax', {});
      } catch (e) {}

      expect(failedSpy.calledOnce).to.be.true;
      expect(failedSpy.firstCall.args[0].error).to.equal('Network error');
    });

    it('should warn on unknown agent', async function() {
      const result = await dispatcher.triggerAgent('unknown_agent', {});
      expect(result).to.be.null;
    });
  });

  describe('Event Handling', function() {
    it('should trigger agents for matching events', async function() {
      await dispatcher._handleEvent('context_warning', { hackathon_id: 'test' });

      expect(mockHttpClient.post.called).to.be.true;
      // Should trigger shadowfax
      const url = mockHttpClient.post.firstCall.args[0];
      expect(url).to.include('context-warning');
    });

    it('should emit event_processed', async function() {
      const processedSpy = sinon.spy();
      dispatcher.on('event_processed', processedSpy);

      await dispatcher._handleEvent('test_failed', { error: 'test' });

      expect(processedSpy.calledOnce).to.be.true;
      expect(processedSpy.firstCall.args[0].eventType).to.equal('test_failed');
    });

    it('should handle random Pippin trigger', async function() {
      // Mock random to always trigger Pippin
      const randomStub = sinon.stub(Math, 'random').returns(0.01); // < 0.05

      await dispatcher._handleEvent('any_event', {});

      // Pippin should be triggered
      const calls = mockHttpClient.post.getCalls();
      const pippinCall = calls.find(c => c.args[0].includes('serendipity'));
      expect(pippinCall).to.exist;

      randomStub.restore();
    });

    it('should not trigger Pippin when random > threshold', async function() {
      // Mock random to not trigger Pippin
      const randomStub = sinon.stub(Math, 'random').returns(0.9); // > 0.05

      await dispatcher._handleEvent('some_event', {});

      // Pippin should not be triggered for random
      const calls = mockHttpClient.post.getCalls();
      const pippinCall = calls.find(c =>
        c.args[1] && c.args[1].trigger_reason === 'random_exploration'
      );
      expect(pippinCall).to.not.exist;

      randomStub.restore();
    });
  });

  describe('Situational Checks', function() {
    beforeEach(function() {
      dispatcher.registerHackathon('situational-test');
    });

    it('should trigger Treebeard when rate limited', async function() {
      mockRedis.hget.withArgs('hackathon:situational-test:state', 'rate_limited').resolves('true');

      await dispatcher._runSituationalChecks();

      const calls = mockHttpClient.post.getCalls();
      const treebeardCall = calls.find(c => c.args[0].includes('patience'));
      expect(treebeardCall).to.exist;
    });

    it('should trigger Aragorn when decisions pending', async function() {
      mockRedis.scard.resolves(3);

      await dispatcher._runSituationalChecks();

      const calls = mockHttpClient.post.getCalls();
      const aragornCall = calls.find(c => c.args[0].includes('leadership'));
      expect(aragornCall).to.exist;
    });

    it('should trigger Eowyn when blocked as impossible', async function() {
      mockRedis.hget.withArgs('hackathon:situational-test:state', 'blocked_reason').resolves('impossible');

      await dispatcher._runSituationalChecks();

      const calls = mockHttpClient.post.getCalls();
      const eowynCall = calls.find(c => c.args[0].includes('unconventional'));
      expect(eowynCall).to.exist;
    });

    it('should trigger Merry for stuck clones', async function() {
      mockRedis.keys.resolves(['clone:clone-1:status']);
      mockRedis.hget.withArgs('clone:clone-1:status', 'state').resolves('processing');
      mockRedis.hget.withArgs('clone:clone-1:status', 'started_at').resolves(String(Date.now() - 700000)); // 11+ minutes ago

      await dispatcher._runSituationalChecks();

      const calls = mockHttpClient.post.getCalls();
      const merryCall = calls.find(c => c.args[0].includes('help-clone'));
      expect(merryCall).to.exist;
    });

    it('should not trigger Merry for active clones', async function() {
      mockRedis.keys.resolves(['clone:clone-2:status']);
      mockRedis.hget.withArgs('clone:clone-2:status', 'state').resolves('processing');
      mockRedis.hget.withArgs('clone:clone-2:status', 'started_at').resolves(String(Date.now() - 60000)); // 1 minute ago

      await dispatcher._runSituationalChecks();

      const calls = mockHttpClient.post.getCalls();
      const merryCall = calls.find(c => c.args[0].includes('help-clone'));
      expect(merryCall).to.not.exist;
    });

    it('should run checks for all active hackathons', async function() {
      dispatcher.registerHackathon('hack-a');
      dispatcher.registerHackathon('hack-b');

      mockRedis.hget.resolves('true'); // Rate limited for all

      await dispatcher._runSituationalChecks();

      // Should have checks for 3 hackathons (situational-test, hack-a, hack-b)
      expect(mockRedis.hget.callCount).to.be.at.least(3);
    });
  });

  describe('Event Emission', function() {
    it('should emit event via emitEvent()', async function() {
      const processedSpy = sinon.spy();
      dispatcher.on('event_processed', processedSpy);

      await dispatcher.emitEvent('custom_event', { custom: 'data' });

      expect(processedSpy.calledOnce).to.be.true;
      expect(processedSpy.firstCall.args[0].data.custom).to.equal('data');
    });

    it('should publish to Redis when available', async function() {
      await dispatcher.emitEvent('publish_event', { data: 'test' });

      expect(mockRedis.publish.calledOnce).to.be.true;
      expect(mockRedis.publish.firstCall.args[0]).to.equal('events:publish_event');
    });
  });

  describe('Status and Configuration', function() {
    it('should return status', function() {
      dispatcher.registerHackathon('status-test');

      const status = dispatcher.getStatus();

      expect(status.running).to.be.false; // Not started
      expect(status.activeHackathons).to.equal(1);
      expect(status.registeredAgents).to.equal(Object.keys(AGENT_TRIGGERS).length);
    });

    it('should get agent config', function() {
      const config = dispatcher.getAgentConfig('shadowfax');

      expect(config.tier).to.equal('event');
      expect(config.events).to.include('context_warning');
    });

    it('should return null for unknown agent config', function() {
      const config = dispatcher.getAgentConfig('nonexistent');
      expect(config).to.be.null;
    });

    it('should list all agents', function() {
      const agents = dispatcher.listAgents();

      expect(agents.length).to.equal(Object.keys(AGENT_TRIGGERS).length);
      expect(agents[0]).to.have.property('name');
      expect(agents[0]).to.have.property('tier');
      expect(agents[0]).to.have.property('webhook');
    });
  });

  describe('Custom Triggers', function() {
    it('should allow custom trigger configuration', function() {
      const customDispatcher = new EventDispatcher({
        customTriggers: {
          custom_agent: {
            tier: 'custom',
            events: ['custom_event'],
            webhook: '/custom/agent',
            description: 'Custom test agent'
          }
        }
      });

      expect(customDispatcher.agentTriggers.custom_agent).to.exist;
      expect(customDispatcher.eventAgentIndex['custom_event']).to.exist;
    });
  });

  describe('Error Handling', function() {
    it('should handle Redis errors in situational checks', async function() {
      mockRedis.hget.rejects(new Error('Redis error'));
      dispatcher.registerHackathon('error-test');

      // Should not throw
      await dispatcher._runSituationalChecks();
    });

    it('should handle webhook errors gracefully', async function() {
      mockHttpClient.post.rejects(new Error('Webhook error'));

      await dispatcher._handleEvent('context_warning', {});

      // Should not throw, should continue processing
    });

    it('should handle malformed event data', async function() {
      // Should not throw with null/undefined data
      await dispatcher._handleEvent('test_event', null);
      await dispatcher._handleEvent('test_event', undefined);
    });
  });

  describe('No Redis Mode', function() {
    it('should work without Redis', async function() {
      const noRedisDispatcher = new EventDispatcher({
        httpClient: mockHttpClient
      });

      await noRedisDispatcher.start();

      // Should still be able to trigger agents
      await noRedisDispatcher.triggerAgent('shadowfax', {});
      expect(mockHttpClient.post.called).to.be.true;

      await noRedisDispatcher.stop();
    });

    it('should skip situational checks without Redis', async function() {
      const noRedisDispatcher = new EventDispatcher({
        httpClient: mockHttpClient
      });

      noRedisDispatcher.registerHackathon('test');

      // Should not throw
      await noRedisDispatcher._runSituationalChecks();
    });
  });
});
