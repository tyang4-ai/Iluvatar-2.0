/**
 * ILUVATAR 2.0 - Time Tracker Unit Tests
 *
 * Tests burndown calculation, velocity metrics, phase timing, and crunch mode
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Mock Redis
const mockRedis = {
  hset: sinon.stub(),
  hget: sinon.stub(),
  zadd: sinon.stub(),
  zrange: sinon.stub(),
  publish: sinon.stub(),
  quit: sinon.stub()
};

describe('TimeTracker Unit Tests', function() {
  let TimeTracker;
  let tracker;

  before(function() {
    const module = require('../../core/time-tracker');
    TimeTracker = module.TimeTracker;
  });

  beforeEach(function() {
    // Reset all stubs
    Object.values(mockRedis).forEach(stub => {
      if (stub.reset) stub.reset();
    });

    mockRedis.hset.resolves(1);
    mockRedis.zadd.resolves(1);
    mockRedis.publish.resolves(1);

    tracker = new TimeTracker(mockRedis);
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('Constructor', function() {
    it('should initialize with provided Redis client', function() {
      expect(tracker.redis).to.equal(mockRedis);
    });
  });

  describe('initialize()', function() {
    it('should initialize time tracking', async function() {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const result = await tracker.initialize({
        id: 'hack-123',
        deadline: deadline
      });

      expect(result.hackathon_id).to.equal('hack-123');
      expect(result.deadline).to.equal(deadline);
      expect(result.crunch_mode).to.be.false;
      expect(parseFloat(result.total_hours)).to.be.approximately(24, 1);
    });

    it('should store time data in Redis', async function() {
      const deadline = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      await tracker.initialize({
        id: 'hack-456',
        deadline: deadline
      });

      expect(mockRedis.hset.calledWith('time:tracking', 'data', sinon.match.string)).to.be.true;
    });

    it('should log hackathon start event', async function() {
      const deadline = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

      await tracker.initialize({
        id: 'hack-789',
        deadline: deadline
      });

      expect(mockRedis.zadd.calledWith('time:events', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should use default phases if not provided', async function() {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const result = await tracker.initialize({
        id: 'hack-default',
        deadline: deadline
      });

      expect(result.phases).to.have.property('ideation');
      expect(result.phases).to.have.property('backend');
      expect(result.phases).to.have.property('frontend');
      expect(result.phases).to.have.property('testing');
      expect(result.phases).to.have.property('deployment');
    });

    it('should use provided phases', async function() {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const customPhases = {
        design: { budget_hours: 2 },
        development: { budget_hours: 15 },
        testing: { budget_hours: 5 }
      };

      const result = await tracker.initialize({
        id: 'hack-custom',
        deadline: deadline,
        phases: customPhases
      });

      expect(result.phases).to.deep.equal(customPhases);
    });
  });

  describe('_getDefaultPhases()', function() {
    it('should allocate phases correctly for 24 hours', function() {
      const phases = tracker._getDefaultPhases(24);

      // Ideation: 4% of 24 = 0.96 hours
      expect(phases.ideation.budget_hours).to.be.closeTo(0.96, 0.1);

      // Backend: 25% of 24 = 6 hours
      expect(phases.backend.budget_hours).to.be.closeTo(6, 0.1);

      // Frontend: 29% of 24 = 6.96 hours
      expect(phases.frontend.budget_hours).to.be.closeTo(6.96, 0.1);

      // Testing: 13% of 24 = 3.12 hours
      expect(phases.testing.budget_hours).to.be.closeTo(3.12, 0.1);
    });

    it('should include buffer time', function() {
      const phases = tracker._getDefaultPhases(100);

      expect(phases.buffer).to.exist;
      expect(phases.buffer.budget_hours).to.equal(5); // 5%
    });
  });

  describe('startPhase()', function() {
    it('should mark phase as in progress', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        phases: { backend: { budget_hours: 6, status: 'pending' } }
      }));

      const result = await tracker.startPhase('backend');

      expect(result.status).to.equal('in_progress');
      expect(result.started_at).to.be.a('string');
    });

    it('should throw error for unknown phase', async function() {
      mockRedis.hget.resolves(JSON.stringify({ phases: {} }));

      try {
        await tracker.startPhase('unknown_phase');
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('Unknown phase');
      }
    });

    it('should log phase start event', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        phases: { frontend: { budget_hours: 7, status: 'pending' } }
      }));

      await tracker.startPhase('frontend');

      expect(mockRedis.zadd.called).to.be.true;
    });
  });

  describe('completePhase()', function() {
    it('should mark phase as completed', async function() {
      const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockRedis.hget.resolves(JSON.stringify({
        phases: {
          testing: {
            budget_hours: 3,
            status: 'in_progress',
            started_at: startTime
          }
        }
      }));

      const result = await tracker.completePhase('testing');

      expect(result.status).to.equal('completed');
      expect(result.completed_at).to.be.a('string');
      expect(parseFloat(result.actual_hours)).to.be.approximately(2, 0.1);
    });

    it('should calculate variance from budget', async function() {
      const startTime = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      mockRedis.hget.resolves(JSON.stringify({
        phases: {
          backend: {
            budget_hours: 6,
            status: 'in_progress',
            started_at: startTime
          }
        }
      }));

      const result = await tracker.completePhase('backend');

      // Actual: ~4 hours, Budget: 6 hours, Variance: -2 hours
      expect(parseFloat(result.variance_hours)).to.be.approximately(-2, 0.5);
    });

    it('should throw error for unknown phase', async function() {
      mockRedis.hget.resolves(JSON.stringify({ phases: {} }));

      try {
        await tracker.completePhase('nonexistent');
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('Unknown phase');
      }
    });
  });

  describe('trackFileCompletion()', function() {
    it('should increment completed files count', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        completed_files: 5,
        start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      }));

      const result = await tracker.trackFileCompletion('api.py', 'Gimli');

      expect(result.completed_files).to.equal(6);
    });

    it('should calculate velocity', async function() {
      // 1 hour elapsed, 5 files completed = 5 files/hour
      mockRedis.hget.resolves(JSON.stringify({
        completed_files: 4,
        start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      }));

      const result = await tracker.trackFileCompletion('route.ts', 'Legolas');

      expect(result.velocity).to.be.approximately(5, 0.5);
    });

    it('should log file completion event', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        completed_files: 0,
        start_time: new Date().toISOString()
      }));

      await tracker.trackFileCompletion('index.html', 'Eowyn');

      expect(mockRedis.zadd.called).to.be.true;
    });
  });

  describe('setTotalFilesEstimate()', function() {
    it('should update total files estimate', async function() {
      mockRedis.hget.resolves(JSON.stringify({ total_files_estimated: 0 }));

      const result = await tracker.setTotalFilesEstimate(50);

      expect(result.total_files_estimated).to.equal(50);
    });
  });

  describe('getStatus()', function() {
    it('should return comprehensive status', async function() {
      const startTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const deadline = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString();

      mockRedis.hget.resolves(JSON.stringify({
        start_time: startTime,
        deadline: deadline,
        total_hours: '24',
        completed_files: 10,
        total_files_estimated: 50,
        velocity: '2.0',
        crunch_mode: false
      }));

      const status = await tracker.getStatus();

      expect(status).to.have.property('elapsed_hours');
      expect(status).to.have.property('remaining_hours');
      expect(status).to.have.property('percent_elapsed');
      expect(status).to.have.property('percent_complete');
      expect(status).to.have.property('velocity');
      expect(status).to.have.property('on_track');
      expect(status).to.have.property('crunch_mode');
    });

    it('should detect when behind schedule', async function() {
      const startTime = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const deadline = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

      mockRedis.hget.resolves(JSON.stringify({
        start_time: startTime,
        deadline: deadline,
        total_hours: '24',
        completed_files: 10,
        total_files_estimated: 50,
        velocity: '0.5', // Too slow
        crunch_mode: false
      }));

      const status = await tracker.getStatus();

      // 40 remaining files at 0.5/hour = 80 hours needed, only 4 remaining
      expect(status.on_track).to.be.false;
      expect(status.status).to.equal('behind_schedule');
    });

    it('should suggest crunch mode at 90% elapsed', async function() {
      const startTime = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
      const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      mockRedis.hget.resolves(JSON.stringify({
        start_time: startTime,
        deadline: deadline,
        total_hours: '24',
        completed_files: 40,
        total_files_estimated: 50,
        velocity: '2.0',
        crunch_mode: false
      }));

      const status = await tracker.getStatus();

      expect(status.percent_elapsed).to.be.above(90);
      expect(status.should_activate_crunch).to.be.true;
    });
  });

  describe('_shouldActivateCrunchMode()', function() {
    it('should return true at 90% elapsed', function() {
      const shouldActivate = tracker._shouldActivateCrunchMode(92, false);
      expect(shouldActivate).to.be.true;
    });

    it('should return false if already activated', function() {
      const shouldActivate = tracker._shouldActivateCrunchMode(95, true);
      expect(shouldActivate).to.be.false;
    });

    it('should return false before 90%', function() {
      const shouldActivate = tracker._shouldActivateCrunchMode(85, false);
      expect(shouldActivate).to.be.false;
    });
  });

  describe('activateCrunchMode()', function() {
    it('should activate crunch mode', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        crunch_mode: false
      }));

      const result = await tracker.activateCrunchMode('time_running_out');

      expect(result.message).to.equal('Crunch mode activated');
      expect(result.reason).to.equal('time_running_out');
      expect(result.activated_at).to.be.a('string');
    });

    it('should broadcast to all agents', async function() {
      mockRedis.hget.resolves(JSON.stringify({ crunch_mode: false }));

      await tracker.activateCrunchMode('auto');

      expect(mockRedis.publish.calledWith('agent:broadcast', sinon.match.string)).to.be.true;

      const message = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(message.type).to.equal('crunch_mode_activated');
      expect(message.to).to.equal('*');
    });

    it('should not re-activate if already active', async function() {
      const activatedAt = new Date().toISOString();
      mockRedis.hget.resolves(JSON.stringify({
        crunch_mode: true,
        crunch_mode_activated_at: activatedAt
      }));

      const result = await tracker.activateCrunchMode();

      expect(result.message).to.equal('Crunch mode already active');
      expect(result.activated_at).to.equal(activatedAt);
    });
  });

  describe('getBurndownData()', function() {
    it('should return burndown chart data', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        total_hours: '24',
        total_files_estimated: 48
      }));
      mockRedis.zrange.resolves([
        JSON.stringify({
          event: 'file_completed',
          timestamp: new Date().toISOString(),
          payload: { total_completed: 5, velocity: '2.5' }
        }),
        JSON.stringify({
          event: 'file_completed',
          timestamp: new Date().toISOString(),
          payload: { total_completed: 10, velocity: '2.5' }
        })
      ]);

      const data = await tracker.getBurndownData();

      expect(data).to.have.property('ideal_burndown');
      expect(data).to.have.property('actual_progress');
      expect(data.ideal_burndown).to.be.an('array');
      expect(data.actual_progress).to.have.lengthOf(2);
    });

    it('should calculate ideal burndown line', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        total_hours: '10',
        total_files_estimated: 100
      }));
      mockRedis.zrange.resolves([]);

      const data = await tracker.getBurndownData();

      // Ideal burndown at hour 0: 100 files remaining
      // Ideal burndown at hour 10: 0 files remaining
      expect(data.ideal_burndown.length).to.be.greaterThan(0);
      expect(parseInt(data.ideal_burndown[0].files_remaining)).to.equal(100);
    });
  });

  describe('getVelocityTrend()', function() {
    it('should return velocity trend data', async function() {
      const now = Date.now();
      mockRedis.zrange.resolves([
        JSON.stringify({
          event: 'file_completed',
          timestamp: new Date(now - 1000).toISOString()
        }),
        JSON.stringify({
          event: 'file_completed',
          timestamp: new Date(now - 2000).toISOString()
        }),
        JSON.stringify({
          event: 'phase_started', // Non-file event
          timestamp: new Date(now - 3000).toISOString()
        })
      ]);

      const trend = await tracker.getVelocityTrend(6);

      expect(trend.window_hours).to.equal(6);
      expect(trend).to.have.property('completions_in_window');
      expect(trend).to.have.property('velocity_last_window');
    });
  });

  describe('close()', function() {
    it('should close Redis connection', async function() {
      mockRedis.quit.resolves();

      await tracker.close();

      expect(mockRedis.quit.calledOnce).to.be.true;
    });
  });
});
