# ILUVATAR 2.0 Setup Tutorial

**Goal:** Deploy a fully functional 20-agent hackathon automation system on AWS.

**Time Required:** 2-3 hours (first time), 30 minutes (subsequent deploys)

**Prerequisites:**
- A computer with internet access
- A credit/debit card for AWS (you'll get free tier for most services)
- Basic command line familiarity (we'll guide you)

**What You'll Learn:**
- How to set up AWS infrastructure
- How to work with Docker containers
- How to configure Redis, PostgreSQL, and Vault
- How to deploy n8n workflow automation
- How to integrate Discord and GitHub

---

## Table of Contents

1. [AWS Account Setup](#1-aws-account-setup)
2. [Local Development Environment](#2-local-development-environment)
3. [Install Required Tools](#3-install-required-tools)
4. [Clone and Configure Project](#4-clone-and-configure-project)
5. [Create External Accounts](#5-create-external-accounts)
6. [Deploy to AWS](#6-deploy-to-aws)
7. [Initialize Services](#7-initialize-services)
8. [Configure Agents](#8-configure-agents)
9. [Test the System](#9-test-the-system)
10. [Monitoring and Debugging](#10-monitoring-and-debugging)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. AWS Account Setup

### What is AWS?
AWS (Amazon Web Services) is a cloud computing platform where you can rent servers (called EC2 instances) to run your code 24/7 without needing your own computer to be always on.

### Step 1.1: Create AWS Account

1. Go to: https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Enter your email and choose "Personal account"
4. Fill in your details:
   - Account name: "ILUVATAR Hackathons"
   - Email: your email
   - Password: create a strong password
5. Enter payment information (required but you'll use free tier)
6. Choose "Basic Support - Free"
7. Complete phone verification
8. Sign in to AWS Console: https://console.aws.amazon.com/

### Step 1.2: Create IAM User (Security Best Practice)

**Why?** The root account has full access to everything. We'll create a limited user for safety.

1. In AWS Console, search for "IAM" in the top search bar
2. Click "Users" in left sidebar
3. Click "Add users"
4. User name: `iluvatar-admin`
5. Check both:
   - ✅ Access key - Programmatic access
   - ✅ Password - AWS Management Console access
6. Click "Next: Permissions"
7. Click "Attach existing policies directly"
8. Search and check these policies:
   - ✅ AmazonEC2FullAccess
   - ✅ AmazonVPCFullAccess
   - ✅ AmazonS3FullAccess
   - ✅ CloudWatchFullAccess
9. Click "Next: Tags" (skip tags)
10. Click "Next: Review"
11. Click "Create user"
12. **IMPORTANT:** Download the CSV file with credentials
    - Save it as `aws-credentials.csv` in a safe place
    - You'll need the Access Key ID and Secret Access Key

### Step 1.3: Create Key Pair (For SSH Access)

**What's a key pair?** It's like a digital key to access your server remotely.

1. In AWS Console, search for "EC2"
2. In left sidebar, click "Key Pairs" (under Network & Security)
3. Click "Create key pair"
4. Name: `iluvatar-keypair`
5. Key pair type: RSA
6. Private key file format:
   - **Windows:** `.ppk` (for PuTTY)
   - **Mac/Linux:** `.pem`
7. Click "Create key pair"
8. Save the downloaded file to a safe location

**Mac/Linux only:** Set correct permissions
```bash
chmod 400 ~/iluvatar-keypair.pem
```

---

## 2. Local Development Environment

### Step 2.1: Choose Your Terminal

**Windows:**
- Download Git Bash: https://git-scm.com/download/win
- OR use PowerShell (built-in)
- OR use WSL: https://docs.microsoft.com/en-us/windows/wsl/install

**Mac:**
- Use built-in Terminal app (Applications → Utilities → Terminal)

**Linux:**
- Use your distribution's terminal (Ctrl+Alt+T)

### Step 2.2: Create Project Directory

```bash
# Clone the repository
git clone https://github.com/yourusername/iluvatar-2.0.git
cd iluvatar-2.0

# Verify you're in the right place
pwd
ls -la
```

---

## 3. Install Required Tools

### Step 3.1: Install Node.js

**Download:** https://nodejs.org/
- Choose "LTS" (Long Term Support) version
- Download and install for your operating system

**Verify installation:**
```bash
node --version  # Should show: v20.x.x or higher
npm --version   # Should show: 10.x.x or higher
```

### Step 3.2: Install Docker

**Download:** https://www.docker.com/products/docker-desktop/

**Mac:**
1. Download Docker Desktop for Mac
2. Install by dragging to Applications
3. Launch Docker Desktop
4. Wait for Docker icon in menu bar to show "running"

**Windows:**
1. Download Docker Desktop for Windows
2. Install (may require restart)
3. Launch Docker Desktop
4. Enable WSL 2 backend if prompted

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in
```

**Verify Docker:**
```bash
docker --version
docker run hello-world
```

### Step 3.3: Install AWS CLI

**Mac:**
```bash
brew install awscli
# OR
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

**Windows:**
- Download: https://awscli.amazonaws.com/AWSCLIV2.msi
- Run installer

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Configure AWS CLI:**
```bash
aws configure
# Enter values from aws-credentials.csv:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: us-east-1
# - Output format: json
```

**Verify:**
```bash
aws sts get-caller-identity
```

---

## 4. Clone and Configure Project

### Step 4.1: Configure Environment Variables

```bash
cd iluvatar-2.0

# Copy template
cp .env.example .env

# Edit with your preferred editor
nano .env
# OR: code .env (VS Code)
# OR: vim .env
```

**Fill in these values:**

```bash
# Anthropic API Key (get from console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Discord Bot (get from discord.com/developers)
DISCORD_BOT_TOKEN=xxxxx
DISCORD_CHANNEL_ID=xxxxx

# GitHub Token (get from github.com/settings/tokens)
GITHUB_TOKEN=ghp_xxxxx
GITHUB_USERNAME=your_username

# Generate strong passwords
POSTGRES_PASSWORD=<use: openssl rand -base64 32>
REDIS_PASSWORD=<use: openssl rand -base64 32>
VAULT_ROOT_TOKEN=<use: openssl rand -base64 32>
N8N_ENCRYPTION_KEY=<use: openssl rand -base64 32>
GRAFANA_ADMIN_PASSWORD=<choose strong password>

# Budget
BUDGET_LIMIT=100
```

---

## 5. Create External Accounts

### Step 5.1: Anthropic API Key

1. Go to: https://console.anthropic.com/
2. Sign up or log in
3. Click "Get API Keys"
4. Click "Create Key"
5. Name: "ILUVATAR Production"
6. Copy the key (starts with `sk-ant-`)
7. Paste into `.env`: `ANTHROPIC_API_KEY=sk-ant-xxxxx`

**Add payment method:**
1. Go to Billing settings
2. Add credit/debit card
3. Set budget alerts at $50, $80, $100

### Step 5.2: Discord Bot

1. Go to: https://discord.com/developers/applications
2. Click "New Application"
3. Name: "ILUVATAR Pipeline"
4. Click "Create"

**Create Bot:**
1. Click "Bot" in left sidebar
2. Click "Add Bot"
3. Under "Token", click "Reset Token" → "Copy"
4. Paste into `.env`: `DISCORD_BOT_TOKEN=xxxxx`

**Bot Permissions:**
1. Scroll to "Privileged Gateway Intents"
2. Enable:
   - ✅ MESSAGE CONTENT INTENT
   - ✅ SERVER MEMBERS INTENT
3. Click "Save Changes"

**Invite Bot:**
1. Click "OAuth2" → "URL Generator"
2. Scopes: Check `bot`
3. Bot Permissions:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ Add Reactions
4. Copy URL, paste in browser, select server, authorize

**Get Channel ID:**
1. Open Discord
2. Enable Developer Mode (Settings → Advanced)
3. Right-click your channel → "Copy Channel ID"
4. Paste into `.env`: `DISCORD_CHANNEL_ID=xxxxx`

### Step 5.3: GitHub Token

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Note: "ILUVATAR Pipeline"
4. Expiration: 90 days
5. Scopes:
   - ✅ repo (all)
   - ✅ workflow
6. Click "Generate token"
7. Copy token (starts with `ghp_`)
8. Paste into `.env`: `GITHUB_TOKEN=ghp_xxxxx`

---

## 6. Local Testing (Before AWS)

### Step 6.1: Start Services Locally

```bash
# Start all containers
docker-compose up -d

# Check status
docker-compose ps

# All should show "Up"
```

### Step 6.2: Initialize Vault

```bash
# Access Vault container
docker exec -it iluvatar_vault sh

# Initialize (SAVE THE OUTPUT!)
vault operator init

# You'll get 5 unseal keys and 1 root token
# SAVE THESE IN A PASSWORD MANAGER!

# Unseal (need 3 keys)
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# Login
vault login <root_token>

# Store secrets
vault kv put secret/anthropic api_key="sk-ant-xxxxx"
vault kv put secret/discord bot_token="your_token"
vault kv put secret/github token="ghp_xxxxx"

# Exit
exit
```

### Step 6.3: Verify Database

```bash
# Access PostgreSQL
docker exec -it iluvatar_postgres psql -U iluvatar

# Check tables
\dt

# Should see:
# - user_preferences
# - hackathon_history
# - learnings
# - cost_tracking
# - agent_metrics
# - file_tracking

# Exit
\q
```

### Step 6.4: Test Redis

```bash
docker exec -it iluvatar_redis redis-cli

# Test
SET test "Hello ILUVATAR"
GET test

# Should return: "Hello ILUVATAR"

# Exit
quit
```

---

## 7. Configure n8n

### Step 7.1: Access n8n

1. Open browser: http://localhost:5678
2. Create owner account (save credentials!)

### Step 7.2: Import Workflows

1. Click "Workflows"
2. Click "Import from File"
3. Import these files from `n8n-workflows/`:
   - `iluvatar-master.json`
   - `debugging-pyramid.json`
   - `micro-checkpoints.json`
   - `discord-dashboard.json`

### Step 7.3: Add Credentials

**Anthropic API:**
1. Settings → Credentials → Add Credential
2. Type: "HTTP Request"
3. Authentication: "Header Auth"
4. Header Name: `x-api-key`
5. Value: `{{ $env.ANTHROPIC_API_KEY }}`
6. Save as "Anthropic API"

**Discord Webhook:**
1. In Discord: Channel settings → Integrations → Webhooks
2. Create webhook, copy URL
3. In n8n: Add Credential → Discord Webhook
4. Paste URL

**GitHub:**
1. Add Credential → GitHub
2. Access Token: `{{ $env.GITHUB_TOKEN }}`

### Step 7.4: Activate Workflows

1. Open each workflow
2. Click "Active" toggle (top-right)
3. Should turn green ✅

---

## 8. Test the System

### Step 8.1: Discord Test

In your Discord channel:
```
/status
```

Expected:
```
✅ ILUVATAR Pipeline is online!

System Status:
├─ All 6 containers: Running
├─ 20 agents: Ready
├─ Redis: Connected
├─ PostgreSQL: Connected
├─ Vault: Unsealed
└─ Budget: $100.00 (100%)

Type /help for commands.
```

### Step 8.2: Agent Communication Test

```
/test-agents
```

Expected:
```
🧪 Running system tests...

✅ Redis State Manager: OK
✅ Redis Pub/Sub: OK
✅ Vault: OK
✅ Anthropic API: OK (342ms)
✅ GitHub API: OK

All systems operational! 🚀
```

---

## 9. Monitoring

### Grafana Dashboard

1. Open: http://localhost:3000
2. Login:
   - Username: `admin`
   - Password: (from `.env`)
3. You'll see:
   - Agent timeline
   - Token usage
   - Cost tracking
   - Velocity metrics

### n8n Workflow Monitoring

1. Open: http://localhost:5678
2. Click "Executions"
3. View real-time workflow runs

---

## 10. Troubleshooting

### Containers Won't Start

```bash
# Check logs
docker-compose logs

# Recreate containers
docker-compose down
docker-compose up -d --force-recreate
```

### Vault Sealed

```bash
# Unseal with 3 keys
docker exec -it iluvatar_vault vault operator unseal <key>
```

### Discord Bot Not Responding

1. Check bot token in Vault
2. Verify bot has correct permissions
3. Check n8n workflow is active
4. Review n8n logs

### Budget Issues

```
/budget 150  # Increase to $150
/status      # Check current spend
```

---

## 11. Running Tests

Before deploying, verify everything works by running the test suite.

### Quick Test
```bash
# Run all tests
npm test
```

Expected output:
```
542 passing (5s)
70 pending
0 failing
```

### Test Categories

| Category | Description | Requires |
|----------|-------------|----------|
| Unit Tests | Core module tests | No infrastructure |
| Deployer Tests | AWS/Vercel/Railway tests | No infrastructure |
| Integration Tests | Full pipeline tests | Skipped (requires setup) |
| E2E Tests | 24-hour simulation | Skipped (requires full stack) |
| Chaos Tests | Failure recovery | Skipped (requires full stack) |

### Running with Local Docker Stack
```bash
# Start local services (Redis, PostgreSQL, n8n)
./scripts/local-test.sh

# Run tests with services
npm test

# Stop services
./scripts/local-test.sh stop
```

### Debug Mode
```bash
# Start with Redis Commander and pgAdmin
./scripts/local-test.sh debug

# Access:
# - n8n: http://localhost:5678
# - Redis Commander: http://localhost:8081
# - pgAdmin: http://localhost:8082
```

---

## 12. Production Deployment (AWS)

See the full plan document for AWS CloudFormation deployment scripts and production configuration.

**Quick AWS Deploy:**
```bash
# Deploy infrastructure
./deploy.sh

# Follow prompts for:
# - EC2 instance type
# - Security groups
# - SSH key pair
```

---

## Next Steps

1. ✅ System is running locally
2. Test with a practice hackathon
3. Deploy to AWS for 24/7 operation
4. Configure alerts and monitoring
5. Start winning hackathons! 🏆

---

## Support

- **Issues:** GitHub Issues
- **Discord:** Community server
- **Docs:** `/docs` folder

**You're ready to automate your hackathon wins!** 🚀
