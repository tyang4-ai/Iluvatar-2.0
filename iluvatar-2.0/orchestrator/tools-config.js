/**
 * ILUVATAR 3.0 - Tools Configuration
 *
 * Defines MCP tools available to agents.
 * Configures tool credentials per hackathon.
 */

// Available tool categories
const TOOL_CATEGORIES = {
  FILE_SYSTEM: 'file_system',
  CODE: 'code',
  WEB: 'web',
  DATABASE: 'database',
  DEPLOYMENT: 'deployment',
  COMMUNICATION: 'communication',
  AI: 'ai'
};

// Tool definitions
const TOOLS = {
  // File System Tools
  read_file: {
    name: 'read_file',
    category: TOOL_CATEGORIES.FILE_SYSTEM,
    description: 'Read contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' }
      },
      required: ['path']
    }
  },

  write_file: {
    name: 'write_file',
    category: TOOL_CATEGORIES.FILE_SYSTEM,
    description: 'Write content to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },

  list_files: {
    name: 'list_files',
    category: TOOL_CATEGORIES.FILE_SYSTEM,
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Include subdirectories' }
      },
      required: ['path']
    }
  },

  // Code Tools
  run_command: {
    name: 'run_command',
    category: TOOL_CATEGORIES.CODE,
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  },

  run_tests: {
    name: 'run_tests',
    category: TOOL_CATEGORIES.CODE,
    description: 'Run test suite',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Test file or directory' },
        framework: { type: 'string', enum: ['jest', 'mocha', 'pytest', 'vitest'] }
      }
    }
  },

  lint_code: {
    name: 'lint_code',
    category: TOOL_CATEGORIES.CODE,
    description: 'Run linter on code',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to lint' },
        fix: { type: 'boolean', description: 'Auto-fix issues' }
      },
      required: ['path']
    }
  },

  // Web Tools
  fetch_url: {
    name: 'fetch_url',
    category: TOOL_CATEGORIES.WEB,
    description: 'Fetch content from a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body' }
      },
      required: ['url']
    }
  },

  search_web: {
    name: 'search_web',
    category: TOOL_CATEGORIES.WEB,
    description: 'Search the web',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' }
      },
      required: ['query']
    }
  },

  // Database Tools
  query_database: {
    name: 'query_database',
    category: TOOL_CATEGORIES.DATABASE,
    description: 'Execute database query',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query' },
        database: { type: 'string', description: 'Database name' }
      },
      required: ['query']
    }
  },

  // Deployment Tools
  deploy_vercel: {
    name: 'deploy_vercel',
    category: TOOL_CATEGORIES.DEPLOYMENT,
    description: 'Deploy to Vercel',
    parameters: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Project directory' },
        production: { type: 'boolean', description: 'Deploy to production' }
      },
      required: ['project_path']
    }
  },

  deploy_railway: {
    name: 'deploy_railway',
    category: TOOL_CATEGORIES.DEPLOYMENT,
    description: 'Deploy to Railway',
    parameters: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Project directory' },
        database: { type: 'string', enum: ['postgresql', 'mysql', 'mongodb', 'redis'] }
      },
      required: ['project_path']
    }
  },

  // Git Tools
  git_commit: {
    name: 'git_commit',
    category: TOOL_CATEGORIES.CODE,
    description: 'Commit changes to git',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files to commit' }
      },
      required: ['message']
    }
  },

  git_push: {
    name: 'git_push',
    category: TOOL_CATEGORIES.CODE,
    description: 'Push commits to remote',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch to push' }
      }
    }
  },

  // Communication Tools
  send_discord_message: {
    name: 'send_discord_message',
    category: TOOL_CATEGORIES.COMMUNICATION,
    description: 'Send message to Discord channel',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message content' },
        embed: { type: 'object', description: 'Discord embed object' }
      },
      required: ['message']
    }
  },

  request_user_input: {
    name: 'request_user_input',
    category: TOOL_CATEGORIES.COMMUNICATION,
    description: 'Request input from user via Discord',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Prompt message' },
        options: { type: 'array', items: { type: 'string' }, description: 'Options to present' },
        timeout_minutes: { type: 'number', description: 'Timeout in minutes' }
      },
      required: ['prompt']
    }
  }
};

