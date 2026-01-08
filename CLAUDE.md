# ILUVATAR - Novel Writer ML Project

## ⚠️ CRITICAL: Pair Programming Mode

**This project uses PAIR PROGRAMMING for learning.**

### What "Pair Programming" Means Here

The user's goal is to **understand the logic and structure** of the code, not to learn JavaScript syntax. The patterns, architecture, and reasoning transfer across languages (user's main focus is Python).

**Claude writes the code**, but:
- One file at a time
- Explain the logic and structure as you go
- Pause after each section to check understanding
- Wait for user confirmation before moving to next file

DO NOT:
- Write multiple files at once
- Present finished solutions without explanation
- Assume user will read and understand code silently

DO:
- Explain WHY before showing code
- Walk through the logic step by step
- Ask questions to check understanding
- Be honest and direct - avoid "yes-man" behavior
- If an approach has tradeoffs, say so clearly
- Correct mistakes without excessive praise
- **When introducing new concepts, ALWAYS explain them first** (e.g., what is an API? what is scope? what is Redis?)

The user is learning ML through this project. Honesty is more valuable than validation.

### Concepts Already Explained

Check `docs/SESSION-CONTEXT.md` for concepts covered in previous sessions to avoid repetition.

### Phase Transitions

**IMPORTANT**: At the start of each new phase, provide a recap of the previous phase(s) covering:
1. What was built (files, modules, systems)
2. Key concepts learned
3. Architecture decisions made and why
4. How this phase connects to the next

This reinforces learning and ensures continuity across sessions.

### Pipeline Integrity Check

**CRITICAL**: When adding or removing features, ALWAYS verify the entire data flow works end-to-end:

1. **Trace the full pipeline** - If you add a new data source (e.g., Story Bible), trace where it's:
   - Created/stored
   - Retrieved
   - Passed between components (Discord → N8N → Agents)
   - Used by the receiving component

2. **Check all connection points** - A feature isn't complete until:
   - The producer generates the data
   - The transport layer (webhook, API) includes it in payloads
   - The consumer receives and uses it

3. **Don't assume wiring** - Just because two components exist doesn't mean they're connected. Verify the actual function calls pass the data through.

Example failure: Creating `BibleRetriever` but forgetting to include bible context in `triggerN8N()` payloads.

### ⚠️ COMMIT AND PUSH CHANGES

**CRITICAL**: After making code changes, ALWAYS commit and push to GitHub before deploying to EC2.

The EC2 server should run code that's tracked in git. This ensures:
1. Changes are version controlled and recoverable
2. Local and EC2 code stay in sync
3. Other developers can see what's deployed

**Before scp to EC2:**
```bash
git add <changed-files>
git commit -m "Description of changes"
git push
```

### ⚠️ STABLE CODE - DO NOT MODIFY WITHOUT SPECIFIC BUG

The following files are **working and tested**. Do NOT refactor, "improve", or change them unless fixing a specific reported bug:

- `src/orchestrator/discord-bot.js` - 25 slash commands, all working
- `src/core/state-manager.js` - Dual-key fallback, Claude text extraction
- `src/core/novel-manager.js` - Novel lifecycle, Story Bible parsing
- `src/core/bible-retriever.js` - Semantic search with embeddings
- `src/agent-prompts/*.md` - Gandalf, Frodo, Elrond prompts

**Before touching stable code:**
1. Read the existing code to understand WHY it's built that way
2. Test the current behavior to confirm it works
3. Make minimal changes for the specific fix
4. Don't add "improvements" or refactor working logic

---

## Project Overview

ILUVATAR is an automated novel creation pipeline that learns writing style through ML fine-tuning.

**Dual Purpose:**
1. Build a personal novel writer (multi-POV xianxia/sci-fi/thriller)
2. Learn ML skills (fine-tuning, RLHF/DPO, RAG, evaluation)

## Current Phase

Check `docs/SESSION-CONTEXT.md` for current status and next steps.

## Project Structure

```
iluvatar-2.0/
├── .claude/           # Claude steering (agents, hooks, prompts, plans)
├── docs/              # Documentation, SESSION-CONTEXT.md
├── legacy/            # OLD hackathon system (reference only)
├── src/               # Novel Writer code
│   ├── core/          # Copied from legacy (state, message-bus, etc.)
│   ├── orchestrator/  # Discord bot, novel manager
│   ├── agent-prompts/ # 3 agents: planning, critic, writing
│   └── schemas/       # Novel state, agent outputs
├── ml/                # ML training modules (1-5)
├── notebooks/         # Jupyter learning notebooks
├── data/              # Training data
└── models/            # Trained checkpoints
```

## Key Decisions

