#!/bin/bash
# =============================================================================
# ILUVATAR 3.0 - EC2 User Data Script
# =============================================================================
# This script runs on EC2 instance first boot
# Installs Docker, Node.js, and prepares the ILUVATAR environment
# =============================================================================

set -e

# Log all output
exec > >(tee /var/log/iluvatar-install.log)
exec 2>&1

echo "=========================================="
echo "ILUVATAR 3.0 Installation"
echo "Started: $(date)"
echo "=========================================="

# -----------------------------------------------------------------------------
# System Update
# -----------------------------------------------------------------------------
echo "[1/8] Updating system packages..."
yum update -y

# -----------------------------------------------------------------------------
# Install Docker
# -----------------------------------------------------------------------------
echo "[2/8] Installing Docker..."
yum install -y docker
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

echo "✓ Docker installed: $(docker --version)"

# -----------------------------------------------------------------------------
# Install Docker Compose
# -----------------------------------------------------------------------------
echo "[3/8] Installing Docker Compose..."
DOCKER_COMPOSE_VERSION="2.24.5"
curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

echo "✓ Docker Compose installed: $(docker-compose --version)"

# -----------------------------------------------------------------------------
# Install Node.js
# -----------------------------------------------------------------------------
echo "[4/8] Installing Node.js 20..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

echo "✓ Node.js installed: $(node --version)"
echo "✓ npm installed: $(npm --version)"

# -----------------------------------------------------------------------------
# Install Additional Tools
# -----------------------------------------------------------------------------
echo "[5/8] Installing additional tools..."
yum install -y \
    git \
    htop \
    vim \
    wget \
    unzip \
    jq

# -----------------------------------------------------------------------------
# Setup ILUVATAR Directory
# -----------------------------------------------------------------------------
echo "[6/8] Setting up ILUVATAR directory..."
cd /home/ec2-user

# If you have a Git repository, uncomment and modify:
# git clone https://github.com/yourusername/iluvatar-2.0.git

# For now, create directory structure
mkdir -p iluvatar-2.0
cd iluvatar-2.0

# Create placeholder .env file
cat > .env.template <<'EOF'
# =============================================================================
# ILUVATAR 3.0 - Environment Configuration
# =============================================================================
# IMPORTANT: Copy this to .env and fill in your actual values
# =============================================================================

# AI Providers
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx

# Discord
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id

# GitHub
GITHUB_TOKEN=ghp_xxxxx

# Database (use RDS endpoint if enabled in CloudFormation)
DATABASE_URL=postgresql://iluvatar:password@localhost:5432/iluvatar
POSTGRES_PASSWORD=changeme

# Redis
REDIS_URL=redis://localhost:6379

# AWS (for S3 archival - instance role provides credentials)
AWS_REGION=us-east-1
S3_ARCHIVE_BUCKET=your-archive-bucket

# Vercel/Railway (optional)
VERCEL_TOKEN=
RAILWAY_TOKEN=

# Budget
DEFAULT_BUDGET=50.00
GLOBAL_BUDGET_LIMIT=500.00

# n8n
N8N_ENCRYPTION_KEY=changeme_32_characters_long_key
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=changeme

# Vault
VAULT_ROOT_TOKEN=changeme

# Grafana
GRAFANA_ADMIN_PASSWORD=changeme
EOF

chown -R ec2-user:ec2-user /home/ec2-user/iluvatar-2.0

# -----------------------------------------------------------------------------
# Create Systemd Service
# -----------------------------------------------------------------------------
echo "[7/8] Creating systemd service..."
cat > /etc/systemd/system/iluvatar-orchestrator.service <<'EOF'
[Unit]
Description=ILUVATAR Orchestrator Service
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/iluvatar-2.0
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStartPre=/bin/sleep 10
ExecStart=/usr/local/bin/docker-compose -f docker-compose.orchestrator.yml up
ExecStop=/usr/local/bin/docker-compose -f docker-compose.orchestrator.yml down
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable iluvatar-orchestrator

# -----------------------------------------------------------------------------
# Create Helpful Scripts
# -----------------------------------------------------------------------------
echo "[8/8] Creating helper scripts..."

# Status check script
cat > /home/ec2-user/status.sh <<'EOF'
#!/bin/bash
echo "ILUVATAR System Status"
echo "======================"
echo ""
echo "Docker:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Services:"
systemctl status iluvatar-orchestrator --no-pager
echo ""
echo "Disk Usage:"
df -h | grep -E '(Filesystem|/dev/xvda)'
echo ""
echo "Memory:"
free -h
EOF

chmod +x /home/ec2-user/status.sh
chown ec2-user:ec2-user /home/ec2-user/status.sh

# Logs script
cat > /home/ec2-user/logs.sh <<'EOF'
#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: ./logs.sh [service]"
  echo "Services: orchestrator, redis, postgres, grafana, prometheus, nginx"
  exit 1
fi

cd /home/ec2-user/iluvatar-2.0
docker-compose -f docker-compose.orchestrator.yml logs -f --tail=100 $1
EOF

chmod +x /home/ec2-user/logs.sh
chown ec2-user:ec2-user /home/ec2-user/logs.sh

# -----------------------------------------------------------------------------
# Create Welcome Message
# -----------------------------------------------------------------------------
cat > /home/ec2-user/WELCOME.txt <<'EOF'
╔════════════════════════════════════════════════════════════════╗
║                     ILUVATAR 3.0 is Ready!                     ║
╚════════════════════════════════════════════════════════════════╝

Next Steps:
-----------

1. Configure Environment:
   cd ~/iluvatar-2.0
   cp .env.template .env
   nano .env  # Fill in your API keys

2. Start Services:
   sudo systemctl start iluvatar-orchestrator

3. Check Status:
   ./status.sh

4. View Logs:
   ./logs.sh orchestrator

Access Points:
--------------
- Orchestrator API: http://YOUR_IP:3001
- n8n UI:           http://YOUR_IP:5678
- Grafana:          http://YOUR_IP:3000
- Vault:            http://YOUR_IP:8200
- Prometheus:       http://YOUR_IP:9090

Documentation:
--------------
- Setup Guide:  ~/iluvatar-2.0/SETUP-TUTORIAL.md
- Session Log:  ~/iluvatar-2.0/SESSION-CONTEXT.md

Troubleshooting:
----------------
- Installation log: /var/log/iluvatar-install.log
- Service logs:     sudo journalctl -u iluvatar-orchestrator -f
- Docker logs:      docker-compose -f docker-compose.orchestrator.yml logs

For help: https://github.com/yourusername/iluvatar-2.0/issues
EOF

chown ec2-user:ec2-user /home/ec2-user/WELCOME.txt

# Display welcome message on login
echo "cat /home/ec2-user/WELCOME.txt" >> /home/ec2-user/.bashrc

# -----------------------------------------------------------------------------
# Completion
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "✓ Installation Complete!"
echo "Finished: $(date)"
echo "=========================================="
echo ""
echo "IMPORTANT: Configure .env file before starting services"
echo "  1. SSH to this instance"
echo "  2. cd iluvatar-2.0"
echo "  3. cp .env.template .env"
echo "  4. Edit .env with your API keys"
echo "  5. sudo systemctl start iluvatar-orchestrator"
echo ""
