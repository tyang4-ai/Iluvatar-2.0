/**
 * ILUVATAR 2.0 - Budget Tracker Unit Tests
 *
 * Tests cost calculation, budget enforcement, and spending tracking
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Mock Redis
const mockRedis = {
  hget: sinon.stub(),
  hset: sinon.stub(),
  hgetall: sinon.stub(),
  hincrbyfloat: sinon.stub(),
  hincrby: sinon.stub(),
  zadd: sinon.stub(),
  zrevrange: sinon.stub(),
  del: sinon.stub(),
  multi: sinon.stub(),
  publish: sinon.stub(),
  quit: sinon.stub()
};

// Mock multi transaction
const mockMulti = {
  hincrbyfloat: sinon.stub().returnsThis(),
  hincrby: sinon.stub().returnsThis(),
  zadd: sinon.stub().returnsThis(),
  del: sinon.stub().returnsThis(),
  exec: sinon.stub()
};

describe('BudgetTracker Unit Tests', function() {
  let BudgetTracker, PRICING;
  let tracker;

  before(function() {
    const module = require('../../core/budget-tracker');
    BudgetTracker = module.BudgetTracker;
    PRICING = module.PRICING;
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

    tracker = new BudgetTracker(mockRedis, 100);
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('Constructor', function() {
    it('should initialize with default budget', function() {
      const t = new BudgetTracker(mockRedis);
      expect(t.maxBudget).to.equal(100);
    });

    it('should accept custom max budget', function() {
      const t = new BudgetTracker(mockRedis, 500);
      expect(t.maxBudget).to.equal(500);
    });

    it('should use provided Redis client', function() {
      expect(tracker.redis).to.equal(mockRedis);
    });
  });

  describe('PRICING', function() {
    it('should have pricing for Opus model', function() {
      expect(PRICING).to.have.property('claude-opus-4-20250514');
      expect(PRICING['claude-opus-4-20250514'].input).to.equal(15.00);
      expect(PRICING['claude-opus-4-20250514'].output).to.equal(75.00);
    });

    it('should have pricing for Sonnet model', function() {
      expect(PRICING).to.have.property('claude-sonnet-4-20250514');
      expect(PRICING['claude-sonnet-4-20250514'].input).to.equal(3.00);
      expect(PRICING['claude-sonnet-4-20250514'].output).to.equal(15.00);
    });

    it('should have pricing for Haiku model', function() {
      expect(PRICING).to.have.property('claude-3-5-haiku-20241022');
      expect(PRICING['claude-3-5-haiku-20241022'].input).to.equal(0.25);
      expect(PRICING['claude-3-5-haiku-20241022'].output).to.equal(1.25);
    });
  });

  describe('calculateCost()', function() {
    it('should calculate Opus cost correctly', function() {
      const usage = {
        model: 'claude-opus-4-20250514',
        input_tokens: 1000,
        output_tokens: 500
      };

      const cost = tracker.calculateCost(usage);

      // Input: 1000/1M * $15 = $0.015
      // Output: 500/1M * $75 = $0.0375
      // Total: $0.0525
      expect(cost).to.be.closeTo(0.0525, 0.0001);
    });

    it('should calculate Sonnet cost correctly', function() {
      const usage = {
        model: 'claude-sonnet-4-20250514',
        input_tokens: 10000,
        output_tokens: 2000
      };

      const cost = tracker.calculateCost(usage);

      // Input: 10000/1M * $3 = $0.03
      // Output: 2000/1M * $15 = $0.03
      // Total: $0.06
      expect(cost).to.be.closeTo(0.06, 0.0001);
    });

    it('should calculate Haiku cost correctly', function() {
      const usage = {
        model: 'claude-3-5-haiku-20241022',
        input_tokens: 100000,
        output_tokens: 50000
      };

      const cost = tracker.calculateCost(usage);

      // Input: 100000/1M * $0.25 = $0.025
      // Output: 50000/1M * $1.25 = $0.0625
      // Total: $0.0875
      expect(cost).to.be.closeTo(0.0875, 0.0001);
    });

    it('should include thinking tokens for Opus', function() {
      const usage = {
        model: 'claude-opus-4-20250514',
        input_tokens: 1000,
        output_tokens: 500,
        thinking_tokens: 5000
      };

      const cost = tracker.calculateCost(usage);

      // Input: 1000/1M * $15 = $0.015
      // Output: 500/1M * $75 = $0.0375
      // Thinking: 5000/1M * $15 = $0.075
      // Total: $0.1275
      expect(cost).to.be.closeTo(0.1275, 0.0001);
    });

    it('should return 0 for unknown model', function() {
      const usage = {
        model: 'unknown-model',
        input_tokens: 1000,
        output_tokens: 500
      };

      const cost = tracker.calculateCost(usage);
      expect(cost).to.equal(0);
    });
  });

  describe('estimateCost()', function() {
    it('should estimate cost before API call', function() {
      const estimate = tracker.estimateCost('claude-sonnet-4-20250514', 5000, 2000);

      // Input: 5000/1M * $3 = $0.015
      // Output: 2000/1M * $15 = $0.03
      // Total: $0.045
      expect(estimate).to.be.closeTo(0.045, 0.0001);
    });

    it('should use default output tokens if not provided', function() {
      const estimate = tracker.estimateCost('claude-sonnet-4-20250514', 5000);

      // Output defaults to 4096 tokens
      // Output: 4096/1M * $15 = $0.06144
      expect(estimate).to.be.greaterThan(0.015); // At least input cost
    });
  });

  describe('checkBudget()', function() {
    it('should allow request when under budget', async function() {
      mockRedis.hget.resolves('10.00'); // Current spend $10

      const result = await tracker.checkBudget('Gimli', 'claude-sonnet-4-20250514', 5000);

      expect(result.allowed).to.be.true;
      expect(result.currentSpend).to.equal(10);
      expect(result.estimate).to.be.greaterThan(0);
    });

    it('should block request when budget would be exceeded', async function() {
      mockRedis.hget.resolves('99.00'); // Current spend $99

      const result = await tracker.checkBudget('Gandalf', 'claude-opus-4-20250514', 100000);

      expect(result.allowed).to.be.false;
      expect(result.reason).to.include('Budget exceeded');
    });

    it('should send alert at 90% budget', async function() {
      // Current spend $89, using Opus with large tokens to push over 90%
      // Opus: 100000 input = 100000/1M * $15 = $1.50 estimate
      // $89 + $1.50 = $90.50 = 90.5% (triggers warning)
      mockRedis.hget.resolves('89.00');
      mockRedis.publish.resolves(1);

      await tracker.checkBudget('Legolas', 'claude-opus-4-20250514', 100000);

      // Should trigger 90% warning
      expect(mockRedis.publish.called).to.be.true;
    });

    it('should return percent used', async function() {
      mockRedis.hget.resolves('50.00');

      const result = await tracker.checkBudget('Radagast', 'claude-sonnet-4-20250514', 1000);

      expect(result.percentUsed).to.be.approximately(50, 5);
    });
  });

  describe('trackUsage()', function() {
    it('should track API usage in Redis', async function() {
      mockRedis.hget.resolves('10.00');
      mockMulti.exec.resolves([]);

      const usage = {
        model: 'claude-sonnet-4-20250514',
        input_tokens: 5000,
        output_tokens: 2000
      };

      await tracker.trackUsage('Gimli', usage);

      expect(mockRedis.multi.called).to.be.true;
      expect(mockMulti.hincrbyfloat.calledWith('budget:spend', 'total', sinon.match.number)).to.be.true;
      expect(mockMulti.hincrbyfloat.calledWith('budget:spend', 'agent:Gimli', sinon.match.number)).to.be.true;
    });

    it('should log transaction', async function() {
      mockRedis.hget.resolves('10.00');

      const usage = {
        model: 'claude-opus-4-20250514',
        input_tokens: 1000,
        output_tokens: 500
      };

      await tracker.trackUsage('Gandalf', usage);

      expect(mockMulti.zadd.calledWith('budget:transactions', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should track token counts', async function() {
      mockRedis.hget.resolves('0');

      const usage = {
        model: 'claude-sonnet-4-20250514',
        input_tokens: 10000,
        output_tokens: 5000,
        thinking_tokens: 2000
      };

      await tracker.trackUsage('Treebeard', usage);

      expect(mockMulti.hincrby.calledWith('budget:tokens', 'total_input', 10000)).to.be.true;
      expect(mockMulti.hincrby.calledWith('budget:tokens', 'total_output', 5000)).to.be.true;
      expect(mockMulti.hincrby.calledWith('budget:tokens', 'total_thinking', 2000)).to.be.true;
    });

    it('should return cost and remaining budget', async function() {
      mockRedis.hget.resolves('50.00');

      const usage = {
        model: 'claude-sonnet-4-20250514',
        input_tokens: 5000,
        output_tokens: 2000
      };

      const result = await tracker.trackUsage('Elrond', usage);

      expect(result).to.have.property('cost');
      expect(result).to.have.property('totalSpend');
      expect(result).to.have.property('percentUsed');
      expect(result).to.have.property('remaining');
    });

    it('should alert at 80% threshold', async function() {
      // Current spend $80.00, 80% of budget triggers 80% alert
      mockRedis.hget.resolves('80.00');
      mockRedis.publish.resolves(1);

      const usage = {
        model: 'claude-opus-4-20250514',
        input_tokens: 10000,
        output_tokens: 5000
      };

      await tracker.trackUsage('Aragorn', usage);

      expect(mockRedis.publish.called).to.be.true;
    });
  });

  describe('getCurrentSpend()', function() {
    it('should return current total spend', async function() {
      mockRedis.hget.resolves('42.50');

      const spend = await tracker.getCurrentSpend();

      expect(spend).to.equal(42.50);
    });

    it('should return 0 if no spend recorded', async function() {
      mockRedis.hget.resolves(null);

      const spend = await tracker.getCurrentSpend();

      expect(spend).to.equal(0);
    });
  });

  describe('getSpendingBreakdown()', function() {
    it('should return detailed breakdown', async function() {
      mockRedis.hgetall.onFirstCall().resolves({
        'total': '50.00',
        'agent:Gandalf': '20.00',
        'agent:Gimli': '15.00',
        'model:claude-opus-4-20250514': '30.00',
        'model:claude-sonnet-4-20250514': '20.00'
      });
      mockRedis.hgetall.onSecondCall().resolves({
        'total_input': '500000',
        'total_output': '200000',
        'total_thinking': '50000'
      });

      const breakdown = await tracker.getSpendingBreakdown();

      expect(breakdown.total).to.equal(50);
      expect(breakdown.remaining).to.equal(50);
      expect(breakdown.by_agent).to.be.an('array');
      expect(breakdown.by_model).to.be.an('array');
      expect(breakdown.tokens.input).to.equal(500000);
    });

    it('should sort agents by spend descending', async function() {
      mockRedis.hgetall.onFirstCall().resolves({
        'total': '50.00',
        'agent:Low': '5.00',
        'agent:High': '30.00',
        'agent:Medium': '15.00'
      });
      mockRedis.hgetall.onSecondCall().resolves({});

      const breakdown = await tracker.getSpendingBreakdown();

      expect(breakdown.by_agent[0].agent).to.equal('High');
      expect(breakdown.by_agent[1].agent).to.equal('Medium');
      expect(breakdown.by_agent[2].agent).to.equal('Low');
    });
  });

  describe('getRecentTransactions()', function() {
    it('should return recent transactions', async function() {
      const mockTransactions = [
        JSON.stringify({ agentId: 'Gandalf', cost: '1.50' }),
        JSON.stringify({ agentId: 'Gimli', cost: '0.75' })
      ];
      mockRedis.zrevrange.resolves(mockTransactions);

      const transactions = await tracker.getRecentTransactions(10);

      expect(transactions).to.have.lengthOf(2);
      expect(transactions[0].agentId).to.equal('Gandalf');
    });
  });

  describe('updateBudget()', function() {
    it('should update max budget', async function() {
      mockRedis.hset.resolves(1);
      mockRedis.hget.resolves('50.00');

      const result = await tracker.updateBudget(200);

      expect(tracker.maxBudget).to.equal(200);
      expect(result.new_budget).to.equal(200);
      expect(result.remaining).to.equal(150);
    });
  });

  describe('reset()', function() {
    it('should clear all budget data', async function() {
      await tracker.reset();

      expect(mockMulti.del.calledWith('budget:spend')).to.be.true;
      expect(mockMulti.del.calledWith('budget:tokens')).to.be.true;
      expect(mockMulti.del.calledWith('budget:transactions')).to.be.true;
    });
  });

  describe('getOptimizationSuggestions()', function() {
    it('should suggest model downgrade when Opus usage high', async function() {
      mockRedis.hgetall.onFirstCall().resolves({
        'total': '80.00',
        'model:claude-opus-4-20250514': '70.00'
      });
      mockRedis.hgetall.onSecondCall().resolves({});

      const suggestions = await tracker.getOptimizationSuggestions();

      expect(suggestions).to.be.an('array');
      const modelSuggestion = suggestions.find(s => s.type === 'model_downgrade');
      expect(modelSuggestion).to.exist;
      expect(modelSuggestion.priority).to.equal('high');
    });

    it('should suggest crunch mode when budget low', async function() {
      mockRedis.hgetall.onFirstCall().resolves({
        'total': '95.00'
      });
      mockRedis.hgetall.onSecondCall().resolves({});

      const suggestions = await tracker.getOptimizationSuggestions();

      const crunchSuggestion = suggestions.find(s => s.type === 'crunch_mode');
      expect(crunchSuggestion).to.exist;
      expect(crunchSuggestion.priority).to.equal('critical');
    });
  });

  describe('close()', function() {
    it('should close Redis connection', async function() {
      await tracker.close();

      expect(mockRedis.quit.calledOnce).to.be.true;
    });
  });
});