| Decision | Choice |
|----------|--------|
| Base Model | Qwen2.5 (14B → 32B) |
| Output Language | Bilingual (Chinese + English) |
| Orchestration | Discord + N8N |
| Learning Style | Pair programming |
| API Model | Claude Opus for planning/critic |

## Hardware

- **Local**: RTX 4090 (24GB) via eGPU - supports up to 32B QLoRA
- **Cloud**: EC2 at `50.18.245.194` for n8n workflows
- **SSH Key**: `iluvatar-keypair.pem` (in project root)
- **SSH User**: `ec2-user` (not ubuntu)

## Discord Bot Deployment

The Discord bot runs on EC2, NOT locally. To deploy changes:

```bash
# 1. Copy updated files to EC2
scp -i iluvatar-keypair.pem src/orchestrator/discord-bot.js ec2-user@50.18.245.194:/home/ec2-user/iluvatar-2.0/src/orchestrator/
scp -i iluvatar-keypair.pem src/core/state-manager.js ec2-user@50.18.245.194:/home/ec2-user/iluvatar-2.0/src/core/

# 2. Restart the bot via PM2
ssh -i iluvatar-keypair.pem ec2-user@50.18.245.194 "pm2 restart iluvatar-bot"

# 3. Check logs
ssh -i iluvatar-keypair.pem ec2-user@50.18.245.194 "pm2 logs iluvatar-bot --lines 20 --nostream"
```

**PM2 Process**: `iluvatar-bot` (runs from `/home/ec2-user/iluvatar-2.0`)

## N8N API Access

Use this API key to verify and inspect the N8N workflow programmatically:

- **N8N URL**: `http://50.18.245.194:5678`
- **API Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmZjU5MGZjNS0wMWUxLTQ3NGEtODQxOC1iZmM4M2UxZTc2MGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY3ODI5MDU2fQ.8RHdUN5peOS8nqr6fjX6sZUGNPX0rHhFQBhv4Y8ABJk`

**Example API calls:**
```bash
# List all workflows
curl -H "X-N8N-API-KEY: <key>" http://50.18.245.194:5678/api/v1/workflows

# Get specific workflow by ID
curl -H "X-N8N-API-KEY: <key>" http://50.18.245.194:5678/api/v1/workflows/{id}

# Get workflow executions
curl -H "X-N8N-API-KEY: <key>" http://50.18.245.194:5678/api/v1/executions
```

Use this to verify workflow configuration before and after changes.

## ⚠️ N8N Container Warning

**NEVER recreate the N8N Docker container** (`docker rm n8n`) without first:
1. Exporting ALL workflows via the N8N UI (Workflows → Export)
2. Saving credentials info (they are stored in the container's database)
3. Backing up `/home/ec2-user/.n8n/database.sqlite`

The workflow and credentials are stored in SQLite inside the container's mounted volume. Recreating the container with different volume mounts or losing the database = **total workflow loss**.

**Safe way to add env vars**: Use `docker update` or edit the existing container, don't recreate.

**Workflow backup location**: `temp_workflow.json` in project root (exported 2026-01-07)

## N8N Node Code Changes

**IMPORTANT**: When asking the user to modify N8N Code nodes:

1. **Provide complete, copy-pasteable code** - The user needs to replace the whole node content, not hunt for specific lines.

2. **ALWAYS use the live N8N API** - NEVER read local files like `temp_workflow.json` for workflow state. The local backup is often outdated. Always fetch current state from the live API:
   ```bash
   # Get live workflow data
   curl -s -H "X-N8N-API-KEY: <key>" "http://50.18.245.194:5678/api/v1/workflows/BZ9bA0uX63uh8hau"
   ```

3. **Verify node names before referencing them** - NEVER assume node names like "Load Novel Data (revise chapter)". Always check the actual workflow first:
   ```bash
   curl -s -H "X-N8N-API-KEY: <key>" "http://50.18.245.194:5678/api/v1/workflows/BZ9bA0uX63uh8hau" | grep -o '"name":"[^"]*"' | sort -u
   ```
   Common node names in this workflow:
   - `Load Current Chapter` (not "Load Novel Data")
   - `Load Current Outline` (not "Load Outline for Revise")
   - `Load Outline` (for write flow)
   - `Load Chapter` (for critique flow)

## Resume Instructions

1. Read `docs/SESSION-CONTEXT.md`
2. Check current phase status
3. Continue with PAIR PROGRAMMING approach
4. Update SESSION-CONTEXT.md after progress

## Session Context Updates

**IMPORTANT**: Update `docs/SESSION-CONTEXT.md` after EVERY major change:
- Code fixes or new features
- N8N workflow modifications
- Bug investigations and resolutions
- Architecture decisions

This ensures continuity when context is lost. Don't wait until the end of a session - update as you go.
