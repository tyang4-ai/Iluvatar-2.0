# ILUVATAR N8N Workflow Setup

## Overview

The N8N workflow orchestrates the three agents (Gandalf, Frodo, Elrond) in response to Discord bot triggers.

**Workflow URL**: http://50.18.245.194:5678

## Workflow Structure

```
Discord Bot triggers webhook
         ↓
    [Webhook Node]
         ↓
    [IF: Check Action]
         ↓
    ┌────┴────┬────────┐
    ↓         ↓        ↓
 outline    write    revise
    ↓         ↓        ↓
 Gandalf   Frodo    Frodo
    ↓         ↓        ↓
    └────┬────┴────────┘
         ↓
    [Save to Redis]
         ↓
    [IF: action == write/revise]
         ↓
      Elrond
         ↓
    [Save Critique]
         ↓
    [IF: score < threshold]
         ↓
    [Loop back to Frodo OR continue to next chapter]
```

## Setup Steps

### 1. Create New Workflow

1. Open N8N at http://50.18.245.194:5678
2. Click "Add Workflow"
3. Name it "ILUVATAR Novel Writer"

### 2. Add Webhook Node (Entry Point)

1. Add node: **Webhook**
2. Settings:
   - HTTP Method: POST
   - Path: `iluvatar-trigger`
   - Response Mode: "Respond to webhook at end of workflow"
3. Copy the webhook URL - this goes in `N8N_WEBHOOK_URL` env var

The webhook receives:
```json
{
  "action": "outline" | "write" | "revise",
  "novelId": "novel-abc123",
  "metadata": { ... }
}
```

### 3. Add IF Node (Route by Action)

1. Add node: **IF**
2. Conditions:
   - Branch 1: `action` equals `outline`
   - Branch 2: `action` equals `write`
   - Branch 3: `action` equals `revise`

### 4. Add HTTP Request Nodes for AI Calls

For each agent, add an **HTTP Request** node:

#### Gandalf (Planning)
```
URL: https://api.anthropic.com/v1/messages
Method: POST
Headers:
  - x-api-key: {{ $env.ANTHROPIC_API_KEY }}
  - anthropic-version: 2023-06-01
  - content-type: application/json
Body:
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 8192,
  "messages": [
    {
      "role": "user",
      "content": "{{ $json.prompt }}"
    }
  ],
  "system": "{{ $env.GANDALF_PROMPT }}"
}
```

#### Frodo (Writing)
Same structure, different prompt and potentially different model.

#### Elrond (Critic)
Same structure, different prompt.

### 5. Add Redis Nodes

Use the **Redis** node to save results:

1. Add node: **Redis**
2. Operation: Set
3. Key: `novel:{{ $json.novelId }}:data`
4. Value: `{{ $json.output }}`

### 6. Add Text Parser (Function Node)

After each AI call, parse the text markers:

```javascript
// Parse Gandalf's output
const output = $input.first().json.content[0].text;

const sections = {};
const markers = ['TITLE', 'SYNOPSIS', 'CHAPTERS', 'CHARACTERS', 'WORLDBUILDING', 'THEMES', 'NOTES'];

for (const marker of markers) {
  const regex = new RegExp(`## ${marker}\\n([\\s\\S]*?)(?=## |$)`, 'i');
  const match = output.match(regex);
  if (match) {
    sections[marker.toLowerCase()] = match[1].trim();
  }
}

return { json: { ...sections, raw: output } };
```

### 7. Add Loop for Revisions

Use the **Loop Over Items** node combined with an IF check:

1. After Elrond scores, check if `score < 70`
2. If yes, loop back to Frodo with the critique
3. If no, proceed to next chapter

### 8. Environment Variables

Set these in N8N Settings → Variables:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `REDIS_HOST` | localhost or Redis server IP |
| `GANDALF_PROMPT` | Contents of gandalf-planning.md |
| `FRODO_PROMPT` | Contents of frodo-writing.md |
| `ELROND_PROMPT` | Contents of elrond-critic.md |

## Alternative: Code Node Approach

Instead of using the HTTP Request node, you can use a **Code** node with the Anthropic SDK:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: $env.ANTHROPIC_API_KEY });

const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  system: $env.GANDALF_PROMPT,
  messages: [
    { role: 'user', content: $input.first().json.prompt }
  ]
});

return { json: { output: message.content[0].text } };
```

## Testing

1. Activate the workflow
2. Use Discord `/novel create` to trigger
3. Check N8N execution logs for errors
4. Verify Redis has the saved data

## Debugging

- **Execution failed**: Check N8N execution log (click on failed execution)
- **AI returns error**: Verify API key, check rate limits
- **Redis not saving**: Check Redis connection, verify key format
- **Webhook not receiving**: Verify URL in Discord bot config

## Import Workflow

See `n8n-workflow-export.json` for a complete importable workflow.
