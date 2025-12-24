/**
 * ILUVATAR 2.0 - Full Pipeline Integration Tests
 *
 * Tests complete workflow from ideation to deployment:
 * - Agent handoffs via message bus
 * - Checkpoint system integration
 * - Budget tracking throughout pipeline
 * - Time tracking and velocity
 * - Error handling and escalation
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Mock Redis for all modules
const createMockRedis = () => {
  const mockSubscriber = {
    subscribe: sinon.stub().resolves(),
    unsubscribe: sinon.stub().resolves(),
    on: sinon.stub(),
    quit: sinon.stub().resolves()
  };

  const mockMulti = {
    hset: sinon.stub().returnsThis(),
    hincrbyfloat: sinon.stub().returnsThis(),
    hincrby: sinon.stub().returnsThis(),
    zadd: sinon.stub().returnsThis(),
    del: sinon.stub().returnsThis(),
    set: sinon.stub().returnsThis(),
    incr: sinon.stub().returnsThis(),
    get: sinon.stub().returnsThis(),
    exec: sinon.stub().resolves([[null, 1], [null, 1]])
  };

  return {
    hset: sinon.stub().resolves(1),
    hget: sinon.stub().resolves(null),
    hgetall: sinon.stub().resolves({}),
    hdel: sinon.stub().resolves(1),
    hincrby: sinon.stub().resolves(1),
    hincrbyfloat: sinon.stub().resolves('1.0'),
    get: sinon.stub().resolves(null),
    set: sinon.stub().resolves('OK'),
    incr: sinon.stub().resolves(1),
    watch: sinon.stub().resolves('OK'),
    unwatch: sinon.stub().resolves('OK'),
    zadd: sinon.stub().resolves(1),
    zrange: sinon.stub().resolves([]),
    zrevrange: sinon.stub().resolves([]),
    zcard: sinon.stub().resolves(0),
    zremrangebyscore: sinon.stub().resolves(0),
    lpush: sinon.stub().resolves(1),
    lrange: sinon.stub().resolves([]),
    lrem: sinon.stub().resolves(1),
    publish: sinon.stub().resolves(1),
    subscribe: sinon.stub().resolves(),
    unsubscribe: sinon.stub().resolves(),
    on: sinon.stub(),
    duplicate: sinon.stub().returns(mockSubscriber),
    multi: sinon.stub().returns(mockMulti),
    quit: sinon.stub().resolves()
  };
};

// Integration tests - uses mocks, no real API calls
describe('Full Pipeline Integration Tests', function() {
  let mockRedis;

  // Core modules
  let StateManager;
  let MessageBus;
  let BudgetTracker;
  let TimeTracker;
  let CheckpointSystem;
  let ErrorHandler;
  let Logger;

  // Module instances
  let stateManager;
  let messageBus;
  let budgetTracker;
  let timeTracker;
  let checkpointSystem;
  let errorHandler;
  let logger;

  before(function() {
    // Load all core modules
    StateManager = require('../../core/state-manager').StateManager;
    MessageBus = require('../../core/message-bus').MessageBus;
    BudgetTracker = require('../../core/budget-tracker').BudgetTracker;
    TimeTracker = require('../../core/time-tracker').TimeTracker;
    CheckpointSystem = require('../../core/checkpoint-system').CheckpointSystem;
    ErrorHandler = require('../../core/error-handler').ErrorHandler;
    Logger = require('../../core/logging').Logger;
  });

  beforeEach(function() {
    mockRedis = createMockRedis();
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    // Initialize all modules with shared mock Redis
    stateManager = new StateManager(mockRedis);
    messageBus = new MessageBus(mockRedis);
    budgetTracker = new BudgetTracker(mockRedis);
    timeTracker = new TimeTracker(mockRedis);
    checkpointSystem = new CheckpointSystem(mockRedis);
    errorHandler = new ErrorHandler(mockRedis);
    logger = new Logger(mockRedis, { enableConsole: false });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('Pipeline Initialization', function() {
    it('should initialize all components for a new hackathon', async function() {
      const hackathonConfig = {
        id: 'hack-2024-01',
        name: 'AI Innovation Challenge',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        budget: 50.0,
        team: ['Gandalf', 'Gimli', 'Legolas']
      };

      // Initialize state
      await stateManager.initialize(hackathonConfig);
      expect(mockRedis.hset.called).to.be.true;

      // Initialize time tracking
      const timeResult = await timeTracker.initialize({
        id: hackathonConfig.id,
        deadline: hackathonConfig.deadline
      });
      expect(timeResult.hackathon_id).to.equal('hack-2024-01');

      // Initialize budget
      await budgetTracker.setBudget(hackathonConfig.budget);
      expect(mockRedis.hset.calledWith('budget:config', 'total', '50')).to.be.true;

      // Log initialization
      await logger.info('Hackathon initialized', { hackathon_id: hackathonConfig.id });
      expect(mockRedis.zadd.calledWith('logs:all', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should set up message bus subscriptions for all agents', async function() {
      const agents = [
        'Gandalf', 'Radagast', 'Treebeard', 'Arwen',
        'Gimli', 'Legolas', 'Aragorn', 'Eowyn',
        'Elrond', 'Thorin', 'Eomer', 'Haldir',
        'Pippin', 'Merry', 'Shadowfax', 'Quickbeam',
        'Gollum', 'Denethor', 'Bilbo', 'Galadriel'
      ];

      for (const agent of agents) {
        await messageBus.subscribe(`agent:${agent}`, () => {});
      }

      expect(mockRedis.subscribe.callCount).to.equal(agents.length);
    });
  });

  describe('Ideation Phase', function() {
    it('should handle idea approval checkpoint', async function() {
      // Gandalf generates ideas
      const ideas = [
        { title: 'AI-Powered Recipe Generator', feasibility: 0.9 },
        { title: 'Real-time Collaboration Tool', feasibility: 0.85 },
        { title: 'Smart Home Dashboard', feasibility: 0.8 }
      ];

      // Track API usage for ideation
      await budgetTracker.trackUsage({
        agent: 'Gandalf',
        model: 'claude-opus-4',
        input_tokens: 2000,
        output_tokens: 1500
      });

      // Create checkpoint for user approval
      mockRedis.hget.resolves(JSON.stringify({ approved: true, feedback: 'Go with Recipe Generator!' }));

      const result = await checkpointSystem.createCheckpoint(1, { ideas });

      expect(result.approved).to.be.true;
      expect(mockRedis.publish.calledWith('agent:Pippin', sinon.match.string)).to.be.true;
    });

    it('should handle idea rejection and require revision', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        approved: false,
        feedback: 'Need more innovative ideas'
      }));

      const result = await checkpointSystem.createCheckpoint(1, { ideas: [] });

      expect(result.approved).to.be.false;
      expect(result.user_feedback).to.include('innovative');
    });
  });

  describe('Architecture Phase', function() {
    it('should handle Radagast architecture planning', async function() {
      // Radagast creates architecture
      const architecture = {
        frontend: 'Next.js',
        backend: 'Node.js + Express',
        database: 'PostgreSQL',
        deployment: 'Vercel + Railway'
      };

      // Track API usage
      await budgetTracker.trackUsage({
        agent: 'Radagast',
        model: 'claude-opus-4',
        input_tokens: 3000,
        output_tokens: 2000
      });

      // Start architecture phase
      mockRedis.hget.resolves(JSON.stringify({
        phases: { backend: { budget_hours: 6, status: 'pending' } }
      }));

      const phaseResult = await timeTracker.startPhase('backend');
      expect(phaseResult.status).to.equal('in_progress');

      // Log phase start
      await logger.info('Architecture phase started', { agent: 'Radagast' });
    });

    it('should track tech stack confirmation checkpoint', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      // Micro checkpoint for tech stack
      const result = await checkpointSystem.createCheckpoint(7, {
        stack: ['Next.js', 'Express', 'PostgreSQL']
      });

      expect(result.approved).to.be.true;
    });
  });

  describe('Development Phase', function() {
    it('should track file completions and calculate velocity', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        completed_files: 5,
        start_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      }));

      // Gimli completes backend file
      const result = await timeTracker.trackFileCompletion('api/routes.ts', 'Gimli');
      expect(result.completed_files).to.equal(6);
      expect(result.velocity).to.be.a('number');

      // Publish completion event
      await messageBus.publish('agent:Pippin', {
        type: 'file_completed',
        file: 'api/routes.ts',
        agent: 'Gimli'
      });
    });

    it('should handle agent handoffs via message bus', async function() {
      // Gimli hands off to Legolas for frontend
      await messageBus.publish('agent:Legolas', {
        from: 'Gimli',
        type: 'handoff',
        payload: {
          api_spec: '/api/recipes/*',
          ready_for: 'frontend_integration'
        }
      });

      expect(mockRedis.publish.calledWith('agent:Legolas', sinon.match.string)).to.be.true;
    });

    it('should track budget consumption across multiple agents', async function() {
      // Simulate multiple agent API calls
      const usages = [
        { agent: 'Gimli', model: 'claude-opus-4', input_tokens: 1500, output_tokens: 1000 },
        { agent: 'Legolas', model: 'claude-opus-4', input_tokens: 2000, output_tokens: 1500 },
        { agent: 'Aragorn', model: 'claude-opus-4', input_tokens: 1000, output_tokens: 800 }
      ];

      for (const usage of usages) {
        await budgetTracker.trackUsage(usage);
      }

      expect(mockRedis.hincrbyfloat.callCount).to.be.greaterThan(0);
    });
  });

  describe('Error Handling & Debugging', function() {
    it('should classify and retry transient errors', async function() {
      const operation = sinon.stub()
        .onCall(0).rejects(new Error('Rate limit exceeded'))
        .onCall(1).resolves('success');

      sinon.stub(errorHandler, '_sleep').resolves();

      const result = await errorHandler.retry(operation, { agentId: 'Gimli' });

      expect(result).to.equal('success');
      expect(operation.calledTwice).to.be.true;
    });

    it('should escalate persistent errors to Treebeard', async function() {
      const operation = sinon.stub().rejects(new Error('Test failed: assertion error'));

      try {
        await errorHandler.retry(operation, { agentId: 'Thorin' });
      } catch (err) {
        expect(mockRedis.publish.calledWith('agent:Treebeard', sinon.match.string)).to.be.true;
      }
    });

    it('should log errors for monitoring', async function() {
      await logger.error('API call failed', {
        agent_id: 'Gimli',
        error: 'Connection timeout'
      });

      expect(mockRedis.zadd.calledWith('logs:error', sinon.match.number, sinon.match.string)).to.be.true;
    });
  });

  describe('Testing Phase', function() {
    it('should handle Arwen test planning', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        phases: { testing: { budget_hours: 3, status: 'pending' } }
      }));

      const phaseResult = await timeTracker.startPhase('testing');
      expect(phaseResult.status).to.equal('in_progress');
    });

    it('should track tests passed checkpoint', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      const result = await checkpointSystem.createCheckpoint(5, {
        test_results: { passed: 45, failed: 0, coverage: 85 }
      });

      expect(result.approved).to.be.true;
    });

    it('should complete testing phase', async function() {
      const startTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      mockRedis.hget.resolves(JSON.stringify({
        phases: {
          testing: {
            budget_hours: 4,
            status: 'in_progress',
            started_at: startTime
          }
        }
      }));

      const result = await timeTracker.completePhase('testing');

      expect(result.status).to.equal('completed');
      expect(parseFloat(result.actual_hours)).to.be.approximately(3, 0.5);
    });
  });

  describe('Deployment Phase', function() {
    it('should handle Eomer deployment coordination', async function() {
      // Broadcast deployment start
      await messageBus.broadcast({
        type: 'deployment_started',
        platform: 'vercel',
        environment: 'production'
      });

      expect(mockRedis.publish.calledWith('agent:broadcast', sinon.match.string)).to.be.true;
    });

    it('should track deployment confirmation checkpoint', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      const result = await checkpointSystem.createCheckpoint(6, {
        deployment_url: 'https://hackathon-app.vercel.app',
        status: 'healthy'
      });

      expect(result.approved).to.be.true;
    });
  });

  describe('Crunch Mode', function() {
    it('should activate crunch mode at 90% elapsed time', async function() {
      const startTime = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
      const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      mockRedis.hget.resolves(JSON.stringify({
        start_time: startTime,
        deadline: deadline,
        total_hours: '24',
        completed_files: 40,
        total_files_estimated: 50,
        crunch_mode: false
      }));

      const status = await timeTracker.getStatus();

      expect(status.percent_elapsed).to.be.above(90);
      expect(status.should_activate_crunch).to.be.true;
    });

    it('should broadcast crunch mode to all agents', async function() {
      mockRedis.hget.resolves(JSON.stringify({ crunch_mode: false }));

      await timeTracker.activateCrunchMode('time_running_out');

      expect(mockRedis.publish.calledWith('agent:broadcast', sinon.match.string)).to.be.true;
    });
  });

  describe('Budget Monitoring', function() {
    it('should warn at 80% budget consumption', async function() {
      mockRedis.hget.onCall(0).resolves('50');  // total budget
      mockRedis.hget.onCall(1).resolves('40');  // spent

      const status = await budgetTracker.checkBudget();

      expect(status.percent_used).to.equal(80);
      expect(status.budget_remaining).to.equal(10);
    });

    it('should generate optimization suggestions', async function() {
      mockRedis.hgetall.resolves({
        'Gandalf': '15.00',
        'Gimli': '10.00',
        'Legolas': '8.00'
      });

      const suggestions = await budgetTracker.getOptimizationSuggestions();

      expect(suggestions).to.be.an('array');
    });
  });

  describe('Pipeline Completion', function() {
    it('should generate comprehensive statistics', async function() {
      // Get checkpoint stats
      mockRedis.hgetall.resolves({
        '1': JSON.stringify({ approved: true }),
        '3': JSON.stringify({ approved: true }),
        '6': JSON.stringify({ approved: true })
      });
      mockRedis.zrange.resolves([
        JSON.stringify({ event: 'checkpoint_approved', auto_approved: false }),
        JSON.stringify({ event: 'checkpoint_approved', auto_approved: false }),
        JSON.stringify({ event: 'checkpoint_approved', auto_approved: true })
      ]);

      const checkpointStats = await checkpointSystem.getStats();
      expect(checkpointStats.total_checkpoints).to.equal(3);

      // Get error stats
      mockRedis.hgetall.onCall(0).resolves({ 'rate_limit': '2', 'timeout': '1' });
      mockRedis.hgetall.onCall(1).resolves({ 'rate_limit': '2', 'timeout': '1' });
      mockRedis.hgetall.onCall(2).resolves({ 'Gimli': '1', 'Legolas': '2' });

      const errorStats = await errorHandler.getStats();
      expect(errorStats.total_errors).to.equal(3);

      // Get log stats
      mockRedis.hgetall.resolves({
        'count:info': '100',
        'count:error': '5'
      });
      mockRedis.zcard.resolves(105);

      const logStats = await logger.getStats();
      expect(logStats.total_logs).to.equal(105);
    });

    it('should close all connections cleanly', async function() {
      await stateManager.close();
      await messageBus.close();
      await budgetTracker.close();
      await timeTracker.close();
      await checkpointSystem.close();
      await errorHandler.close();
      await logger.close();

      expect(mockRedis.quit.callCount).to.equal(7);
    });
  });

  describe('End-to-End Workflow Simulation', function() {
    it('should complete full hackathon workflow', async function() {
      // 1. Initialize
      await stateManager.initialize({
        id: 'e2e-hack',
        name: 'E2E Test Hackathon'
      });

      // 2. Start time tracking
      await timeTracker.initialize({
        id: 'e2e-hack',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

      // 3. Idea approval
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));
      await checkpointSystem.createCheckpoint(1, { ideas: ['Test Idea'] });

      // 4. Development
      mockRedis.hget.resolves(JSON.stringify({
        phases: { backend: { budget_hours: 6, status: 'pending' } }
      }));
      await timeTracker.startPhase('backend');

      // 5. Track work
      mockRedis.hget.resolves(JSON.stringify({
        completed_files: 0,
        start_time: new Date().toISOString()
      }));

      for (let i = 0; i < 5; i++) {
        await timeTracker.trackFileCompletion(`file${i}.ts`, 'Gimli');
        await budgetTracker.trackUsage({
          agent: 'Gimli',
          model: 'claude-opus-4',
          input_tokens: 500,
          output_tokens: 300
        });
      }

      // 6. Complete phase
      const startTime = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      mockRedis.hget.resolves(JSON.stringify({
        phases: {
          backend: { budget_hours: 6, status: 'in_progress', started_at: startTime }
        }
      }));
      await timeTracker.completePhase('backend');

      // 7. Deployment confirmation
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));
      await checkpointSystem.createCheckpoint(6, { url: 'https://app.vercel.app' });

      // Verify the workflow completed
      expect(mockRedis.hset.called).to.be.true;
      expect(mockRedis.zadd.called).to.be.true;
      expect(mockRedis.publish.called).to.be.true;
    });
  });

  describe('Concurrent Agent Operations', function() {
    it('should handle parallel agent communications', async function() {
      const agents = ['Gimli', 'Legolas', 'Aragorn', 'Eowyn'];

      // Simulate parallel file completions
      const promises = agents.map(async agent => {
        mockRedis.hget.resolves(JSON.stringify({
          completed_files: 0,
          start_time: new Date().toISOString()
        }));

        await timeTracker.trackFileCompletion(`${agent.toLowerCase()}-file.ts`, agent);
        await messageBus.publish('agent:Pippin', {
          type: 'progress_update',
          agent: agent
        });
      });

      await Promise.all(promises);

      expect(mockRedis.publish.callCount).to.be.at.least(agents.length);
    });
  });

  describe('State Consistency', function() {
    it('should maintain consistent state across operations', async function() {
      // Initialize state
      await stateManager.initialize({ id: 'state-test' });

      // Update state from multiple sources
      await stateManager.update({ phase: 'development' });
      await stateManager.update({ files_completed: 10 });

      // Verify state was updated
      expect(mockRedis.hset.callCount).to.be.greaterThan(0);
    });
  });
});
