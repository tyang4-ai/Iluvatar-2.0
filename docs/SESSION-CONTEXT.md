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
| Phase B: Integration Testing | COMPLETED | Channel-aware bot, Story Bible, Discord callbacks, N8N fixes |
| Phase B2: Discord Bot Overhaul | COMPLETED | 25 slash commands, bug fixes, ML data collection prep |
| Phase C: Data Pipeline | IN PROGRESS | Foundation laid - DPO storage, training export ready |
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
3. **Phase B (COMPLETED)**: Integration testing + channel-aware system
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
   - ✅ B.10: N8N prompt builders fixed (novelId/callback preserved through Load nodes)
   - ✅ B.11: Language enforcement (Chinese novels generate Chinese content)
   - ✅ B.12: Chapter generation verified (saves to correct Redis keys)
4. ✅ **Phase B2 Complete**: Discord Bot Overhaul (25 slash commands)
   - ✅ B2.1: Critical bug fixes (revise action type, bibleContext for outline revision)
   - ✅ B2.2: Quality fixes (bibleContext for plan_book)
   - ✅ B2.3: Enhanced `/novel create` (13 genres, pov, tone, style_reference, auto_critique)
   - ✅ B2.4: QoL commands (/novel next, help, settings, preview, improved status)
   - ✅ B2.5: Export functionality (/novel export markdown/txt)
   - ✅ B2.6: ML data collection prep (DPO pair storage, training export formats)
   - See full plan: `.claude/plans/federated-questing-lollipop.md`
5. **Phase C (IN PROGRESS)**: Data pipeline for preference collection
   - ✅ C.1: DPO pair storage infrastructure (storeRevisionPair in NovelManager)
   - ✅ C.2: Training export formats (/novel export format:dpo|sft|reward)
   - C.3: Collect human preference signals via Discord reactions (deferred)
   - C.4: Store training data in S3 (next step)
   - C.5: End-to-end test: generate novel → collect preferences → export training data

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
| **Dual-Key Fallback** | StateManager now checks both Redis hash fields (`HGET novel:xyz:data outline`) AND simple string keys (`GET novel:xyz:outline`). This bridges N8N (which only supports SET/GET) with the bot's hash-based storage. For chapters/critiques, it aggregates individual keys (novel:xyz:chapter:1, :2, :3) into the expected object format. |
| **N8N Data Flow Issue** | When N8N workflow passes through a "Load" node (Load Outline, Load Chapter), the original webhook data (novelId, metadata, callback) is lost. Solution: Use `$('Webhook').first().json.body` to get original data, not `$input.first().json`. |
| **DPO (Direct Preference Optimization)** | Training method that learns from (chosen, rejected) pairs. When user revises a chapter, we save original → rejected, revised → chosen. The model learns to prefer the revised version. No separate reward model needed. |
| **SFT (Supervised Fine-Tuning)** | Basic fine-tuning on (instruction, output) pairs. We export chapters with their prompts as SFT training data. First step before DPO. |

---

## Discord Bot Commands (25 total)

All commands are under `/novel`. Use in either **Library** channel (novel management) or **Novel** channel (writing operations).

### Novel Management (Library Channel)
| Command | Description |
|---------|-------------|
| `/novel create` | Create new novel with genre, premise, language, pov, tone, style |
| `/novel list` | List all novels in the system |
| `/novel delete` | Delete a novel and its channel |
| `/novel help` | Show all commands with descriptions |

### Novel Information (Any Channel)
| Command | Description |
|---------|-------------|
| `/novel status` | Check novel status with progress bar and stats |
| `/novel bible` | View story bible (characters, plot threads, etc.) |
| `/novel next` | Get guided next action based on current state |
| `/novel preview` | Preview upcoming chapter from outline |
| `/novel settings` | View or update novel settings |

### Reading Content (Any Channel)
| Command | Description |
|---------|-------------|
| `/novel read_chapter` | Read a specific chapter |
| `/novel read_outline` | Read the full outline |
| `/novel read_section` | Read a range of chapters |
| `/novel read_all` | Read entire novel (max 20 chapters) |