class ToolsConfig {
  constructor(options = {}) {
    this.tools = { ...TOOLS };
    this.enabledTools = new Set(Object.keys(TOOLS));

    // Credentials storage per hackathon
    this.credentials = new Map();
  }

  /**
   * Get all available tools
   */
  getAllTools() {
    return Object.values(this.tools);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category) {
    return Object.values(this.tools).filter(tool => tool.category === category);
  }

  /**
   * Get tool by name
   */
  getTool(name) {
    return this.tools[name];
  }

  /**
   * Get enabled tools
   */
  getEnabledTools() {
    return Array.from(this.enabledTools).map(name => this.tools[name]).filter(Boolean);
  }

  /**
   * Enable a tool
   */
  enableTool(name) {
    if (this.tools[name]) {
      this.enabledTools.add(name);
    }
  }

  /**
   * Disable a tool
   */
  disableTool(name) {
    this.enabledTools.delete(name);
  }

  /**
   * Set credentials for a hackathon
   */
  setCredentials(hackathonId, credentials) {
    this.credentials.set(hackathonId, {
      ...this.credentials.get(hackathonId),
      ...credentials
    });
  }

  /**
   * Get credentials for a hackathon
   */
  getCredentials(hackathonId) {
    return this.credentials.get(hackathonId) || {};
  }

  /**
   * Get tools formatted for agent
   */
  getToolsForAgent(agentName) {
    // Different agents have access to different tools
    const agentToolAccess = {
      // Core development agents - full access
      'Gimli': ['read_file', 'write_file', 'list_files', 'run_command', 'run_tests', 'git_commit', 'git_push'],
      'Legolas': ['read_file', 'write_file', 'list_files', 'run_command', 'run_tests', 'git_commit', 'git_push'],
      'Aragorn': ['read_file', 'write_file', 'list_files', 'run_command', 'run_tests', 'git_commit', 'git_push'],

      // Architecture/Planning - read + web
      'Gandalf': ['read_file', 'list_files', 'search_web', 'fetch_url'],
      'Radagast': ['read_file', 'list_files', 'search_web', 'fetch_url'],

      // Deployment - deployment tools
      'Eomer': ['read_file', 'list_files', 'run_command', 'deploy_vercel', 'deploy_railway', 'git_push'],

      // Testing
      'Thorin': ['read_file', 'write_file', 'run_command', 'run_tests', 'lint_code'],
      'Arwen': ['read_file', 'list_files', 'run_tests'],

      // Communication
      'Pippin': ['send_discord_message', 'request_user_input'],

      // Default - basic file access
      'default': ['read_file', 'list_files']
    };

    const allowedTools = agentToolAccess[agentName] || agentToolAccess['default'];

    return allowedTools
      .filter(name => this.enabledTools.has(name))
      .map(name => this.tools[name])
      .filter(Boolean);
  }

  /**
   * Format tools for Claude API
   */
  formatForClaude(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }

  /**
   * Format tools for OpenAI API
   */
  formatForOpenAI(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  /**
   * Validate tool call
   */
  validateToolCall(toolName, args) {
    const tool = this.tools[toolName];
    if (!tool) {
      return { valid: false, error: `Unknown tool: ${toolName}` };
    }

    if (!this.enabledTools.has(toolName)) {
      return { valid: false, error: `Tool not enabled: ${toolName}` };
    }

    // Validate required parameters
    const required = tool.parameters.required || [];
    for (const param of required) {
      if (!(param in args)) {
        return { valid: false, error: `Missing required parameter: ${param}` };
      }
    }

    return { valid: true };
  }

  /**
   * Get tool categories
   */
  getCategories() {
    return TOOL_CATEGORIES;
  }

  /**
   * Export configuration for container
   */
  exportForContainer(hackathonId) {
    const credentials = this.getCredentials(hackathonId);

    return {
      tools: this.getEnabledTools(),
      credentials: {
        github_token: credentials.github_token ? '***' : null,
        vercel_token: credentials.vercel_token ? '***' : null,
        railway_token: credentials.railway_token ? '***' : null
      }
    };
  }
}

module.exports = { ToolsConfig, TOOLS, TOOL_CATEGORIES };
