# Skill: Create an n8n Workflow

This guide explains how to create or modify n8n workflows for the ILUVATAR system.

## Overview

n8n is the workflow orchestration engine that:
- Triggers pipelines via webhooks
- Chains agent calls together
- Handles error recovery and branching
- Manages state via Redis

## Workflow Location

All workflows are stored in `/iluvatar-2.0/n8n-workflows/`:

| File | Purpose |
|------|---------|
| `01-iluvatar-master.json` | Main entry point (webhook triggers) |
| `02-backend-clone-handler.json` | Backend code generation |
| `02-debugging-pyramid.json` | 6-layer error recovery |
| `03-frontend-clone-handler.json` | Frontend code generation |
| `03-micro-checkpoints.json` | Progress tracking |
| `04-discord-dashboard.json` | Real-time UI updates |
| `04-event-agents.json` | Event dispatching |
| `05-support-agents.json` | Support agent orchestration |
| `05-velocity-tracking.json` | Performance metrics |

## Step 1: Design the Workflow

Before creating nodes, plan:
1. **Trigger**: How will the workflow start? (Webhook, Schedule, Redis message)
2. **Agents**: Which agents will be called and in what order?
3. **Branching**: What conditions require different paths?
4. **Error Handling**: How should failures be handled?
5. **Output**: What is the final result?

## Step 2: Create the Workflow in n8n UI

1. Open n8n at `http://localhost:5678`
2. Click "Add Workflow"
3. Add nodes as needed

### Common Node Types

**Webhook Trigger**
```json
{
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "path": "your-endpoint",
    "httpMethod": "POST",
    "responseMode": "responseNode"
  }
}
```

**HTTP Request (Claude API)**
```json
{
  "name": "Agent Call",
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "anthropicApi"
  }
}
```

**Function Node (Data Transform)**
```json
{
  "name": "Transform",
  "type": "n8n-nodes-base.function",
  "parameters": {
    "functionCode": "return items.map(item => ({ json: { ...item.json, processed: true } }));"
  }
}
```

**Redis Node**
```json
{
  "name": "Redis Publish",
  "type": "n8n-nodes-base.redis",
  "parameters": {
    "operation": "publish",
    "channel": "agent:NextAgent",
    "message": "={{ JSON.stringify($json) }}"
  }
}
```

**IF Node (Branching)**
```json
{
  "name": "Check Success",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "boolean": [{
        "value1": "={{ $json.success }}",
        "value2": true
      }]
    }
  }
}
```

## Step 3: Export the Workflow

1. In n8n UI, click the workflow menu (3 dots)
2. Select "Export"
3. Save as JSON to `/iluvatar-2.0/n8n-workflows/`

Use the naming convention:
```
##-workflow-name.json
```

## Step 4: Configure Credentials

Workflows reference credentials by type, not value. Ensure these are configured in n8n:

| Credential Type | Purpose |
|----------------|---------|
| `anthropicApi` | Claude API access |
| `redisApi` | Redis connection |
| `postgresApi` | PostgreSQL connection |
| `discordApi` | Discord bot token |

## Workflow Patterns

### Pattern 1: Linear Agent Chain

```
Webhook → Agent 1 → Transform → Agent 2 → Transform → Response
```

### Pattern 2: Checkpoint with Human Approval

```
Webhook → Agent → Checkpoint Node → Wait for Approval → Continue or Reject
```

### Pattern 3: Error Recovery (Debugging Pyramid)

```
Agent → IF(error) → Layer 1 Fix → IF(still error) → Layer 2 Fix → ... → Escalate
```

### Pattern 4: Parallel Execution

```
Webhook → Split → [Agent A, Agent B, Agent C] → Merge → Continue
```

## Error Handling

Always add error handling branches:

```javascript
// In Function node after agent call
const response = $input.item.json;

if (response.error || !response.content) {
  return [{
    json: {
      success: false,
      error: response.error || 'No content returned',
      retry: true
    }
  }];
}

return [{
  json: {
    success: true,
    result: JSON.parse(response.content[0].text)
  }
}];
```

## Testing Workflows

1. Use n8n's "Execute Workflow" button with test data
2. Check the execution log for each node
3. Verify Redis state updates
4. Check PostgreSQL for checkpoint records

## Importing Workflows

To import an existing workflow:

```bash
# Via n8n CLI
n8n import:workflow --input=/path/to/workflow.json

# Or via API
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d @/path/to/workflow.json
```

## Checklist

- [ ] Workflow designed with clear agent sequence
- [ ] Trigger node configured (webhook/schedule/redis)
- [ ] All agent nodes use correct Anthropic API format
- [ ] Error handling branches added
- [ ] Credentials referenced (not hardcoded)
- [ ] Exported to `/n8n-workflows/##-name.json`
- [ ] Tested with sample data
- [ ] Redis state updates verified