### Writing Operations (Novel Channel)
| Command | Description |
|---------|-------------|
| `/novel write` | Generate outline or write next chapter |
| `/novel approve` | Approve outline or chapter |
| `/novel feedback` | Submit revision feedback |
| `/novel critique` | Request Elrond evaluation |
| `/novel plan_chapter` | Plan detailed chapter(s) |
| `/novel plan_book` | Re-plan entire book |
| `/novel recall` | Start revision of earlier content |
| `/novel cascade` | Regenerate chapters after revision |
| `/novel skip_cascade` | Keep later chapters as-is |

### Control & Export (Novel Channel)
| Command | Description |
|---------|-------------|
| `/novel pause` | Pause novel generation |
| `/novel resume` | Resume paused novel |
| `/novel export` | Export novel (markdown/txt) or training data (dpo/sft/reward) |

---

## N8N Workflow Configuration

The N8N workflow ("Iluvatar 2.0") has been configured and is running at http://50.18.245.194:5678.

### Critical N8N Fix Applied (Jan 2026)

**Problem**: Chapters were saving to `novel:undefined:chapter:1` and Discord notifications had empty channelId.

**Root Cause**: Prompt builder nodes used `$input.first().json` to get novelId, but after passing through "Load Outline" or "Load Chapter" Redis nodes, only the loaded data remained.

**Fix**: Updated all 4 prompt builder nodes to reference `$('Webhook').first().json.body` directly:
- Build Frodo Prompt (write action)
- Build Elrond Prompt (critique action)
- Build Gandalf Prompt (revise) (revise_outline action)
- Build Frodo Prompt (revise) (revise_chapter action)

**Pattern**:
```javascript
// CORRECT - get from Webhook node directly
const webhookData = $('Webhook').first().json.body;
const novelId = webhookData.novelId;
const callback = webhookData.callback || {};

// Get loaded data from $input
const loadedOutline = $input.first().json.outline;
```

### N8N Process Management

N8N runs outside PM2 (orphan process started by start-n8n.sh). To manage:
```bash
# Find N8N process
pgrep -af n8n

# Kill if needed
kill <pid>

# Start N8N with prompts
~/start-n8n.sh
```

The `start-n8n.sh` script loads:
- Agent prompts from `~/iluvatar-2.0/src/agent-prompts/`
- API keys from `~/.n8n/.env`

---

## Bug Fixed: /novel read_outline "Internal Server Error" (Jan 2026)

**Status**: RESOLVED

**Root Cause**: Discord API returns HTTP 500 when embed descriptions contain Chinese text chunks larger than ~3000 characters, even though the documented limit is 4096. This appears to be an undocumented behavior related to UTF-8 encoding of Chinese characters.

**Fix Applied**:
1. Created new `sendContentAsFollowUps()` method that uses smaller 2000-char chunks
2. First chunk sent via `editReply()`, subsequent chunks via `followUp()` (separate messages)
3. Updated `handleReadOutline()` to use the new method

**Key Learning**: For Chinese/CJK text in Discord embeds, use 2000-char chunks instead of 4000 to avoid Discord's undocumented size limits.

**Files Modified**:
- `src/orchestrator/discord-bot.js` - Added `sendContentAsFollowUps()` method, updated `handleReadOutline()`

---

## Feature Added: Critique-Based Revision Flow (Jan 2026)

**Status**: WORKING

The `/novel feedback` command now supports automatic loading of Elrond's stored critique.

**Changes**:
1. Added `use_critique` option (defaults to `true`) - loads Elrond's stored critique as revision instructions
2. Added `chapter` option - specify which chapter to revise (defaults to latest written chapter)
3. Auto-detects latest written chapter from `state.chapters` instead of relying on `metadata.currentChapter`

