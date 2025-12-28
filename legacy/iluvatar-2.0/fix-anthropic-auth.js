const fs = require('fs');
const path = require('path');

// Read workflow file
const workflowPath = path.join(__dirname, 'n8n-workflows', '01-iluvatar-master.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

console.log('Fixing Anthropic API authentication...');
let fixed = 0;

workflow.nodes = workflow.nodes.map(node => {
  // Check if this node uses anthropicApi credentials
  if (node.credentials?.anthropicApi || node.parameters?.nodeCredentialType === 'anthropicApi') {
    console.log(`Fixing: ${node.name} (${node.id})`);

    // Remove credentials and change authentication
    delete node.credentials;

    if (node.parameters) {
      // Remove predefined credential type
      delete node.parameters.authentication;
      delete node.parameters.nodeCredentialType;

      // Add x-api-key header
      const existingHeaders = node.parameters.headerParameters?.parameters || [];

      // Check if x-api-key already exists
      const hasApiKey = existingHeaders.some(h => h.name === 'x-api-key');
      if (!hasApiKey) {
        existingHeaders.unshift({
          name: 'x-api-key',
          value: '={{$env.ANTHROPIC_API_KEY}}'
        });
      }

      node.parameters.headerParameters = {
        parameters: existingHeaders
      };
      node.parameters.sendHeaders = true;
    }

    fixed++;
  }
  return node;
});

// Write updated workflow
fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
console.log(`\nFixed ${fixed} Anthropic API nodes.`);
console.log('Workflow updated successfully!');
