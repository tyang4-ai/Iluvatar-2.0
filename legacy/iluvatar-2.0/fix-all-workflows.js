const fs = require('fs');
const path = require('path');

const workflowDir = path.join(__dirname, 'n8n-workflows');

// Agent prompt mappings - minimal prompts for each agent
const agentPrompts = {
  '01-shadowfax.md': 'You are Shadowfax, the context compression agent. Compress conversation context while preserving key information.',
  '02-quickbeam.md': 'You are Quickbeam, the speculative pre-fetching agent. Anticipate what information will be needed next.',
  '03-gollum.md': 'You are Gollum, the triple monitoring agent. Monitor budget, time, and quality metrics.',
  '04-denethor.md': 'You are Denethor, the work distribution agent. Analyze tasks and distribute work to backend/frontend queues.',
  '05-merry.md': 'You are Merry, the orchestration and GitHub agent. Manage repository operations and workflow coordination.',
  '06-pippin.md': 'You are Pippin, the Discord concierge. Format messages for Discord notifications and user updates.',
  '07-bilbo.md': 'You are Bilbo, the user preferences agent. Track and apply user preferences throughout the project.',
  '08-galadriel.md': 'You are Galadriel, the self-reflection agent. Analyze decisions and suggest improvements.',
  '09-gandalf.md': 'You are Gandalf, the ideation wizard. Generate exactly 3 creative hackathon project ideas with scores for novelty, feasibility, and wow_factor. Return JSON with ideas array.',
  '10-radagast.md': 'You are Radagast, the architecture agent. Design technical architecture including tech_stack, file_structure, and dependencies. Return JSON.',
  '11-treebeard.md': 'You are Treebeard, the 6-layer debugging agent. Analyze errors systematically from L1 (quick fixes) to L6 (human escalation).',
  '12-arwen.md': 'You are Arwen, the test planning agent. Create comprehensive test plans for the project.',
  '13-gimli.md': 'You are Gimli, the backend developer. Write robust backend code following best practices.',
  '14-legolas.md': 'You are Legolas, the frontend developer. Write clean, accessible frontend code.',
  '15-aragorn.md': 'You are Aragorn, the integration agent. Ensure all components work together seamlessly.',
  '16-eowyn.md': 'You are Eowyn, the UI polish agent. Refine user interfaces for optimal user experience.',
  '17-elrond.md': 'You are Elrond, the code review agent. Review code for quality, security, and best practices.',
  '18-thorin.md': 'You are Thorin, the testing agent. Write and execute comprehensive tests.',
  '19-eomer.md': 'You are Eomer, the deployment agent. Handle deployment configuration and execution.',
  '20-haldir.md': 'You are Haldir, the verification agent. Verify that implementations meet requirements.',
  '21-saruman.md': 'You are Saruman, the submission agent. Prepare hackathon submissions and pitch materials.',
  '22-sauron.md': 'You are Sauron, the demo video director. Create compelling demo video scripts.',
  '23-historian.md': 'You are Historian, the archive Q&A agent. Answer questions about past hackathon work.',
  '24-scribe.md': 'You are Scribe, the experience writer. Document the hackathon journey.',
  '25-faramir.md': 'You are Faramir, the rollback coordinator. Manage rollbacks when issues occur.',
  '26-librarian.md': 'You are Librarian, the repository organization agent. Organize and categorize resources.'
};

let totalStats = {
  redisConverted: 0,
  anthropicFixed: 0,
  fsReadFileFixed: 0,
  responseModeFixed: 0,
  filesProcessed: 0
};

