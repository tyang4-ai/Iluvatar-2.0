const fs = require('fs');
const path = require('path');

// Agent file mappings
const agentFiles = {
  '04-denethor.md': 'Denethor - Work distribution agent for backend/frontend queues',
  '06-pippin.md': 'Pippin - Discord concierge for notifications and checkpoints',
  '09-gandalf.md': 'Gandalf - Ideation wizard generating hackathon ideas',
  '10-radagast.md': 'Radagast - Architecture agent designing tech stack',
  '21-saruman.md': 'Saruman - Submission agent for devpost preparation',
  '22-sauron.md': 'Sauron - Video script agent for demo creation'
};

// Process workflow file
function processWorkflow(workflowPath) {
  console.log(`Processing: ${workflowPath}`);
  let content = fs.readFileSync(workflowPath, 'utf8');
  let modified = false;

  // For each agent, replace the fs.readFileSync pattern with inline prompt
  for (const [agentFile, description] of Object.entries(agentFiles)) {
    // Pattern: const fs = require('fs');\nconst systemPrompt = fs.readFileSync('/data/agents/XX.md', 'utf8');
    const patterns = [
      // Pattern 1: Full fs require and readFileSync
      new RegExp(
        `const fs = require\\('fs'\\);\\\\nconst systemPrompt = fs\\.readFileSync\\('/data/agents/${agentFile.replace('.', '\\.')}',\\s*'utf8'\\);`,
        'g'
      ),
      // Pattern 2: Just the readFileSync
      new RegExp(
        `fs\\.readFileSync\\('/data/agents/${agentFile.replace('.', '\\.')}',\\s*'utf8'\\)`,
        'g'
      )
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        // Read the actual agent file if it exists
        const agentPath = path.join(__dirname, 'agents', agentFile);
        let systemPrompt = description;

        if (fs.existsSync(agentPath)) {
          // Read and escape the agent content for JSON
          let agentContent = fs.readFileSync(agentPath, 'utf8');
          // Escape for embedding in JSON string
          agentContent = agentContent
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '')
            .replace(/\t/g, '\\t');
          systemPrompt = agentContent;
        }

        // Replace pattern with inline string
        content = content.replace(patterns[0], `const systemPrompt = "${systemPrompt}";`);
        content = content.replace(patterns[1], `"${systemPrompt}"`);
        modified = true;
        console.log(`  - Fixed: ${agentFile}`);
      }
    }
  }

  if (modified) {
    fs.writeFileSync(workflowPath, content);
    console.log(`  Updated: ${workflowPath}`);
  } else {
    console.log(`  No changes needed: ${workflowPath}`);
  }
}

// Process all workflow files
const workflowDir = path.join(__dirname, 'n8n-workflows');
const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.json'));

files.forEach(file => {
  processWorkflow(path.join(workflowDir, file));
});

console.log('\nDone!');
