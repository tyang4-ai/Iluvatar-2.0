/**
 * ILUVATAR 2.0 - Error Handler Unit Tests
 *
 * Tests error classification, retry strategies, and escalation to Treebeard
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Mock Redis
const mockRedis = {
  zadd: sinon.stub(),
  hincrby: sinon.stub(),
  hgetall: sinon.stub(),
  zrevrange: sinon.stub(),
  zremrangebyscore: sinon.stub(),
  publish: sinon.stub(),
  quit: sinon.stub()
};

describe('ErrorHandler Unit Tests', function() {
  let ErrorHandler, ERROR_TYPES, RETRY_STRATEGIES;
  let errorHandler;

  before(function() {
    const module = require('../../core/error-handler');
    ErrorHandler = module.ErrorHandler;
    ERROR_TYPES = module.ERROR_TYPES;
    RETRY_STRATEGIES = module.RETRY_STRATEGIES;
  });

  beforeEach(function() {
    // Reset all stubs
    Object.values(mockRedis).forEach(stub => {
      if (stub.reset) stub.reset();
    });

    mockRedis.zadd.resolves(1);
    mockRedis.hincrby.resolves(1);
    mockRedis.publish.resolves(1);
    mockRedis.hgetall.resolves({});
    mockRedis.zrevrange.resolves([]);
    mockRedis.zremrangebyscore.resolves(0);
    mockRedis.quit.resolves();

    errorHandler = new ErrorHandler(mockRedis);
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('ERROR_TYPES Configuration', function() {
    it('should define 10 error types', function() {
      expect(Object.keys(ERROR_TYPES)).to.have.lengthOf(10);
    });

    it('should include rate_limit type', function() {
      expect(ERROR_TYPES.RATE_LIMIT).to.equal('rate_limit');
    });

    it('should include api_timeout type', function() {
      expect(ERROR_TYPES.API_TIMEOUT).to.equal('api_timeout');
    });

    it('should include test_failure type', function() {
      expect(ERROR_TYPES.TEST_FAILURE).to.equal('test_failure');
    });

    it('should include unknown type', function() {
      expect(ERROR_TYPES.UNKNOWN).to.equal('unknown');
    });
  });

  describe('RETRY_STRATEGIES Configuration', function() {
    it('should define strategy for each error type', function() {
      Object.values(ERROR_TYPES).forEach(type => {
        expect(RETRY_STRATEGIES[type]).to.exist;
      });
    });

    it('should have exponential backoff for rate_limit', function() {
      const strategy = RETRY_STRATEGIES[ERROR_TYPES.RATE_LIMIT];
      expect(strategy.backoff).to.equal('exponential');
      expect(strategy.max_retries).to.equal(5);
    });

    it('should escalate test failures immediately', function() {
      const strategy = RETRY_STRATEGIES[ERROR_TYPES.TEST_FAILURE];
      expect(strategy.max_retries).to.equal(0);
      expect(strategy.should_escalate).to.be.true;
    });

    it('should adjust temperature for syntax errors', function() {
      const strategy = RETRY_STRATEGIES[ERROR_TYPES.SYNTAX_ERROR];
      expect(strategy.should_adjust_params).to.be.true;
      expect(strategy.param_adjustments.temperature).to.equal(0.3);
    });
  });

  describe('Constructor', function() {
    it('should initialize with provided Redis client', function() {
      expect(errorHandler.redis).to.equal(mockRedis);
    });
  });

  describe('classifyError()', function() {
    it('should classify rate limit errors', function() {
      const error = new Error('Rate limit exceeded. Please retry after 60 seconds.');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.RATE_LIMIT);
    });

    it('should classify 429 status as rate limit', function() {
      const error = new Error('Request failed with status 429');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.RATE_LIMIT);
    });

    it('should classify too many requests as rate limit', function() {
      const error = new Error('Too many requests, slow down');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.RATE_LIMIT);
    });

    it('should classify timeout errors', function() {
      const error = new Error('Request timed out after 30000ms');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.API_TIMEOUT);
    });

    it('should classify 504 as timeout', function() {
      const error = new Error('Gateway timeout 504');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.API_TIMEOUT);
    });

    it('should classify syntax errors', function() {
      const error = new Error('SyntaxError: Unexpected token }');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.SYNTAX_ERROR);
    });

    it('should classify parsing errors as syntax', function() {
      const error = new Error('Parsing error: invalid json');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.SYNTAX_ERROR);
    });

    it('should classify test failures', function() {
      const error = new Error('Test failed: expected 5 but received 3');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.TEST_FAILURE);
    });

    it('should classify assertion errors as test failure', function() {
      const error = new Error('AssertionError: values do not match');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.TEST_FAILURE);
    });

    it('should classify module not found errors', function() {
      const error = new Error("Cannot find module 'express'");
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.IMPORT_ERROR);
    });

    it('should classify type errors', function() {
      const error = new Error('TypeError: undefined is not a function');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.TYPE_ERROR);
    });

    it('should classify authentication errors', function() {
      const error = new Error('Unauthorized: Invalid API key');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.AUTHENTICATION_ERROR);
    });

    it('should classify 401 as authentication error', function() {
      const error = new Error('Request failed with status 401');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.AUTHENTICATION_ERROR);
    });

    it('should classify network errors', function() {
      const error = new Error('ECONNREFUSED: Connection refused');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.NETWORK_ERROR);
    });

    it('should classify ENOTFOUND as network error', function() {
      const error = new Error('ENOTFOUND: DNS lookup failed');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.NETWORK_ERROR);
    });

    it('should classify deployment errors by context', function() {
      const error = new Error('Build failed');
      const type = errorHandler.classifyError(error, { operation: 'deployment' });
      expect(type).to.equal(ERROR_TYPES.DEPLOYMENT_ERROR);
    });

    it('should classify deploy keyword as deployment error', function() {
      const error = new Error('Deploy failed: container crashed');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.DEPLOYMENT_ERROR);
    });

    it('should return unknown for unrecognized errors', function() {
      const error = new Error('Something weird happened');
      const type = errorHandler.classifyError(error);
      expect(type).to.equal(ERROR_TYPES.UNKNOWN);
    });
  });

  describe('retry()', function() {
    it('should return result on first successful attempt', async function() {
      const operation = sinon.stub().resolves('success');

      const result = await errorHandler.retry(operation);

      expect(result).to.equal('success');
      expect(operation.calledOnce).to.be.true;
    });

    it('should retry on failure and succeed', async function() {
      const operation = sinon.stub()
        .onCall(0).rejects(new Error('Network error: ECONNREFUSED'))
        .onCall(1).resolves('recovered');

      // Stub sleep to be instant
      sinon.stub(errorHandler, '_sleep').resolves();

      const result = await errorHandler.retry(operation);

      expect(result).to.equal('recovered');
      expect(operation.calledTwice).to.be.true;
    });

    it('should throw after max retries exceeded', async function() {
      const operation = sinon.stub().rejects(new Error('Persistent network error'));

      sinon.stub(errorHandler, '_sleep').resolves();

      try {
        await errorHandler.retry(operation, { agentId: 'Gimli' });
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('Max retries');
        expect(err.message).to.include('exceeded');
      }
    });

    it('should escalate test failures immediately', async function() {
      const operation = sinon.stub().rejects(new Error('Test failed: assertion error'));

      try {
        await errorHandler.retry(operation);
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(mockRedis.publish.calledWith('agent:Treebeard', sinon.match.string)).to.be.true;
      }
    });

    it('should log recovery after successful retry', async function() {
      const operation = sinon.stub()
        .onCall(0).rejects(new Error('Rate limit exceeded'))
        .onCall(1).resolves('success');

      sinon.stub(errorHandler, '_sleep').resolves();

      await errorHandler.retry(operation);

      // Should have logged both error and recovery
      expect(mockRedis.zadd.calledWith('errors:log', sinon.match.number, sinon.match.string)).to.be.true;
      expect(mockRedis.zadd.calledWith('errors:recoveries', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should pass attempt number to operation', async function() {
      const attempts = [];
      const operation = sinon.stub().callsFake(attempt => {
        attempts.push(attempt);
        if (attempt < 1) {
          throw new Error('Rate limit');
        }
        return 'success';
      });

      sinon.stub(errorHandler, '_sleep').resolves();

      await errorHandler.retry(operation);

      expect(attempts).to.deep.equal([0, 1]);
    });
  });

  describe('_calculateDelay()', function() {
    it('should calculate exponential backoff', function() {
      const strategy = { backoff: 'exponential', base_delay_ms: 1000 };

      expect(errorHandler._calculateDelay(strategy, 1)).to.equal(1000);  // 1000 * 2^0
      expect(errorHandler._calculateDelay(strategy, 2)).to.equal(2000);  // 1000 * 2^1
      expect(errorHandler._calculateDelay(strategy, 3)).to.equal(4000);  // 1000 * 2^2
    });

    it('should calculate linear backoff', function() {
      const strategy = { backoff: 'linear', base_delay_ms: 1000 };

      expect(errorHandler._calculateDelay(strategy, 1)).to.equal(1000);
      expect(errorHandler._calculateDelay(strategy, 2)).to.equal(2000);
      expect(errorHandler._calculateDelay(strategy, 3)).to.equal(3000);
    });

    it('should return 0 for no backoff', function() {
      const strategy = { backoff: 'none', base_delay_ms: 1000 };

      expect(errorHandler._calculateDelay(strategy, 1)).to.equal(0);
    });
  });

  describe('_escalateToTreebeard()', function() {
    it('should publish escalation to Treebeard channel', async function() {
      const error = new Error('Complex error');

      await errorHandler._escalateToTreebeard(error, 'unknown', { agentId: 'Legolas' }, 3);

      expect(mockRedis.publish.calledWith('agent:Treebeard', sinon.match.string)).to.be.true;
    });

    it('should include error details in escalation', async function() {
      const error = new Error('Test failure');

      await errorHandler._escalateToTreebeard(error, 'test_failure', { file: 'app.js' }, 0);

      const publishedData = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(publishedData.from).to.equal('ErrorHandler');
      expect(publishedData.to).to.equal('Treebeard');
      expect(publishedData.type).to.equal('debugging_request');
      expect(publishedData.payload.error_type).to.equal('test_failure');
    });

    it('should log escalation event', async function() {
      const error = new Error('Error');

      await errorHandler._escalateToTreebeard(error, 'unknown', {}, 2);

      expect(mockRedis.zadd.calledWith('errors:escalations', sinon.match.number, sinon.match.string)).to.be.true;
    });
  });

  describe('getStats()', function() {
    it('should return comprehensive statistics', async function() {
      mockRedis.hgetall.onCall(0).resolves({
        'rate_limit': '5',
        'api_timeout': '3',
        'test_failure': '2'
      });
      mockRedis.hgetall.onCall(1).resolves({
        'rate_limit': '4',
        'api_timeout': '2'
      });
      mockRedis.hgetall.onCall(2).resolves({
        'Gimli': '3',
        'Legolas': '2'
      });

      const stats = await errorHandler.getStats();

      expect(stats.total_errors).to.equal(10);
      expect(stats.total_recoveries).to.equal(6);
      expect(stats.recovery_rate).to.equal('60.00%');
      expect(stats.by_type).to.have.property('rate_limit');
      expect(stats.by_agent).to.have.property('Gimli');
    });

    it('should handle empty statistics', async function() {
      mockRedis.hgetall.resolves({});

      const stats = await errorHandler.getStats();

      expect(stats.total_errors).to.equal(0);
      expect(stats.recovery_rate).to.equal('0%');
    });
  });

  describe('getRecentErrors()', function() {
    it('should return recent errors', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ error_type: 'rate_limit', message: 'Error 1' }),
        JSON.stringify({ error_type: 'timeout', message: 'Error 2' })
      ]);

      const errors = await errorHandler.getRecentErrors(10);

      expect(errors).to.have.lengthOf(2);
      expect(errors[0].error_type).to.equal('rate_limit');
    });

    it('should respect limit parameter', async function() {
      await errorHandler.getRecentErrors(25);

      expect(mockRedis.zrevrange.calledWith('errors:log', 0, 24)).to.be.true;
    });
  });

  describe('getEscalations()', function() {
    it('should return escalations to Treebeard', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ event: 'escalate_to_treebeard', error_type: 'test_failure' })
      ]);

      const escalations = await errorHandler.getEscalations(10);

      expect(escalations).to.have.lengthOf(1);
      expect(escalations[0].event).to.equal('escalate_to_treebeard');
    });
  });

  describe('clearLogs()', function() {
    it('should remove old logs', async function() {
      mockRedis.zremrangebyscore.resolves(100);

      const result = await errorHandler.clearLogs(7);

      expect(result.removed_errors).to.equal(100);
      expect(mockRedis.zremrangebyscore.calledWith('errors:log', '-inf', sinon.match.number)).to.be.true;
    });

    it('should calculate correct cutoff timestamp', async function() {
      const before = Date.now();

      await errorHandler.clearLogs(3);

      const cutoff = mockRedis.zremrangebyscore.firstCall.args[2];
      const expectedCutoff = before - (3 * 24 * 60 * 60 * 1000);

      expect(cutoff).to.be.closeTo(expectedCutoff, 1000);
    });
  });

  describe('close()', function() {
    it('should close Redis connection', async function() {
      await errorHandler.close();

      expect(mockRedis.quit.calledOnce).to.be.true;
    });
  });
});
