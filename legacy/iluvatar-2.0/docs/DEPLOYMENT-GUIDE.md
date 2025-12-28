# ILUVATAR Deployment Guide

Complete guide for deploying ILUVATAR to AWS from scratch.

**Time Required**: 45-60 minutes
**Cost**: ~$50-120/month (depends on instance size)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [AWS Account Setup](#2-aws-account-setup)
3. [Discord Bot Setup](#3-discord-bot-setup)
4. [API Keys](#4-api-keys)
5. [Deploy to AWS](#5-deploy-to-aws)
6. [Configure the Instance](#6-configure-the-instance)
7. [Start Services](#7-start-services)
8. [Import n8n Workflows](#8-import-n8n-workflows)
9. [Verify Installation](#9-verify-installation)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Before starting, ensure you have:

- [ ] Windows PC with Git Bash or WSL (for running bash scripts)
- [ ] AWS account (free tier works for testing)
- [ ] Discord account
- [ ] Anthropic API account
- [ ] GitHub account

### Install Required Tools

**AWS CLI**:
```bash
# Download from: https://aws.amazon.com/cli/
# Verify installation:
aws --version
```

**Git Bash** (Windows):
```
Download from: https://git-scm.com/download/win
```

---

## 2. AWS Account Setup

### 2.1 Create AWS Account

If you don't have one:
1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow the signup process
4. Add a payment method (required, but free tier available)

### 2.2 Create IAM User

Don't use your root account. Create an IAM user:

1. Go to AWS Console → IAM → Users
2. Click "Create user"
3. User name: `iluvatar-deployer`
4. Click "Next"
5. Select "Attach policies directly"
6. Search and select these policies:
   - `AmazonEC2FullAccess`
   - `AmazonS3FullAccess`
   - `AmazonVPCFullAccess`
   - `CloudFormationFullAccess`
   - `IAMFullAccess`
7. Click "Next" → "Create user"

### 2.3 Create Access Keys

1. Click on the user you just created
2. Go to "Security credentials" tab
3. Click "Create access key"
4. Select "Command Line Interface (CLI)"
5. Check the confirmation box
6. Click "Create access key"
7. **IMPORTANT**: Download the CSV file or copy both keys
   - Access Key ID: `AKIA...`
   - Secret Access Key: `...`

### 2.4 Configure AWS CLI

```bash
aws configure
```

Enter when prompted:
- AWS Access Key ID: `[paste your access key]`
- AWS Secret Access Key: `[paste your secret key]`
- Default region name: `us-east-1` (or your preferred region)
- Default output format: `json`

Verify configuration:
```bash
aws sts get-caller-identity
```

Should show your account ID and user ARN.

### 2.5 Create EC2 Key Pair

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name iluvatar-keypair \
  --query 'KeyMaterial' \
  --output text > iluvatar-keypair.pem

# Set permissions (Git Bash/Linux/Mac)
chmod 400 iluvatar-keypair.pem
```

**Keep this file safe!** You need it to SSH into your instance.

---

## 3. Discord Bot Setup

### 3.1 Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name: `ILUVATAR Pipeline`
4. Click "Create"

### 3.2 Create Bot User

1. Click "Bot" in the left sidebar
2. Click "Add Bot" → "Yes, do it!"
3. Under "Token", click "Reset Token"
4. **Copy the token** - you'll need this later
5. Save it somewhere secure (you won't see it again!)

### 3.3 Enable Privileged Intents

Still in Bot settings, scroll down and enable:
- [x] **PRESENCE INTENT**
- [x] **SERVER MEMBERS INTENT**
- [x] **MESSAGE CONTENT INTENT** ← Critical!

Click "Save Changes"

### 3.4 Get Client ID

1. Click "OAuth2" in the left sidebar
2. Copy the "CLIENT ID" - save this

### 3.5 Generate Invite URL

1. Click "OAuth2" → "URL Generator"
2. **Scopes**: Select `bot` and `applications.commands`
3. **Bot Permissions**: Select:
   - Send Messages
   - Send Messages in Threads
   - Create Public Threads
   - Read Message History
   - Embed Links
   - Attach Files
   - Add Reactions
   - Use Slash Commands
   - Manage Channels (for auto-creating hackathon channels)
4. Copy the generated URL at the bottom

### 3.6 Add Bot to Your Server

1. Open the URL you copied in a browser
2. Select your Discord server
3. Click "Authorize"
4. Complete the CAPTCHA

### 3.7 Get Server and Channel IDs

1. Open Discord
2. Go to User Settings → Advanced
3. Enable **Developer Mode**
4. Right-click your server name → "Copy Server ID"
   - This is your `DISCORD_GUILD_ID`
5. Create a channel called `#admin-dashboard`
6. Right-click the channel → "Copy Channel ID"
   - This is your `ADMIN_CHANNEL_ID`

### 3.8 Get Your User ID

1. Right-click on yourself (your username)
2. Click "Copy User ID"
   - This is your `DISCORD_OWNER_ID`

---

## 4. API Keys

### 4.1 Anthropic API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Go to Settings → API Keys
4. Click "Create Key"
5. Name it: `iluvatar`
6. Copy the key (starts with `sk-ant-`)

### 4.2 GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Note: `iluvatar-hackathon`
4. Expiration: 90 days (or your preference)
5. Select scopes:
   - [x] `repo` (Full control of private repositories)
   - [x] `workflow` (Update GitHub Action workflows)
6. Click "Generate token"
7. Copy the token (starts with `ghp_`)

### 4.3 Optional: Deployment Platform Tokens

**Vercel** (for frontend deployments):
1. Go to https://vercel.com/account/tokens
2. Create token, copy it

**Railway** (for backend deployments):
1. Go to https://railway.app/account/tokens
2. Create token, copy it

---

## 5. Deploy to AWS

### 5.1 Navigate to Project Directory

```bash
cd "E:\coding\Hackpage 2.0\Hackpage 2.0\iluvatar-2.0"
```

### 5.2 Run Deployment Script

```bash
bash deploy.sh
```

### 5.3 Answer the Prompts

The script will ask you for:

| Prompt | Recommended Value | Notes |
|--------|-------------------|-------|
| Stack name | `iluvatar-prod` | Your CloudFormation stack name |
| AWS Region | `us-east-1` | Or your preferred region |
| Instance type | `t3.xlarge` | 4 vCPU, 16GB RAM. Use `t3.large` for smaller budgets |
| SSH Key name | `iluvatar-keypair` | The key pair you created earlier |
| Your IP for SSH | `0.0.0.0/0` | Or your specific IP for better security |
| Environment | `production` | or `staging` |
| EBS volume size | `50` | GB of storage |
| Enable RDS | `n` | Uses Docker PostgreSQL instead |
| Enable ElastiCache | `n` | Uses Docker Redis instead |

### 5.4 Wait for Deployment

The script will:
1. Validate your configuration
2. Create CloudFormation stack
3. Wait for resources (~5-10 minutes)
4. Output connection information

**Save the output!** It contains your:
- Public IP address
- SSH command
- Service URLs

Example output:
```
Deployment successful!

Public IP: 54.123.45.67

SSH Command:
  ssh -i iluvatar-keypair.pem ec2-user@54.123.45.67

Service URLs:
  Orchestrator API: http://54.123.45.67:3001
  n8n Workflows:    http://54.123.45.67:5678
  Grafana:          http://54.123.45.67:3000
  Vault:            http://54.123.45.67:8200

Deployment info saved to: deployment-info.txt
```

---

## 6. Configure the Instance

### 6.1 SSH to Your Instance

```bash
ssh -i iluvatar-keypair.pem ec2-user@YOUR_PUBLIC_IP
```

Replace `YOUR_PUBLIC_IP` with the IP from the deployment output.

### 6.2 Navigate to Project Directory

```bash
cd ~/iluvatar-2.0
```

### 6.3 Create Environment File

```bash
cp .env.template .env
nano .env
```

### 6.4 Fill in Environment Variables

Edit the `.env` file with your values:

```bash
# =============================================================================
# REQUIRED - Core Services
# =============================================================================

# Anthropic API (REQUIRED)
ANTHROPIC_API_KEY=sk-ant-xxxxx-your-key-here

# Discord Bot (REQUIRED)
DISCORD_BOT_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
DISCORD_GUILD_ID=your-server-id-here
ADMIN_CHANNEL_ID=your-admin-channel-id-here

# Admin Configuration (REQUIRED - This is YOUR Discord user ID)
DISCORD_OWNER_ID=your-discord-user-id-here

# GitHub (REQUIRED)
GITHUB_TOKEN=ghp_xxxxx-your-token-here
GITHUB_USERNAME=your-github-username

# =============================================================================
# REQUIRED - Security (Generate these!)
# =============================================================================

# Database Passwords - Generate with: openssl rand -base64 32
POSTGRES_PASSWORD=paste-generated-password-here
REDIS_PASSWORD=paste-generated-password-here

# n8n Encryption - Must be exactly 32 characters
N8N_ENCRYPTION_KEY=paste-32-character-string-here
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=choose-a-secure-password

# Vault
VAULT_ROOT_TOKEN=paste-generated-token-here

# Grafana
GRAFANA_ADMIN_PASSWORD=choose-a-secure-password

# =============================================================================
# OPTIONAL - Can add later via Discord /admin-set-env
# =============================================================================

# OpenAI (alternative to Anthropic)
# OPENAI_API_KEY=sk-xxxxx

# Deployment Platforms
# VERCEL_TOKEN=your-vercel-token
# RAILWAY_TOKEN=your-railway-token

# AWS S3 (for backups - auto-configured from CloudFormation)
AWS_REGION=us-east-1
# S3_ARCHIVE_BUCKET=auto-filled-by-cloudformation

# Budget Limits
BUDGET_LIMIT=100
GLOBAL_BUDGET_LIMIT=500
```

### 6.5 Generate Secure Passwords

Run these commands and paste the output into your `.env`:

```bash
# Generate POSTGRES_PASSWORD
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"

# Generate REDIS_PASSWORD
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"

# Generate N8N_ENCRYPTION_KEY (exactly 32 chars)
echo "N8N_ENCRYPTION_KEY=$(openssl rand -base64 24)"

# Generate VAULT_ROOT_TOKEN
echo "VAULT_ROOT_TOKEN=$(openssl rand -base64 32)"
```

### 6.6 Save and Exit

Press `Ctrl+X`, then `Y`, then `Enter` to save.

---

## 7. Start Services

### 7.1 Start the Orchestrator

```bash
sudo systemctl start iluvatar-orchestrator
```

### 7.2 Check Status

```bash
./status.sh
```

You should see all containers running:
- orchestrator
- n8n
- redis
- postgres
- grafana
- prometheus

### 7.3 View Logs (if needed)

```bash
./logs.sh orchestrator
```

---

## 8. Import n8n Workflows

### 8.1 Access n8n UI

Open in browser: `http://YOUR_PUBLIC_IP:5678`

Login with:
- Username: `admin` (or your `N8N_BASIC_AUTH_USER`)
- Password: Your `N8N_BASIC_AUTH_PASSWORD`

### 8.2 Import Workflows

1. Click "Workflows" in the sidebar
2. Click "Import from File"
3. Navigate to `n8n-workflows/` directory on your local machine
4. Import each file:
   - `01-iluvatar-master.json`
   - `02-debugging-pyramid.json`
   - `03-micro-checkpoints.json`
   - `04-discord-dashboard.json`
   - `05-velocity-tracking.json`

### 8.3 Configure Credentials in n8n

1. Click the gear icon (Settings)
2. Go to "Credentials"
3. Click "Add Credential"

**Add Anthropic API**:
- Type: HTTP Request
- Name: `Anthropic API`
- Authentication: Header Auth
- Header Name: `x-api-key`
- Header Value: Your Anthropic API key

**Add Discord Webhook** (optional):
- Type: Discord Webhook
- Name: `Discord Updates`
- Webhook URL: Create a webhook in your Discord channel

**Add GitHub**:
- Type: GitHub
- Name: `GitHub`
- Access Token: Your GitHub token

### 8.4 Activate Workflows

For each imported workflow:
1. Open the workflow
2. Toggle "Active" switch in the top-right corner

---

## 9. Verify Installation

### 9.1 Test Discord Bot

Go to your Discord server and type:
```
/status
```

The bot should respond with system status.

### 9.2 Test Admin Commands

Type:
```
/admin-list-env
```

If you're the owner, you should see a list of environment variables (masked).

### 9.3 Create a Test Hackathon

```
/new-hackathon name:Test Hackathon deadline:2025-12-31T23:59:00Z budget:50
```

The bot should:
1. Create a new channel `#hackathon-test-hackathon`
2. Send a welcome message
3. Confirm creation in the admin channel

### 9.4 Check All Services

| Service | URL | Expected |
|---------|-----|----------|
| Orchestrator API | http://YOUR_IP:3001/health | `{"status":"healthy"}` |
| n8n UI | http://YOUR_IP:5678 | Login page |
| Grafana | http://YOUR_IP:3000 | Login page |

---

## 10. Troubleshooting

### Bot Not Responding

1. Check bot token:
   ```bash
   ./logs.sh orchestrator | grep -i discord
   ```

2. Verify intents are enabled (especially MESSAGE_CONTENT)

3. Check if bot is in your server

### Services Won't Start

1. Check Docker:
   ```bash
   docker ps -a
   ```

2. View logs:
   ```bash
   docker-compose logs
   ```

3. Check `.env` file has all required values

### Can't SSH to Instance

1. Check your IP hasn't changed
2. Verify key pair permissions:
   ```bash
   chmod 400 iluvatar-keypair.pem
   ```
3. Check security group in AWS Console allows SSH (port 22)

### n8n Workflows Not Running

1. Make sure workflows are "Active"
2. Check n8n logs:
   ```bash
   ./logs.sh n8n
   ```
3. Verify credentials are configured

### Out of Memory

Upgrade instance:
1. Stop instance in AWS Console
2. Change instance type (e.g., t3.xlarge → t3.2xlarge)
3. Start instance

---

## Quick Reference Card

Save this for later:

```
=== SSH ===
ssh -i iluvatar-keypair.pem ec2-user@YOUR_IP

=== Status ===
./status.sh

=== Logs ===
./logs.sh orchestrator
./logs.sh n8n
./logs.sh postgres

=== Restart ===
sudo systemctl restart iluvatar-orchestrator

=== URLs ===
n8n:      http://YOUR_IP:5678
Grafana:  http://YOUR_IP:3000
API:      http://YOUR_IP:3001

=== Discord Commands ===
/status              - Check system
/admin-list-env      - List env vars
/admin-set-env       - Set env var
/admin-restart       - Restart services
/new-hackathon       - Create hackathon
```

---

## Next Steps

Once deployed, see **USER-MANUAL.md** for:
- How to use Discord commands
- How to run hackathons
- How to add new tools and credentials
- How to monitor and maintain the system
