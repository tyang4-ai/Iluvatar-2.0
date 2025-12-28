# Skill: Create a New AI Agent

This guide explains how to add a new AI agent to the ILUVATAR system.

## Overview

Agents are Claude-powered AI modules that handle specific tasks in the hackathon automation pipeline. Each agent:
- Has a unique number and LotR-themed name
- Receives input via Redis pub/sub
- Outputs structured JSON
- Can request checkpoints for human approval

## Step 1: Create the Agent Definition

Create a new file in `/iluvatar-2.0/agents/` following the naming pattern:

```
##-agent-name.md
```

Where `##` is the next available number (check existing files).

### Template Structure

```markdown
# [Agent Name] - [Role Description]

## Character
**Name:** [LotR Character Name]
**Model:** claude-sonnet-4-20250514 (or opus for complex reasoning)
**Quote:** "[Relevant quote from the character]"

---

## System Prompt

You are [Agent Name], the [role] in the ILUVATAR hackathon automation pipeline. Your mission is to [primary task].

**CRITICAL RULES:**
1. [Rule 1]
2. [Rule 2]
3. [Rule 3]

### WHEN YOU DON'T KNOW
- It is OK and ENCOURAGED to say "I don't know" when uncertain
- When stuck, send a message to [helper agent] requesting help
- NEVER guess or hallucinate solutions

### LOGGING REQUIREMENTS
- Log frequently using structured format: `{ level, message, trace_id, context }`
- Include trace_id in all log entries for correlation

---

## YOUR INPUTS

You will receive a JSON object with:
```json
{
  "field1": "description",
  "field2": "description"
}
```

---

## YOUR TASK

[Detailed task description with phases if needed]

---

## FINAL OUTPUT FORMAT

Return ONLY valid JSON (no markdown, no extra text):

```json
{
  "agent": "[agent-name]",
  "phase": "[phase-name]",
  "timestamp": "ISO-8601",
  "result": { },
  "next_checkpoint": {
    "name": "[checkpoint_name]",
    "message_to_user": "[Message for Discord]",
    "auto_approve_minutes": 15
  }
}
```

---

## n8n Integration

[Include HTTP Request node configuration for calling the Anthropic API]
```

## Step 2: Create the Prompt File

Create a corresponding file in `/iluvatar-2.0/agent-prompts/`:

```
##-agent-name-prompt.md
```

This can contain a more detailed version of the system prompt, including examples.

## Step 3: Add to n8n Workflow

Add an HTTP Request node to call the agent:

```javascript
{
  "name": "[Agent Name]",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "anthropicApi",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "anthropic-version", "value": "2023-06-01" }
      ]
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        { "name": "model", "value": "={{ $('Config').item.json.models.sonnet }}" },
        { "name": "max_tokens", "value": 4096 },
        { "name": "messages", "value": [{ "role": "user", "content": "={{ $json.prompt }}" }] }
      ]
    }
  }
}
```

## Step 4: Add Message Bus Integration

If the agent needs to communicate with others, add pub/sub handlers:

```javascript
// In the pre-processing node
await $redis.subscribe('agent:YourAgentName');

// In the post-processing node
await $redis.publish('agent:NextAgent', JSON.stringify({
  from: 'YourAgentName',
  to: 'NextAgent',
  type: 'handoff',
  payload: result
}));
```

## Step 5: Add Checkpoint (if needed)

If the agent requires human approval:

```javascript
await $redis.publish('agent:Pippin', JSON.stringify({
  from: 'YourAgentName',
  to: 'Pippin',
  type: 'checkpoint_required',
  checkpoint: {
    name: 'your_checkpoint_name',
    message_to_user: 'Please review...',
    auto_approve_minutes: 15
  },
  payload: result
}));
```

## Example: Gandalf Agent

See `/iluvatar-2.0/agents/09-gandalf.md` for a complete example including:
- Detailed system prompt with phases
- Scoring guidelines
- Input/output JSON schemas
- n8n node configuration
- Pre/post processing nodes

## Model Selection

| Use Case | Model |
|----------|-------|
| Complex reasoning, ideation | `claude-opus-4-20250514` with Extended Thinking |
| Code generation, structured output | `claude-sonnet-4-20250514` |
| Simple transformations | `claude-sonnet-4-20250514` |

## Checklist

- [ ] Agent file created in `/agents/##-name.md`
- [ ] Prompt file created in `/agent-prompts/##-name-prompt.md`
- [ ] n8n workflow node added
- [ ] Input/output JSON schema defined
- [ ] Checkpoint integration if needed
- [ ] Message bus channels configured
- [ ] Tested with sample input
