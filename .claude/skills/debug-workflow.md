# Skill: Debug Workflows and Agents

This guide explains how to debug n8n workflows and Claude agent issues in the ILUVATAR system.

## Quick Reference

```bash
# View all container logs
./scripts/dev-logs.sh

# View specific container
docker compose logs -f iluvatar_orchestrator
docker compose logs -f iluvatar_n8n

# Query Redis state
docker exec iluvatar_redis redis-cli HGETALL state:data

# Check PostgreSQL
docker exec -it iluvatar_postgres psql -U iluvatar -d iluvatar -c "SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 10;"
```

## Debugging Layers

The ILUVATAR system has a 6-layer debugging pyramid. Start from Layer 1 and escalate:

### Layer 1: Check Logs

1. **Container Logs**
   ```bash
   docker compose logs -f --tail=100
   ```

2. **n8n Execution Logs**
   - Open n8n UI: http://localhost:5678
   - Go to Executions
   - Find the failed execution
   - Click to see each node's input/output

3. **Application Logs**
   ```bash
   docker exec iluvatar_orchestrator cat /app/logs/combined.log | tail -100
   ```

### Layer 2: Check State

1. **Redis State**
   ```bash
   # All state data
   docker exec iluvatar_redis redis-cli HGETALL state:data

   # Specific key
   docker exec iluvatar_redis redis-cli HGET state:data hackathon_metadata

   # Current version
   docker exec iluvatar_redis redis-cli GET state:version
   ```

2. **PostgreSQL Checkpoints**
   ```bash
   docker exec -it iluvatar_postgres psql -U iluvatar -d iluvatar
   ```
   ```sql
   SELECT * FROM checkpoints WHERE hackathon_id = 'xxx' ORDER BY created_at DESC;
   SELECT * FROM agent_logs WHERE trace_id = 'xxx';
   ```

### Layer 3: Trace the Flow

1. **Find the trace_id**
   - Every agent call includes a `trace_id`
   - Search logs: `grep "trace_id" /app/logs/combined.log`

2. **Follow the trace**
   ```sql
   SELECT agent, message, timestamp
   FROM agent_logs
   WHERE trace_id = 'your-trace-id'
   ORDER BY timestamp;
   ```

3. **Check message bus**
   ```bash
   # Subscribe to see messages
   docker exec iluvatar_redis redis-cli SUBSCRIBE "agent:*"
   ```

### Layer 4: Reproduce the Issue

1. **Capture the input**
   - Find the agent's input from n8n execution
   - Save to a test file

2. **Test in isolation**
   ```javascript
   // test-agent.js
   const input = require('./test-input.json');
   const { callAgent } = require('./orchestrator/agent-caller');

   async function test() {
     const result = await callAgent('Gandalf', input);
     console.log(JSON.stringify(result, null, 2));
   }
   test();
   ```

### Layer 5: Fix and Verify

1. **Make the fix**
2. **Run unit tests**: `npm run test:unit`
3. **Test the specific agent**
4. **Run integration tests**: `npm test`

### Layer 6: Escalate

If you can't resolve the issue:
1. Check the debugging pyramid documentation
2. Ask for human help via Discord checkpoint
3. Log the issue for post-mortem analysis

## Common Issues

### Issue: Agent returns empty response

**Symptoms**: n8n node shows empty `content` array

**Debug Steps**:
1. Check API call format in n8n execution
2. Verify model name is correct
3. Check token limits
4. Look for rate limiting

**Fix**: Usually a malformed request or exceeded quota

### Issue: State conflict error

**Symptoms**: `ConflictError: State has been modified`

**Debug Steps**:
1. Check which agents are writing simultaneously
2. Look at state version history
3. Review the optimistic locking flow

**Fix**: Ensure agents read latest version before writing

### Issue: Checkpoint not appearing in Discord

**Symptoms**: Agent completes but no Discord message

**Debug Steps**:
1. Check if checkpoint was published to Redis
   ```bash
   docker exec iluvatar_redis redis-cli SUBSCRIBE "agent:Pippin"
   ```
2. Check Pippin agent logs
3. Verify Discord bot is connected

**Fix**: Usually missing pub/sub subscription or Discord connection issue

### Issue: Workflow stuck

**Symptoms**: n8n execution hangs indefinitely

**Debug Steps**:
1. Check which node is stuck
2. Look for infinite loops in Function nodes
3. Check external API timeouts
4. Look for Redis pub/sub deadlock

**Fix**: Add timeouts, fix loop conditions, restart n8n

### Issue: Agent hallucinates or gives wrong output

**Symptoms**: Output JSON doesn't match expected schema

**Debug Steps**:
1. Review the prompt - is it clear?
2. Check the input - is it complete?
3. Look at extended thinking (if opus)
4. Compare with expected examples

**Fix**: Improve prompt, add examples, validate output

## Useful Commands

```bash
# Restart all containers
docker compose restart

# Restart specific container
docker compose restart iluvatar_n8n

# Check container health
docker compose ps

# View container resource usage
docker stats

# Enter container shell
docker exec -it iluvatar_orchestrator sh

# Clear Redis state (careful!)
docker exec iluvatar_redis redis-cli FLUSHALL

# View n8n workflow data
docker exec -it iluvatar_postgres psql -U n8n -d n8n -c "SELECT * FROM workflow_entity;"
```

## n8n Specific Debugging

### View Execution Data

```javascript
// In n8n Function node
console.log('Input:', JSON.stringify($input.all(), null, 2));
console.log('Item:', JSON.stringify($input.item.json, null, 2));

// Check previous node output
console.log('From previous:', JSON.stringify($('PreviousNode').all(), null, 2));
```

### Error Handling in n8n

Add an Error Trigger workflow to catch all errors:

```json
{
  "name": "Error Handler",
  "nodes": [
    {
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger"
    },
    {
      "name": "Log Error",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "console.error('Workflow failed:', $input.item.json);\nreturn $input.all();"
      }
    }
  ]
}
```

## Monitoring

### Grafana Dashboard

Access at http://localhost:3000

Key metrics:
- Agent call latency
- Error rates by agent
- Redis memory usage
- API cost tracking

### Health Checks

```bash
# Orchestrator health
curl http://localhost:4000/health

# n8n health
curl http://localhost:5678/healthz

# Redis ping
docker exec iluvatar_redis redis-cli PING
```

## Checklist for Debugging Session

- [ ] Identify which component is failing
- [ ] Collect logs from all relevant sources
- [ ] Find the trace_id for correlation
- [ ] Check state in Redis and PostgreSQL
- [ ] Reproduce with minimal input
- [ ] Make fix and run tests
- [ ] Verify in full pipeline
- [ ] Document if it's a new issue type
