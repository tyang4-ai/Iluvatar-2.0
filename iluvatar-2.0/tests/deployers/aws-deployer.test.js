/**
 * ILUVATAR 2.0 - AWS Deployer Tests
 *
 * Tests AWS deployment flow, configuration validation, and error handling
 */

const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');

describe('AWSDeployer Tests', function() {
  let AWSDeployer;
  let deployer;
  let mockAWS;

  before(function() {
    // Mock AWS SDK before requiring the module
    mockAWS = {
      EC2: sinon.stub(),
      S3: sinon.stub(),
      ElasticBeanstalk: sinon.stub(),
      RDS: sinon.stub(),
      CloudFront: sinon.stub(),
      Route53: sinon.stub(),
      ELBv2: sinon.stub(),
      config: { update: sinon.stub() }
    };

    // Create mock instances
    const mockEC2 = {
      createSecurityGroup: sinon.stub().returns({ promise: sinon.stub().resolves({ GroupId: 'sg-12345' }) }),
      authorizeSecurityGroupIngress: sinon.stub().returns({ promise: sinon.stub().resolves({}) }),
      runInstances: sinon.stub().returns({ promise: sinon.stub().resolves({ Instances: [{ InstanceId: 'i-12345' }] }) }),
      describeInstances: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Reservations: [{ Instances: [{ PublicIpAddress: '54.123.45.67' }] }]
        })
      }),
      waitFor: sinon.stub().returns({ promise: sinon.stub().resolves({}) })
    };

    const mockS3 = {
      createBucket: sinon.stub().returns({ promise: sinon.stub().resolves({}) }),
      putBucketWebsite: sinon.stub().returns({ promise: sinon.stub().resolves({}) }),
      putBucketPolicy: sinon.stub().returns({ promise: sinon.stub().resolves({}) }),
      upload: sinon.stub().returns({ promise: sinon.stub().resolves({}) })
    };

    const mockElasticBeanstalk = {
      createApplication: sinon.stub().returns({ promise: sinon.stub().resolves({}) }),
      createApplicationVersion: sinon.stub().returns({ promise: sinon.stub().resolves({}) }),
      createEnvironment: sinon.stub().returns({
        promise: sinon.stub().resolves({ CNAME: 'test-app.elasticbeanstalk.com' })
      }),
      describeEnvironments: sinon.stub().returns({
        promise: sinon.stub().resolves({ Environments: [{ Status: 'Ready' }] })
      })
    };

    const mockCloudFront = {
      createDistribution: sinon.stub().returns({
        promise: sinon.stub().resolves({
          Distribution: { Id: 'E12345', DomainName: 'd12345.cloudfront.net' }
        })
      })
    };

    mockAWS.EC2.returns(mockEC2);
    mockAWS.S3.returns(mockS3);
    mockAWS.ElasticBeanstalk.returns(mockElasticBeanstalk);
    mockAWS.CloudFront.returns(mockCloudFront);
    mockAWS.RDS.returns({});
    mockAWS.Route53.returns({});
    mockAWS.ELBv2.returns({});

    // Now require the module with mocked dependencies
    AWSDeployer = require('../../deployers/aws-deployer');
  });

  beforeEach(function() {
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');

    deployer = new AWSDeployer({
      region: 'us-east-1',
      project_path: '/tmp/test-project',
      project_name: 'test-hackathon-app',
      deployment_type: 's3'
    });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('Constructor', function() {
    it('should initialize with provided config', function() {
      expect(deployer.region).to.equal('us-east-1');
      expect(deployer.projectName).to.equal('test-hackathon-app');
      expect(deployer.deploymentType).to.equal('s3');
    });

    it('should use default region if not provided', function() {
      const defaultDeployer = new AWSDeployer({
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(defaultDeployer.region).to.equal('us-east-1');
    });

    it('should default to elastic-beanstalk deployment type', function() {
      const defaultDeployer = new AWSDeployer({
        project_path: '/tmp/test',
        project_name: 'test'
      });

      expect(defaultDeployer.deploymentType).to.equal('elastic-beanstalk');
    });

    it('should default to t3.micro instance type', function() {
      expect(deployer.instanceType).to.equal('t3.micro');
    });

    it('should accept custom instance type', function() {
      const customDeployer = new AWSDeployer({
        project_path: '/tmp/test',
        project_name: 'test',
        instance_type: 't3.large'
      });

      expect(customDeployer.instanceType).to.equal('t3.large');
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

    it('should default to static for unknown projects', function() {
      sinon.stub(fs, 'existsSync').returns(false);

      const runtime = deployer.detectRuntime();

      expect(runtime).to.equal('static');
    });
  });

  describe('getContentType()', function() {
    it('should return correct content type for HTML', function() {
      expect(deployer.getContentType('index.html')).to.equal('text/html');
    });

    it('should return correct content type for CSS', function() {
      expect(deployer.getContentType('styles.css')).to.equal('text/css');
    });

    it('should return correct content type for JavaScript', function() {
      expect(deployer.getContentType('app.js')).to.equal('application/javascript');
    });

    it('should return correct content type for JSON', function() {
      expect(deployer.getContentType('data.json')).to.equal('application/json');
    });

    it('should return correct content type for PNG', function() {
      expect(deployer.getContentType('image.png')).to.equal('image/png');
    });

    it('should return correct content type for JPEG', function() {
      expect(deployer.getContentType('photo.jpg')).to.equal('image/jpeg');
      expect(deployer.getContentType('photo.jpeg')).to.equal('image/jpeg');
    });

    it('should return correct content type for SVG', function() {
      expect(deployer.getContentType('icon.svg')).to.equal('image/svg+xml');
    });

    it('should return octet-stream for unknown types', function() {
      expect(deployer.getContentType('file.xyz')).to.equal('application/octet-stream');
    });
  });

  describe('getBuildDirectory()', function() {
    it('should find build directory', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('build'));

      const buildDir = deployer.getBuildDirectory();

      expect(buildDir).to.include('build');
    });

    it('should find dist directory', function() {
      sinon.stub(fs, 'existsSync').callsFake(p => p.includes('dist'));

      const buildDir = deployer.getBuildDirectory();

      expect(buildDir).to.include('dist');
    });

    it('should fallback to project path if no build dir found', function() {
      sinon.stub(fs, 'existsSync').returns(false);

      const buildDir = deployer.getBuildDirectory();

      expect(buildDir).to.equal(deployer.projectPath);
    });
  });

  describe('deploy()', function() {
    it('should throw error for unsupported deployment type', async function() {
      deployer.deploymentType = 'unsupported';

      try {
        await deployer.deploy();
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('Unsupported deployment type');
      }
    });

    it('should throw error for ECS deployment (not implemented)', async function() {
      deployer.deploymentType = 'ecs';

      try {
        await deployer.deploy();
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('ECS deployment not yet implemented');
      }
    });
  });

  describe('verifyDeployment()', function() {
    it('should return true for successful verification', async function() {
      const result = await deployer.verifyDeployment('http://test-app.com');

      expect(result).to.be.true;
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

  describe('Deployment Types', function() {
    describe('S3 Deployment', function() {
      it('should have correct deployment type', function() {
        expect(deployer.deploymentType).to.equal('s3');
      });
    });

    describe('EC2 Deployment', function() {
      it('should configure EC2 deployment', function() {
        const ec2Deployer = new AWSDeployer({
          project_path: '/tmp/test',
          project_name: 'test',
          deployment_type: 'ec2',
          instance_type: 't3.medium'
        });

        expect(ec2Deployer.deploymentType).to.equal('ec2');
        expect(ec2Deployer.instanceType).to.equal('t3.medium');
      });
    });

    describe('Elastic Beanstalk Deployment', function() {
      it('should configure Elastic Beanstalk deployment', function() {
        const ebDeployer = new AWSDeployer({
          project_path: '/tmp/test',
          project_name: 'test',
          deployment_type: 'elastic-beanstalk',
          database: 'postgresql'
        });

        expect(ebDeployer.deploymentType).to.equal('elastic-beanstalk');
        expect(ebDeployer.database).to.equal('postgresql');
      });
    });
  });

  describe('Environment Variables', function() {
    it('should store environment variables', function() {
      const envDeployer = new AWSDeployer({
        project_path: '/tmp/test',
        project_name: 'test',
        env_vars: {
          NODE_ENV: 'production',
          API_KEY: 'secret-key'
        }
      });

      expect(envDeployer.envVars.NODE_ENV).to.equal('production');
      expect(envDeployer.envVars.API_KEY).to.equal('secret-key');
    });

    it('should default to empty object', function() {
      expect(deployer.envVars).to.deep.equal({});
    });
  });
});
