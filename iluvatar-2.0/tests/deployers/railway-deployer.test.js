/**
 * ILUVATAR 2.0 - Railway Deployer Tests
 *
 * Tests Railway deployment flow, database provisioning, and configuration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

describe('RailwayDeployer Tests', function() {
  let RailwayDeployer;
  let deployer;
  let execSyncStub;

  before(function() {
    RailwayDeployer = require('../../deployers/railway-deployer');
  });

  beforeEach(function() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    // Set environment variable for token
    process.env.RAILWAY_TOKEN = 'test-railway-token';

    deployer = new RailwayDeployer({
      project_path: '/tmp/test-project',
      project_name: 'test-hackathon-app',
      runtime: 'nodejs',
      database: 'postgresql'
    });
  });

  afterEach(function() {
    delete process.env.RAILWAY_TOKEN;
    sinon.restore();
  });

  describe('Constructor', function() {
    it('should initialize with provided config', function() {
      expect(deployer.projectName).to.equal('test-hackathon-app');
      expect(deployer.runtime).to.equal('nodejs');
      expect(deployer.database).to.equal('postgresql');
    });

    it('should use token from config', function() {
      const customDeployer = new RailwayDeployer({
        railway_token: 'custom-token',
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(customDeployer.token).to.equal('custom-token');
    });

    it('should fallback to environment variable for token', function() {
      expect(deployer.token).to.equal('test-railway-token');
    });

    it('should throw error if no token provided', function() {
      delete process.env.RAILWAY_TOKEN;

      expect(() => {
        new RailwayDeployer({
          project_path: '/tmp/test',
          project_name: 'test'
        });
      }).to.throw('Railway token is required');
    });

    it('should default runtime to nodejs', function() {
      const defaultDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(defaultDeployer.runtime).to.equal('nodejs');
    });

    it('should default database to null', function() {
      const defaultDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(defaultDeployer.database).to.be.null;
    });
  });

  describe('detectRuntime()', function() {
    it('should detect Node.js from package.json', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('package.json'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('nodejs');
    });

    it('should detect Python from requirements.txt', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('requirements.txt'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('python');
    });

    it('should detect Python from Pipfile', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('Pipfile'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('python');
    });

    it('should detect Go from go.mod', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('go.mod'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('go');
    });

    it('should detect Ruby from Gemfile', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('Gemfile'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('ruby');
    });

    it('should detect Rust from Cargo.toml', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('Cargo.toml'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('rust');
    });

    it('should detect Docker from Dockerfile', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('Dockerfile'));

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('docker');
    });

    it('should default to nodejs', function() {
      sinon.stub(fs, 'existsSync').returns(false);

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('nodejs');
    });
  });

  describe('getBuildCommand()', function() {
    it('should return correct command for nodejs', function() {
      deployer.runtime = 'nodejs';
      expect(deployer.getBuildCommand()).to.equal('npm install && npm run build');
    });

    it('should return correct command for python', function() {
      deployer.runtime = 'python';
      expect(deployer.getBuildCommand()).to.equal('pip install -r requirements.txt');
    });

    it('should return correct command for go', function() {
      deployer.runtime = 'go';
      expect(deployer.getBuildCommand()).to.equal('go build -o main .');
    });

    it('should return correct command for ruby', function() {
      deployer.runtime = 'ruby';
      expect(deployer.getBuildCommand()).to.equal('bundle install');
    });

    it('should return correct command for rust', function() {
      deployer.runtime = 'rust';
      expect(deployer.getBuildCommand()).to.equal('cargo build --release');
    });

    it('should return null for docker', function() {
      deployer.runtime = 'docker';
      expect(deployer.getBuildCommand()).to.be.null;
    });
  });

  describe('getStartCommand()', function() {
    it('should return correct command for nodejs', function() {
      deployer.runtime = 'nodejs';
      expect(deployer.getStartCommand()).to.equal('npm start');
    });

    it('should return correct command for python', function() {
      deployer.runtime = 'python';
      expect(deployer.getStartCommand()).to.equal('gunicorn app:app --bind 0.0.0.0:$PORT');
    });

    it('should return correct command for go', function() {
      deployer.runtime = 'go';
      expect(deployer.getStartCommand()).to.equal('./main');
    });

    it('should return correct command for ruby', function() {
      deployer.runtime = 'ruby';
      expect(deployer.getStartCommand()).to.equal('bundle exec rails server -p $PORT');
    });

    it('should return correct command for rust', function() {
      deployer.runtime = 'rust';
      expect(deployer.getStartCommand()).to.equal('./target/release/app');
    });
  });

  describe('createRailwayConfig()', function() {
    it('should create railway.json file', function() {
      const writeFileStub = sinon.stub(fs, 'writeFileSync');

      deployer.createRailwayConfig();

      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[0]).to.include('railway.json');
    });

    it('should include correct schema', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.createRailwayConfig();

      expect(writtenConfig.$schema).to.equal('https://railway.app/railway.schema.json');
    });

    it('should include build command', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.createRailwayConfig();

      expect(writtenConfig.build.buildCommand).to.equal('npm install && npm run build');
    });

    it('should include health check path', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.createRailwayConfig();

      expect(writtenConfig.deploy.healthcheckPath).to.equal('/health');
    });
  });

  describe('createProcfile()', function() {
    it('should create Procfile for nodejs', function() {
      const writeFileStub = sinon.stub(fs, 'writeFileSync');
      deployer.runtime = 'nodejs';

      deployer.createProcfile();

      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[1]).to.equal('web: npm start');
    });

    it('should create Procfile for python', function() {
      const writeFileStub = sinon.stub(fs, 'writeFileSync');
      deployer.runtime = 'python';

      deployer.createProcfile();

      expect(writeFileStub.firstCall.args[1]).to.equal('web: gunicorn app:app');
    });

    it('should not create Procfile for docker', function() {
      const writeFileStub = sinon.stub(fs, 'writeFileSync');
      deployer.runtime = 'docker';

      deployer.createProcfile();

      expect(writeFileStub.called).to.be.false;
    });
  });

  describe('Database Support', function() {
    it('should support postgresql', function() {
      const dbDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        database: 'postgresql'
      });

      expect(dbDeployer.database).to.equal('postgresql');
    });

    it('should support mysql', function() {
      const dbDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        database: 'mysql'
      });

      expect(dbDeployer.database).to.equal('mysql');
    });

    it('should support mongodb', function() {
      const dbDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        database: 'mongodb'
      });

      expect(dbDeployer.database).to.equal('mongodb');
    });

    it('should support redis', function() {
      const dbDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        database: 'redis'
      });

      expect(dbDeployer.database).to.equal('redis');
    });
  });

  describe('Environment Variables', function() {
    it('should store environment variables', function() {
      const envDeployer = new RailwayDeployer({
        railway_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        env_vars: {
          NODE_ENV: 'production',
          API_KEY: 'secret'
        }
      });

      expect(envDeployer.envVars.NODE_ENV).to.equal('production');
      expect(envDeployer.envVars.API_KEY).to.equal('secret');
    });

    it('should default to empty object', function() {
      expect(deployer.envVars).to.deep.equal({});
    });
  });

  describe('sleep()', function() {
    it('should wait for specified milliseconds', async function() {
      const start = Date.now();

      await deployer.sleep(100);

      const elapsed = Date.now() - start;
      expect(elapsed).to.be.at.least(90);
    });
  });

  describe('API Configuration', function() {
    it('should use correct API base URL', function() {
      expect(deployer.apiBaseUrl).to.equal('https://backboard.railway.app/graphql');
    });
  });
});
