# ILUVATAR User Manual

Complete guide for using ILUVATAR after deployment.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Discord Commands Reference](#2-discord-commands-reference)
3. [Running a Hackathon](#3-running-a-hackathon)
4. [Admin Commands (No SSH Required!)](#4-admin-commands-no-ssh-required)
5. [Managing Environment Variables](#5-managing-environment-variables)
6. [Managing MCP Tools](#6-managing-mcp-tools)
7. [Managing Credentials](#7-managing-credentials)
8. [Monitoring & Maintenance](#8-monitoring--maintenance)
9. [The 26 AI Agents](#9-the-26-ai-agents)
10. [Checkpoints & Approvals](#10-checkpoints--approvals)
11. [Budget Management](#11-budget-management)
12. [Troubleshooting](#12-troubleshooting)
13. [Admin Access from Other Computers](#13-admin-access-from-other-computers)

---

## 1. Overview

### What is ILUVATAR?

ILUVATAR is an AI-powered hackathon automation system. It uses 25 Lord of the Rings-themed AI agents to:
- Generate hackathon project ideas
- Design architecture
- Write code (frontend & backend)
- Debug issues
- Deploy to production
- Create submissions

### Architecture

```
Discord (Your Interface)
    ↓
Discord Bot + Admin Manager
    ↓
n8n Workflow Engine
    ↓
25 AI Agents (Claude API)
    ↓
GitHub, Vercel, Railway (Deployment)
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Hackathon** | A single project instance with its own channel, budget, and agents |
| **Agent** | An AI with a specific role (e.g., Gandalf = ideation, Gimli = backend) |
| **Checkpoint** | A quality gate requiring approval before proceeding |
| **Model Tier** | Opus (complex), Sonnet (balanced), Haiku (fast/cheap) |

---

## 2. Discord Commands Reference

### Quick Reference Table

| Command | Who Can Use | Description |
|---------|-------------|-------------|
| `/status` | Anyone | Check hackathon or system status |
| `/new-hackathon` | Admins | Create a new hackathon |
| `/list-hackathons` | Anyone | List all hackathons |
| `/approve` | Anyone in channel | Approve current checkpoint |
| `/reject` | Anyone in channel | Reject with feedback |
| `/pause` | Anyone in channel | Pause hackathon |
| `/resume` | Anyone in channel | Resume hackathon |
| `/budget` | Anyone in channel | Check budget status |
| `/suggest` | Anyone in channel | Send suggestion to agents |
| `/archive-hackathon` | Admins | Archive completed hackathon |
| `/system-status` | Admins | Infrastructure health |
| `/global-budget` | Admins | Total spend across all |
| `/admin-*` | **Owner Only** | Admin commands (see below) |

### Command Details

#### `/new-hackathon`

Create a new hackathon project.

```
/new-hackathon name:My Awesome Project deadline:2025-12-31T23:59:00Z budget:100
```

**Parameters**:
- `name` (required): Project name
- `deadline` (required): ISO format datetime
- `budget` (required): Maximum spend in USD
- `pdf` (optional): Hackathon rules PDF attachment

**What Happens**:
1. Creates dedicated Discord channel `#hackathon-my-awesome-project`
2. Creates GitHub repository
3. Initializes agent workspace
4. Sends welcome message with instructions

#### `/status`

Check current status.

In admin channel:
```
/status
```
Shows: System health, active hackathons, total budget

In hackathon channel:
```
/status
```
Shows: Current phase, active agent, progress, budget used

#### `/approve` and `/reject`

Respond to checkpoint requests.

```
/approve feedback:Looks good, proceed!
```

```
/reject feedback:Please add error handling to the API routes
```

#### `/suggest`

Send a suggestion to the active agent.

```
/suggest suggestion:Consider using Redis for caching instead of in-memory
```

#### `/budget`

View budget details for current hackathon.

```
/budget
```

Shows:
- Total budget
- Amount spent
- Remaining
- Cost breakdown by agent

---

## 3. Running a Hackathon

### Step 1: Create the Hackathon

In your admin channel:
```
/new-hackathon name:AI Todo App deadline:2025-01-15T18:00:00Z budget:50
```

Optionally attach a PDF with hackathon rules.

### Step 2: Join the Hackathon Channel

The bot creates `#hackathon-ai-todo-app`. Go there for all updates.

### Step 3: Monitor Progress

The pipeline runs automatically through phases:

| Phase | Agent | What Happens |
|-------|-------|--------------|
| 1. Ideation | Gandalf | Analyzes requirements, generates ideas |
| 2. Architecture | Radagast | Designs system, chooses tech stack |
| 3. Backend | Gimli | Writes server code |
| 4. Frontend | Legolas | Writes UI code |
| 5. Integration | Aragorn | Connects frontend to backend |
| 6. Testing | Thorin | Writes and runs tests |
| 7. Debugging | Treebeard | Fixes issues (6-layer pyramid) |
| 8. Deployment | Eomer | Deploys to production |
| 9. Submission | Saruman | Prepares final submission |

### Step 4: Handle Checkpoints

You'll receive checkpoint requests like:

```
📋 Checkpoint: Architecture Review
[Approve] [Reject] [Skip]

Radagast has completed the system design. Please review:
- Tech stack: Next.js + FastAPI + PostgreSQL
- Deployment: Vercel (frontend) + Railway (backend)
```

Click **Approve** to continue, **Reject** with feedback to revise.

### Step 5: Provide Feedback

Use `/suggest` anytime:
```
/suggest suggestion:The landing page should have a dark theme
```

### Step 6: Monitor Budget

Check spending:
```
/budget
```

If budget is running low, you can:
1. Increase via `/admin-set-env key:BUDGET_LIMIT value:150`
2. Pause with `/pause` to review

### Step 7: Complete and Archive

When finished:
```
/archive-hackathon
```

This:
- Stops all agents
- Creates S3 backup
- Generates summary report
- Keeps channel for reference

---

## 4. Admin Commands (No SSH Required!)

These commands let you manage everything from Discord. **Only users with their Discord ID in `DISCORD_OWNER_ID` or `ADMIN_USER_IDS` can use these.**

### Quick Reference

| Command | Description |
|---------|-------------|
| `/admin-set-env` | Set environment variable |
| `/admin-get-env` | Get env var (masked) |
| `/admin-list-env` | List all env vars |
| `/admin-delete-env` | Delete env var |
| `/admin-add-tool` | Add MCP tool |
| `/admin-list-tools` | List all tools |
| `/admin-toggle-tool` | Enable/disable tool |
| `/admin-delete-tool` | Delete custom tool |
| `/admin-add-credential` | Add API credential |
| `/admin-list-credentials` | List credentials |
| `/admin-delete-credential` | Delete credential |
| `/admin-restart` | Restart services |
| `/admin-logs` | View logs |
| `/admin-backup` | Create backup |
| `/admin-status` | Service status |
| `/admin-add-owner` | Add admin user |
| `/admin-remove-owner` | Remove admin |
| `/admin-list-owners` | List admins |

### Security

- All `/admin-*` responses are **ephemeral** (only you see them)
- Values are **masked** (e.g., `sk-a...xxxx`)
- Cannot delete protected variables
- Cannot remove yourself as owner

---

## 5. Managing Environment Variables

### List All Variables

```
/admin-list-env
```

With filter:
```
/admin-list-env filter:DISCORD
```

### Set a Variable

```
/admin-set-env key:NEW_API_KEY value:abc123xyz
```

**Note**: Variable names must be `UPPER_SNAKE_CASE`.

### Get a Variable (Masked)

```
/admin-get-env key:ANTHROPIC_API_KEY
```

Shows: `ANTHROPIC_API_KEY = sk-a...xxxxx (45 chars)`

### Delete a Variable

```
/admin-delete-env key:OLD_UNUSED_VAR
```

**Protected variables** (cannot delete):
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `POSTGRES_PASSWORD`

### After Changing Variables

Changes take effect after restart:
```
/admin-restart service:all
```

---

## 6. Managing MCP Tools

MCP (Model Context Protocol) tools are capabilities available to agents.

### List All Tools

```
/admin-list-tools
```

By category:
```
/admin-list-tools category:deployment
```

### Built-in Tools

| Tool | Category | Description |
|------|----------|-------------|
| `read_file` | file_system | Read file contents |
| `write_file` | file_system | Write to file |
| `list_files` | file_system | List directory |
| `run_command` | code | Execute shell command |
| `run_tests` | code | Run test suite |
| `lint_code` | code | Run linter |
| `fetch_url` | web | HTTP request |
| `search_web` | web | Web search |
| `query_database` | database | SQL query |
| `deploy_vercel` | deployment | Deploy to Vercel |
| `deploy_railway` | deployment | Deploy to Railway |
| `git_commit` | code | Git commit |
| `git_push` | code | Git push |
| `send_discord_message` | communication | Send Discord message |
| `request_user_input` | communication | Ask user for input |

### Add a Custom Tool

```
/admin-add-tool name:send_email description:Send an email via SendGrid category:communication
```

With parameters (JSON):
```
/admin-add-tool name:resize_image description:Resize image to dimensions category:custom parameters:{"type":"object","properties":{"width":{"type":"number"},"height":{"type":"number"}},"required":["width","height"]}
```

### Enable/Disable a Tool

```
/admin-toggle-tool name:deploy_railway enabled:false
```

### Delete a Custom Tool

```
/admin-delete-tool name:my_custom_tool
```

**Note**: Can only delete custom tools, not built-in ones.

---

## 7. Managing Credentials

### List Credentials

```
/admin-list-credentials
```

Shows masked values:
```
anthropic/api_key: sk-a...xxxx
github/token: ghp_...xxxx
```

### Add a Credential

```
/admin-add-credential service:openai key:api_key value:sk-xxxxx
```

This also sets it as `OPENAI_API_KEY` in the environment.

Common credentials to add:
- `anthropic` / `api_key`
- `openai` / `api_key`
- `github` / `token`
- `vercel` / `token`
- `railway` / `token`
- `sendgrid` / `api_key`

### Delete a Credential

```
/admin-delete-credential service:openai key:api_key
```

---

## 8. Monitoring & Maintenance

### Check Service Status

```
/admin-status
```

Shows:
```
🟢 orchestrator: running
🟢 n8n: running
🟢 redis: running
🟢 postgres: running
🟢 grafana: running
```

### View Logs

```
/admin-logs service:orchestrator lines:100
```

Services: `orchestrator`, `n8n`, `redis`, `postgres`

### Restart Services

Restart specific service:
```
/admin-restart service:n8n
```

Restart all:
```
/admin-restart service:all
```

### Create Backup

```
/admin-backup
```

Creates:
- Database dump
- Environment configuration
- Custom tools
- Uploads to S3 (if configured)

### Web Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| n8n | http://YOUR_IP:5678 | Workflow editor |
| Grafana | http://YOUR_IP:3000 | Metrics & monitoring |
| API Health | http://YOUR_IP:3001/health | Service health check |

---

## 9. The 26 AI Agents

### Agent Tiers

| Tier | Model | Use Case | Cost |
|------|-------|----------|------|
| **Opus** | claude-opus | Complex reasoning, architecture | High |
| **Sonnet** | claude-sonnet | Balanced tasks | Medium |
| **Haiku** | claude-haiku | Fast, simple tasks | Low |

### Agent Roster

#### Tier 1: Opus (Complex Tasks)

| Agent | Role | Phase |
|-------|------|-------|
| **Gandalf** | Ideation & Platform Selection | 1 |
| **Radagast** | Time-Aware Architecture | 2 |
| **Treebeard** | 6-Layer Debugging | Debug |
| **Arwen** | Test Planning | 6 |
| **Gimli** | Backend Development | 3 |
| **Legolas** | Frontend Development | 4 |
| **Aragorn** | Integration | 5 |
| **Éowyn** | UI Polish | 4 |
| **Saruman** | Submission & Pitch | 9 |
| **Sauron** | Demo Video Director | 9 |

#### Tier 2: Sonnet (Balanced Tasks)

| Agent | Role | Phase |
|-------|------|-------|
| **Denethor** | Work Distribution | Coord |
| **Merry** | Orchestration & GitHub | Coord |
| **Pippin** | Discord Concierge | Comm |
| **Bilbo** | User Preferences | Support |
| **Galadriel** | Self-Reflection | QA |
| **Elrond** | Code Reviews | 5 |
| **Thorin** | Testing | 6 |
| **Éomer** | Deployment | 8 |
| **Haldir** | Verification | 8 |
| **Historian** | Archive Q&A | Post |
| **Scribe** | Experience Writer | Post |
| **Faramir** | Rollback Coordinator | Support |

#### Tier 3: Haiku (Fast/Cheap)

| Agent | Role | Phase |
|-------|------|-------|
| **Shadowfax** | Context Compression | Support |
| **Quickbeam** | Speculative Pre-fetching | Support |
| **Gollum** | Triple Monitoring | Monitor |
| **Librarian** | Repository Organization | Support |

### Agent Communication

Agents communicate via Redis pub/sub:
- Each agent has a dedicated channel
- Messages include task, context, and previous outputs
- Orchestrator routes between agents

---

## 10. Checkpoints & Approvals

### Major Checkpoints (6)

| # | Checkpoint | When | What to Review |
|---|------------|------|----------------|
| 1 | Ideation | After Gandalf | Project concept, feasibility |
| 2 | Architecture | After Radagast | Tech stack, design decisions |
| 3 | Backend | After Gimli | API design, database schema |
| 4 | Frontend | After Legolas | UI components, user flow |
| 5 | Integration | After Aragorn | Full system working together |
| 6 | Deployment | After Éomer | Production readiness |

### Micro Checkpoints (5)

| # | Checkpoint | When | What to Review |
|---|------------|------|----------------|
| A | Code Review | After major code | Code quality, patterns |
| B | Test Results | After Thorin | Test coverage, passing |
| C | Bug Fix | After Treebeard | Issue resolved |
| D | UI Polish | After Éowyn | Visual quality |
| E | Final Review | Before submit | Everything complete |

### Auto-Approve

If you don't respond within the timeout (default: 30 minutes), checkpoints auto-approve. Configure timeout:
```
/admin-set-env key:CHECKPOINT_TIMEOUT_MINUTES value:60
```

### Rejection Flow

When you reject:
1. Agent receives your feedback
2. Agent revises work
3. New checkpoint request sent
4. Repeat until approved

---

## 11. Budget Management

### How Costs Work

| Model | Input | Output |
|-------|-------|--------|
| Opus | $15/1M tokens | $75/1M tokens |
| Sonnet | $3/1M tokens | $15/1M tokens |
| Haiku | $0.25/1M tokens | $1.25/1M tokens |

### Per-Hackathon Budget

Set when creating:
```
/new-hackathon name:Project budget:100
```

### Check Budget

```
/budget
```

Shows:
```
💰 Budget Status

Total: $100.00
Spent: $23.45
Remaining: $76.55

Breakdown:
- Gandalf (Opus): $5.20
- Radagast (Opus): $8.30
- Gimli (Opus): $10.95
```

### Budget Warnings

| Threshold | Action |
|-----------|--------|
| 80% | Warning message in channel |
| 90% | Pause warning, asks to continue |
| 100% | Auto-pause, requires approval |

### Increase Budget

Via Discord:
```
/admin-set-env key:BUDGET_LIMIT value:150
```

Then restart to apply.

### Global Budget Limit

Across all hackathons:
```
/admin-set-env key:GLOBAL_BUDGET_LIMIT value:1000
```

---

## 12. Troubleshooting

### Bot Not Responding

**Check 1**: Is bot online?
- Look for bot in server member list
- Should show green dot

**Check 2**: View logs
```
/admin-logs service:orchestrator
```

**Check 3**: Restart bot
```
/admin-restart service:orchestrator
```

**Check 4**: Verify token (via SSH if needed)
```bash
nano ~/.iluvatar-2.0/.env
# Check DISCORD_BOT_TOKEN
```

### Hackathon Stuck

**Option 1**: Check status
```
/status
```

**Option 2**: Force approve any pending checkpoint
```
/approve feedback:Force continuing
```

**Option 3**: Pause and resume
```
/pause
/resume
```

### High Costs

**Check spending**:
```
/budget
```

**Switch to cheaper models**:
```
/admin-set-env key:DEFAULT_MODEL_TIER value:sonnet
```

**Reduce agent usage**:
- Disable expensive agents
- Use fewer iterations

### Services Down

**Check status**:
```
/admin-status
```

**Restart failed service**:
```
/admin-restart service:n8n
```

**Restart all**:
```
/admin-restart service:all
```

**If still failing**, SSH and check Docker:
```bash
docker-compose logs
```

### Workflows Not Running

1. Check n8n UI: http://YOUR_IP:5678
2. Verify workflows are "Active"
3. Check credentials are configured
4. View n8n logs:
   ```
   /admin-logs service:n8n
   ```

### Can't Access Admin Commands

Error: "Unauthorized: Only bot owners can use /admin-*"

**Fix**: Add your Discord user ID:
1. Get your Discord user ID (Developer Mode → Copy ID)
2. SSH to instance:
   ```bash
   nano ~/iluvatar-2.0/.env
   ```
3. Add/update:
   ```
   DISCORD_OWNER_ID=your-user-id-here
   ```
4. Restart:
   ```bash
   sudo systemctl restart iluvatar-orchestrator
   ```

### Emergency Recovery

If everything is broken:

1. **SSH to instance**:
   ```bash
   ssh -i iluvatar-keypair.pem ec2-user@YOUR_IP
   ```

2. **Check Docker**:
   ```bash
   docker-compose ps
   docker-compose logs
   ```

3. **Restart everything**:
   ```bash
   sudo systemctl restart iluvatar-orchestrator
   ```

4. **Restore from backup**:
   ```bash
   aws s3 ls s3://your-bucket/backups/
   aws s3 cp s3://your-bucket/backups/latest.tar.gz .
   tar -xzf latest.tar.gz
   # Follow restore instructions
   ```

---

## Quick Reference Card

```
=== COMMON COMMANDS ===
/status                    - Check system/hackathon status
/new-hackathon            - Create hackathon
/approve                   - Approve checkpoint
/reject                    - Reject with feedback
/budget                    - Check budget
/suggest                   - Send suggestion

=== ADMIN COMMANDS (Owner Only) ===
/admin-list-env           - List env vars
/admin-set-env            - Set env var
/admin-restart            - Restart services
/admin-logs               - View logs
/admin-status             - Service status
/admin-backup             - Create backup
/admin-add-credential     - Add API key
/admin-add-tool           - Add MCP tool
/admin-add-owner          - Add admin user

=== WEB DASHBOARDS ===
n8n Workflows:  http://YOUR_IP:5678
Grafana:        http://YOUR_IP:3000
API Health:     http://YOUR_IP:3001/health

=== AGENT TIERS ===
Opus:   Complex tasks (expensive)
Sonnet: Balanced tasks (moderate)
Haiku:  Simple tasks (cheap)

=== CHECKPOINT FLOW ===
Agent completes work
    ↓
Checkpoint request sent
    ↓
You: /approve or /reject
    ↓
Next phase begins
```

---

## 13. Admin Access from Other Computers

This section explains how to access and manage your ILUVATAR deployment from any computer, not just the one you used for initial setup.

### Option 1: Discord Commands (Recommended)

The easiest way - no SSH needed! Use the admin commands from any computer with Discord access.

**Requirements**:
- Your Discord user ID must be in `DISCORD_OWNER_ID` or `ADMIN_USER_IDS`
- Discord app/browser on any device

**Available Commands**:
```
/admin-set-env      - Set environment variables
/admin-get-env      - View env vars (masked)
/admin-list-env     - List all env vars
/admin-logs         - View service logs
/admin-restart      - Restart services
/admin-status       - Check service health
/admin-backup       - Create backup
/admin-add-owner    - Add another admin
```

### Option 2: SSH Access

For deeper access, use SSH from any computer.

**Step 1: Transfer Your SSH Key**

Copy your private key (`iluvatar-keypair.pem`) to the new computer:

```bash
# From original computer, secure copy to new computer
scp iluvatar-keypair.pem user@new-computer:~/.ssh/

# Or use USB drive, encrypted cloud storage, etc.
```

**Step 2: Set Correct Permissions**

On the new computer:

```bash
chmod 400 ~/.ssh/iluvatar-keypair.pem
```

**Step 3: Connect**

```bash
ssh -i ~/.ssh/iluvatar-keypair.pem ec2-user@YOUR_EC2_IP
```

**Step 4: Manage ILUVATAR**

Once connected:

```bash
# View/edit environment
nano ~/iluvatar-2.0/.env

# View logs
docker-compose logs -f orchestrator

# Restart services
sudo systemctl restart iluvatar-orchestrator

# Check status
docker-compose ps
```

### Option 3: AWS Session Manager (No SSH Key Needed)

If you have AWS CLI configured, you can connect without SSH keys:

**Step 1: Install AWS CLI on New Computer**

```bash
# macOS
brew install awscli

# Windows (PowerShell)
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Step 2: Configure Credentials**

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region
```

**Step 3: Install Session Manager Plugin**

Download from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

**Step 4: Connect**

```bash
aws ssm start-session --target YOUR_INSTANCE_ID
```

### Option 4: Web-Based SSH (AWS Console)

1. Log into AWS Console: https://console.aws.amazon.com
2. Navigate to EC2 → Instances
3. Select your ILUVATAR instance
4. Click **Connect**
5. Choose **EC2 Instance Connect** or **Session Manager**
6. Click **Connect**

This opens a browser-based terminal - no local setup required.

### Adding New Admins Remotely

To give another user admin access:

**Via Discord** (if you're already an admin):
```
/admin-add-owner user:@username
```

**Via SSH** (if you have server access):
```bash
ssh -i key.pem ec2-user@YOUR_IP
nano ~/iluvatar-2.0/.env

# Add their Discord ID to ADMIN_USER_IDS (comma-separated)
ADMIN_USER_IDS=123456789,987654321

# Restart
sudo systemctl restart iluvatar-orchestrator
```

### Security Best Practices

1. **Never share your SSH private key** via unencrypted channels
2. **Use strong passwords** for AWS account
3. **Enable MFA** on AWS Console
4. **Rotate credentials** periodically with `/admin-add-credential`
5. **Review admin list** regularly with `/admin-list-owners`
6. **Use dedicated Discord accounts** for bot administration

### Quick Access Reference

| Method | Requirements | Best For |
|--------|--------------|----------|
| Discord `/admin-*` | Discord + Owner ID | Daily management |
| SSH with key | `.pem` file + SSH client | Deep access, debugging |
| AWS Session Manager | AWS CLI + credentials | No key file needed |
| AWS Console Connect | AWS web login | Emergency access |

---

## Getting Help

- **Deployment Issues**: See DEPLOYMENT-GUIDE.md
- **Technical Details**: See README.md
- **Architecture**: See SESSION-CONTEXT.md
- **Report Bugs**: https://github.com/your-repo/issues
