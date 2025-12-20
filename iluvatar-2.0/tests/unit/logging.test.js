/**
 * ILUVATAR 2.0 - Logging Unit Tests
 *
 * Tests structured logging, trace ID propagation, and log levels
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Mock Redis
const mockRedis = {
  zadd: sinon.stub(),
  hincrby: sinon.stub(),
  hgetall: sinon.stub(),
  zrevrange: sinon.stub(),
  zcard: sinon.stub(),
  zremrangebyscore: sinon.stub(),
  publish: sinon.stub(),
  quit: sinon.stub()
};

describe('Logger Unit Tests', function() {
  let Logger, LOG_LEVELS, createLogger, getLogger;
  let logger;

  before(function() {
    const module = require('../../core/logging');
    Logger = module.Logger;
    LOG_LEVELS = module.LOG_LEVELS;
    createLogger = module.createLogger;
    getLogger = module.getLogger;
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
    mockRedis.zcard.resolves(0);
    mockRedis.zremrangebyscore.resolves(0);
    mockRedis.quit.resolves();

    // Stub console.log to avoid output during tests
    sinon.stub(console, 'log');

    logger = new Logger(mockRedis, { enableConsole: false });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('LOG_LEVELS Configuration', function() {
    it('should define 5 log levels', function() {
      expect(Object.keys(LOG_LEVELS)).to.have.lengthOf(5);
    });

    it('should have correct level hierarchy', function() {
      expect(LOG_LEVELS.DEBUG).to.equal(0);
      expect(LOG_LEVELS.INFO).to.equal(1);
      expect(LOG_LEVELS.WARN).to.equal(2);
      expect(LOG_LEVELS.ERROR).to.equal(3);
      expect(LOG_LEVELS.CRITICAL).to.equal(4);
    });
  });

  describe('Constructor', function() {
    it('should initialize with provided Redis client', function() {
      expect(logger.redis).to.equal(mockRedis);
    });

    it('should set default min level to INFO', function() {
      const defaultLogger = new Logger(mockRedis);
      expect(defaultLogger.minLevel).to.equal(LOG_LEVELS.INFO);
    });

    it('should accept custom min level', function() {
      const debugLogger = new Logger(mockRedis, { minLevel: LOG_LEVELS.DEBUG });
      expect(debugLogger.minLevel).to.equal(LOG_LEVELS.DEBUG);
    });

    it('should enable console by default', function() {
      const defaultLogger = new Logger(mockRedis);
      expect(defaultLogger.enableConsole).to.be.true;
    });

    it('should enable Redis by default', function() {
      const defaultLogger = new Logger(mockRedis);
      expect(defaultLogger.enableRedis).to.be.true;
    });
  });

  describe('child()', function() {
    it('should create child logger with context', function() {
      const childLogger = logger.child({ agent_id: 'Gandalf' });

      expect(childLogger.context.agent_id).to.equal('Gandalf');
    });

    it('should inherit parent context', function() {
      logger.context = { hackathon_id: 'hack-123' };
      const childLogger = logger.child({ agent_id: 'Gandalf' });

      expect(childLogger.context.hackathon_id).to.equal('hack-123');
      expect(childLogger.context.agent_id).to.equal('Gandalf');
    });

    it('should not modify parent context', function() {
      const childLogger = logger.child({ agent_id: 'Gandalf' });

      expect(logger.context).to.be.undefined;
    });
  });

  describe('debug()', function() {
    it('should not log when below min level', async function() {
      logger.minLevel = LOG_LEVELS.INFO;

      await logger.debug('Debug message');

      expect(mockRedis.zadd.called).to.be.false;
    });

    it('should log when at or above min level', async function() {
      logger.minLevel = LOG_LEVELS.DEBUG;

      await logger.debug('Debug message');

      expect(mockRedis.zadd.called).to.be.true;
    });
  });

  describe('info()', function() {
    it('should log at INFO level', async function() {
      const entry = await logger.info('Info message');

      expect(entry.level).to.equal('INFO');
      expect(entry.message).to.equal('Info message');
    });

    it('should include timestamp', async function() {
      const entry = await logger.info('Test message');

      expect(entry.timestamp).to.be.a('string');
      expect(new Date(entry.timestamp)).to.be.instanceOf(Date);
    });

    it('should generate trace ID', async function() {
      const entry = await logger.info('Test message');

      expect(entry.trace_id).to.be.a('string');
      expect(entry.trace_id.length).to.be.greaterThan(10);
    });

    it('should include meta data', async function() {
      const entry = await logger.info('Test message', { file: 'app.js', line: 42 });

      expect(entry.meta.file).to.equal('app.js');
      expect(entry.meta.line).to.equal(42);
    });

    it('should store in Redis', async function() {
      await logger.info('Test message');

      expect(mockRedis.zadd.calledWith('logs:all', sinon.match.number, sinon.match.string)).to.be.true;
      expect(mockRedis.zadd.calledWith('logs:info', sinon.match.number, sinon.match.string)).to.be.true;
    });
  });

  describe('warn()', function() {
    it('should log at WARN level', async function() {
      const entry = await logger.warn('Warning message');

      expect(entry.level).to.equal('WARN');
    });

    it('should store in warn-specific log', async function() {
      await logger.warn('Warning');

      expect(mockRedis.zadd.calledWith('logs:warn', sinon.match.number, sinon.match.string)).to.be.true;
    });
  });

  describe('error()', function() {
    it('should log at ERROR level', async function() {
      const entry = await logger.error('Error message');

      expect(entry.level).to.equal('ERROR');
    });

    it('should store in error-specific log', async function() {
      await logger.error('Error');

      expect(mockRedis.zadd.calledWith('logs:error', sinon.match.number, sinon.match.string)).to.be.true;
    });
  });

  describe('critical()', function() {
    it('should log at CRITICAL level', async function() {
      const entry = await logger.critical('Critical error');

      expect(entry.level).to.equal('CRITICAL');
    });

    it('should publish alert to Pippin', async function() {
      await logger.critical('System failure!');

      expect(mockRedis.publish.calledWith('agent:Pippin', sinon.match.string)).to.be.true;

      const publishedData = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(publishedData.type).to.equal('critical_alert');
      expect(publishedData.to).to.equal('Pippin');
    });

    it('should include log entry in alert', async function() {
      await logger.critical('Database down!');

      const publishedData = JSON.parse(mockRedis.publish.firstCall.args[1]);
      expect(publishedData.payload.message).to.equal('Database down!');
    });
  });

  describe('_getLevelName()', function() {
    it('should return correct level names', function() {
      expect(logger._getLevelName(0)).to.equal('DEBUG');
      expect(logger._getLevelName(1)).to.equal('INFO');
      expect(logger._getLevelName(2)).to.equal('WARN');
      expect(logger._getLevelName(3)).to.equal('ERROR');
      expect(logger._getLevelName(4)).to.equal('CRITICAL');
    });

    it('should return UNKNOWN for invalid levels', function() {
      expect(logger._getLevelName(99)).to.equal('UNKNOWN');
    });
  });

  describe('_redisLog()', function() {
    it('should store in main log', async function() {
      const entry = { message: 'Test', agent_id: 'Gandalf', trace_id: 'trace-123' };

      await logger._redisLog(LOG_LEVELS.INFO, entry);

      expect(mockRedis.zadd.calledWith('logs:all', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should store in agent-specific log', async function() {
      const entry = { message: 'Test', agent_id: 'Gandalf' };

      await logger._redisLog(LOG_LEVELS.INFO, entry);

      expect(mockRedis.zadd.calledWith('logs:agent:Gandalf', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should store in trace-specific log', async function() {
      const entry = { message: 'Test', trace_id: 'trace-abc' };

      await logger._redisLog(LOG_LEVELS.INFO, entry);

      expect(mockRedis.zadd.calledWith('logs:trace:trace-abc', sinon.match.number, sinon.match.string)).to.be.true;
    });

    it('should increment stats counters', async function() {
      const entry = { message: 'Test', agent_id: 'Legolas' };

      await logger._redisLog(LOG_LEVELS.ERROR, entry);

      expect(mockRedis.hincrby.calledWith('logs:stats', 'count:error', 1)).to.be.true;
      expect(mockRedis.hincrby.calledWith('logs:stats', 'agent:Legolas', 1)).to.be.true;
    });
  });

  describe('getLogs()', function() {
    it('should get all logs by default', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ level: 'INFO', message: 'Log 1' }),
        JSON.stringify({ level: 'WARN', message: 'Log 2' })
      ]);

      const logs = await logger.getLogs();

      expect(logs).to.have.lengthOf(2);
      expect(mockRedis.zrevrange.calledWith('logs:all', 0, 99)).to.be.true;
    });

    it('should filter by level', async function() {
      await logger.getLogs({ level: 'error' });

      expect(mockRedis.zrevrange.calledWith('logs:error', sinon.match.number, sinon.match.number)).to.be.true;
    });

    it('should filter by agent_id', async function() {
      await logger.getLogs({ agent_id: 'Gandalf' });

      expect(mockRedis.zrevrange.calledWith('logs:agent:Gandalf', sinon.match.number, sinon.match.number)).to.be.true;
    });

    it('should filter by trace_id', async function() {
      await logger.getLogs({ trace_id: 'trace-xyz' });

      expect(mockRedis.zrevrange.calledWith('logs:trace:trace-xyz', sinon.match.number, sinon.match.number)).to.be.true;
    });

    it('should respect limit and offset', async function() {
      await logger.getLogs({ limit: 50, offset: 10 });

      expect(mockRedis.zrevrange.calledWith('logs:all', 10, 59)).to.be.true;
    });
  });

  describe('getStats()', function() {
    it('should return comprehensive statistics', async function() {
      mockRedis.hgetall.resolves({
        'count:debug': '10',
        'count:info': '100',
        'count:warn': '20',
        'count:error': '5',
        'count:critical': '1',
        'agent:Gandalf': '50',
        'agent:Legolas': '30'
      });
      mockRedis.zcard.resolves(136);

      const stats = await logger.getStats();

      expect(stats.total_logs).to.equal(136);
      expect(stats.by_level.debug).to.equal(10);
      expect(stats.by_level.info).to.equal(100);
      expect(stats.by_level.critical).to.equal(1);
      expect(stats.by_agent).to.have.lengthOf(2);
      expect(stats.by_agent[0].agent).to.equal('Gandalf');
      expect(stats.by_agent[0].count).to.equal(50);
    });

    it('should sort agents by count descending', async function() {
      mockRedis.hgetall.resolves({
        'agent:Gimli': '10',
        'agent:Gandalf': '100',
        'agent:Legolas': '50'
      });
      mockRedis.zcard.resolves(160);

      const stats = await logger.getStats();

      expect(stats.by_agent[0].agent).to.equal('Gandalf');
      expect(stats.by_agent[1].agent).to.equal('Legolas');
      expect(stats.by_agent[2].agent).to.equal('Gimli');
    });
  });

  describe('search()', function() {
    it('should search logs by message content', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ message: 'User logged in successfully' }),
        JSON.stringify({ message: 'Database connection established' }),
        JSON.stringify({ message: 'User logged out' })
      ]);

      const results = await logger.search('User');

      expect(results).to.have.lengthOf(2);
      expect(results[0].message).to.include('User');
    });

    it('should be case insensitive', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ message: 'ERROR: Something went wrong' }),
        JSON.stringify({ message: 'error handling completed' })
      ]);

      const results = await logger.search('error');

      expect(results).to.have.lengthOf(2);
    });

    it('should respect limit', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ message: 'Test 1' }),
        JSON.stringify({ message: 'Test 2' }),
        JSON.stringify({ message: 'Test 3' })
      ]);

      const results = await logger.search('Test', { limit: 2 });

      expect(results).to.have.lengthOf(2);
    });
  });

  describe('cleanup()', function() {
    it('should clean up all log keys', async function() {
      mockRedis.zremrangebyscore.resolves(50);

      const results = await logger.cleanup(7);

      expect(results['logs:all']).to.equal(50);
      expect(mockRedis.zremrangebyscore.calledWith('logs:all', '-inf', sinon.match.number)).to.be.true;
      expect(mockRedis.zremrangebyscore.calledWith('logs:debug', '-inf', sinon.match.number)).to.be.true;
      expect(mockRedis.zremrangebyscore.calledWith('logs:critical', '-inf', sinon.match.number)).to.be.true;
    });

    it('should calculate correct cutoff', async function() {
      const before = Date.now();

      await logger.cleanup(5);

      const cutoff = mockRedis.zremrangebyscore.firstCall.args[2];
      const expectedCutoff = before - (5 * 24 * 60 * 60 * 1000);

      expect(cutoff).to.be.closeTo(expectedCutoff, 1000);
    });
  });

  describe('exportLogs()', function() {
    it('should export logs with metadata', async function() {
      mockRedis.zrevrange.resolves([
        JSON.stringify({ message: 'Log 1' }),
        JSON.stringify({ message: 'Log 2' })
      ]);

      const exported = await logger.exportLogs({ limit: 10 });

      expect(exported.exported_at).to.be.a('string');
      expect(exported.log_count).to.equal(2);
      expect(exported.logs).to.have.lengthOf(2);
    });

    it('should include filter options', async function() {
      const options = { level: 'error', limit: 50 };

      const exported = await logger.exportLogs(options);

      expect(exported.filters).to.deep.equal(options);
    });
  });

  describe('close()', function() {
    it('should close Redis connection', async function() {
      await logger.close();

      expect(mockRedis.quit.calledOnce).to.be.true;
    });
  });

  describe('Factory Functions', function() {
    it('createLogger should create global logger', function() {
      const createdLogger = createLogger(mockRedis, { minLevel: LOG_LEVELS.DEBUG });

      expect(createdLogger).to.be.instanceOf(Logger);
    });

    it('getLogger should return existing or create new', function() {
      const retrieved = getLogger();

      expect(retrieved).to.be.instanceOf(Logger);
    });
  });

  describe('Console Output', function() {
    it('should output to console when enabled', async function() {
      const consoleLogger = new Logger(mockRedis, { enableConsole: true, enableRedis: false });

      await consoleLogger.info('Test message');

      expect(console.log.called).to.be.true;
    });

    it('should not output to console when disabled', async function() {
      await logger.info('Test message');

      // Our logger has enableConsole: false
      // Console log was stubbed in beforeEach
      expect(console.log.calledWith(sinon.match(/INFO/))).to.be.false;
    });
  });

  describe('Context Propagation', function() {
    it('should use context trace_id if available', async function() {
      const childLogger = logger.child({ trace_id: 'parent-trace-123' });

      const entry = await childLogger.info('Child log');

      expect(entry.trace_id).to.equal('parent-trace-123');
    });

    it('should use meta trace_id over context', async function() {
      const childLogger = logger.child({ trace_id: 'context-trace' });

      const entry = await childLogger.info('Test', { trace_id: 'meta-trace' });

      expect(entry.trace_id).to.equal('meta-trace');
    });

    it('should propagate agent_id from context', async function() {
      const childLogger = logger.child({ agent_id: 'Gandalf' });

      const entry = await childLogger.info('Agent message');

      expect(entry.agent_id).to.equal('Gandalf');
    });
  });
});
