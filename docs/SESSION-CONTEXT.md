# ILUVATAR - Novel Writer ML Project

> **Purpose**: Session continuity document. When context is lost, read this file first.
>
> **IMPORTANT FOR AI ASSISTANTS**: Always update this file after major progress.

---

## Project Overview

**ILUVATAR** is an automated novel creation pipeline that learns your writing style through ML fine-tuning. The project serves dual purposes:
1. **Build a personal novel writer** - Generate consistent, stylistically-controlled chapters
2. **Learn ML skills** - Fine-tuning, RLHF/DPO, RAG, and evaluation through hands-on practice

### Novel Concept
- **Genre**: Xianxia/Sci-Fi/Thriller fusion (修仙 + science fiction + suspense)
- **Structure**: Multi-POV web novels - same story from different character perspectives
- **Language**: Bilingual output (Chinese + English)

### Your Profile
- **ML Level**: Beginner (learning through pair programming)
- **Hardware**: RTX 4090 (24GB) via eGPU dock
- **Base Models**: Qwen2.5 (14B → 32B) for Chinese language strength

---

## Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Repository Setup | IN PROGRESS | Cleaning up, reorganizing |
| Phase A: Infrastructure | NOT STARTED | Discord + N8N |
| Phase B: Baseline Writer | NOT STARTED | 3-agent Claude pipeline |
| Phase C: Data Pipeline | NOT STARTED | Preference collection |
| Phase D: First Fine-tune | NOT STARTED | LoRA on Qwen2.5 |
| Phase E: RLHF Loop | NOT STARTED | DPO training |

---

## Repository Structure

```
e:\coding\iluvatar-2.0\           (ILUVATAR Novel Writer ML Project)
├── .claude/                       # Claude steering documents
│   ├── agents/                    # Custom agent definitions
│   ├── hooks/                     # Pre/post hooks
│   ├── prompts/                   # Reusable prompts
│   └── plans/                     # Planning documents
│
├── docs/                          # Human documentation
│   ├── learning/                  # ML learning materials
│   ├── findings/                  # Interesting behaviors observed
│   ├── results/                   # Experiment results
│   ├── data-samples/              # Example/dummy data
│   └── SESSION-CONTEXT.md         # This file
│
├── legacy/                        # OLD: Hackathon automation system
│   └── iluvatar-2.0/              # Preserved for reference
│
├── src/                           # ILUVATAR Novel Writer code
│   ├── core/                      # Copied/adapted from legacy
│   ├── orchestrator/              # Discord + N8N
│   ├── agent-prompts/             # 3 agent prompts
│   └── schemas/                   # Novel state schemas
│
├── ml/                            # ML Training Modules
│   ├── module-1-baselines/
│   ├── module-2-embeddings/
│   ├── module-3-finetuning/
│   ├── module-4-rlhf/
│   └── module-5-evaluation/
│
├── notebooks/                     # Jupyter learning notebooks
├── data/                          # Training data
└── models/                        # Trained model checkpoints
```

---

## Architecture

### Hybrid Agent System

```
Planning Agent: Claude Opus (complex reasoning, extended thinking)
                    ↓
Writing Agent:  YOUR FINE-TUNED MODEL (style-optimized, free)
                    ↓
Critic Agent:   Claude Opus (quality evaluation, training signal)
```

### ML Training Pipeline

1. **Critic generates preferences** → (original chapter, revised chapter) pairs
2. **Preferences train reward model** → Learns what "good writing" means
3. **DPO trains writer model** → Local model improves from Claude's feedback
4. **Iterate** → Model quality improves over time

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Project Name | ILUVATAR (inherited from legacy) |
| Orchestration | Discord + N8N |
| Output Language | Bilingual (Chinese + English) |
| Base Model | Qwen2.5 (14B → 32B) |
| Learning Style | Pair programming |
| API Model | Claude Opus for planning/critic |

---

## Timeline & Expectations

| Milestone | Timeline | Quality vs Opus |
|-----------|----------|-----------------|
| API baseline (Opus) | Week 2 | 100% (but expensive) |
| First fine-tuned model | Week 6 | 60-70% |
| After DPO training | Week 12 | 75-85% |
| After 6 months | 6 months | 85-95% in YOUR style |

---

## Research Potential

Novel contributions being explored:
1. **Multi-POV Factual Consistency** - Same event from different POVs must align factually
2. **Long-form Narrative Coherence** - Evaluating consistency across 100k+ word novels
3. **Bilingual Xianxia Concept Alignment** - 修仙 concepts that work in both languages

---

## Infrastructure

| Resource | Status | Details |
|----------|--------|---------|
| EC2 Instance | Available | `i-0ca37bb23f2e48567` at `50.18.245.194` |
| n8n | Available | http://50.18.245.194:5678 (admin/changeme123) |
| GitHub | Active | https://github.com/tyang4-ai/Iluvatar-2.0 |
| Local GPU | Available | RTX 4090 24GB via eGPU |

---

## Next Steps

1. Complete Phase 0: Push cleaned repo to GitHub
2. Begin Phase A: Copy core modules from legacy, set up Discord bot
3. Create the 3 agent prompts (planning, critic, writing)
4. Build first baseline writer using Claude Opus

---

## Files to Reference

**Reusable from legacy:**
- `legacy/iluvatar-2.0/core/state-manager.js` - Redis state management
- `legacy/iluvatar-2.0/core/message-bus.js` - Agent communication
- `legacy/iluvatar-2.0/core/json-validator.js` - JSON parsing
- `legacy/iluvatar-2.0/orchestrator/ai-adapter.js` - Multi-provider AI calls

**Full plan:**
- `.claude/plans/inherited-chasing-moon.md` - Complete implementation plan

---

## Resume Instructions

1. Read this SESSION-CONTEXT.md file
2. Check "Current Status" section above
3. Review the plan at `.claude/plans/inherited-chasing-moon.md`
4. Continue from where previous session ended
5. **Update this file** after making progress
