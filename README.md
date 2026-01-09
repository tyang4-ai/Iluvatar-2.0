> **Tip:** View this file with proper formatting at [markdownlivepreview.com](https://markdownlivepreview.com/)

# ILUVATAR - Novel Writer ML Project

> *Named after Tolkien's creator god* - An automated novel creation pipeline that learns your writing style through ML fine-tuning.

## What It Does

ILUVATAR is a **Discord-controlled novel writing pipeline** with three AI agents:

- **Gandalf** (Planner) - Creates novel outlines, Story Bibles, and chapter plans
- **Frodo** (Writer) - Writes chapters following the plan, maintaining style consistency
- **Elrond** (Critic) - Evaluates chapters and provides revision feedback

All orchestrated through Discord slash commands, with N8N handling the workflow automation and Redis storing novel state.

### Current Capabilities

- `/novel create` - Start a new novel with premise and author style
- `/novel outline` - Generate detailed novel outline with Story Bible
- `/novel plan_chapter` - Create detailed chapter plan before writing
- `/novel write` - Generate chapters with optional auto-critique/revision
- `/novel critique` - Get feedback on any chapter from the critic
- `/novel revise` - Revise a chapter based on feedback
- `/novel feedback` - Manual DPO preference pairs for ML training
- `/novel export` - Export to markdown/JSON for training data

### ML Learning Goals

- **Fine-tuning LLMs** (LoRA/QLoRA on Qwen2.5)
- **RLHF/DPO** (preference learning from critic feedback)
- **RAG & Embeddings** (long-context novel management via Story Bible)
- **Evaluation** (custom benchmarks for writing quality)

### The Novel

A multi-POV xianxia/sci-fi/thriller fusion:
- 武侠/修仙 (Wuxia/Xianxia) - Chinese fantasy with cultivation
- Science Fiction - Technology, futuristic elements
- Thriller - Suspense, plot twists, pacing

Multiple short web novels telling the same story from different character perspectives.

## Architecture

```
Planning Agent: Claude Opus (complex reasoning, extended thinking)
                    ↓
Writing Agent:  Fine-tuned Qwen2.5 (style-optimized, free inference)
                    ↓
Critic Agent:   Claude Opus (quality evaluation → training signal)
```

The critic's feedback creates preference pairs for DPO training, allowing the local model to learn from Claude's judgments.

## Project Structure

```
.
├── .claude/          # Claude steering (agents, hooks, prompts)
├── docs/             # Documentation, findings, results
├── legacy/           # Original hackathon automation system (reference)
├── src/              # ILUVATAR novel writer code
├── ml/               # ML training modules (5 progressive modules)
├── notebooks/        # Jupyter learning notebooks
├── data/             # Training data
└── models/           # Trained checkpoints
```

## Getting Started

```bash
# Clone the repository
git clone https://github.com/tyang4-ai/Iluvatar-2.0.git
cd Iluvatar-2.0

# Set up Python environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

## Current Status

| Phase | Status |
|-------|--------|
| Infrastructure (Discord, N8N, Redis) | COMPLETE |
| Novel Pipeline (outline → write → critique → revise) | COMPLETE |
| Auto-Critique/Revision Cycle | COMPLETE |
| DPO Data Collection (`/novel feedback`) | COMPLETE |
| ML Training Pipeline | IN PROGRESS |

## ML Learning Path

| Module | Focus |
|--------|-------|
| 1. Baselines | API writer + evaluation |
| 2. Embeddings/RAG | Vector DBs, retrieval |
| 3. Fine-tuning | LoRA/QLoRA training |
| 4. RLHF/DPO | Preference learning |
| 5. Evaluation | Benchmarks, metrics |

## Hardware

- **Local**: RTX 4090 (24GB) - supports up to 32B models with QLoRA
- **Cloud**: EC2 instance at `50.18.245.194` for n8n workflows

## Documentation

- [Session Context](docs/SESSION-CONTEXT.md) - Current project state
- [Implementation Plan](.claude/plans/) - Detailed plan files

## Legacy

The `legacy/iluvatar-2.0/` folder contains the original ILUVATAR hackathon automation system with 26 LotR-themed AI agents. This code is preserved for reference and contains reusable modules (state management, AI adapter, etc.).

## License

MIT

---

*"In the beginning, Ilúvatar, the One, who in the Elvish tongue is named Eru, made the Ainur of his thought..."*
