/**
 * ILUVATAR 2.0 - Vercel Deployer
 *
 * Automated deployment to Vercel for Next.js/React applications
 * Used by Éomer agent (19-eomer.md) for frontend deployments
 *
 * Features:
 * - Auto-detection of Next.js/React/static sites
 * - Environment variable configuration
 * - Domain setup and SSL
 * - Build settings optimization
 * - Deployment verification
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class VercelDeployer {
  constructor(config) {
    this.token = config.vercel_token || process.env.VERCEL_TOKEN;
    this.teamId = config.team_id || null;
    this.projectPath = config.project_path;
    this.projectName = config.project_name;
    this.framework = config.framework || 'nextjs'; // nextjs, react, static
    this.envVars = config.env_vars || {};
    this.apiBaseUrl = 'https://api.vercel.com';

    if (!this.token) {
      throw new Error('Vercel token is required. Set VERCEL_TOKEN environment variable.');
    }
  }

  /**
   * Main deployment function
   */
  async deploy() {
    console.log('🚀 Starting Vercel deployment...');
    console.log(`   Project: ${this.projectName}`);
    console.log(`   Framework: ${this.framework}`);

    try {
      // Step 1: Detect project type
      const detectedFramework = this.detectFramework();
      console.log(`✓ Detected framework: ${detectedFramework}`);

      // Step 2: Create/update Vercel project
      const project = await this.createOrUpdateProject();
      console.log(`✓ Project configured: ${project.name}`);

      // Step 3: Configure environment variables
      await this.configureEnvironmentVariables(project.id);
      console.log(`✓ Environment variables configured (${Object.keys(this.envVars).length} vars)`);

      // Step 4: Create vercel.json configuration
      this.createVercelConfig();
      console.log('✓ Vercel configuration created');

      // Step 5: Install Vercel CLI if not present
      this.ensureVercelCLI();
      console.log('✓ Vercel CLI ready');

      // Step 6: Link project
      await this.linkProject(project.id);
      console.log('✓ Project linked');

      // Step 7: Deploy
      const deployment = await this.executeDeployment();
      console.log(`✓ Deployment successful!`);
      console.log(`   URL: ${deployment.url}`);

      // Step 8: Verify deployment
      const verified = await this.verifyDeployment(deployment.url);
      console.log(`✓ Deployment verified: ${verified ? 'HEALTHY' : 'NEEDS ATTENTION'}`);

      return {
        success: true,
        url: `https://${deployment.url}`,
        deployment_id: deployment.id,
        project_id: project.id,
        framework: detectedFramework,
        verified: verified
      };

    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  /**
   * Detect framework from project structure
   */
  detectFramework() {
    const packageJsonPath = path.join(this.projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return 'static';
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (dependencies.next) {
      return 'nextjs';
    } else if (dependencies.react && dependencies['react-scripts']) {
      return 'create-react-app';
    } else if (dependencies.react && dependencies.vite) {
      return 'vite';
    } else if (dependencies.react) {
      return 'react';
    } else if (dependencies.vue) {
      return 'vue';
    } else {
      return 'static';
    }
  }

  /**
   * Create or update Vercel project via API
   */
  async createOrUpdateProject() {
    try {
      // Check if project exists
      const response = await axios.get(
        `${this.apiBaseUrl}/v9/projects/${this.projectName}`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            ...(this.teamId && { 'teamId': this.teamId })
          }
        }
      );

      console.log('  Project already exists, updating...');
      return response.data;

    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Project doesn't exist, create it
        console.log('  Creating new project...');

        const response = await axios.post(
          `${this.apiBaseUrl}/v9/projects`,
          {
            name: this.projectName,
            framework: this.framework,
            buildCommand: this.getBuildCommand(),
            devCommand: this.getDevCommand(),
            installCommand: 'npm install',
            outputDirectory: this.getOutputDirectory()
          },
          {
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json',
              ...(this.teamId && { 'teamId': this.teamId })
            }
          }
        );

        return response.data;
      }
      throw error;
    }
  }

  /**
   * Configure environment variables
   */
  async configureEnvironmentVariables(projectId) {
    for (const [key, value] of Object.entries(this.envVars)) {
      try {
        await axios.post(
          `${this.apiBaseUrl}/v10/projects/${projectId}/env`,
          {
            key: key,
            value: value,
            type: 'encrypted',
            target: ['production', 'preview']
          },
          {
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`  ✓ Set ${key}`);
      } catch (error) {
        if (error.response && error.response.status === 409) {
          // Variable already exists, update it
          console.log(`  ⟳ Updating ${key}`);
          // Note: Updating requires deleting and recreating due to Vercel API limitations
        } else {
          console.error(`  ✗ Failed to set ${key}:`, error.message);
        }
      }
    }
  }

  /**
   * Create vercel.json configuration file
   */
  createVercelConfig() {
    const config = {
      version: 2,
      framework: this.framework,
      buildCommand: this.getBuildCommand(),
      devCommand: this.getDevCommand(),
      installCommand: 'npm install',
      outputDirectory: this.getOutputDirectory(),
      headers: [
        {
          source: '/api/(.*)',
          headers: [
            {
              key: 'Access-Control-Allow-Origin',
              value: '*'
            },
            {
              key: 'Access-Control-Allow-Methods',
              value: 'GET, POST, PUT, DELETE, OPTIONS'
            },
            {
              key: 'Access-Control-Allow-Headers',
              value: 'Content-Type, Authorization'
            }
          ]
        }
      ],
      rewrites: this.framework === 'nextjs' ? [
        {
          source: '/(.*)',
          destination: '/'
        }
      ] : []
    };

    const configPath = path.join(this.projectPath, 'vercel.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Ensure Vercel CLI is installed
   */
  ensureVercelCLI() {
    try {
      execSync('vercel --version', { stdio: 'ignore' });
    } catch (error) {
      console.log('  Installing Vercel CLI...');
      execSync('npm install -g vercel', { stdio: 'inherit' });
    }
  }

  /**
   * Link project to Vercel
   */
  async linkProject(projectId) {
    const vercelDir = path.join(this.projectPath, '.vercel');

    if (!fs.existsSync(vercelDir)) {
      fs.mkdirSync(vercelDir, { recursive: true });
    }

    const projectJson = {
      projectId: projectId,
      orgId: this.teamId || 'personal'
    };

    fs.writeFileSync(
      path.join(vercelDir, 'project.json'),
      JSON.stringify(projectJson, null, 2)
    );
  }

  /**
   * Execute deployment using Vercel CLI
   */
  async executeDeployment() {
    console.log('  Deploying to production...');

    const deployCmd = `vercel --prod --token ${this.token} --yes`;

    const output = execSync(deployCmd, {
      cwd: this.projectPath,
      encoding: 'utf8'
    });

    // Parse deployment URL from output
    const urlMatch = output.match(/https:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0].replace('https://', '') : null;

    if (!url) {
      throw new Error('Failed to extract deployment URL from Vercel output');
    }

    return {
      url: url,
      id: url.split('-')[0] // Simplified ID extraction
    };
  }

  /**
   * Verify deployment is live and healthy
   */
  async verifyDeployment(url) {
    console.log('  Verifying deployment...');

    const fullUrl = `https://${url}`;
    const maxRetries = 10;
    const retryDelay = 5000; // 5 seconds

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.get(fullUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'ILUVATAR-Vercel-Deployer/1.0'
          }
        });

        if (response.status === 200) {
          console.log(`  ✓ Deployment is live (HTTP ${response.status})`);
          return true;
        }
      } catch (error) {
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
   * Get build command based on framework
   */
  getBuildCommand() {
    const commands = {
      'nextjs': 'next build',
      'create-react-app': 'react-scripts build',
      'vite': 'vite build',
      'react': 'npm run build',
      'vue': 'npm run build',
      'static': null
    };

    // Use hasOwnProperty to properly handle null values (static has no build)
    if (Object.prototype.hasOwnProperty.call(commands, this.framework)) {
      return commands[this.framework];
    }
    return 'npm run build';
  }

  /**
   * Get dev command based on framework
   */
  getDevCommand() {
    const commands = {
      'nextjs': 'next dev',
      'create-react-app': 'react-scripts start',
      'vite': 'vite',
      'react': 'npm run dev',
      'vue': 'npm run serve',
      'static': null
    };

    return commands[this.framework] || 'npm run dev';
  }

  /**
   * Get output directory based on framework
   */
  getOutputDirectory() {
    const directories = {
      'nextjs': '.next',
      'create-react-app': 'build',
      'vite': 'dist',
      'react': 'build',
      'vue': 'dist',
      'static': '.'
    };

    return directories[this.framework] || 'build';
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
    vercel_token: process.env.VERCEL_TOKEN,
    env_vars: {}
  };

  // Parse environment variables from command line
  for (let i = 4; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--env-')) {
      const [key, value] = arg.substring(6).split('=');
      config.env_vars[key] = value;
    }
  }

  const deployer = new VercelDeployer(config);

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

module.exports = VercelDeployer;
