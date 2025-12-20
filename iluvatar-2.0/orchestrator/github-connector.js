/**
 * ILUVATAR 3.0 - GitHub Connector
 *
 * Manages GitHub repositories for hackathon projects.
 * Handles cloning, committing, pushing, and PR creation.
 */

const { Octokit } = require('@octokit/rest');
const { execFileSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Validate and sanitize a Git URL
 * @param {string} url - URL to validate
 * @returns {string} Validated URL
 * @throws {Error} If URL is invalid
 */
function validateGitUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid repository URL');
  }

  // Allow HTTPS GitHub URLs, SSH URLs, and local paths
  const validPatterns = [
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
    /^https:\/\/[\w.-]+@github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
    /^git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?$/,
    /^[a-zA-Z]:\\[\w\\.-]+$/, // Windows path
    /^\/[\w/.-]+$/ // Unix path
  ];

  const isValid = validPatterns.some(pattern => pattern.test(url));
  if (!isValid) {
    throw new Error(`Invalid repository URL format: ${url.substring(0, 50)}`);
  }

  return url;
}

/**
 * Validate and sanitize a file path
 * @param {string} targetPath - Path to validate
 * @returns {string} Validated path
 * @throws {Error} If path is invalid
 */
function validatePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Invalid target path');
  }

  // Prevent path traversal
  const normalized = path.normalize(targetPath);
  if (normalized.includes('..')) {
    throw new Error('Path traversal detected');
  }

  // Only allow alphanumeric, dash, underscore, and path separators
  if (!/^[\w\-./\\:]+$/.test(normalized)) {
    throw new Error(`Invalid characters in path: ${normalized.substring(0, 50)}`);
  }

  return normalized;
}

/**
 * Sanitize git config values (username, email)
 * @param {string} value - Value to sanitize
 * @param {string} fieldName - Name of field for error messages
 * @returns {string} Sanitized value
 */
