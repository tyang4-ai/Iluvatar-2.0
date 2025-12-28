const fs = require('fs');
const path = require('path');

// Read workflow file
const workflowPath = path.join(__dirname, 'n8n-workflows', '01-iluvatar-master.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('Converting Redis nodes to Function nodes...');
let converted = 0;

workflow.nodes = workflow.nodes.map(node => {
  if (node.type === 'n8n-nodes-base.redis') {
    console.log(`Converting: ${node.name} (${node.id})`);

    const params = node.parameters || {};
    const command = params.command || 'SET';
    const key = params.key || 'state:data';
    const args = params.options?.args || '';

    let functionCode = '';

    if (command === 'HMSET') {
      // HMSET state:data field1 value1 field2 value2 ...
      functionCode = `// Converted from Redis HMSET node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const argsData = ${args.replace(/^={{ /, '').replace(/ }}$/, '')};
  const pairs = JSON.parse(argsData);
  // HMSET expects key, field1, value1, field2, value2...
  await redis.hmset('${key}', ...pairs);
  return { json: { success: true, operation: 'HMSET', key: '${key}' } };
} catch (err) {
  console.error('Redis HMSET error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
    } else if (command === 'SET') {
      // SET key value
      functionCode = `// Converted from Redis SET node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  await redis.set('${key}', '${args}');
  return { json: { success: true, operation: 'SET', key: '${key}' } };
} catch (err) {
  console.error('Redis SET error:', err.message);
  throw err;
} finally {
  await redis.quit();
}`;
    } else if (command === 'PUBLISH') {
      // PUBLISH channel message
      functionCode = `// Converted from Redis PUBLISH node
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});

try {
  const message = ${args.replace(/^={{ /, '').replace(/ }}$/, '')};
  await redis.publish('${key}', message);
  return { json: { success: true, operation: 'PUBLISH', channel: '${key}' } };
} catch (err) {
  console.error('Redis PUBLISH error:', err.message);
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

    converted++;

    // Return converted node
    return {
      parameters: {
        functionCode: functionCode
      },
      id: node.id,
      name: node.name,
      type: 'n8n-nodes-base.function',
      typeVersion: 1,
      position: node.position
    };
  }
  return node;
});

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\nConverted ${converted} Redis nodes to Function nodes.`);
console.log('Workflow updated successfully!');
