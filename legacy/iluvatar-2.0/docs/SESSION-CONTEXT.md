# ILUVATAR 2.0 - Session Context for Continuation

## Current Status: BLOCKED on Webhook Error

### The Problem
n8n workflows are imported and activated on EC2 (50.18.245.194), but webhooks return:
```
{"code":0,"message":"Workflow Webhook Error: Workflow could not be started!"}
```

Logs show: `Webhook node not correctly configured` (appears twice on startup)

### What's Been Fixed
1. **Redis nodes** - Converted from n8n-nodes-base.redis to ioredis Function nodes (127.0.0.1:6379)
2. **Anthropic auth** - Removed credentials, using header-based auth with `$env.ANTHROPIC_API_KEY`
3. **fs.readFileSync** - Inlined all agent prompts directly into workflow JSON
4. **responseMode** - Changed from `responseNode` to `onReceived`
5. **max_tokens** - Fixed missing max_tokens in API calls
6. **Webhook typeVersion** - All 34 webhooks now use typeVersion: 2 with httpMethod: POST
7. **Internal URLs** - Changed `http://n8n:5678` to `http://127.0.0.1:5678`
8. **Duplicate webhook paths** - Renamed master's checkpoint-response to master-checkpoint-response
9. **ioredis in Docker** - Custom Dockerfile.n8n installs ioredis to /opt/custom-modules

### Current EC2 State
- **Container**: iluvatar-n8n running with iluvatar-n8n:latest image
- **9 workflows imported and active**:
  - cvlO00qim2t6wRkS - ILUVATAR Master Pipeline
  - hJfvBSi7Zz38XpZ6 - Backend Clone Handler (Gimli)
  - 3wGCayv0YQMmaXfH - Debugging Pyramid
  - qSJCRGmLg3bOpSoG - Frontend Clone Handler (Legolas)
  - dER1Cka0urarsBA5 - Micro-Checkpoints Handler
  - DI0mXzOfvUJFxs4j - Discord Dashboard
  - 4 - Event Agents (Tier 2)
  - QqhVajs4MF83AHsh - Support Agents
  - GOtudhcVU32juTbB - Velocity Tracking

### What Needs Investigation
The "Webhook node not correctly configured" error persists despite all webhooks having:
- typeVersion: 2
- httpMethod: "POST"
- path: unique strings
- responseMode: "onReceived"

Possible causes to investigate:
1. **Webhook output connections** - Some webhook might not be connected to any downstream node
2. **Wait node webhookId conflicts** - Wait nodes also create webhooks
3. **n8n version compatibility** - n8n 1.94.1 might have stricter validation
4. **Environment variables** - DISCORD_WEBHOOK_URL might be empty/invalid

### Files Modified (local)
All in `iluvatar-2.0/n8n-workflows/`:
- 01-iluvatar-master.json (main workflow)
- 02-backend-clone-handler.json
- 02-debugging-pyramid.json
- 03-frontend-clone-handler.json
- 03-micro-checkpoints.json
- 04-discord-dashboard.json
- 04-event-agents.json
- 05-support-agents.json
- 05-velocity-tracking.json

### Helper Scripts Created
- `fix-all-workflows.js` - Comprehensive fixer for Redis, Anthropic, fs.readFileSync, responseMode
- `fix-json-escaping.js` - Fixes unescaped quotes in JSON strings
- `convert-redis-nodes.js` - Original Redis conversion script
- `Dockerfile.n8n` - Custom n8n image with ioredis pre-installed

### SSH Access
```bash
ssh -i "iluvatar-2.0/iluvatar-keypair.pem" ec2-user@50.18.245.194
```

### Quick Commands
```bash
# Check n8n logs
docker logs iluvatar-n8n --tail 50

# List workflows
docker exec iluvatar-n8n n8n list:workflow

# Export workflow to inspect
docker exec iluvatar-n8n n8n export:workflow --id=cvlO00qim2t6wRkS

# Test webhook
curl -X POST http://50.18.245.194:5678/webhook/control-message \
  -H "Content-Type: application/json" \
  -d '{"type": "start_planning_only", "hackathon_id": "test-001"}'

# Check Redis
docker exec iluvatar-redis redis-cli PING

# Restart n8n
docker restart iluvatar-n8n
```

### Next Steps to Try
1. **Check n8n UI directly** - Open http://50.18.245.194:5678 in browser, examine workflows visually for disconnected webhooks
2. **Export all workflows and search for webhookId conflicts**
3. **Check if DISCORD_WEBHOOK_URL env var is set properly**
4. **Try simplifying**: create a minimal test workflow with just one webhook to isolate the issue
5. **Check n8n GitHub issues** for "Webhook node not correctly configured" with v1.94.1

---

## Prompt to Continue

```
I'm working on ILUVATAR 2.0, a hackathon automation system using n8n workflows on EC2 (50.18.245.194).

Current issue: Webhooks return "Workflow could not be started!" with logs showing "Webhook node not correctly configured".

All 9 workflows are imported and show as "Started" on n8n startup. All 34 webhook nodes have typeVersion:2 and httpMethod:"POST".

Read iluvatar-2.0/docs/SESSION-CONTEXT.md for full context on what's been fixed.

Please investigate:
1. Open n8n UI at http://50.18.245.194:5678 to visually inspect workflows
2. Look for webhooks that aren't connected to downstream nodes
3. Check for Wait node webhookId conflicts
4. Verify DISCORD_WEBHOOK_URL environment variable is set

The webhook I'm trying to test is: POST /webhook/control-message
```