function convertRedisNode(node) {
  const params = node.parameters || {};
  const command = params.command || 'GET';
  const key = params.key || 'state:data';
  const args = params.options?.args || params.arguments || '';

  let functionCode = '';

  if (command === 'HMSET' || command === 'HSET') {
    functionCode = `// Converted from Redis ${command} node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const inputData = $input.all();
  const data = inputData[0]?.json || {};
  await redis.hmset('${key}', data);
  return { json: { success: true, operation: '${command}', key: '${key}' } };
} catch (err) {
  console.error('Redis ${command} error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'HGETALL') {
    functionCode = `// Converted from Redis HGETALL node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const result = await redis.hgetall('${key}');
  return { json: result || {} };
} catch (err) {
  console.error('Redis HGETALL error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'HGET') {
    const field = params.field || 'data';
    functionCode = `// Converted from Redis HGET node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const result = await redis.hget('${key}', '${field}');
  return { json: { value: result } };
} catch (err) {
  console.error('Redis HGET error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'SET') {
    functionCode = `// Converted from Redis SET node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const inputData = $input.all();
  const value = JSON.stringify(inputData[0]?.json || {});
  await redis.set('${key}', value);
  return { json: { success: true, operation: 'SET', key: '${key}' } };
} catch (err) {
  console.error('Redis SET error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'GET') {
    functionCode = `// Converted from Redis GET node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const result = await redis.get('${key}');
  let parsed = result;
  try { parsed = JSON.parse(result); } catch(e) {}
  return { json: { value: parsed } };
} catch (err) {
  console.error('Redis GET error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'PUBLISH') {
    functionCode = `// Converted from Redis PUBLISH node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const inputData = $input.all();
  const message = JSON.stringify(inputData[0]?.json || {});
  await redis.publish('${key}', message);
  return { json: { success: true, operation: 'PUBLISH', channel: '${key}' } };
} catch (err) {
  console.error('Redis PUBLISH error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'LPUSH' || command === 'RPUSH') {
    functionCode = `// Converted from Redis ${command} node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const inputData = $input.all();
  const value = JSON.stringify(inputData[0]?.json || {});
  await redis.${command.toLowerCase()}('${key}', value);
  return { json: { success: true, operation: '${command}', key: '${key}' } };
} catch (err) {
  console.error('Redis ${command} error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else if (command === 'INCR' || command === 'DECR') {
    functionCode = `// Converted from Redis ${command} node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const result = await redis.${command.toLowerCase()}('${key}');
  return { json: { value: result } };
} catch (err) {
  console.error('Redis ${command} error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  } else {
    // Generic handler
    functionCode = `// Converted from Redis ${command} node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const result = await redis.call('${command}', '${key}');
  return { json: { success: true, operation: '${command}', result } };
} catch (err) {
  console.error('Redis ${command} error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
  }

  return {
    parameters: { functionCode },
    id: node.id,
    name: node.name,
    type: 'n8n-nodes-base.function',
    typeVersion: 1,
    position: node.position
  };
}

function fixAnthropicAuth(node) {
  if (!node.parameters) return node;

  // Remove credential-based auth
  delete node.credentials;
  delete node.parameters.authentication;
  delete node.parameters.nodeCredentialType;

  // Get existing headers
  const existingHeaders = node.parameters.headerParameters?.parameters || [];

  // Check if x-api-key already exists
  const hasApiKey = existingHeaders.some(h => h.name === 'x-api-key');
  if (!hasApiKey) {
    existingHeaders.unshift({
      name: 'x-api-key',
      value: '={{ $env.ANTHROPIC_API_KEY }}'
    });
  }

  // Ensure anthropic-version header exists
  const hasVersion = existingHeaders.some(h => h.name === 'anthropic-version');
  if (!hasVersion) {
    existingHeaders.push({
      name: 'anthropic-version',
      value: '2023-06-01'
    });
  }

  node.parameters.headerParameters = { parameters: existingHeaders };
  node.parameters.sendHeaders = true;

  return node;
}

function fixFsReadFileSync(content) {
  let modified = content;

  // Pattern: fs.readFileSync('/data/agents/XX-agentname.md', 'utf8')
  const fsPattern = /fs\.readFileSync\s*\(\s*['"]\/data\/agents\/(\d{2}-[a-z]+\.md)['"]\s*,\s*['"]utf8['"]\s*\)/gi;

  modified = modified.replace(fsPattern, (match, agentFile) => {
    const prompt = agentPrompts[agentFile] || `You are an AI agent. Follow instructions carefully.`;
    // Escape for JSON string
    const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"${escaped}"`;
  });

  // Also handle const fs = require('fs'); patterns that might precede
  modified = modified.replace(/const\s+fs\s*=\s*require\s*\(\s*['"]fs['"]\s*\)\s*;?\s*\\n/g, '');

  return modified;
}

function processWorkflow(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\nProcessing: ${fileName}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let workflow;

  try {
    workflow = JSON.parse(content);
  } catch (e) {
    console.error(`  ERROR: Could not parse JSON in ${fileName}`);
    return;
  }

  let stats = {
    redisConverted: 0,
    anthropicFixed: 0,
    fsReadFileFixed: 0,
    responseModeFixed: 0
  };

  // 1. Convert Redis nodes
  workflow.nodes = workflow.nodes.map(node => {
    if (node.type === 'n8n-nodes-base.redis') {
      console.log(`  Converting Redis node: ${node.name}`);
      stats.redisConverted++;
      return convertRedisNode(node);
    }
    return node;
  });

  // 2. Fix Anthropic API auth
  workflow.nodes = workflow.nodes.map(node => {
    if (node.credentials?.anthropicApi || node.parameters?.nodeCredentialType === 'anthropicApi') {
      console.log(`  Fixing Anthropic auth: ${node.name}`);
      stats.anthropicFixed++;
      return fixAnthropicAuth(node);
    }
    return node;
  });

  // 3. Fix responseMode in webhook nodes
  workflow.nodes = workflow.nodes.map(node => {
    if (node.type === 'n8n-nodes-base.webhook' && node.parameters?.responseMode === 'responseNode') {
      console.log(`  Fixing responseMode: ${node.name}`);
      stats.responseModeFixed++;
      node.parameters.responseMode = 'onReceived';
    }
    return node;
  });

  // Convert back to string for fs.readFileSync fix
  content = JSON.stringify(workflow, null, 2);

  // 4. Fix fs.readFileSync in function code
  const originalContent = content;
  content = fixFsReadFileSync(content);
  if (content !== originalContent) {
    const matches = originalContent.match(/fs\.readFileSync/g);
    stats.fsReadFileFixed = matches ? matches.length : 0;
    console.log(`  Fixed ${stats.fsReadFileFixed} fs.readFileSync occurrences`);
  }

  // Write updated workflow
  fs.writeFileSync(filePath, content);

  // Update totals
  totalStats.redisConverted += stats.redisConverted;
  totalStats.anthropicFixed += stats.anthropicFixed;
  totalStats.fsReadFileFixed += stats.fsReadFileFixed;
  totalStats.responseModeFixed += stats.responseModeFixed;
  totalStats.filesProcessed++;

  console.log(`  Done: ${stats.redisConverted} Redis, ${stats.anthropicFixed} Anthropic, ${stats.fsReadFileFixed} fs.readFileSync, ${stats.responseModeFixed} responseMode`);
}

// Process all workflow files
console.log('='.repeat(60));
console.log('ILUVATAR Workflow Fixer - Processing All Workflows');
console.log('='.repeat(60));

const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.json'));
files.forEach(file => processWorkflow(path.join(workflowDir, file)));

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Files processed:     ${totalStats.filesProcessed}`);
console.log(`Redis nodes:         ${totalStats.redisConverted}`);
console.log(`Anthropic nodes:     ${totalStats.anthropicFixed}`);
console.log(`fs.readFileSync:     ${totalStats.fsReadFileFixed}`);
console.log(`responseMode:        ${totalStats.responseModeFixed}`);
console.log('='.repeat(60));
console.log('All workflows updated successfully!');
