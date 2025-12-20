# ILUVATAR 2.0

**Automated Hackathon Pipeline - Win Hackathons with 20 AI Agents**

ILUVATAR 2.0 is an intelligent, multi-agent system that automates the entire hackathon process from ideation to deployment. Built with Claude (Opus/Sonnet/Haiku), it orchestrates 20 specialized AI agents to build winning projects in 24-48 hours.

---

## 🎯 What It Does

- **Brainstorms Ideas:** Gandalf generates 3 scored ideas based on hackathon theme and sponsor APIs
- **Plans Architecture:** Radagast designs time-aware architecture with burndown tracking
- **Writes Code:** Gimli (backend) and Legolas (frontend) generate production-ready code
- **Reviews & Tests:** Elrond reviews for security/performance, Thorin generates comprehensive tests
- **Deploys:** Éomer deploys to Vercel/Railway/Netlify with one command
- **Monitors Progress:** Real-time Discord dashboard + Grafana metrics
- **Self-Debugs:** 6-layer debugging pyramid handles 98% of errors automatically

---

## 🏗️ Architecture

### 20-Agent System

| Layer | Agents | Model | Role |
|-------|--------|-------|------|
| **Infrastructure** | Shadowfax, Quickbeam, Gollum | Haiku | Context compression, pre-fetching, monitoring |
| **Coordination** | Denethor, Merry, Pippin, Bilbo, Galadriel | Sonnet | Work distribution, GitHub, Discord, preferences, learning |
| **Planning** | Gandalf, Radagast, Treebeard, Arwen | Opus | Ideation, architecture, debugging, test planning |
| **Code Generation** | Gimli, Legolas, Aragorn, Éowyn | Opus | Backend, frontend, integration, UI polish |
| **Review & Testing** | Elrond, Thorin | Sonnet | Code review, test generation |
| **Deployment** | Éomer, Haldir | Sonnet | Multi-platform deployment, verification |

### Tech Stack