function sanitizeGitConfigValue(value, fieldName) {
  if (!value || typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}`);
  }

  // Allow alphanumeric, spaces, @, dots, dashes, underscores
  const sanitized = value.trim();
  if (!/^[\w\s@.\-]+$/.test(sanitized)) {
    throw new Error(`Invalid characters in ${fieldName}`);
  }

  if (sanitized.length > 100) {
    throw new Error(`${fieldName} too long (max 100 characters)`);
  }

  return sanitized;
}

/**
 * Sanitize branch names
 * @param {string} branch - Branch name to sanitize
 * @returns {string} Sanitized branch name
 */
function sanitizeBranchName(branch) {
  if (!branch || typeof branch !== 'string') {
    return 'main';
  }

  // Only allow alphanumeric, dash, underscore, slash
  const sanitized = branch.trim();
  if (!/^[\w\-/]+$/.test(sanitized)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }

  return sanitized;
}

class GitHubConnector {
  constructor(options = {}) {
    this.token = options.token || process.env.GITHUB_TOKEN;
    this.octokit = this.token ? new Octokit({ auth: this.token }) : null;
    this.defaultOrg = options.org || process.env.GITHUB_ORG;
  }

  /**
   * Create a new repository for a hackathon
   */
  async createRepository(hackathonId, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const repoName = options.name || `hackathon-${hackathonId}`;
    const isPrivate = options.private !== false;

    const response = await this.octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: options.description || `ILUVATAR Hackathon Project: ${hackathonId}`,
      private: isPrivate,
      auto_init: true,
      gitignore_template: 'Node'
    });

    return {
      name: response.data.name,
      full_name: response.data.full_name,
      clone_url: response.data.clone_url,
      ssh_url: response.data.ssh_url,
      html_url: response.data.html_url
    };
  }

  /**
   * Create repository in organization
   */
  async createOrgRepository(hackathonId, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const org = options.org || this.defaultOrg;
    if (!org) {
      throw new Error('Organization not specified');
    }

    const repoName = options.name || `hackathon-${hackathonId}`;

    const response = await this.octokit.repos.createInOrg({
      org,
      name: repoName,
      description: options.description || `ILUVATAR Hackathon Project: ${hackathonId}`,
      private: options.private !== false,
      auto_init: true
    });

    return {
      name: response.data.name,
      full_name: response.data.full_name,
      clone_url: response.data.clone_url,
      ssh_url: response.data.ssh_url,
      html_url: response.data.html_url
    };
  }

  /**
   * Clone a repository
   */
  async cloneRepository(repoUrl, targetDir, options = {}) {
    // Validate inputs to prevent injection
    const validatedUrl = validateGitUrl(repoUrl);
    const validatedPath = validatePath(targetDir);
    const cloneUrl = this.getAuthenticatedUrl(validatedUrl);

    try {
      // Clone the repository using array arguments (safe from injection)
      execFileSync('git', ['clone', cloneUrl, validatedPath], {
        stdio: options.silent ? 'ignore' : 'inherit'
      });

      // Configure git
      if (options.userName && options.userEmail) {
        const userName = sanitizeGitConfigValue(options.userName, 'userName');
        const userEmail = sanitizeGitConfigValue(options.userEmail, 'userEmail');

        execFileSync('git', ['config', 'user.name', userName], { cwd: validatedPath });
        execFileSync('git', ['config', 'user.email', userEmail], { cwd: validatedPath });
      }

      return validatedPath;
    } catch (error) {
      // Redact any token from error messages
      const safeMessage = error.message.replace(/https:\/\/[^@]+@/g, 'https://[REDACTED]@');
      throw new Error(`Failed to clone repository: ${safeMessage}`);
    }
  }

  /**
   * Get authenticated URL for cloning
   */
  getAuthenticatedUrl(url) {
    if (!this.token) return url;

    // Convert HTTPS URL to include token
    if (url.startsWith('https://github.com/')) {
      return url.replace('https://github.com/', `https://${this.token}@github.com/`);
    }

    return url;
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(repoDir, message, options = {}) {
    const validatedPath = validatePath(repoDir);
    const branch = sanitizeBranchName(options.branch || 'main');

    try {
      // Stage all changes
      execFileSync('git', ['add', '-A'], { cwd: validatedPath });

      // Check if there are changes to commit
      try {
        execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: validatedPath });
        // No changes
        return { committed: false, message: 'No changes to commit' };
      } catch (e) {
        // There are changes - this is expected, continue
      }

      // Commit - message passed as single argument (safe from injection)
      const commitMessage = `${message}\n\n🤖 Generated by ILUVATAR`;
      execFileSync('git', ['commit', '-m', commitMessage], { cwd: validatedPath });

      // Push
      execFileSync('git', ['push', 'origin', branch], { cwd: validatedPath });

      // Get commit hash
      const hash = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: validatedPath,
        encoding: 'utf8'
      }).trim();

      return {
        committed: true,
        hash,
        message
      };
    } catch (error) {
      // Redact any token from error messages
      const safeMessage = error.message.replace(/https:\/\/[^@]+@/g, 'https://[REDACTED]@');
      throw new Error(`Failed to commit/push: ${safeMessage}`);
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(repoDir, branchName, options = {}) {
    const validatedPath = validatePath(repoDir);
    const validatedBranchName = sanitizeBranchName(branchName);
    const baseBranch = sanitizeBranchName(options.baseBranch || 'main');

    try {
      // Ensure we're on base branch and up to date
      execFileSync('git', ['checkout', baseBranch], { cwd: validatedPath });
      execFileSync('git', ['pull'], { cwd: validatedPath });

      // Create and checkout new branch
      execFileSync('git', ['checkout', '-b', validatedBranchName], { cwd: validatedPath });

      return validatedBranchName;
    } catch (error) {
      const safeMessage = error.message.replace(/https:\/\/[^@]+@/g, 'https://[REDACTED]@');
      throw new Error(`Failed to create branch: ${safeMessage}`);
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(owner, repo, options) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const response = await this.octokit.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body || '',
      head: options.head,
      base: options.base || 'main'
    });

    return {
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state
    };
  }

  /**
   * Get repository contents
   */
  async getContents(owner, repo, filePath = '') {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const response = await this.octokit.repos.getContent({
      owner,
      repo,
      path: filePath
    });

    return response.data;
  }

  /**
   * Create or update file
   */
  async createOrUpdateFile(owner, repo, filePath, content, message, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    // Check if file exists
    let sha;
    try {
      const existing = await this.octokit.repos.getContent({
        owner,
        repo,
        path: filePath
      });
      sha = existing.data.sha;
    } catch (e) {
      // File doesn't exist
    }

    const response = await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `${message}\n\n🤖 Generated by ILUVATAR`,
      content: Buffer.from(content).toString('base64'),
      sha,
      branch: options.branch || 'main'
    });

    return {
      sha: response.data.content.sha,
      url: response.data.content.html_url
    };
  }

  /**
   * Delete file
   */
  async deleteFile(owner, repo, filePath, message, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    // Get file SHA
    const existing = await this.octokit.repos.getContent({
      owner,
      repo,
      path: filePath
    });

    await this.octokit.repos.deleteFile({
      owner,
      repo,
      path: filePath,
      message: `${message}\n\n🤖 Deleted by ILUVATAR`,
      sha: existing.data.sha,
      branch: options.branch || 'main'
    });

    return { deleted: true };
  }

  /**
   * Create release
   */
  async createRelease(owner, repo, options) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const response = await this.octokit.repos.createRelease({
      owner,
      repo,
      tag_name: options.tag,
      name: options.name || options.tag,
      body: options.body || '',
      draft: options.draft || false,
      prerelease: options.prerelease || false
    });

    return {
      id: response.data.id,
      tag: response.data.tag_name,
      url: response.data.html_url,
      upload_url: response.data.upload_url
    };
  }

  /**
   * Get repository info
   */
  async getRepository(owner, repo) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const response = await this.octokit.repos.get({ owner, repo });

    return {
      name: response.data.name,
      full_name: response.data.full_name,
      description: response.data.description,
      private: response.data.private,
      html_url: response.data.html_url,
      clone_url: response.data.clone_url,
      default_branch: response.data.default_branch,
      language: response.data.language,
      stars: response.data.stargazers_count,
      forks: response.data.forks_count
    };
  }

  /**
   * List repository commits
   */
  async listCommits(owner, repo, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const response = await this.octokit.repos.listCommits({
      owner,
      repo,
      per_page: options.limit || 30
    });

    return response.data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      url: commit.html_url
    }));
  }

  /**
   * Add collaborator to repository
   */
  async addCollaborator(owner, repo, username, permission = 'push') {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    await this.octokit.repos.addCollaborator({
      owner,
      repo,
      username,
      permission
    });

    return { added: true, username, permission };
  }

  /**
   * Fork repository (for working on existing projects)
   */
  async forkRepository(owner, repo, options = {}) {
    if (!this.octokit) {
      throw new Error('GitHub token not configured');
    }

    const response = await this.octokit.repos.createFork({
      owner,
      repo,
      organization: options.org
    });

    return {
      name: response.data.name,
      full_name: response.data.full_name,
      clone_url: response.data.clone_url,
      html_url: response.data.html_url
    };
  }

  /**
   * Check if repository exists
   */
  async repositoryExists(owner, repo) {
    if (!this.octokit) return false;

    try {
      await this.octokit.repos.get({ owner, repo });
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { GitHubConnector };
