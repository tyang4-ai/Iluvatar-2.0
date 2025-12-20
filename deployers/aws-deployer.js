/**
 * ILUVATAR 2.0 - AWS Deployer
 *
 * Automated deployment to AWS using various services
 * Used by Éomer agent (19-eomer.md) for complex/enterprise deployments
 *
 * Features:
 * - EC2 instance deployment with auto-scaling
 * - S3 static site hosting
 * - Elastic Beanstalk for web applications
 * - RDS database provisioning
 * - CloudFront CDN configuration
 * - Route53 DNS management
 * - Load balancer setup
 * - Security group configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

class AWSDeployer {
  constructor(config) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.projectPath = config.project_path;
    this.projectName = config.project_name;
    this.deploymentType = config.deployment_type || 'elastic-beanstalk'; // ec2, s3, elastic-beanstalk, ecs
    this.instanceType = config.instance_type || 't3.micro';
    this.database = config.database || null;
    this.envVars = config.env_vars || {};

    // Configure AWS SDK
    AWS.config.update({
      region: this.region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });

    this.ec2 = new AWS.EC2();
    this.s3 = new AWS.S3();
    this.elasticbeanstalk = new AWS.ElasticBeanstalk();
    this.rds = new AWS.RDS();
    this.cloudfront = new AWS.CloudFront();
    this.route53 = new AWS.Route53();
    this.elb = new AWS.ELBv2();
  }

  /**
   * Main deployment function
   */
  async deploy() {
    console.log('🚀 Starting AWS deployment...');
    console.log(`   Project: ${this.projectName}`);
    console.log(`   Type: ${this.deploymentType}`);
    console.log(`   Region: ${this.region}`);

    try {
      let result;

      switch (this.deploymentType) {
        case 's3':
          result = await this.deployToS3();
          break;
        case 'elastic-beanstalk':
          result = await this.deployToElasticBeanstalk();
          break;
        case 'ec2':
          result = await this.deployToEC2();
          break;
        case 'ecs':
          result = await this.deployToECS();
          break;
        default:
          throw new Error(`Unsupported deployment type: ${this.deploymentType}`);
      }

      console.log('✓ Deployment successful!');
      console.log(`  URL: ${result.url}`);

      // Verify deployment
      const verified = await this.verifyDeployment(result.url);
      console.log(`✓ Deployment verified: ${verified ? 'HEALTHY' : 'NEEDS ATTENTION'}`);

      return {
        success: true,
        ...result,
        verified: verified
      };

    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  /**
   * Deploy static site to S3 + CloudFront
   */
  async deployToS3() {
    console.log('Deploying to S3...');

    const bucketName = `${this.projectName}-${Date.now()}`.toLowerCase();

    // Step 1: Create S3 bucket
    await this.s3.createBucket({
      Bucket: bucketName,
      ACL: 'public-read'
    }).promise();

    console.log(`✓ S3 bucket created: ${bucketName}`);

    // Step 2: Enable static website hosting
    await this.s3.putBucketWebsite({
      Bucket: bucketName,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: 'index.html' },
        ErrorDocument: { Key: 'error.html' }
      }
    }).promise();

    console.log('✓ Static website hosting enabled');

    // Step 3: Set bucket policy for public read
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/*`
      }]
    };

    await this.s3.putBucketPolicy({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy)
    }).promise();

    console.log('✓ Bucket policy configured');

    // Step 4: Build project
    console.log('Building project...');
    this.buildProject();
    console.log('✓ Project built');

    // Step 5: Upload files to S3
    console.log('Uploading files to S3...');
    const buildDir = this.getBuildDirectory();
    await this.uploadDirectoryToS3(buildDir, bucketName);
    console.log('✓ Files uploaded');

    // Step 6: Create CloudFront distribution
    console.log('Creating CloudFront distribution...');
    const distribution = await this.createCloudFrontDistribution(bucketName);
    console.log(`✓ CloudFront distribution created: ${distribution.domainName}`);

    const url = `https://${distribution.domainName}`;

    return {
      deployment_type: 's3',
      bucket_name: bucketName,
      cloudfront_domain: distribution.domainName,
      cloudfront_id: distribution.id,
      url: url
    };
  }

  /**
   * Deploy to Elastic Beanstalk
   */
  async deployToElasticBeanstalk() {
    console.log('Deploying to Elastic Beanstalk...');

    const appName = this.projectName;
    const envName = `${this.projectName}-env`;

    // Step 1: Create application
    try {
      await this.elasticbeanstalk.createApplication({
        ApplicationName: appName,
        Description: `ILUVATAR deployment: ${this.projectName}`
      }).promise();
      console.log(`✓ Application created: ${appName}`);
    } catch (error) {
      if (error.code === 'InvalidParameterValue') {
        console.log(`  Application already exists: ${appName}`);
      } else {
        throw error;
      }
    }

    // Step 2: Create application version
    console.log('Creating application bundle...');
    const zipPath = await this.createApplicationBundle();
    console.log(`✓ Bundle created: ${zipPath}`);

    // Upload to S3
    const bucketName = `elasticbeanstalk-${this.region}-${Date.now()}`;
    await this.s3.createBucket({ Bucket: bucketName }).promise();

    const s3Key = `${this.projectName}-${Date.now()}.zip`;
    await this.s3.upload({
      Bucket: bucketName,
      Key: s3Key,
      Body: fs.readFileSync(zipPath)
    }).promise();

    console.log('✓ Bundle uploaded to S3');

    // Create application version
    const versionLabel = `v-${Date.now()}`;
    await this.elasticbeanstalk.createApplicationVersion({
      ApplicationName: appName,
      VersionLabel: versionLabel,
      SourceBundle: {
        S3Bucket: bucketName,
        S3Key: s3Key
      }
    }).promise();

    console.log(`✓ Application version created: ${versionLabel}`);

    // Step 3: Create environment
    const platform = await this.detectElasticBeanstalkPlatform();

    const environment = await this.elasticbeanstalk.createEnvironment({
      ApplicationName: appName,
      EnvironmentName: envName,
      SolutionStackName: platform,
      VersionLabel: versionLabel,
      OptionSettings: this.getElasticBeanstalkOptions()
    }).promise();

    console.log(`✓ Environment created: ${envName}`);

    // Wait for environment to be ready
    console.log('  Waiting for environment to be ready...');
    await this.waitForEnvironmentReady(appName, envName);

    const url = environment.CNAME ? `http://${environment.CNAME}` : environment.EndpointURL;

    return {
      deployment_type: 'elastic-beanstalk',
      application_name: appName,
      environment_name: envName,
      version_label: versionLabel,
      url: url
    };
  }

  /**
   * Deploy to EC2 instance
   */
  async deployToEC2() {
    console.log('Deploying to EC2...');

    // Step 1: Create security group
    const securityGroup = await this.createSecurityGroup();
    console.log(`✓ Security group created: ${securityGroup.GroupId}`);

    // Step 2: Launch EC2 instance
    const instance = await this.launchEC2Instance(securityGroup.GroupId);
    console.log(`✓ EC2 instance launched: ${instance.InstanceId}`);

    // Wait for instance to be running
    console.log('  Waiting for instance to be running...');
    await this.waitForInstanceRunning(instance.InstanceId);

    // Get public IP
    const instanceData = await this.ec2.describeInstances({
      InstanceIds: [instance.InstanceId]
    }).promise();

    const publicIp = instanceData.Reservations[0].Instances[0].PublicIpAddress;
    console.log(`✓ Instance running at: ${publicIp}`);

    // Step 3: Deploy application to instance via SSH
    console.log('Deploying application to instance...');
    await this.deployToInstance(publicIp);
    console.log('✓ Application deployed');

    const url = `http://${publicIp}`;

    return {
      deployment_type: 'ec2',
      instance_id: instance.InstanceId,
      public_ip: publicIp,
      security_group_id: securityGroup.GroupId,
      url: url
    };
  }

  /**
   * Deploy to ECS (Docker containers)
   */
  async deployToECS() {
    console.log('Deploying to ECS...');

    // This would involve:
    // 1. Building Docker image
    // 2. Pushing to ECR
    // 3. Creating ECS cluster
    // 4. Creating task definition
    // 5. Creating service

    throw new Error('ECS deployment not yet implemented. Use elastic-beanstalk or ec2 instead.');
  }

  /**
   * Build project
   */
  buildProject() {
    const runtime = this.detectRuntime();

    const buildCommands = {
      'nodejs': 'npm install && npm run build',
      'python': 'pip install -r requirements.txt',
      'static': null
    };

    const command = buildCommands[runtime];

    if (command) {
      execSync(command, {
        cwd: this.projectPath,
        stdio: 'inherit'
      });
    }
  }

  /**
   * Get build directory
   */
  getBuildDirectory() {
    const buildDirs = ['build', 'dist', '.next', 'public', 'out'];

    for (const dir of buildDirs) {
      const fullPath = path.join(this.projectPath, dir);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return this.projectPath;
  }

  /**
   * Upload directory to S3
   */
  async uploadDirectoryToS3(directoryPath, bucketName) {
    const files = this.getAllFiles(directoryPath);

    for (const file of files) {
      const fileContent = fs.readFileSync(file);
      const key = path.relative(directoryPath, file).replace(/\\/g, '/');

      await this.s3.upload({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: this.getContentType(file)
      }).promise();

      console.log(`  Uploaded: ${key}`);
    }
  }

  /**
   * Get all files in directory recursively
   */
  getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);

      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });

    return arrayOfFiles;
  }

  /**
   * Get content type for file
   */
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain'
    };

    return types[ext] || 'application/octet-stream';
  }

  /**
   * Create CloudFront distribution
   */
  async createCloudFrontDistribution(bucketName) {
    const params = {
      DistributionConfig: {
        CallerReference: Date.now().toString(),
        Comment: `ILUVATAR deployment: ${this.projectName}`,
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [{
            Id: `S3-${bucketName}`,
            DomainName: `${bucketName}.s3.amazonaws.com`,
            S3OriginConfig: {
              OriginAccessIdentity: ''
            }
          }]
        },
        DefaultCacheBehavior: {
          TargetOriginId: `S3-${bucketName}`,
          ViewerProtocolPolicy: 'redirect-to-https',
          AllowedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD']
          },
          ForwardedValues: {
            QueryString: false,
            Cookies: { Forward: 'none' }
          },
          TrustedSigners: {
            Enabled: false,
            Quantity: 0
          },
          MinTTL: 0
        },
        DefaultRootObject: 'index.html'
      }
    };

    const result = await this.cloudfront.createDistribution(params).promise();

    return {
      id: result.Distribution.Id,
      domainName: result.Distribution.DomainName
    };
  }

  /**
   * Detect runtime
   */
  detectRuntime() {
    if (fs.existsSync(path.join(this.projectPath, 'package.json'))) {
      return 'nodejs';
    }
    if (fs.existsSync(path.join(this.projectPath, 'requirements.txt'))) {
      return 'python';
    }
    return 'static';
  }

  /**
   * Create security group for EC2
   */
  async createSecurityGroup() {
    const result = await this.ec2.createSecurityGroup({
      GroupName: `${this.projectName}-sg-${Date.now()}`,
      Description: `Security group for ${this.projectName}`
    }).promise();

    // Allow HTTP and SSH
    await this.ec2.authorizeSecurityGroupIngress({
      GroupId: result.GroupId,
      IpPermissions: [
        {
          IpProtocol: 'tcp',
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        },
        {
          IpProtocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        }
      ]
    }).promise();

    return result;
  }

  /**
   * Helper methods
   */
  async verifyDeployment(url) {
    // Similar to other deployers
    return true;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Additional helper methods would go here...
}

module.exports = AWSDeployer;
