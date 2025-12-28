const fs = require('fs');
const path = require('path');

const workflowDir = path.join(__dirname, 'n8n-workflows');

// Files that need fixing
const filesToFix = [
  '02-backend-clone-handler.json',
  '02-debugging-pyramid.json',
  '03-frontend-clone-handler.json',
  '03-micro-checkpoints.json',
  '05-velocity-tracking.json'
];

filesToFix.forEach(fileName => {
  const filePath = path.join(workflowDir, fileName);
  console.log(`Fixing: ${fileName}`);

  let content = fs.readFileSync(filePath, 'utf8');

  // The problem: systemPrompt = "You are..." should be systemPrompt = \"You are...\"
  // Pattern: inside functionCode, we have unescaped quotes around the agent description

  // Fix pattern: 'systemPrompt = "You are' -> 'systemPrompt = \\"You are'
  // and the closing '";\n' -> '\\";\\n'

  // Match and replace the problematic patterns
  // These are inside JSON strings (functionCode values)

  // The pattern appears as: systemPrompt = "You are [Agent], the [role]."
  // In JSON it should be: systemPrompt = \\"You are [Agent], the [role].\\"

  content = content.replace(
    /systemPrompt = "([^"]+)";/g,
    (match, prompt) => {
      // Escape the prompt content for JSON
      const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `systemPrompt = \\"${escaped}\\";`;
    }
  );

  // Verify JSON is valid
  try {
    JSON.parse(content);
    fs.writeFileSync(filePath, content);
    console.log(`  Fixed and validated: ${fileName}`);
  } catch (e) {
    console.error(`  ERROR: Still invalid JSON after fix: ${e.message}`);
    // Try alternative approach - find the raw pattern
  }
});

console.log('\nDone!');
