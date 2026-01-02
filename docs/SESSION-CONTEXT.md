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
| Phase 0: Repository Setup | COMPLETED | Cleaned up, reorganized, pushed to GitHub |
| Phase A: Infrastructure | COMPLETED | Core modules, Discord bot, N8N workflow, agent prompts |
| Phase B: Integration Testing | IN PROGRESS | Channel-aware bot, Story Bible, Discord callbacks |
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

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Project Name | ILUVATAR (inherited from legacy) | |
| Orchestration | Discord + N8N | |
| Output Language | Bilingual (Chinese + English) | |
| Base Model | Qwen2.5 (14B → 32B) | Strong Chinese language support |
| Learning Style | Pair programming | |
| API Model | Claude Opus for planning/critic | |
| Agent Output Format | Plain text with markers (not JSON) | LLMs unreliable at JSON; text with `## SECTION` markers is easier to parse and less error-prone |
| State Scope | Hybrid: global + per-novel | Global for style guides, per-novel for chapter data; prevents conflicts |
| Agent Names | Gandalf (planning), Frodo (writing), Elrond (critic) | LOTR-inspired |

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

1. ✅ Phase 0 Complete: Repository cleaned and pushed to GitHub
2. ✅ **Phase A Complete**: Infrastructure setup
   - ✅ A.1: state-manager.js with scoped state (global + per-novel)
   - ✅ A.2: message-bus.js (skipped json-validator - using text markers)
   - ✅ A.3: model-config.js (Gandalf, Frodo, Elrond tiers)
   - ✅ A.4: novel-manager.js (novel lifecycle, configurable thresholds)
   - ✅ A.5: s3-storage.js (backup/restore/training data)
   - ✅ A.6: discord-bot.js (6 slash commands)
   - ✅ A.7: Agent prompts (gandalf-planning.md, frodo-writing.md, elrond-critic.md)
   - ✅ A.8: N8N workflow setup docs + export JSON
3. **Phase B (In Progress)**: Integration testing + channel-aware system
   - ✅ B.1: Channel-aware Discord bot (auto-creates novel channels)
   - ✅ B.2: Story Bible system (characters, relationships, plot threads, Chekhov's guns)
   - ✅ B.3: bible-retriever.js (hybrid semantic search with OpenAI embeddings)
   - ✅ B.4: Recall/cascade functionality (revise earlier chapters)
   - ✅ B.5: N8N callback guide (Discord channel posting)
   - ✅ B.6: Updated agent prompts for Story Bible I/O
   - ✅ B.6b: Bible context wired into webhook payloads (handleWrite, handleFeedback, handleCritique)
   - ✅ B.7: Deploy and test on EC2 (bot running via pm2, bible retriever enabled)
   - ✅ B.8: Manual N8N workflow updates (all 5 Discord callback paths configured)
   - ✅ B.9a: Library channel auto-creation on bot startup
   - ✅ B.9b: Channel-based command gating (library vs novel channels)
   - ✅ B.9c: `/novel delete` command for library channel
   - ⏳ B.10: Full end-to-end test (redeploy bot, test complete workflow)
4. Phase C: Data pipeline for preference collection

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

## Concepts Already Explained

Track concepts explained during pair programming sessions to avoid repetition.

| Concept | Explanation |
|---------|-------------|
| **API (Application Programming Interface)** | The "contract" or "menu" that defines what methods/functions are available to call. Like a restaurant menu - lists what you can order (methods) and what you get back (return values). |
| **StateManager** | A class that wraps Redis operations with optimistic locking rules. Instead of calling Redis directly, agents call StateManager methods which handle version checking and conflict resolution. |
| **Scope** | "Which bucket of data" - either `"global"` for shared config (style guides, training settings) or `"novel:{id}"` for per-novel isolated state. Prevents conflicts between novels. |
| **Optimistic Locking** | WATCH/MULTI/EXEC pattern: read data + version, do work, attempt write with expected version. If version changed (another agent wrote), transaction fails and must retry. |
| **Redis Data Structures** | Hash (`hset`/`hget`) for key-value pairs, Sorted Sets (`zadd`/`zrevrange`) for ordered data with scores, String keys for version numbers. |
| **Exponential Backoff** | Retry delays that double each attempt (100ms → 200ms → 400ms). Prevents thundering herd problem when multiple agents retry simultaneously. |
| **Message Bus (Pub/Sub)** | Like a radio station: publishers broadcast on channels, subscribers listen. Agents communicate through the bus without knowing each other directly. Includes inbox backup for reliability when agents are offline. |
| **Temperature (LLM)** | Controls probability distribution for next-token selection. 0 = always pick highest probability (deterministic). 1 = sample according to actual probabilities (creative). Higher = flatter distribution, more randomness. |
| **Story Bible** | A structured database of narrative elements (characters, relationships, plot threads, world facts, timeline, Chekhov's guns) that must stay consistent across chapters. Agents read from and write to the bible. |
| **Embeddings** | Vector representations of text that capture semantic meaning. Similar concepts have similar vectors. Used for semantic search in the Story Bible - find relevant entries by comparing vector similarity instead of keyword matching. |
| **Cosine Similarity** | A measure of how similar two vectors are (0 = unrelated, 1 = identical direction). For normalized embeddings, it's just the dot product. Used to find which bible entries are relevant to a given chapter. |
| **Chekhov's Gun** | Narrative principle: if you introduce something (a gun on the wall in Act 1), it must be used later (fired in Act 3). We track these to ensure planted elements pay off. |
| **Cascade Regeneration** | When you revise an earlier chapter, later chapters may need to be regenerated to maintain consistency. Optional - user can skip if changes don't affect continuity. |

---

## Resume Instructions

1. Read this SESSION-CONTEXT.md file
2. Check "Current Status" section above
3. Review the plan at `.claude/plans/inherited-chasing-moon.md`
4. Continue from where previous session ended
5. **Update this file** after making progress
