# AI Troubleshooting Guide for ILUVATAR

> **Purpose**: This guide is for AI assistants working on this project. Learn from past mistakes to avoid repeating them.

---

## Critical Lessons Learned

### 1. n8n Credential Encryption - DO NOT ATTEMPT MANUAL ENCRYPTION

**Problem**: n8n credentials are encrypted with a complex algorithm. Attempting to manually create encrypted credentials via SQLite will fail.

**What I tried (ALL FAILED)**:
- Inserting raw JSON into `credentials_entity` table
- Using AES-256-CBC encryption with the key from config
- Using n8n-core's Credentials class from inside the container

**Why it failed**: n8n uses a specific encryption format that includes salting and the exact algorithm isn't easily reproducible outside n8n's codebase.

**THE SOLUTION**:
1. **Use n8n UI** at `http://<EC2-IP>:5678` to create credentials manually
2. **OR** convert `n8n-nodes-base.redis` nodes to `n8n-nodes-base.function` nodes with inline ioredis

**Inline ioredis example** (use this instead of Redis credential nodes):
```javascript
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});
try {
  await redis.set('key', 'value');
  return { json: { success: true } };
} finally {
  await redis.quit();
}
```

---

### 2. n8n Webhook responseMode

**Problem**: `"responseMode": "responseNode"` requires a "Respond to Webhook" node in the workflow.

**Error**: `No Respond to Webhook node found in the workflow`

**Solution**: Change to `"responseMode": "onReceived"` which returns immediately.

```bash
# Fix all workflow files at once:
sed -i 's/"responseMode": "responseNode"/"responseMode": "onReceived"/g' *.json
```

---

### 3. n8n 2.0 vs 1.x - Workflow Publishing

**Problem**: n8n 2.0 requires `workflow_history` entries for publishing workflows.

**Error**: `Version "1" not found for workflow`

**Solution**: Use n8n 1.94.1 instead of latest (2.x):
```bash
docker run -d --name iluvatar-n8n n8nio/n8n:1.94.1 ...
```

With 1.94.1, use:
```bash
docker exec iluvatar-n8n n8n update:workflow --all --active=true
docker restart iluvatar-n8n
```

---

### 4. Redis Host in n8n with Host Networking

**Problem**: Workflows use `process.env.REDIS_HOST || 'redis'` but with `--network host`, 'redis' doesn't resolve.

**Solution**: Hardcode `'127.0.0.1'` in all workflow Function nodes:
```bash
sed -i "s/process.env.REDIS_HOST || 'redis'/'127.0.0.1'/g" *.json
```

---

### 5. ioredis Must Be Reinstalled After Container Restart

**Problem**: `npm install -g ioredis` doesn't persist across container restarts unless the volume includes `/usr/local/lib/node_modules`.

**Solution**: Always run after n8n container starts:
```bash
docker exec -u root iluvatar-n8n npm install -g ioredis
```

---

## SSH Connection to EC2

```bash
ssh -i "/e/coding/Hackpage 2.0/Hackpage 2.0/iluvatar-2.0/iluvatar-keypair.pem" ec2-user@50.18.245.194
```

**Note**: User is `ec2-user`, NOT `ubuntu`.

---

## RESOLVED: Plan-Only Workflow Working (2025-12-25)

The plan-only workflow now works. The following issues were fixed:

### Issue 1: Redis Credential Nodes
**Symptom**: `Credential with ID "1" does not exist for type "redis"`
**Fix**: Converted 7 `n8n-nodes-base.redis` nodes in `01-iluvatar-master.json` to Function nodes with inline ioredis:
```javascript
const Redis = require('ioredis');
const redis = new Redis({host: '127.0.0.1', port: 6379});
// ... operation ...
await redis.quit();
```

### Issue 2: Anthropic API Credentials
**Symptom**: `Credential with ID "2" does not exist for type "anthropicApi"`
**Fix**: Removed credential-based auth and added x-api-key header directly:
```json
"headerParameters": {
  "parameters": [
    {"name": "x-api-key", "value": "={{$env.ANTHROPIC_API_KEY}}"},
    {"name": "anthropic-version", "value": "2023-06-01"}
  ]
}
```

### Issue 3: fs.readFileSync Not Available
**Symptom**: `Cannot find module 'fs'`
**Fix**: Replaced `fs.readFileSync('/data/agents/XX.md')` with inlined minimal prompts.

### Issue 4: Extended Thinking Token Limits
**Symptom**: `max_tokens must be greater than thinking.budget_tokens`
**Fix**: Changed `max_tokens: 8192` to `max_tokens: 16000` (with `budget_tokens: 10000`).

### Issue 5: responseMode Error
**Symptom**: `No Respond to Webhook node found`
**Fix**: Changed `"responseMode": "responseNode"` to `"responseMode": "onReceived"`.

---

## Efficiency Tips for Future Sessions

1. **Don't attempt n8n credential encryption** - it's a rabbit hole. Use the UI or convert to Function nodes.

2. **Check the obvious first**: Before complex debugging, verify:
   - Is ioredis installed? `docker exec iluvatar-n8n npm list -g ioredis`
   - Is Redis running? `docker ps | grep redis`
   - Are workflows active? `docker exec iluvatar-n8n n8n list:workflow --active=true`

3. **Read error messages carefully**: The n8n logs tell you exactly which node failed and why.

4. **Don't recreate volumes repeatedly** - each new volume loses all workflows. Import takes time.

5. **Use n8n 1.94.1** - the latest 2.x has breaking changes with workflow publishing.

---

## Quick Commands Reference

```bash
# Check n8n status
docker logs iluvatar-n8n --tail 50

# Test webhook
curl -X POST http://localhost:5678/webhook/iluvatar-webhook \
  -H 'Content-Type: application/json' \
  -d '{"hackathonId": "test", "event": "start", "mode": "planning_only"}'

# Restart n8n with ioredis
docker restart iluvatar-n8n && sleep 5 && docker exec -u root iluvatar-n8n npm install -g ioredis

# Import workflow
docker exec iluvatar-n8n n8n import:workflow --input="/workflows/01-iluvatar-master.json"

# Activate all workflows (n8n 1.x only)
docker exec iluvatar-n8n n8n update:workflow --all --active=true
```
