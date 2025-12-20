/**
 * ILUVATAR 2.0 - Checkpoint System Unit Tests
 *
 * Tests all 11 checkpoint types, auto-approval timeouts, and user interaction flow
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Mock Redis
const mockRedis = {
  hset: sinon.stub(),
  hget: sinon.stub(),
  hdel: sinon.stub(),
  hgetall: sinon.stub(),
  zadd: sinon.stub(),
  zrange: sinon.stub(),
  publish: sinon.stub(),
  multi: sinon.stub(),
  quit: sinon.stub()
};

// Mock multi transaction
const mockMulti = {
  del: sinon.stub().returnsThis(),
  exec: sinon.stub()
};

describe('CheckpointSystem Unit Tests', function() {
  let CheckpointSystem, CHECKPOINTS;
  let checkpointSystem;

  before(function() {
    const module = require('../../core/checkpoint-system');
    CheckpointSystem = module.CheckpointSystem;
    CHECKPOINTS = module.CHECKPOINTS;
  });

  beforeEach(function() {
    // Reset all stubs
    Object.values(mockRedis).forEach(stub => {
      if (stub.reset) stub.reset();
    });
    Object.values(mockMulti).forEach(stub => {
      if (stub.reset) stub.reset();
      if (stub.returnsThis) stub.returnsThis();
    });

    mockRedis.multi.returns(mockMulti);
    mockMulti.exec.resolves([]);
    mockRedis.hset.resolves(1);
    mockRedis.zadd.resolves(1);
    mockRedis.publish.resolves(1);
    mockRedis.hdel.resolves(1);

    checkpointSystem = new CheckpointSystem(mockRedis);
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('CHECKPOINTS Configuration', function() {
    it('should define 11 checkpoints', function() {
      expect(Object.keys(CHECKPOINTS)).to.have.lengthOf(11);
    });

    it('should have 6 major checkpoints', function() {
      const major = Object.values(CHECKPOINTS).filter(c => c.type === 'major');
      expect(major).to.have.lengthOf(6);
    });

    it('should have 5 micro checkpoints', function() {
      const micro = Object.values(CHECKPOINTS).filter(c => c.type === 'micro');
      expect(micro).to.have.lengthOf(5);
    });

    it('should define checkpoint 1 as idea_approval', function() {
      expect(CHECKPOINTS[1].name).to.equal('idea_approval');
      expect(CHECKPOINTS[1].type).to.equal('major');
      expect(CHECKPOINTS[1].auto_approve_minutes).to.equal(15);
    });

    it('should define checkpoint 3 as architecture_approval', function() {
      expect(CHECKPOINTS[3].name).to.equal('architecture_approval');
      expect(CHECKPOINTS[3].requires_user_input).to.be.true;
    });

    it('should define checkpoint 6 as deployment_confirmation', function() {
      expect(CHECKPOINTS[6].name).to.equal('deployment_confirmation');
      expect(CHECKPOINTS[6].type).to.equal('major');
    });

    it('should define all micro checkpoints as auto-approve by default', function() {
      const micro = Object.values(CHECKPOINTS).filter(c => c.type === 'micro');
      micro.forEach(checkpoint => {
        expect(checkpoint.requires_user_input).to.be.false;
      });
    });
  });

  describe('Constructor', function() {
    it('should initialize with provided Redis client', function() {
      expect(checkpointSystem.redis).to.equal(mockRedis);
    });
  });

  describe('createCheckpoint()', function() {
    it('should throw error for unknown checkpoint ID', async function() {
      try {
        await checkpointSystem.createCheckpoint(99, {});
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('Unknown checkpoint ID');
      }
    });

    it('should store checkpoint in active checkpoints', async function() {
      // Mock immediate approval
      mockRedis.hget.resolves(JSON.stringify({ approved: true, feedback: 'Looks good' }));

      await checkpointSystem.createCheckpoint(1, { ideas: ['idea1'] });

      expect(mockRedis.hset.calledWith('checkpoints:active', '1', sinon.match.string)).to.be.true;
    });

    it('should publish checkpoint to Pippin', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      await checkpointSystem.createCheckpoint(2, { platform: 'vercel' });

      expect(mockRedis.publish.calledWith('agent:Pippin', sinon.match.string)).to.be.true;

      const publishedData = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(publishedData.type).to.equal('checkpoint_required');
      expect(publishedData.to).to.equal('Pippin');
    });

    it('should log checkpoint creation', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      await checkpointSystem.createCheckpoint(3, { architecture: {} });

      expect(mockRedis.zadd.calledWith('checkpoints:log', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should return approval result', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true, feedback: 'Great architecture!' }));

      const result = await checkpointSystem.createCheckpoint(3, { architecture: {} });

      expect(result.approved).to.be.true;
      expect(result.user_feedback).to.equal('Great architecture!');
    });

    it('should move checkpoint to history after resolution', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      await checkpointSystem.createCheckpoint(4, {});

      expect(mockRedis.hset.calledWith('checkpoints:history', '4', sinon.match.string)).to.be.true;
      expect(mockRedis.hdel.calledWith('checkpoints:active', '4')).to.be.true;
    });

    it('should allow custom auto-approve timeout', async function() {
      mockRedis.hget.resolves(JSON.stringify({ approved: true }));

      await checkpointSystem.createCheckpoint(1, {}, { auto_approve_minutes: 30 });

      const storedData = JSON.parse(mockRedis.hset.firstCall.args[2]);
      expect(storedData.auto_approve_minutes).to.equal(30);
    });
  });

  describe('_waitForApproval()', function() {
    it('should return user response when available', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        approved: true,
        feedback: 'User approved manually'
      }));
      mockRedis.hdel.resolves(1);

      const result = await checkpointSystem._waitForApproval(1, 1);

      expect(result.approved).to.be.true;
      expect(result.user_feedback).to.equal('User approved manually');
      expect(result.auto_approved).to.be.false;
    });

    it('should auto-approve after timeout', async function() {
      // Stub sleep to be instant
      sinon.stub(checkpointSystem, '_sleep').resolves();
      mockRedis.hget.resolves(null); // No user response

      // Use very short timeout
      const result = await checkpointSystem._waitForApproval(1, 0.001);

      expect(result.approved).to.be.true;
      expect(result.auto_approved).to.be.true;
      expect(result.user_feedback).to.include('Auto-approved');
    });

    it('should handle rejection', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        approved: false,
        feedback: 'Need to reconsider this approach'
      }));

      const result = await checkpointSystem._waitForApproval(2, 1);

      expect(result.approved).to.be.false;
      expect(result.user_feedback).to.include('reconsider');
    });
  });

  describe('approve()', function() {
    it('should store approval response', async function() {
      await checkpointSystem.approve(1, 'Approved with minor suggestions');

      expect(mockRedis.hset.calledWith('checkpoints:responses', '1', sinon.match.string)).to.be.true;

      const storedData = JSON.parse(mockRedis.hset.firstCall.args[2]);
      expect(storedData.approved).to.be.true;
      expect(storedData.feedback).to.equal('Approved with minor suggestions');
    });

    it('should work without feedback', async function() {
      const result = await checkpointSystem.approve(2);

      expect(result.message).to.equal('Checkpoint approved');
      expect(result.checkpoint_id).to.equal(2);
    });
  });

  describe('reject()', function() {
    it('should store rejection response', async function() {
      await checkpointSystem.reject(3, 'Architecture is too complex');

      expect(mockRedis.hset.calledWith('checkpoints:responses', '3', sinon.match.string)).to.be.true;

      const storedData = JSON.parse(mockRedis.hset.firstCall.args[2]);
      expect(storedData.approved).to.be.false;
      expect(storedData.feedback).to.equal('Architecture is too complex');
    });

    it('should return rejection confirmation', async function() {
      const result = await checkpointSystem.reject(4, 'Tests not comprehensive enough');

      expect(result.message).to.equal('Checkpoint rejected');
      expect(result.feedback).to.include('Tests not comprehensive');
    });
  });

  describe('skip()', function() {
    it('should approve with skip message', async function() {
      await checkpointSystem.skip(5);

      const storedData = JSON.parse(mockRedis.hset.firstCall.args[2]);
      expect(storedData.approved).to.be.true;
      expect(storedData.feedback).to.include('skipped');
    });
  });

  describe('getActiveCheckpoints()', function() {
    it('should return active checkpoints', async function() {
      mockRedis.hgetall.resolves({
        '1': JSON.stringify({ name: 'idea_approval', status: 'pending' }),
        '3': JSON.stringify({ name: 'architecture_approval', status: 'pending' })
      });

      const active = await checkpointSystem.getActiveCheckpoints();

      expect(active).to.have.lengthOf(2);
      expect(active[0]).to.have.property('id');
      expect(active[0]).to.have.property('name');
    });

    it('should return empty array when no active checkpoints', async function() {
      mockRedis.hgetall.resolves({});

      const active = await checkpointSystem.getActiveCheckpoints();

      expect(active).to.be.an('array');
      expect(active).to.have.lengthOf(0);
    });
  });

  describe('getHistory()', function() {
    it('should return checkpoint history sorted by ID', async function() {
      mockRedis.hgetall.resolves({
        '3': JSON.stringify({ name: 'architecture_approval', approved: true }),
        '1': JSON.stringify({ name: 'idea_approval', approved: true }),
        '2': JSON.stringify({ name: 'platform_selection', approved: false })
      });

      const history = await checkpointSystem.getHistory();

      expect(history).to.have.lengthOf(3);
      expect(history[0].id).to.equal(1);
      expect(history[1].id).to.equal(2);
      expect(history[2].id).to.equal(3);
    });
  });

  describe('getStats()', function() {
    it('should calculate checkpoint statistics', async function() {
      mockRedis.hgetall.resolves({
        '1': JSON.stringify({ approved: true }),
        '2': JSON.stringify({ approved: true }),
        '3': JSON.stringify({ approved: false }),
        '4': JSON.stringify({ approved: true })
      });
      mockRedis.zrange.resolves([
        JSON.stringify({ event: 'checkpoint_approved', auto_approved: true }),
        JSON.stringify({ event: 'checkpoint_approved', auto_approved: false }),
        JSON.stringify({ event: 'checkpoint_rejected' }),
        JSON.stringify({ event: 'checkpoint_approved', auto_approved: false })
      ]);

      const stats = await checkpointSystem.getStats();

      expect(stats.total_checkpoints).to.equal(4);
      expect(stats.approved).to.equal(3);
      expect(stats.rejected).to.equal(1);
      expect(stats.auto_approved).to.equal(1);
      expect(stats.manual_approvals).to.equal(2);
      expect(stats.approval_rate).to.equal('75.00%');
    });

    it('should handle empty history', async function() {
      mockRedis.hgetall.resolves({});
      mockRedis.zrange.resolves([]);

      const stats = await checkpointSystem.getStats();

      expect(stats.total_checkpoints).to.equal(0);
      expect(stats.approval_rate).to.equal('0%');
    });
  });

  describe('configure()', function() {
    it('should update configuration', async function() {
      mockRedis.hget.resolves(null);

      const config = await checkpointSystem.configure({
        auto_approve_all_micro: false,
        default_timeout_minutes: 20
      });

      expect(config.auto_approve_all_micro).to.be.false;
      expect(config.default_timeout_minutes).to.equal(20);
    });

    it('should merge with existing configuration', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        auto_approve_all_micro: true,
        auto_approve_all_major: false,
        default_timeout_minutes: 15
      }));

      const config = await checkpointSystem.configure({
        auto_approve_all_major: true
      });

      expect(config.auto_approve_all_micro).to.be.true;
      expect(config.auto_approve_all_major).to.be.true;
      expect(config.default_timeout_minutes).to.equal(15);
    });
  });

  describe('getConfig()', function() {
    it('should return current configuration', async function() {
      mockRedis.hget.resolves(JSON.stringify({
        auto_approve_all_micro: false,
        auto_approve_all_major: true,
        default_timeout_minutes: 10
      }));

      const config = await checkpointSystem.getConfig();

      expect(config.auto_approve_all_micro).to.be.false;
      expect(config.auto_approve_all_major).to.be.true;
    });

    it('should return defaults if no config set', async function() {
      mockRedis.hget.resolves(null);

      const config = await checkpointSystem.getConfig();

      expect(config.auto_approve_all_micro).to.be.true;
      expect(config.auto_approve_all_major).to.be.false;
      expect(config.default_timeout_minutes).to.equal(15);
    });
  });

  describe('reset()', function() {
    it('should clear all checkpoint data', async function() {
      await checkpointSystem.reset();

      expect(mockMulti.del.calledWith('checkpoints:active')).to.be.true;
      expect(mockMulti.del.calledWith('checkpoints:responses')).to.be.true;
      expect(mockMulti.del.calledWith('checkpoints:history')).to.be.true;
      expect(mockMulti.del.calledWith('checkpoints:log')).to.be.true;
      expect(mockMulti.exec.calledOnce).to.be.true;
    });

    it('should return success message', async function() {
      const result = await checkpointSystem.reset();

      expect(result.message).to.equal('Checkpoints reset successfully');
    });
  });

  describe('close()', function() {
    it('should close Redis connection', async function() {
      mockRedis.quit.resolves();

      await checkpointSystem.close();

      expect(mockRedis.quit.calledOnce).to.be.true;
    });
  });

  describe('Checkpoint Type Tests', function() {
    it('should handle idea_approval checkpoint (1)', function() {
      const cp = CHECKPOINTS[1];
      expect(cp.name).to.equal('idea_approval');
      expect(cp.type).to.equal('major');
      expect(cp.requires_user_input).to.be.true;
    });

    it('should handle platform_selection checkpoint (2)', function() {
      const cp = CHECKPOINTS[2];
      expect(cp.name).to.equal('platform_selection');
      expect(cp.auto_approve_minutes).to.equal(10);
    });

    it('should handle code_complete checkpoint (4)', function() {
      const cp = CHECKPOINTS[4];
      expect(cp.name).to.equal('code_complete');
      expect(cp.requires_user_input).to.be.false; // Auto if tests pass
    });

    it('should handle tests_passed checkpoint (5)', function() {
      const cp = CHECKPOINTS[5];
      expect(cp.name).to.equal('tests_passed');
      expect(cp.auto_approve_minutes).to.equal(5);
    });

    it('should handle tech_stack_confirmation micro checkpoint (7)', function() {
      const cp = CHECKPOINTS[7];
      expect(cp.name).to.equal('tech_stack_confirmation');
      expect(cp.type).to.equal('micro');
    });

    it('should handle demo_script_review micro checkpoint (11)', function() {
      const cp = CHECKPOINTS[11];
      expect(cp.name).to.equal('demo_script_review');
      expect(cp.type).to.equal('micro');
      expect(cp.auto_approve_minutes).to.equal(10);
    });
  });
});
