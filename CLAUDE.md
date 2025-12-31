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

## Resume Instructions

1. Read `docs/SESSION-CONTEXT.md`
2. Check current phase status
3. Continue with PAIR PROGRAMMING approach
4. Update SESSION-CONTEXT.md after progress