- **Orchestration:** n8n (workflow engine)
- **State Management:** Redis (optimistic locking, Pub/Sub)
- **Long-term Storage:** PostgreSQL (preferences, history, learnings)
- **Vector Search:** Qdrant (semantic search for past failures)
- **Secrets:** HashiCorp Vault
- **Monitoring:** Grafana
- **Deployment:** AWS EC2 (6 Docker containers)

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- AWS account (for deployment)
- Anthropic API key ([get one here](https://console.anthropic.com/))
- Discord bot ([create here](https://discord.com/developers/applications))
- GitHub personal access token ([create here](https://github.com/settings/tokens))

### 1. Clone and Configure

```bash
git clone https://github.com/yourusername/iluvatar-2.0.git
cd iluvatar-2.0

# Copy environment template
cp .env.example .env

# Edit .env with your API keys and credentials
nano .env
```

### 2. Start Local Development

```bash
# Start all 6 containers
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Initialize Services

```bash
# Initialize Vault (first time only)
docker exec -it iluvatar_vault vault operator init
# Save the unseal keys and root token!

# Unseal Vault (required after each restart)
docker exec -it iluvatar_vault vault operator unseal <key1>
docker exec -it iluvatar_vault vault operator unseal <key2>
docker exec -it iluvatar_vault vault operator unseal <key3>

# Store secrets
docker exec -it iluvatar_vault vault login <root_token>
docker exec -it iluvatar_vault vault kv put secret/anthropic api_key="sk-ant-xxxxx"
docker exec -it iluvatar_vault vault kv put secret/discord bot_token="your_token"
docker exec -it iluvatar_vault vault kv put secret/github token="ghp_xxxxx"
```

### 4. Configure n8n

1. Open [http://localhost:5678](http://localhost:5678)
2. Create owner account
3. Import workflows from `n8n-workflows/`
4. Add credentials (Anthropic, Discord, GitHub)
5. Activate workflows

### 5. Test the System

In Discord:
```
/status
```

Expected response:
```
✅ ILUVATAR Pipeline is online!

System Status:
├─ All 6 containers: Running
├─ 20 agents: Ready
├─ Redis: Connected
├─ PostgreSQL: Connected
├─ Vault: Unsealed
└─ Budget remaining: $100.00 (100%)
```

---

## 📖 Documentation

- **[Setup Tutorial](SETUP-TUTORIAL.md)** - Complete beginner-friendly guide (AWS deployment)
- **[Agent Roster](docs/agent-roster.md)** - Detailed description of all 20 agents
- **[Architecture Guide](docs/architecture.md)** - System design and data flow
- **[API Reference](docs/api-reference.md)** - State management and message bus
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

---

## 🎮 Usage

### Start a Hackathon

In Discord:
```
/start-hackathon
Theme: Build an AI-powered education tool
Deadline: 2025-12-20 18:00
Budget: $50
```

### Monitor Progress

- **Discord:** Real-time dashboard updates every 5 minutes
- **Grafana:** [http://localhost:3000](http://localhost:3000) (detailed metrics)
- **n8n:** [http://localhost:5678](http://localhost:5678) (workflow execution)

### Available Commands

```
/pause              - Pause pipeline immediately
/resume             - Resume paused pipeline
/status             - Get current status
/suggest <message>  - Inject suggestion
/override <agent>   - Force re-run agent
/budget <amount>    - Adjust budget
/help               - Show all commands
```

---

## 💰 Cost Estimates

| Hackathon Duration | Typical Cost | Breakdown |
|-------------------|--------------|-----------|
| 24 hours | $20-35 | Mostly Haiku/Sonnet for simple projects |
| 48 hours | $40-70 | Balanced use of all models |
| 7 days | $80-120 | Complex project with extensive testing |

**AWS Infrastructure:** ~$0.17/hour (EC2 t3.xlarge) = $4/day when running

---

## 🏆 Success Metrics

Based on design goals:

| Metric | Target | Notes |
|--------|--------|-------|
| Success Rate | 96-98% | Up from 85% in v1.0 |
| Human Interventions | <2% | Multi-layer debugging handles rest |
| Mean Time to Recovery | <5 min | Automated error resolution |
| Hackathon Win Rate | >20% | Industry avg: 5-10% |
| Demo Quality Score | 8+/10 | Judge appeal and "wow factor" |

---

## 🔧 Development

### Project Structure

```
iluvatar-2.0/
├── setup/              # Docker configs, DB initialization
├── core/               # State manager, message bus, utilities
├── agents/             # 20 agent prompt files (.md format)
├── n8n-workflows/      # Workflow JSON files
├── tests/              # Integration and E2E tests
├── deployers/          # Platform-specific deployment scripts
├── config-node.js      # Centralized model configuration
└── docker-compose.yml  # 6-container orchestration
```

### Adding a New Agent

1. Create prompt file: `agents/new-agent.md`
2. Add to `config-node.js` agent_models
3. Create n8n workflow node
4. Test with mock inputs
5. Integrate into pipeline

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E hackathon simulation
npm run test:hackathon
```

---

## 🐛 Troubleshooting

### Common Issues

**Containers won't start:**
```bash
docker-compose down
docker-compose up -d --force-recreate
```

**Vault is sealed:**
```bash
docker exec -it iluvatar_vault vault operator unseal <key>
```

**Discord bot not responding:**
- Check bot token in Vault
- Verify bot has MESSAGE_CONTENT intent enabled
- Check n8n workflow is active

**Budget exceeded:**
```
/budget 150
```

See [Troubleshooting Guide](docs/troubleshooting.md) for more.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

---

## 🙏 Acknowledgments

- **Claude (Anthropic)** - The AI powerhouse behind all 20 agents
- **n8n** - Workflow orchestration platform
- **LOTR Characters** - Agent naming inspiration (Tolkien estate)
- **MLH & Hackathon Community** - For the amazing events that inspired this

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/iluvatar-2.0/issues)
- **Discord:** [Join our server](https://discord.gg/iluvatar)
- **Email:** support@iluvatar.dev

---

**Built with ❤️ for hackers who want to win**

🏆 Happy Hacking! 🏆
