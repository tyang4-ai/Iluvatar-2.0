/**
 * ILUVATAR 2.0 - Railway Deployer
 *
 * Automated deployment to Railway for backend applications with database
 * Used by Éomer agent (19-eomer.md) for backend + database deployments
 *
 * Features:
 * - Automatic PostgreSQL/MySQL/MongoDB/Redis provisioning
 * - Environment variable configuration
 * - Build settings optimization
 * - Health check configuration
 * - Deployment verification
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class RailwayDeployer {
  constructor(config) {
    this.token = config.railway_token || process.env.RAILWAY_TOKEN;
    this.projectPath = config.project_path;
    this.projectName = config.project_name;
    this.runtime = config.runtime || 'nodejs'; // nodejs, python, go, ruby
    this.database = config.database || null; // postgresql, mysql, mongodb, redis, none
    this.envVars = config.env_vars || {};
    this.apiBaseUrl = 'https://backboard.railway.app/graphql';

    if (!this.token) {
      throw new Error('Railway token is required. Set RAILWAY_TOKEN environment variable.');
    }
  }

  /**
   * Main deployment function
   */
  async deploy() {
    console.log('🚀 Starting Railway deployment...');
    console.log(`   Project: ${this.projectName}`);
    console.log(`   Runtime: ${this.runtime}`);
    console.log(`   Database: ${this.database || 'none'}`);

    try {
      // Step 1: Detect runtime
      const detectedRuntime = this.detectRuntime();
      console.log(`✓ Detected runtime: ${detectedRuntime}`);

      // Step 2: Install Railway CLI
      this.ensureRailwayCLI();
      console.log('✓ Railway CLI ready');

      // Step 3: Create or link project
      const project = await this.createOrLinkProject();
      console.log(`✓ Project configured: ${project.name}`);

      // Step 4: Provision database if needed
      if (this.database) {
        const db = await this.provisionDatabase(project.id);
        console.log(`✓ Database provisioned: ${this.database}`);

        // Add database URL to environment variables
        this.envVars.DATABASE_URL = db.connectionString;
      }

      // Step 5: Configure environment variables
      await this.configureEnvironmentVariables(project.id);
      console.log(`✓ Environment variables configured (${Object.keys(this.envVars).length} vars)`);

      // Step 6: Create railway.json configuration
      this.createRailwayConfig();
      console.log('✓ Railway configuration created');

      // Step 7: Create Procfile if needed
      this.createProcfile();
      console.log('✓ Procfile created');

      // Step 8: Deploy
      const deployment = await this.executeDeployment();
      console.log(`✓ Deployment successful!`);
      console.log(`   URL: ${deployment.url}`);

      // Step 9: Verify deployment
      const verified = await this.verifyDeployment(deployment.url);
      console.log(`✓ Deployment verified: ${verified ? 'HEALTHY' : 'NEEDS ATTENTION'}`);

      return {
        success: true,
        url: deployment.url,
        deployment_id: deployment.id,
        project_id: project.id,
        runtime: detectedRuntime,
        database: this.database,
        database_url: this.database ? this.envVars.DATABASE_URL : null,
        verified: verified
      };

    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  /**
   * Detect runtime from project structure
   */
  detectRuntime() {
    // Check for Node.js
    if (fs.existsSync(path.join(this.projectPath, 'package.json'))) {
      return 'nodejs';
    }

    // Check for Python
    if (fs.existsSync(path.join(this.projectPath, 'requirements.txt')) ||
        fs.existsSync(path.join(this.projectPath, 'Pipfile')) ||
        fs.existsSync(path.join(this.projectPath, 'pyproject.toml'))) {
      return 'python';
    }

    // Check for Go
    if (fs.existsSync(path.join(this.projectPath, 'go.mod'))) {
      return 'go';
    }

    // Check for Ruby
    if (fs.existsSync(path.join(this.projectPath, 'Gemfile'))) {
      return 'ruby';
    }

    // Check for Rust
    if (fs.existsSync(path.join(this.projectPath, 'Cargo.toml'))) {
      return 'rust';
    }

    // Default to Docker if Dockerfile exists
    if (fs.existsSync(path.join(this.projectPath, 'Dockerfile'))) {
      return 'docker';
    }

    return 'nodejs'; // Default fallback
  }

  /**
   * Ensure Railway CLI is installed
   */
  ensureRailwayCLI() {
    try {
      execSync('railway --version', { stdio: 'ignore' });
    } catch (error) {
      console.log('  Installing Railway CLI...');

      // Install based on OS
      const platform = process.platform;

      if (platform === 'darwin' || platform === 'linux') {
        execSync('curl -fsSL https://railway.app/install.sh | sh', { stdio: 'inherit' });
      } else if (platform === 'win32') {
        execSync('npm install -g @railway/cli', { stdio: 'inherit' });
      }
    }
  }

  /**
   * Create or link Railway project
   */
  async createOrLinkProject() {
    try {
      // Login to Railway
      execSync(`railway login --browserless`, {
        input: this.token,
        stdio: 'pipe'
      });

      // Check if project already exists
      try {
        const existingProjects = execSync('railway list', { encoding: 'utf8' });

        if (existingProjects.includes(this.projectName)) {
          console.log('  Linking to existing project...');
          execSync(`railway link ${this.projectName}`, {
            cwd: this.projectPath,
            stdio: 'inherit'
          });
        } else {
          console.log('  Creating new project...');
          execSync(`railway init --name ${this.projectName}`, {
            cwd: this.projectPath,
            stdio: 'inherit'
          });
        }
      } catch (error) {
        // If list fails, create new project
        console.log('  Creating new project...');
        execSync(`railway init --name ${this.projectName}`, {
          cwd: this.projectPath,
          stdio: 'inherit'
        });
      }

      return {
        name: this.projectName,
        id: 'railway-project-id' // Railway CLI doesn't expose project ID easily
      };

    } catch (error) {
      throw new Error(`Failed to create/link Railway project: ${error.message}`);
    }
  }

  /**
   * Provision database
   */
  async provisionDatabase(projectId) {
    console.log(`  Provisioning ${this.database}...`);

    const databaseCommands = {
      'postgresql': 'railway add --database postgres',
      'mysql': 'railway add --database mysql',
      'mongodb': 'railway add --database mongodb',
      'redis': 'railway add --database redis'
    };

    const command = databaseCommands[this.database];

    if (!command) {
      throw new Error(`Unsupported database: ${this.database}`);
    }

    try {
      execSync(command, {
        cwd: this.projectPath,
        stdio: 'inherit'
      });

      // Wait for database to be ready
      await this.sleep(10000);

      // Get database connection string
      const connectionString = execSync('railway variables get DATABASE_URL', {
        cwd: this.projectPath,
        encoding: 'utf8'
      }).trim();

      return {
        type: this.database,
        connectionString: connectionString
      };

    } catch (error) {
      throw new Error(`Failed to provision database: ${error.message}`);
    }
  }

  /**
   * Configure environment variables
   */
  async configureEnvironmentVariables(projectId) {
    for (const [key, value] of Object.entries(this.envVars)) {
      try {
        execSync(`railway variables set ${key}="${value}"`, {
          cwd: this.projectPath,
          stdio: 'pipe'
        });
        console.log(`  ✓ Set ${key}`);
      } catch (error) {
        console.error(`  ✗ Failed to set ${key}:`, error.message);
      }
    }
  }

  /**
   * Create railway.json configuration
   */
  createRailwayConfig() {
    const config = {
      $schema: "https://railway.app/railway.schema.json",
      build: {
        builder: "NIXPACKS",
        buildCommand: this.getBuildCommand()
      },
      deploy: {
        startCommand: this.getStartCommand(),
        healthcheckPath: "/health",
        healthcheckTimeout: 100,
        restartPolicyType: "ON_FAILURE",
        restartPolicyMaxRetries: 10
      }
    };

    const configPath = path.join(this.projectPath, 'railway.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Create Procfile for deployment
   */
  createProcfile() {
    const procfileCommands = {
      'nodejs': 'web: npm start',
      'python': 'web: gunicorn app:app',
      'go': 'web: ./main',
      'ruby': 'web: bundle exec rails server -p $PORT',
      'rust': 'web: ./target/release/app',
      'docker': null // Uses Dockerfile CMD
    };

    const command = procfileCommands[this.runtime];

    if (command) {
      const procfilePath = path.join(this.projectPath, 'Procfile');
      fs.writeFileSync(procfilePath, command);
    }
  }

  /**
   * Execute deployment
   */
  async executeDeployment() {
    console.log('  Deploying to Railway...');

    try {
      const output = execSync('railway up --detach', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      console.log('  Deployment initiated, waiting for URL...');

      // Wait for deployment to complete
      await this.sleep(30000);

      // Get deployment URL
      const url = execSync('railway domain', {
        cwd: this.projectPath,
        encoding: 'utf8'
      }).trim();

      return {
        url: url,
        id: 'railway-deployment-id' // Railway CLI doesn't expose deployment ID easily
      };

    } catch (error) {
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  /**
   * Verify deployment is live and healthy
   */
  async verifyDeployment(url) {
    console.log('  Verifying deployment...');

    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const maxRetries = 10;
    const retryDelay = 10000; // 10 seconds (Railway can take time to start)

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(fullUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'ILUVATAR-Railway-Deployer/1.0'
          }
        });

        if (response.status === 200) {
          console.log(`  ✓ Deployment is live (HTTP ${response.status})`);
          return true;
        }
      } catch (error) {
        // Also check /health endpoint
        try {
          const healthResponse = await axios.get(`${fullUrl}/health`, {
            timeout: 15000
          });

          if (healthResponse.status === 200) {
            console.log(`  ✓ Deployment is live (health check passed)`);
            return true;
          }
        } catch (healthError) {
          // Continue retrying
        }

        if (i < maxRetries - 1) {
          console.log(`  Retry ${i + 1}/${maxRetries} in ${retryDelay / 1000}s...`);
          await this.sleep(retryDelay);
        } else {
          console.error('  ✗ Deployment verification failed:', error.message);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Get build command based on runtime
   */
  getBuildCommand() {
    const commands = {
      'nodejs': 'npm install && npm run build',
      'python': 'pip install -r requirements.txt',
      'go': 'go build -o main .',
      'ruby': 'bundle install',
      'rust': 'cargo build --release',
      'docker': null
    };

    return commands[this.runtime] || null;
  }

  /**
   * Get start command based on runtime
   */
  getStartCommand() {
    const commands = {
      'nodejs': 'npm start',
      'python': 'gunicorn app:app --bind 0.0.0.0:$PORT',
      'go': './main',
      'ruby': 'bundle exec rails server -p $PORT',
      'rust': './target/release/app',
      'docker': null
    };

    return commands[this.runtime] || null;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI usage
if (require.main === module) {
  const config = {
    project_path: process.argv[2] || process.cwd(),
    project_name: process.argv[3] || path.basename(process.cwd()),
    railway_token: process.env.RAILWAY_TOKEN,
    database: process.argv[4] || null,
    env_vars: {}
  };

  // Parse environment variables from command line
  for (let i = 5; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--env-')) {
      const [key, value] = arg.substring(6).split('=');
      config.env_vars[key] = value;
    }
  }

  const deployer = new RailwayDeployer(config);

  deployer.deploy()
    .then(result => {
      console.log('\n✅ Deployment complete!');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Deployment failed!');
      console.error(error);
      process.exit(1);
    });
}

module.exports = RailwayDeployer;
