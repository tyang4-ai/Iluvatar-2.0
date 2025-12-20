/**
 * ILUVATAR 2.0 - Vercel Deployer Tests
 *
 * Tests Vercel deployment flow, framework detection, and configuration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');

describe('VercelDeployer Tests', function() {
  let VercelDeployer;
  let deployer;

  before(function() {
    VercelDeployer = require('../../deployers/vercel-deployer');
  });

  beforeEach(function() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    // Set environment variable for token
    process.env.VERCEL_TOKEN = 'test-vercel-token';

    deployer = new VercelDeployer({
      project_path: '/tmp/test-project',
      project_name: 'test-hackathon-app',
      framework: 'nextjs'
    });
  });

  afterEach(function() {
    delete process.env.VERCEL_TOKEN;
    sinon.restore();
  });

  describe('Constructor', function() {
    it('should initialize with provided config', function() {
      expect(deployer.projectName).to.equal('test-hackathon-app');
      expect(deployer.framework).to.equal('nextjs');
    });

    it('should use token from config', function() {
      const customDeployer = new VercelDeployer({
        vercel_token: 'custom-token',
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(customDeployer.token).to.equal('custom-token');
    });

    it('should fallback to environment variable for token', function() {
      expect(deployer.token).to.equal('test-vercel-token');
    });

    it('should throw error if no token provided', function() {
      delete process.env.VERCEL_TOKEN;

      expect(() => {
        new VercelDeployer({
          project_path: '/tmp/test',
          project_name: 'test'
        });
      }).to.throw('Vercel token is required');
    });

    it('should default framework to nextjs', function() {
      const defaultDeployer = new VercelDeployer({
        vercel_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(defaultDeployer.framework).to.equal('nextjs');
    });

    it('should accept team_id', function() {
      const teamDeployer = new VercelDeployer({
        vercel_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        team_id: 'team_abc123'
      });

      expect(teamDeployer.teamId).to.equal('team_abc123');
    });
  });

  describe('detectFramework()', function() {
    it('should detect Next.js', function() {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns(JSON.stringify({
        dependencies: { next: '^13.0.0', react: '^18.0.0' }
      }));

      const framework = deployer.detectFramework();

      expect(framework).to.equal('nextjs');
    });

    it('should detect Create React App', function() {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns(JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-scripts': '^5.0.0' }
      }));

      const framework = deployer.detectFramework();

      expect(framework).to.equal('create-react-app');
    });

    it('should detect Vite + React', function() {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns(JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { vite: '^4.0.0' }
      }));

      const framework = deployer.detectFramework();

      expect(framework).to.equal('vite');
    });

    it('should detect Vue', function() {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns(JSON.stringify({
        dependencies: { vue: '^3.0.0' }
      }));

      const framework = deployer.detectFramework();

      expect(framework).to.equal('vue');
    });

    it('should detect plain React', function() {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns(JSON.stringify({
        dependencies: { react: '^18.0.0' }
      }));

      const framework = deployer.detectFramework();

      expect(framework).to.equal('react');
    });

    it('should return static if no package.json', function() {
      sinon.stub(fs, 'existsSync').returns(false);

      const framework = deployer.detectFramework();

      expect(framework).to.equal('static');
    });

    it('should return static for non-framework packages', function() {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns(JSON.stringify({
        dependencies: { express: '^4.0.0' }
      }));

      const framework = deployer.detectFramework();

      expect(framework).to.equal('static');
    });
  });

  describe('getBuildCommand()', function() {
    it('should return correct command for nextjs', function() {
      deployer.framework = 'nextjs';
      expect(deployer.getBuildCommand()).to.equal('next build');
    });

    it('should return correct command for create-react-app', function() {
      deployer.framework = 'create-react-app';
      expect(deployer.getBuildCommand()).to.equal('react-scripts build');
    });

    it('should return correct command for vite', function() {
      deployer.framework = 'vite';
      expect(deployer.getBuildCommand()).to.equal('vite build');
    });

    it('should return correct command for vue', function() {
      deployer.framework = 'vue';
      expect(deployer.getBuildCommand()).to.equal('npm run build');
    });

    it('should return null for static', function() {
      deployer.framework = 'static';
      expect(deployer.getBuildCommand()).to.be.null;
    });

    it('should fallback to npm run build for unknown', function() {
      deployer.framework = 'unknown';
      expect(deployer.getBuildCommand()).to.equal('npm run build');
    });
  });

  describe('getDevCommand()', function() {
    it('should return correct command for nextjs', function() {
      deployer.framework = 'nextjs';
      expect(deployer.getDevCommand()).to.equal('next dev');
    });

    it('should return correct command for create-react-app', function() {
      deployer.framework = 'create-react-app';
      expect(deployer.getDevCommand()).to.equal('react-scripts start');
    });

    it('should return correct command for vite', function() {
      deployer.framework = 'vite';
      expect(deployer.getDevCommand()).to.equal('vite');
    });

    it('should return correct command for vue', function() {
      deployer.framework = 'vue';
      expect(deployer.getDevCommand()).to.equal('npm run serve');
    });
  });

  describe('getOutputDirectory()', function() {
    it('should return correct directory for nextjs', function() {
      deployer.framework = 'nextjs';
      expect(deployer.getOutputDirectory()).to.equal('.next');
    });

    it('should return correct directory for create-react-app', function() {
      deployer.framework = 'create-react-app';
      expect(deployer.getOutputDirectory()).to.equal('build');
    });

    it('should return correct directory for vite', function() {
      deployer.framework = 'vite';
      expect(deployer.getOutputDirectory()).to.equal('dist');
    });

    it('should return correct directory for vue', function() {
      deployer.framework = 'vue';
      expect(deployer.getOutputDirectory()).to.equal('dist');
    });

    it('should return current dir for static', function() {
      deployer.framework = 'static';
      expect(deployer.getOutputDirectory()).to.equal('.');
    });

    it('should fallback to build for unknown', function() {
      deployer.framework = 'unknown';
      expect(deployer.getOutputDirectory()).to.equal('build');
    });
  });

  describe('createVercelConfig()', function() {
    it('should create vercel.json file', function() {
      const writeFileStub = sinon.stub(fs, 'writeFileSync');

      deployer.createVercelConfig();

      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[0]).to.include('vercel.json');
    });

    it('should include version 2', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.createVercelConfig();

      expect(writtenConfig.version).to.equal(2);
    });

    it('should include framework', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.createVercelConfig();

      expect(writtenConfig.framework).to.equal('nextjs');
    });

    it('should include CORS headers for API routes', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.createVercelConfig();

      expect(writtenConfig.headers).to.have.lengthOf(1);
      expect(writtenConfig.headers[0].source).to.equal('/api/(.*)');
    });

    it('should include rewrites for nextjs', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.framework = 'nextjs';
      deployer.createVercelConfig();

      expect(writtenConfig.rewrites).to.have.lengthOf(1);
    });

    it('should not include rewrites for non-nextjs', function() {
      let writtenConfig;
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        writtenConfig = JSON.parse(content);
      });

      deployer.framework = 'react';
      deployer.createVercelConfig();

      expect(writtenConfig.rewrites).to.have.lengthOf(0);
    });
  });

  describe('linkProject()', function() {
    it('should create .vercel directory', async function() {
      const mkdirStub = sinon.stub(fs, 'mkdirSync');
      const writeFileStub = sinon.stub(fs, 'writeFileSync');
      sinon.stub(fs, 'existsSync').returns(false);

      await deployer.linkProject('proj_12345');

      expect(mkdirStub.calledOnce).to.be.true;
    });

    it('should create project.json with project ID', async function() {
      let writtenConfig;
      sinon.stub(fs, 'mkdirSync');
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        if (path.includes('project.json')) {
          writtenConfig = JSON.parse(content);
        }
      });

      await deployer.linkProject('proj_12345');

      expect(writtenConfig.projectId).to.equal('proj_12345');
    });

    it('should set orgId to personal if no team', async function() {
      let writtenConfig;
      sinon.stub(fs, 'mkdirSync');
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        if (path.includes('project.json')) {
          writtenConfig = JSON.parse(content);
        }
      });

      deployer.teamId = null;
      await deployer.linkProject('proj_12345');

      expect(writtenConfig.orgId).to.equal('personal');
    });

    it('should use teamId for orgId if provided', async function() {
      let writtenConfig;
      sinon.stub(fs, 'mkdirSync');
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'writeFileSync').callsFake((path, content) => {
        if (path.includes('project.json')) {
          writtenConfig = JSON.parse(content);
        }
      });

      deployer.teamId = 'team_abc123';
      await deployer.linkProject('proj_12345');

      expect(writtenConfig.orgId).to.equal('team_abc123');
    });
  });

  describe('Environment Variables', function() {
    it('should store environment variables', function() {
      const envDeployer = new VercelDeployer({
        vercel_token: 'token',
        project_path: '/tmp/test',
        project_name: 'test',
        env_vars: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
          DATABASE_URL: 'postgres://localhost/db'
        }
      });

      expect(envDeployer.envVars.NEXT_PUBLIC_API_URL).to.equal('https://api.example.com');
      expect(envDeployer.envVars.DATABASE_URL).to.equal('postgres://localhost/db');
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
      expect(deployer.apiBaseUrl).to.equal('https://api.vercel.com');
    });
  });

  describe('Framework Support', function() {
    const frameworks = ['nextjs', 'create-react-app', 'vite', 'react', 'vue', 'static'];

    frameworks.forEach(framework => {
      it(`should support ${framework} framework`, function() {
        const fwDeployer = new VercelDeployer({
          vercel_token: 'token',
          project_path: '/tmp/test',
          project_name: 'test',
          framework: framework
        });

        expect(fwDeployer.framework).to.equal(framework);
      });
    });
  });
});
