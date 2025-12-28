# ILUVATAR - Novel Writer ML Project

> *Named after Tolkien's creator god* - An automated novel creation pipeline that learns your writing style through ML fine-tuning.

## Overview

ILUVATAR is both a **working novel writing system** and a **learning project** for ML skills:

- **Fine-tuning LLMs** (LoRA/QLoRA on Qwen2.5)
- **RLHF/DPO** (preference learning from critic feedback)
- **RAG & Embeddings** (long-context novel management)
- **Evaluation** (custom benchmarks for writing quality)

### The Novel

A multi-POV xianxia/sci-fi/thriller fusion:
- 武侠/修仙 (Wuxia/Xianxia) - Chinese fantasy with cultivation
- Science Fiction - Technology, futuristic elements
- Thriller - Suspense, plot twists, pacing

Multiple short web novels telling the same story from different character perspectives, eventually unified into one complete narrative.

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

## ML Learning Path

| Module | Focus | Timeline |
|--------|-------|----------|
| 1. Baselines | API writer + evaluation | Weeks 1-2 |
| 2. Embeddings/RAG | Vector DBs, retrieval | Weeks 3-4 |
| 3. Fine-tuning | LoRA/QLoRA training | Weeks 5-8 |
| 4. RLHF/DPO | Preference learning | Weeks 9-12 |
| 5. Evaluation | Benchmarks, metrics | Ongoing |

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
