# ILUVATAR 2.0 - Claude Code Configuration

## Project Structure

```
iluvatar-2.0/
├── agents/           # 26 AI agent definitions (LotR-themed)
├── agent-prompts/    # Detailed prompt files for each agent
├── core/             # Shared modules (state, logging, message-bus)
├── orchestrator/     # Main entry point, Discord bot, container pool
├── n8n-workflows/    # 9 workflow JSON files
├── deployers/        # Platform-specific deployment modules
├── tests/            # Unit, integration, chaos, e2e tests
├── setup/            # Infrastructure configuration
└── scripts/          # Utility scripts
```

## File Header Requirements

Every new .js file MUST start with a JSDoc comment block:

```javascript
/**
 * ILUVATAR 2.0 - [Module Name]
 *
 * [Brief description of what this file does]
 * [Key features or integration points]
 */
```

Example from existing codebase:
```javascript
/**
 * ILUVATAR 2.0 - Redis State Manager
 *
 * Manages shared state with optimistic locking to prevent race conditions.
 * Multiple agents can read concurrently, but writes use version-based locks.
 */
```

## Architecture Overview

- **n8n workflows** orchestrate agents (not REST API routes)
- **Redis pub/sub** for inter-agent messaging via `core/message-bus.js`
- **PostgreSQL** for state persistence
- **Docker Compose** for local development (6 containers)
- **Discord** as the primary user interface

## Key Files

| File | Purpose |
|------|---------|
| `orchestrator/index.js` | Main entry point (Express on port 4000) |
| `orchestrator/discord-bot.js` | User interaction via Discord slash commands |
| `orchestrator/container-pool.js` | Docker container lifecycle management |
| `orchestrator/hackathon-manager.js` | Multi-tenant hackathon orchestration |
| `core/state-manager.js` | Redis state with optimistic locking |
| `core/message-bus.js` | Agent-to-agent pub/sub communication |
| `core/logging.js` | Structured logging with trace IDs |
| `core/checkpoint-system.js` | Human-in-the-loop approval workflow |

## Agent Naming Convention

Agents are numbered and named after LotR characters:
- `01-shadowfax.md` through `26-librarian.md`
- Each agent has a corresponding prompt in `agent-prompts/`
- Agents communicate via Redis pub/sub channels

## Debugging

Run the log viewer to tail all container logs with color coding:
```bash
./scripts/dev-logs.sh
```

Or manually:
```bash
docker compose logs -f iluvatar_orchestrator iluvatar_n8n
```

Query Redis state:
```bash
docker exec iluvatar_redis redis-cli HGETALL state:data
```

## Testing

```bash
npm test           # All tests
npm run test:unit  # Unit tests only
npm run test:e2e   # End-to-end tests
npm run test:chaos # Chaos/failure injection tests
```

## Skills

See `.claude/skills/` for implementation guides:
- `create-agent.md` - How to add a new AI agent
- `create-workflow.md` - How to create an n8n workflow
- `add-core-module.md` - How to add a shared core module
- `add-test.md` - Testing patterns
- `add-discord-command.md` - How to add Discord slash commands
- `debug-workflow.md` - Debugging n8n + Claude agent issues

## Common Patterns

### Adding a new feature
1. Create/modify the core module in `core/`
2. Add unit tests in `tests/unit/`
3. Update n8n workflow if needed
4. Add Discord command if user-facing

### Debugging agent issues
1. Check n8n execution logs in the UI (http://localhost:5678)
2. Run `./scripts/dev-logs.sh` for container logs
3. Use trace_id to correlate logs across agents
4. Check PostgreSQL for checkpoint records

### Environment Variables

Required in `.env`:
- `DISCORD_TOKEN` - Discord bot token
- `ANTHROPIC_API_KEY` - Claude API key
- `POSTGRES_*` - Database connection
- `REDIS_*` - Redis connection
- `AWS_*` - AWS credentials for deployment