**Flow**:
1. `/novel write` → Frodo writes chapter → saves to `novel:xyz:chapter:1`
2. `/novel critique` → Elrond reads chapter, generates critique → saves to `novel:xyz:critique:1`
3. `/novel feedback` (with `use_critique:true`) → Loads stored critique → Triggers Frodo revision
4. Frodo revises → **overwrites** `novel:xyz:chapter:1` with revised version
5. `/novel critique` → Reads revised version (same key, updated content)

**N8N Fix Required**: Updated "Build Frodo Prompt (revise)" node to use correct node references:
- `$('Load Current Chapter').first().json` (not "Load Novel Data")
- `$('Load Outline for Context').first().json` (not assumed names)

**Files Modified**:
- `src/orchestrator/discord-bot.js` - Added `chapter` and `use_critique` options to feedback command

---

## Bug Fixed: /novel approve and /novel next Not Detecting Chapters (Jan 2026)

**Status**: RESOLVED

**Root Cause**: N8N saves chapters directly to Redis keys (`novel:xyz:chapter:1`) but doesn't update the bot's metadata hash (`metadata.currentChapter`). The `handleApprove` and `handleNext` commands relied on `metadata.currentChapter`, which remained 0 even after chapters were written.

**Fix Applied**:
1. **`handleApprove`** and **`handleNext`** now derive chapter count from actual `state.chapters` keys instead of `metadata.currentChapter`
2. Added `syncChapterMetadata()` method to `NovelManager` for N8N to call after saving chapters
3. Added HTTP callback server on port 3001 with `/sync-chapter` endpoint

**Code Pattern Used**:
```javascript
// Get actual chapter count from state.chapters (N8N saves directly, metadata may be stale)
const writtenChapters = Object.keys(state.chapters || {}).map(Number).filter(n => !isNaN(n));
const latestChapter = writtenChapters.length > 0 ? Math.max(...writtenChapters) : 0;
```

**N8N Integration (Optional but Recommended)**:
Add HTTP Request node after both `Save Chapter to Redis` and `Save Chapter to Redis (revise)`:
- **Method**: POST
- **URL**: `http://localhost:3001/sync-chapter`
- **Body**: `{"novelId": "{{ $('Webhook').first().json.body.novelId }}", "chapterNum": {{ $('Webhook').first().json.body.chapterNum }}}`

**Files Modified**:
- `src/orchestrator/discord-bot.js` - Fixed `handleApprove`, `handleNext`, added callback server
- `src/core/novel-manager.js` - Added `syncChapterMetadata()` method

---

## ⚠️ STABLE COMPONENTS - DO NOT MODIFY WITHOUT REASON

The following components are **working correctly** and should NOT be modified unless there's a specific bug to fix:

| Component | File | Status |
|-----------|------|--------|
| Discord bot core | `src/orchestrator/discord-bot.js` | ✅ Stable - 25 commands working |
| State manager | `src/core/state-manager.js` | ✅ Stable - dual-key fallback, Claude text extraction |
| Novel manager | `src/core/novel-manager.js` | ✅ Stable - lifecycle, bible parsing |
| Bible retriever | `src/core/bible-retriever.js` | ✅ Stable - semantic search |
| Agent prompts | `src/agent-prompts/*.md` | ✅ Stable - Gandalf, Frodo, Elrond |
| N8N workflow | http://50.18.245.194:5678 | ⚠️ Partially stable - needs Fix 4 for bible updates |

**Before modifying any stable component:**
1. Understand WHY it was built the way it was
2. Test the existing behavior first
3. Make minimal changes to fix the specific issue
4. Don't refactor or "improve" working code

---

## Story Bible Status (Jan 2026)

| Feature | Status | Notes |
|---------|--------|-------|
| Gandalf outputs `## STORY BIBLE` | ✅ Working | In prompt |
| Frodo outputs `## BIBLE UPDATES` | ✅ Working | In prompt |
| Parse Story Bible from outline | ✅ Working | `/novel bible section:📥 Import from Outline` |
| N8N auto-parse from Gandalf | ❌ Not implemented | Apply Fix 4a-4b in N8N |
| N8N parse Frodo's BIBLE UPDATES | ❌ Not implemented | Apply Fix 4c-4f in N8N |

**Current workaround**: After outline is generated, manually run `/novel bible section:📥 Import from Outline` to populate the Story Bible.

---
## N8N Workflow Restructure (Jan 2026)

**Problem**: `plan_chapter` action was overwriting the novel outline because both `outline` and `plan_chapter` flows went through the same Gandalf → Parse Bible → Save outline chain.

**Fix Applied**:
1. Added **Route Gandalf Output** Switch node after Gandalf
2. Routes `outline` action → Parse Bible → Save Story Bible → Save outline
3. Routes `plan_chapter` action → Save Chapter Plan (skips outline save)

**Additional Changes**:
- Added `getPreviousChapterPlans()` method to StateManager
- Discord bot fetches previous chapter plans and sends to N8N as `previousPlansContext`
- Updated Build Gandalf Plan Prompt node to include previous plans in prompt

**Completed (Jan 8, 2026)**:
- ✅ Discord bot now REQUIRES chapter plan before `/novel write`
- ✅ `handleWrite()` checks for `chapterPlan_{chapterNum}` in Redis
- ✅ Shows friendly error with `/novel plan_chapter` suggestion if missing

**N8N Work Completed (Jan 8, 2026)**:
- ✅ Added `Load Chapter Plan` Redis node (Hash Get from `novel:{novelId}:data`)
- ✅ Wired: `Load Outline` → `Load Chapter Plan` → `Build Frodo Prompt`
- ✅ Updated `Build Frodo Prompt` to extract `chapterPlan_{chapterNum}` and include in prompt

**Ready for Testing**:
- `/novel plan_chapter chapter:N` → Gandalf creates detailed plan → saves to Redis
- `/novel write` → Checks plan exists → Frodo writes using the plan

---

## Bug Fixes Applied (Jan 8, 2026)

### 1. Discord Bot Errors Fixed

**getPreviousChapterPlans undefined error**:
- Code was calling `this.stateManager.getPreviousChapterPlans()` but `this.stateManager` didn't exist
- Fixed to use `this.novelManager.state.get()` with proper string key fallback
- File: `src/orchestrator/discord-bot.js`

**syncChapterMetadata is not a function error**:
- EC2 had outdated `novel-manager.js` missing the `syncChapterMetadata()` method
- Deployed updated file with all methods
- File: `src/core/novel-manager.js`

### 2. /novel feedback Not Finding Chapters

**Problem**: "Chapter 4 hasn't been written yet" even though chapter was saved.

**Root Causes**:
1. Chapter keys are strings (`'4'`) but `targetChapter` was a number (`4`)
2. Chapters stored in Claude API format `{data: [{type: "text", text: "..."}]}` but code looked for `{content: "..."}` or `{text: "..."}`

**Fix**: Convert chapter number to string and extract text from Claude API response format.
- File: `src/orchestrator/discord-bot.js`

### 3. N8N Sync Chapter Metadata URL

**Problem**: N8N "Sync Chapter Metadata" node used `http://localhost:3001/sync-chapter` but N8N runs in Docker container where localhost doesn't reach the host.

**Fix**: Changed URL to `http://172.17.0.1:3001/sync-chapter` (Docker bridge gateway).
- Node: "Sync Chapter Metadata" (both instances)

### 4. Story Bible Updates Not Saving (Frodo → Bible)

**Problem**: Frodo outputs `## BIBLE UPDATES` section but updates weren't being applied.

**Root Cause**: Gandalf saves `characters` as an array, but `Merge Bible Data` node expected an object indexed by ID. Array lookup `characters["char-001"]` returns undefined.

**Fix**: Updated "Merge Bible Data" node to:
1. Convert array to object if needed (backwards compatibility)
2. Find characters by name if ID lookup fails
- Node: "Merge Bible Data" in N8N

---

## Resume Instructions

1. Read this SESSION-CONTEXT.md file
2. Check "Current Status" section above
3. Review the plan at `.claude/plans/inherited-chasing-moon.md`
4. Continue from where previous session ended
5. **Update this file** after making progress
