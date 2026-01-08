# ILUVATAR N8N Workflow Setup

## Overview

The N8N workflow orchestrates the three agents (Gandalf, Frodo, Elrond) in response to Discord bot triggers.

**Workflow URL**: http://50.18.245.194:5678

---

## 🚨 URGENT FIXES NEEDED (Jan 2026)

Apply these fixes in order. Open N8N at http://50.18.245.194:5678 and edit the "ILUVATAR 2.0" workflow.

**Quick Reference:**
- Fix 1: Post Chunk JSON escaping (Chinese text breaking)
- Fix 2: Build Elrond Prompt Claude text extraction
- Fix 3: Add plan_chapter route
- Fix 4: Story Bible population
- Fix 5: Discord thread visibility (threads not showing as attached)
- Fix 6: Auto-Critique Flow (auto-run Elrond after chapter writes)
- Fix 7: Style Fields Missing (POV, Tone, Style Reference not passed to agents)
- **Fix 8: Two-Stage Planning** ← NEW (High-level outline + detailed chapter planning)

### Fix 1: Post Chunk to Thread - JSON Escaping

**Problem**: Chinese text with special characters breaks JSON parsing.
**Error**: `"JSON parameter needs to be valid JSON"` at Post Chunk to Thread node.

**Node**: "Post Chunk to Thread" (HTTP Request)

**Current (broken)**:
```
={
  "content": "**Part {{ $json.partNumber }}/{{ $json.totalParts }}**\n\n{{ $json.content }}"
}
```

**Fixed**:
```
={{ JSON.stringify({ content: "Part " + $json.partNumber + "/" + $json.totalParts + ":\n\n" + $json.content }) }}
```

---

### Fix 2: Build Elrond Prompt - Extract Claude Text

**Problem**: Chapter shows as `[object Object]` instead of actual text in critique.
**Cause**: Claude's response format `{ data: [{ type: "text", text: "..." }] }` not parsed.

**Node**: "Build Elrond Prompt" (Code)

**Replace entire code with**:
```javascript
// Build Elrond prompt for critique with STRONG language enforcement
// IMPORTANT: Get data from Webhook node, not $input (which only has chapter after Load Chapter)
const webhookData = $('Webhook').first().json.body;
const loadedChapter = $input.first().json.chapter;

const metadata = webhookData.metadata || {};
const novelId = webhookData.novelId;
const chapterNum = webhookData.chapterNum || 1;
const bibleContext = webhookData.bibleContext || '';
const callback = webhookData.callback || {};

// Parse chapter if it's a string
let chapter = loadedChapter;
if (typeof chapter === 'string') {
  try { chapter = JSON.parse(chapter); } catch(e) { /* keep as string */ }
}

// Extract text content from Claude's raw response format
// Claude returns: { data: [{ type: "thinking", ... }, { type: "text", text: "..." }] }
let chapterContent = '';
let chapterTitle = chapter?.title || 'Untitled';
let wordCount = chapter?.wordCount || 'Unknown';

if (chapter?.content) {
  // Already has content field
  chapterContent = chapter.content;
} else if (chapter?.data && Array.isArray(chapter.data)) {
  // Claude API response format
  const textItem = chapter.data.find(item => item.type === 'text');
  if (textItem && textItem.text) {
    chapterContent = textItem.text;
    wordCount = textItem.text.length;
    // Try to extract title from text
    const titleMatch = chapterContent.match(/^#\s*(.+)$/m);
    if (titleMatch) {
      chapterTitle = titleMatch[1].trim();
    }
  }
} else if (chapter?.raw) {
  chapterContent = chapter.raw;
} else if (typeof chapter === 'string') {
  chapterContent = chapter;
} else {
  chapterContent = JSON.stringify(chapter);
}

// CRITICAL: Language enforcement instruction for critique
const languageInstruction = metadata.language === 'zh'
  ? `\n\n**关键要求 - 语言**: 这是一部中文小说。你的评价也必须使用中文撰写：
- 分数说明用中文
- 优点和缺点分析用中文
- 修改建议用中文
- 所有反馈必须是中文。`
  : `\n\n**LANGUAGE REQUIREMENT**: This is an English novel. Write your critique in English.`;

const prompt = `Evaluate this chapter:

Chapter ${chapterNum}: ${chapterTitle}

${chapterContent}

Word count: ${wordCount}
Novel language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
${languageInstruction}

${bibleContext ? `\n## STORY BIBLE CONTEXT\n${bibleContext}` : ''}

Please provide your critique following the format specified in your instructions.`;

return { json: { prompt, metadata, chapterNum, novelId, callback, chapter } };
```

---

### Fix 3: Add plan_chapter Route

**Purpose**: Enable `/novel plan_chapter` command to create detailed chapter plans.

#### Step 3a: Update Route Action Switch

1. Open "Route Action" node (Switch)
2. Add new rule:
   - Condition: `{{ $json.body.action }}` equals `plan_chapter`
   - Output Key: `plan_chapter`

#### Step 3b: Add Load Outline (plan) Node

1. Add new node: **Redis** (after Route Action → plan_chapter)
2. Name: "Load Outline (plan)"
3. Settings:
   - Operation: Get
   - Key: `novel:{{ $('Webhook').first().json.body.novelId }}:data`
   - Property Name: outline
   - Key Type: Hash
   - Field: outline

#### Step 3c: Add Build Gandalf Plan Prompt Node

1. Add new node: **Code** (after Load Outline (plan))
2. Name: "Build Gandalf Plan Prompt"
3. Code:

```javascript
// Build Gandalf prompt for detailed chapter planning
const webhookData = $('Webhook').first().json.body;
const loadedOutline = $input.first().json.outline;

const metadata = webhookData.metadata || {};
const novelId = webhookData.novelId;
const chapterNum = webhookData.chapterNum || 1;
const chapterCount = webhookData.chapterCount || 1;
const bibleContext = webhookData.bibleContext || '';
const callback = webhookData.callback || {};

// Parse outline if it's a string
let outline = loadedOutline;
if (typeof outline === 'string') {
  try { outline = JSON.parse(outline); } catch(e) { /* keep as string */ }
}

// Extract outline text - handle Claude response format
let outlineText = '';
if (outline?.raw) {
  outlineText = outline.raw;
} else if (outline?.data && Array.isArray(outline.data)) {
  const textItem = outline.data.find(item => item.type === 'text');
  if (textItem && textItem.text) {
    outlineText = textItem.text;
  }
} else if (typeof outline === 'string') {
  outlineText = outline;
} else {
  outlineText = JSON.stringify(outline);
}

const endChapter = chapterNum + chapterCount - 1;
const chapterRange = chapterCount > 1 ? `chapters ${chapterNum}-${endChapter}` : `chapter ${chapterNum}`;

// CRITICAL: Language enforcement
const languageInstruction = metadata.language === 'zh'
  ? `\n\n**关键要求 - 语言**: 你必须使用中文（简体中文）撰写所有章节计划！`
  : `\n\n**LANGUAGE REQUIREMENT**: Write all chapter plans in English.`;

const prompt = `Create a detailed chapter plan for ${chapterRange} of "${metadata.title}".

## Current Outline
${outlineText}

## Task
For each chapter in the range ${chapterNum} to ${endChapter}, create a detailed plan including:

1. **Scene Breakdown**: List each scene with location, characters present, and purpose
2. **Key Beats**: The major story beats and emotional moments
3. **Character Development**: What each character learns or how they change
4. **Dialogue Notes**: Key conversations or lines to include
5. **Foreshadowing**: Elements to plant for future chapters
6. **Connection Points**: How this chapter connects to previous/next chapters
${languageInstruction}

${bibleContext ? `\n## STORY BIBLE CONTEXT\n${bibleContext}` : ''}

Please provide detailed plans for each chapter.`;

return { json: { prompt, metadata, chapterNum, chapterCount, novelId, callback } };
```

#### Step 3d: Connect to Gandalf Node

You can either:
- **Option A**: Reuse existing "Gandalf" node (connect Build Gandalf Plan Prompt → Gandalf)
- **Option B**: Create new "Gandalf (Plan)" node (duplicate of Gandalf) for isolation

I recommend **Option A** since both tasks (outline creation and chapter planning) are similar Gandalf tasks.

#### Step 3e: Save Chapter Plan to Redis

1. Add node: **Redis** (after Gandalf)
2. Name: "Save Chapter Plan"
3. Settings:
   - Operation: Set
   - Key: `novel:{{ $('Webhook').first().json.body.novelId }}:data`
   - Key Type: Hash
   - Field: `chapterPlan_{{ $('Webhook').first().json.body.chapterNum }}`
   - Value: `{{ JSON.stringify($json) }}`

#### Step 3f: Update Format Discord Message

Add this case to the switch statement in "Format Discord Message" code node:

```javascript
case 'plan_chapter':
  const planChapter = webhookData.chapterNum || 1;
  const planCount = webhookData.chapterCount || 1;
  const planEnd = planChapter + planCount - 1;
  const planRange = planCount > 1 ? `Chapters ${planChapter}-${planEnd}` : `Chapter ${planChapter}`;

  const gandalfPlanOutput = $('Gandalf').first()?.json?.text ||
                            $('Gandalf').first()?.json?.content?.[0]?.text || '';
  fullContent = gandalfPlanOutput;
  title = `📋 ${planRange} Planning Complete`;
  description = `Gandalf has created detailed plans for ${planRange.toLowerCase()}.`;
  color = 0x3498db; // Blue
  break;
```

#### Step 3g: Connect Nodes

```
Route Action (plan_chapter output)
    ↓
Load Outline (plan)
    ↓
Build Gandalf Plan Prompt
    ↓
Gandalf (reuse existing)
    ↓
Save Chapter Plan
    ↓
Format Discord Message (shared)
    ↓
Post to Discord Channel (shared)
    ↓
... (rest of Discord posting chain)
```

---

### Fix 4: Story Bible Population

The Story Bible is currently empty because N8N doesn't parse the bible sections from agent output. The agent prompts already output structured data:

- **Gandalf** outputs `## STORY BIBLE` section after outline
- **Frodo** outputs `## BIBLE UPDATES` section after each chapter

We need to parse these sections and save to Redis.

---

#### Step 4a: Create "Parse Bible from Gandalf" Code Node

1. Add node: **Code** (after Gandalf, before Save outline to Redis)
2. Name: "Parse Bible from Gandalf"
3. Mode: Run Once for All Items
4. Language: JavaScript
5. Code:

```javascript
// Parse Story Bible from Gandalf's outline output
// Gandalf outputs a ## STORY BIBLE section with structured data

const webhookData = $('Webhook').first().json.body;
const novelId = webhookData.novelId;

// Get Gandalf's output
const gandalfOutput = $('Gandalf').first()?.json;
let outputText = '';

// Extract text from Claude response format
if (gandalfOutput?.text) {
  outputText = gandalfOutput.text;
} else if (gandalfOutput?.content?.[0]?.text) {
  outputText = gandalfOutput.content[0].text;
} else if (gandalfOutput?.data && Array.isArray(gandalfOutput.data)) {
  const textItem = gandalfOutput.data.find(item => item.type === 'text');
  if (textItem?.text) outputText = textItem.text;
}

// Parse the STORY BIBLE section
const storyBible = {
  characters: {},
  relationships: [],
  plotThreads: [],
  worldFacts: [],
  chekhovs: [],
  timeline: []
};

// Find STORY BIBLE section
const bibleMatch = outputText.match(/##\s*STORY BIBLE[\s\S]*?(?=##\s*[A-Z]|$)/i);
if (!bibleMatch) {
  // No bible section found, pass through with empty updates
  return [{ json: { novelId, storyBible: null, rawOutput: gandalfOutput } }];
}

const bibleSection = bibleMatch[0];

// Parse CHARACTERS section
const charSection = bibleSection.match(/###\s*CHARACTERS[\s\S]*?(?=###|$)/i);
if (charSection) {
  // Parse character blocks
  const charBlocks = charSection[0].matchAll(/- ID:\s*(\S+)[\s\S]*?(?=- ID:|###|$)/gi);
  for (const block of charBlocks) {
    const text = block[0];
    const id = block[1];

    const nameMatch = text.match(/- Name:\s*(.+)/i);
    const aliasMatch = text.match(/- Aliases?:\s*(.+)/i);
    const descMatch = text.match(/- Description:\s*(.+)/i);
    const traitsMatch = text.match(/- Traits?:\s*(.+)/i);
    const firstMatch = text.match(/- First Appearance:\s*(?:Chapter\s*)?(\d+)/i);
    const statusMatch = text.match(/- Status:\s*(\w+)/i);

    storyBible.characters[id] = {
      id,
      name: nameMatch ? nameMatch[1].trim() : id,
      aliases: aliasMatch ? aliasMatch[1].split(',').map(a => a.trim()) : [],
      description: descMatch ? descMatch[1].trim() : '',
      traits: traitsMatch ? traitsMatch[1].split(',').map(t => t.trim()) : [],
      firstAppearance: firstMatch ? parseInt(firstMatch[1]) : 1,
      status: statusMatch ? statusMatch[1].trim().toLowerCase() : 'alive'
    };
  }
}

// Parse PLOT THREADS section
const threadSection = bibleSection.match(/###\s*PLOT THREADS[\s\S]*?(?=###|$)/i);
if (threadSection) {
  const threadBlocks = threadSection[0].matchAll(/- ID:\s*(\S+)[\s\S]*?(?=- ID:|###|$)/gi);
  for (const block of threadBlocks) {
    const text = block[0];
    const id = block[1];

    const titleMatch = text.match(/- Title:\s*(.+)/i);
    const introMatch = text.match(/- Introduced:\s*(?:Chapter\s*)?(\d+)/i);

    // Parse foreshadowing hints
    const foreshadowing = [];
    const hintMatches = text.matchAll(/- Chapter (\d+):\s*[""](.+?)[""]/gi);
    for (const hint of hintMatches) {
      foreshadowing.push({ chapter: parseInt(hint[1]), hint: hint[2] });
    }

    storyBible.plotThreads.push({
      id,
      title: titleMatch ? titleMatch[1].trim() : id,
      introduced: introMatch ? parseInt(introMatch[1]) : 1,
      foreshadowing,
      resolved: false
    });
  }
}

// Parse WORLD FACTS section
const factsSection = bibleSection.match(/###\s*WORLD FACTS[\s\S]*?(?=###|$)/i);
if (factsSection) {
  const factLines = factsSection[0].matchAll(/- \[?([^\]]+)\]?:\s*(.+)/gi);
  for (const line of factLines) {
    storyBible.worldFacts.push({
      category: line[1].trim(),
      fact: line[2].trim()
    });
  }
}

// Parse CHEKHOVS section
const chekhSection = bibleSection.match(/###\s*CHEKHOVS[\s\S]*?(?=###|$)/i);
if (chekhSection) {
  const chekhLines = chekhSection[0].matchAll(/- Item:\s*(.+?)(?:\n|$)[\s\S]*?- Introduced:\s*(?:Chapter\s*)?(\d+)[\s\S]*?(?:- Notes?:\s*(.+?))?(?=- Item:|###|$)/gi);
  for (const line of chekhLines) {
    storyBible.chekhovs.push({
      item: line[1].trim(),
      introduced: parseInt(line[2]),
      notes: line[3]?.trim() || '',
      payoff: null
    });
  }
}

console.log(`[Parse Bible] Parsed from Gandalf: ${Object.keys(storyBible.characters).length} chars, ${storyBible.plotThreads.length} threads, ${storyBible.worldFacts.length} facts, ${storyBible.chekhovs.length} chekhovs`);

return [{ json: { novelId, storyBible, rawOutput: gandalfOutput } }];
```

---

#### Step 4b: Create "Save Story Bible" Redis Node

1. Add node: **Redis** (after Parse Bible from Gandalf)
2. Name: "Save Story Bible (Gandalf)"
3. Settings:
   - Operation: Set
   - Key Type: String
   - Key: `novel:{{ $json.novelId }}:storyBible`
   - Value: `={{ $json.storyBible ? JSON.stringify($json.storyBible) : '{}' }}`

**Note**: We use a string key (`novel:{id}:storyBible`) instead of a hash field because N8N's Redis node has limited hash support. The Discord bot's StateManager will fall back to simple keys if hash fields are empty (see `state-manager.js:get()` method).

---

#### Step 4c: Create "Parse Bible Updates from Frodo" Code Node

1. Add node: **Code** (after Frodo writes chapter, before Save Chapter to Redis)
2. Name: "Parse Bible Updates from Frodo"
3. Mode: Run Once for All Items
4. Language: JavaScript
5. Code:

```javascript
// Parse Bible Updates from Frodo's chapter output
// Frodo outputs a ## BIBLE UPDATES section with changes

const webhookData = $('Webhook').first().json.body;
const novelId = webhookData.novelId;
const chapterNum = webhookData.chapterNum || 1;

// Get Frodo's output
const frodoOutput = $('Frodo').first()?.json;
let outputText = '';

// Extract text from Claude response format
if (frodoOutput?.text) {
  outputText = frodoOutput.text;
} else if (frodoOutput?.content?.[0]?.text) {
  outputText = frodoOutput.content[0].text;
} else if (frodoOutput?.data && Array.isArray(frodoOutput.data)) {
  const textItem = frodoOutput.data.find(item => item.type === 'text');
  if (textItem?.text) outputText = textItem.text;
}

// Parse BIBLE UPDATES section
const bibleUpdates = {
  characters: {},
  newRelationships: [],
  plotProgress: [],
  timelineEvents: [],
  chekhPayoffs: [],
  newChekhovs: []
};

// Find BIBLE UPDATES section
const updatesMatch = outputText.match(/##\s*BIBLE UPDATES[\s\S]*?(?=##\s*[A-Z]|$)/i);
if (!updatesMatch) {
  // No updates section, pass through
  return [{ json: { novelId, chapterNum, bibleUpdates: null, rawOutput: frodoOutput } }];
}

const updatesSection = updatesMatch[0];

// Parse CHARACTER UPDATES
const charSection = updatesSection.match(/###\s*CHARACTER UPDATES[\s\S]*?(?=###|$)/i);
if (charSection) {
  const charLines = charSection[0].matchAll(/- (\S+):\s*(.+)/gi);
  for (const line of charLines) {
    const charId = line[1].trim();
    const updateText = line[2].trim();

    // Parse updates like "Status: injured", "New trait: distrustful"
    const updates = {};
    const statusMatch = updateText.match(/Status:\s*(\w+)/i);
    const traitMatch = updateText.match(/(?:New )?[Tt]rait:\s*(.+?)(?:,|$)/);

    if (statusMatch) updates.status = statusMatch[1].toLowerCase();
    if (traitMatch) updates.newTrait = traitMatch[1].trim();

    if (Object.keys(updates).length > 0) {
      bibleUpdates.characters[charId] = updates;
    }
  }
}

// Parse NEW RELATIONSHIPS
const relSection = updatesSection.match(/###\s*NEW RELATIONSHIPS[\s\S]*?(?=###|$)/i);
if (relSection) {
  const relLines = relSection[0].matchAll(/- From:\s*(\S+),?\s*To:\s*(\S+),?\s*Type:\s*([^,]+)(?:,?\s*Notes?:\s*(.+))?/gi);
  for (const line of relLines) {
    bibleUpdates.newRelationships.push({
      from: line[1].trim(),
      to: line[2].trim(),
      type: line[3].trim(),
      notes: line[4]?.trim() || ''
    });
  }
}

// Parse PLOT THREAD PROGRESS
const plotSection = updatesSection.match(/###\s*PLOT THREAD PROGRESS[\s\S]*?(?=###|$)/i);
if (plotSection) {
  const plotLines = plotSection[0].matchAll(/- (?:NEW\s+)?(\S+):\s*(.+)/gi);
  for (const line of plotLines) {
    const isNew = line[0].toLowerCase().includes('new');
    bibleUpdates.plotProgress.push({
      id: line[1].trim(),
      progress: line[2].trim(),
      isNew
    });
  }
}

// Parse TIMELINE EVENTS
const timeSection = updatesSection.match(/###\s*TIMELINE EVENTS[\s\S]*?(?=###|$)/i);
if (timeSection) {
  const eventLines = timeSection[0].matchAll(/- (.+)/gi);
  for (const line of eventLines) {
    if (!line[1].match(/^###/)) {
      bibleUpdates.timelineEvents.push({
        chapter: chapterNum,
        event: line[1].trim()
      });
    }
  }
}

// Parse CHEKHOV PAYOFFS
const payoffSection = updatesSection.match(/###\s*CHEKHOV PAYOFFS[\s\S]*?(?=###|$)/i);
if (payoffSection) {
  const payoffLines = payoffSection[0].matchAll(/- ([^:]+):\s*(.+)/gi);
  for (const line of payoffLines) {
    bibleUpdates.chekhPayoffs.push({
      item: line[1].trim(),
      chapter: chapterNum
    });
  }
}

// Parse NEW CHEKHOVS
const newChekSection = updatesSection.match(/###\s*NEW CHEKHOVS[\s\S]*?(?=###|$)/i);
if (newChekSection) {
  const chekhLines = newChekSection[0].matchAll(/- Item:\s*(.+?)(?:,\s*Notes?:\s*(.+))?(?:\n|$)/gi);
  for (const line of chekhLines) {
    bibleUpdates.newChekhovs.push({
      item: line[1].trim(),
      introduced: chapterNum,
      notes: line[2]?.trim() || '',
      payoff: null
    });
  }
}

console.log(`[Parse Bible] Ch${chapterNum} updates: ${Object.keys(bibleUpdates.characters).length} char updates, ${bibleUpdates.newRelationships.length} new rels, ${bibleUpdates.timelineEvents.length} events`);

return [{ json: { novelId, chapterNum, bibleUpdates, rawOutput: frodoOutput } }];
```

---

#### Step 4d: Create "Apply Bible Updates" Code Node

1. Add node: **Code** (after Parse Bible Updates from Frodo)
2. Name: "Apply Bible Updates"
3. Mode: Run Once for All Items
4. Language: JavaScript
5. Code:

```javascript
// Merge bible updates into existing story bible
// This prepares the data for Redis save

const novelId = $json.novelId;
const chapterNum = $json.chapterNum;
const updates = $json.bibleUpdates;

if (!updates) {
  // No updates to apply, pass through
  return [{ json: { novelId, chapterNum, mergedBible: null, rawOutput: $json.rawOutput } }];
}

// Get current bible from Redis (loaded earlier in workflow)
// For now, we'll return the updates formatted for merge
// The actual merge happens in the Save node

const mergeOperations = {
  // Character updates: { charId: { field: newValue } }
  characterUpdates: updates.characters || {},

  // New relationships to append
  newRelationships: updates.newRelationships || [],

  // Plot thread progress
  plotProgress: updates.plotProgress || [],

  // Timeline events to append
  timelineEvents: updates.timelineEvents || [],

  // Chekhov payoffs to mark
  chekhPayoffs: updates.chekhPayoffs || [],

  // New Chekhov's guns to add
  newChekhovs: updates.newChekhovs || []
};

return [{ json: { novelId, chapterNum, mergeOperations, rawOutput: $json.rawOutput } }];
```

---

#### Step 4e: Create "Merge Bible to Redis" Code Node with Redis

Since N8N's Redis node can't do read-modify-write atomically, we need to load, merge, and save in sequence.

1. Add node: **Redis** (after Apply Bible Updates)
2. Name: "Load Current Bible"
3. Settings:
   - Operation: Get
   - Key Type: String
   - Key: `novel:{{ $json.novelId }}:storyBible`
   - Property Name: `storyBible`

4. Add node: **Code** (after Load Current Bible)
5. Name: "Merge Bible Data"
6. Code:

```javascript
// Merge bible updates into current bible
const novelId = $('Apply Bible Updates').first().json.novelId;
const chapterNum = $('Apply Bible Updates').first().json.chapterNum;
const ops = $('Apply Bible Updates').first().json.mergeOperations;
const rawOutput = $('Apply Bible Updates').first().json.rawOutput;

// Load current bible
let currentBible;
try {
  const loaded = $('Load Current Bible').first().json.storyBible;
  currentBible = typeof loaded === 'string' ? JSON.parse(loaded) : loaded;
} catch(e) {
  currentBible = null;
}

// Default empty bible
if (!currentBible || typeof currentBible !== 'object') {
  currentBible = {
    characters: {},
    relationships: [],
    plotThreads: [],
    worldFacts: [],
    timeline: [],
    chekhovs: []
  };
}

// Apply character updates
for (const [charId, updates] of Object.entries(ops.characterUpdates || {})) {
  if (currentBible.characters[charId]) {
    // Update existing character
    if (updates.status) currentBible.characters[charId].status = updates.status;
    if (updates.newTrait && currentBible.characters[charId].traits) {
      if (!currentBible.characters[charId].traits.includes(updates.newTrait)) {
        currentBible.characters[charId].traits.push(updates.newTrait);
      }
    }
  }
}

// Append new relationships (avoid exact duplicates)
for (const rel of ops.newRelationships || []) {
  const exists = currentBible.relationships.some(r =>
    r.from === rel.from && r.to === rel.to && r.type === rel.type
  );
  if (!exists) {
    currentBible.relationships.push(rel);
  }
}

// Update plot thread progress
for (const progress of ops.plotProgress || []) {
  if (progress.isNew) {
    // New plot thread
    currentBible.plotThreads.push({
      id: progress.id,
      title: progress.progress.split(':')[0] || progress.id,
      introduced: chapterNum,
      foreshadowing: [],
      resolved: false
    });
  } else {
    // Update existing thread
    const thread = currentBible.plotThreads.find(t => t.id === progress.id);
    if (thread) {
      thread.foreshadowing.push({ chapter: chapterNum, hint: progress.progress });
    }
  }
}

// Append timeline events
for (const event of ops.timelineEvents || []) {
  currentBible.timeline.push(event);
}

// Mark Chekhov payoffs
for (const payoff of ops.chekhPayoffs || []) {
  const chekhov = currentBible.chekhovs.find(c =>
    c.item.toLowerCase().includes(payoff.item.toLowerCase()) ||
    payoff.item.toLowerCase().includes(c.item.toLowerCase())
  );
  if (chekhov) {
    chekhov.payoff = payoff.chapter;
  }
}

// Add new Chekhov's guns
for (const newChek of ops.newChekhovs || []) {
  currentBible.chekhovs.push(newChek);
}

console.log(`[Merge Bible] Ch${chapterNum}: Bible now has ${Object.keys(currentBible.characters).length} chars, ${currentBible.relationships.length} rels, ${currentBible.timeline.length} events`);

return [{ json: { novelId, chapterNum, mergedBible: currentBible, rawOutput } }];
```

7. Add node: **Redis** (after Merge Bible Data)
8. Name: "Save Merged Bible"
9. Settings:
   - Operation: Set
   - Key Type: String
   - Key: `novel:{{ $json.novelId }}:storyBible`
   - Value: `={{ JSON.stringify($json.mergedBible) }}`

---

#### Step 4f: Connect the Bible Parsing Pipeline

**For Outline (Gandalf) path:**
```
Gandalf
    ↓
Parse Bible from Gandalf
    ↓
Save Story Bible (Gandalf)
    ↓
Save outline to Redis (existing, modify to use rawOutput)
    ↓
Format Discord Message
```

**For Write Chapter (Frodo) path:**
```
Frodo
    ↓
Parse Bible Updates from Frodo
    ↓
Apply Bible Updates
    ↓
Load Current Bible
    ↓
Merge Bible Data
    ↓
Save Merged Bible
    ↓
Save Chapter to Redis (existing, modify to use rawOutput)
    ↓
... (Elrond critique flow)
```

---

#### Step 4g: Update Existing Save Nodes

After adding the Bible parsing nodes, update the existing Save nodes to use the raw output:

**Save outline to Redis:**
- Change Value from `$json.output` to:
```
={{ $('Parse Bible from Gandalf').first().json.rawOutput ? JSON.stringify($('Parse Bible from Gandalf').first().json.rawOutput) : JSON.stringify($json) }}
```

**Save Chapter to Redis:**
- Change Value from `$json` to:
```
={{ $('Merge Bible Data').first()?.json.rawOutput ? JSON.stringify($('Merge Bible Data').first().json.rawOutput) : JSON.stringify($json) }}
```

---

## Workflow Structure

```
Discord Bot triggers webhook
         ↓
    [Webhook Node]
         ↓
    [IF: Check Action]
         ↓
    ┌────┴────┬────────┐
    ↓         ↓        ↓
 outline    write    revise
    ↓         ↓        ↓
 Gandalf   Frodo    Frodo
    ↓         ↓        ↓
    └────┬────┴────────┘
         ↓
    [Save to Redis]
         ↓
    [IF: action == write/revise]
         ↓
      Elrond
         ↓
    [Save Critique]
         ↓
    [IF: score < threshold]
         ↓
    [Loop back to Frodo OR continue to next chapter]
```

## Setup Steps

### 1. Create New Workflow

1. Open N8N at http://50.18.245.194:5678
2. Click "Add Workflow"
3. Name it "ILUVATAR Novel Writer"

### 2. Add Webhook Node (Entry Point)

1. Add node: **Webhook**
2. Settings:
   - HTTP Method: POST
   - Path: `iluvatar-trigger`
   - Response Mode: "Respond to webhook at end of workflow"
3. Copy the webhook URL - this goes in `N8N_WEBHOOK_URL` env var

The webhook receives:
```json
{
  "action": "outline" | "write" | "critique" | "revise_outline" | "revise_chapter" | "plan_chapter",
  "novelId": "novel-abc123",
  "metadata": { "title": "...", "genre": "...", "language": "zh|en", ... },
  "chapterNum": 1,
  "chapterCount": 1,
  "feedback": "...",
  "bibleContext": "## STORY BIBLE CONTEXT\n\n### CHARACTERS\n...",
  "callback": {
    "discordChannelId": "123456789012345678",
    "botToken": "MTQ0OTcwNjcxMDU5MDU1..."
  }
}
```

**Field Notes:**
- `bibleContext`: Pre-formatted story bible slice (characters, relationships, plot threads, Chekhov's guns, timeline). Included for `write`, `critique`, `revise_chapter`, and `plan_chapter` actions. Pass this directly to the agent prompt.
- `chapterNum`: Which chapter is being written/critiqued/revised/planned
- `chapterCount`: Number of chapters to plan (only for `plan_chapter` action, default 1, max 5)
- `feedback`: User's revision feedback (only for `revise_outline` and `revise_chapter`)
- `callback`: Used by N8N to post results back to the correct Discord channel

### 3. Add IF Node (Route by Action)

1. Add node: **IF**
2. Conditions:
   - Branch 1: `action` equals `outline`
   - Branch 2: `action` equals `write`
   - Branch 3: `action` equals `revise`

### 4. Add HTTP Request Nodes for AI Calls

For each agent, add an **HTTP Request** node:

#### Gandalf (Planning)
```
URL: https://api.anthropic.com/v1/messages
Method: POST
Headers:
  - x-api-key: {{ $env.ANTHROPIC_API_KEY }}
  - anthropic-version: 2023-06-01
  - content-type: application/json
Body:
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 8192,
  "messages": [
    {
      "role": "user",
      "content": "{{ $json.prompt }}"
    }
  ],
  "system": "{{ $env.GANDALF_PROMPT }}"
}
```

#### Frodo (Writing)

**CRITICAL**: Frodo needs high `max_tokens` because:
1. Extended thinking consumes ~2000-4000 tokens
2. Full chapter content needs ~4000-8000 tokens (depending on language)
3. Recommended: **16384** minimum for extended thinking enabled

```
URL: https://api.anthropic.com/v1/messages
Method: POST
Headers:
  - x-api-key: {{ $env.ANTHROPIC_API_KEY }}
  - anthropic-version: 2023-06-01
  - content-type: application/json
Body:
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 16384,
  "messages": [
    {
      "role": "user",
      "content": "{{ $json.prompt }}\n\n{{ $json.bibleContext || '' }}"
    }
  ],
  "system": "{{ $env.FRODO_PROMPT }}"
}
```

**Important**: Include `bibleContext` in the user message so Frodo has story bible context for consistency.

#### Elrond (Critic)
```
URL: https://api.anthropic.com/v1/messages
Method: POST
Headers:
  - x-api-key: {{ $env.ANTHROPIC_API_KEY }}
  - anthropic-version: 2023-06-01
  - content-type: application/json
Body:
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 8192,
  "messages": [
    {
      "role": "user",
      "content": "{{ $json.prompt }}\n\n{{ $json.bibleContext || '' }}"
    }
  ],
  "system": "{{ $env.ELROND_PROMPT }}"
}
```

**Important**: Include `bibleContext` in the user message so Elrond can verify consistency against the story bible.

### 5. Add Redis Nodes

**IMPORTANT**: Our StateManager uses Redis **Hash** operations, not simple key-value. Each novel's data is stored as a hash with fields like `outline`, `chapters`, `metadata`.

#### For Outline (after Gandalf):

1. Add node: **Redis**
2. Operation: **Hash Set** (HSET)
3. Key: `novel:{{ $json.body.novelId }}:data`
4. Field: `outline`
5. Value: `{{ JSON.stringify({ raw: $json.output, savedAt: new Date().toISOString() }) }}`

#### For Chapters (after Frodo):

1. Add node: **Redis**
2. Operation: **Hash Get** first to get existing chapters, then **Hash Set**
3. Key: `novel:{{ $json.body.novelId }}:data`
4. Field: `chapters`
5. Value: Merge new chapter into existing chapters object

**Code Node for Chapter Save:**
```javascript
// Get existing chapters from Redis first (via previous node)
const existingChapters = $('Redis Get Chapters').first()?.json || {};
const chapterNum = $('Webhook').first().json.body.chapterNum || 1;
const parsedOutput = $('Parse Frodo Output').first().json;

// Add new chapter
existingChapters[chapterNum] = {
  title: parsedOutput.chapter_title,
  content: parsedOutput.content,
  wordCount: parsedOutput.word_count,
  raw: parsedOutput.raw,
  savedAt: new Date().toISOString()
};

return { json: { chapters: existingChapters } };
```

Then save with:
- Operation: **Hash Set**
- Key: `novel:{{ $json.body.novelId }}:data`
- Field: `chapters`
- Value: `{{ JSON.stringify($json.chapters) }}`

### 6. Add Text Parser (Function Node)

After each AI call, parse the text markers:

```javascript
// Parse Gandalf's output
const output = $input.first().json.content[0].text;

const sections = {};
const markers = ['TITLE', 'SYNOPSIS', 'CHAPTERS', 'CHARACTERS', 'WORLDBUILDING', 'THEMES', 'NOTES'];

for (const marker of markers) {
  const regex = new RegExp(`## ${marker}\\n([\\s\\S]*?)(?=## |$)`, 'i');
  const match = output.match(regex);
  if (match) {
    sections[marker.toLowerCase()] = match[1].trim();
  }
}

return { json: { ...sections, raw: output } };
```

### 7. Add Loop for Revisions

Use the **Loop Over Items** node combined with an IF check:

1. After Elrond scores, check if `score < 70`
2. If yes, loop back to Frodo with the critique
3. If no, proceed to next chapter

### 8. Environment Variables

Set these in N8N Settings → Variables:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `REDIS_HOST` | localhost or Redis server IP |
| `GANDALF_PROMPT` | Contents of gandalf-planning.md |
| `FRODO_PROMPT` | Contents of frodo-writing.md |
| `ELROND_PROMPT` | Contents of elrond-critic.md |

## Alternative: Code Node Approach

Instead of using the HTTP Request node, you can use a **Code** node with the Anthropic SDK:

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: $env.ANTHROPIC_API_KEY });

const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  system: $env.GANDALF_PROMPT,
  messages: [
    { role: 'user', content: $input.first().json.prompt }
  ]
});

return { json: { output: message.content[0].text } };
```

## Discord Callback (Posting Results to Channel)

After each agent completes, the workflow posts formatted results back to the correct Discord channel.

### Webhook Payload (Updated)

The Discord bot now sends callback information with each trigger:

```json
{
  "action": "outline" | "write" | "critique" | "revise_outline" | "revise_chapter",
  "novelId": "novel-abc123",
  "metadata": { "title": "...", "genre": "...", ... },
  "chapterNum": 1,
  "feedback": "...",
  "callback": {
    "discordChannelId": "123456789012345678",
    "botToken": "MTQ0OTcwNjcxMDU5MDU1..."
  }
}
```

### Step 1: Add "Format Discord Message" Code Node

After each `[Save to Redis]` node, add a **Code** node:

**Name**: `Format Discord Message`

```javascript
// Get data from previous nodes
const webhookData = $('Webhook').first().json.body;
const action = webhookData.action;
const novelId = webhookData.novelId;
const channelId = webhookData.callback?.discordChannelId;
const metadata = webhookData.metadata || {};

// Get agent output (adjust based on which path)
let title, description, color, fields;

switch (action) {
  case 'outline':
    title = '📜 Outline Generated';
    description = `**${metadata.title || 'Novel'}** outline is ready for review.`;
    color = 0x3498db; // Blue
    fields = [
      { name: 'Novel ID', value: novelId, inline: true },
      { name: 'Genre', value: metadata.genre || 'N/A', inline: true },
      { name: 'Language', value: metadata.language || 'N/A', inline: true },
      { name: 'Status', value: '⏳ Awaiting Approval', inline: true },
      { name: 'Next Step', value: 'Use `/novel approve` to approve or `/novel feedback` to revise', inline: false }
    ];
    break;

  case 'write':
    const chapterNum = webhookData.chapterNum || 1;
    title = `✍️ Chapter ${chapterNum} Written`;
    description = `**${metadata.title || 'Novel'}** - Chapter ${chapterNum} is ready.`;
    color = 0x2ecc71; // Green
    fields = [
      { name: 'Novel ID', value: novelId, inline: true },
      { name: 'Chapter', value: String(chapterNum), inline: true },
      { name: 'Status', value: '📝 Ready for Review', inline: true },
      { name: 'Next Step', value: 'Use `/novel critique` for evaluation or `/novel approve` to continue', inline: false }
    ];
    break;

  case 'critique':
    const critiqueChapter = webhookData.chapterNum || 1;
    // Try to parse score from Elrond's output
    const elrondOutput = $('Elrond').first()?.json?.content?.[0]?.text || '';
    const scoreMatch = elrondOutput.match(/## SCORE\s*\n\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 'N/A';
    const passed = typeof score === 'number' && score >= 70;

    title = `🔍 Chapter ${critiqueChapter} Critique`;
    description = `Elrond has evaluated Chapter ${critiqueChapter}.`;
    color = passed ? 0x2ecc71 : 0xe74c3c; // Green if pass, Red if fail
    fields = [
      { name: 'Novel ID', value: novelId, inline: true },
      { name: 'Chapter', value: String(critiqueChapter), inline: true },
      { name: 'Score', value: `${score}/100`, inline: true },
      { name: 'Verdict', value: passed ? '✅ Passed' : '❌ Needs Revision', inline: true },
      { name: 'Next Step', value: passed ? 'Use `/novel write` for next chapter' : 'Use `/novel feedback` to revise', inline: false }
    ];
    break;

  case 'revise_outline':
    title = '📜 Outline Revised';
    description = `**${metadata.title || 'Novel'}** outline has been revised.`;
    color = 0x9b59b6; // Purple
    fields = [
      { name: 'Novel ID', value: novelId, inline: true },
      { name: 'Status', value: '⏳ Awaiting Approval', inline: true },
      { name: 'Next Step', value: 'Use `/novel approve` to approve or `/novel feedback` for more changes', inline: false }
    ];
    break;

  case 'revise_chapter':
    const reviseChapter = webhookData.chapterNum || 1;
    title = `✍️ Chapter ${reviseChapter} Revised`;
    description = `Chapter ${reviseChapter} has been revised.`;
    color = 0x9b59b6; // Purple
    fields = [
      { name: 'Novel ID', value: novelId, inline: true },
      { name: 'Chapter', value: String(reviseChapter), inline: true },
      { name: 'Status', value: '📝 Ready for Review', inline: true },
      { name: 'Next Step', value: 'Use `/novel critique` to re-evaluate or `/novel approve` to continue', inline: false }
    ];
    break;

  default:
    title = '📢 Pipeline Update';
    description = `Action: ${action}`;
    color = 0x95a5a6;
    fields = [{ name: 'Novel ID', value: novelId, inline: true }];
}

// Build Discord embed
const embed = {
  title,
  description,
  color,
  fields,
  timestamp: new Date().toISOString(),
  footer: { text: 'ILUVATAR Pipeline' }
};

return {
  json: {
    channelId,
    botToken: webhookData.callback?.botToken,
    embed
  }
};
```

### Step 2: Add "Post to Discord" HTTP Request Node

**Name**: `Post to Discord Channel`
**Type**: HTTP Request

- **Method**: POST
- **URL**: `https://discord.com/api/v10/channels/{{ $json.channelId }}/messages`
- **Authentication**: Header Auth
- **Headers**:
  - `Authorization`: `Bot {{ $json.botToken }}`
  - `Content-Type`: `application/json`
- **Body** (JSON):
```json
{
  "embeds": [{{ JSON.stringify($json.embed) }}]
}
```

### Step 3: Connect Nodes

For EACH path (outline, write, critique, revise_outline, revise_chapter):

```
[Agent Node] → [Save to Redis] → [Format Discord Message] → [Post to Discord Channel]
```

### Workflow Diagram (Updated)

```
Discord Bot triggers webhook
         ↓
    [Webhook Node]
         ↓
    [IF: Check Action]
         ↓
    ┌────┴────┬────────┬──────────┬──────────────┐
    ↓         ↓        ↓          ↓              ↓
 outline    write   critique  revise_outline  revise_chapter
    ↓         ↓        ↓          ↓              ↓
 Gandalf   Frodo    Elrond    Gandalf         Frodo
    ↓         ↓        ↓          ↓              ↓
    └────┬────┴────┬───┴──────────┴──────────────┘
         ↓         ↓
    [Save to Redis]
         ↓
    [Format Discord Message]
         ↓
    [Post to Discord Channel]
```

### Security Note

The bot token is passed in the webhook payload. In production, you may want to:
1. Store the token in N8N environment variables instead
2. Use `$env.DISCORD_BOT_TOKEN` in the HTTP Request node
3. Remove `botToken` from the webhook payload

## Testing

1. Activate the workflow
2. Use Discord `/novel create` to trigger
3. Check N8N execution logs for errors
4. Verify Redis has the saved data
5. **Verify Discord channel received the formatted result**

## Debugging

- **Execution failed**: Check N8N execution log (click on failed execution)
- **AI returns error**: Verify API key, check rate limits
- **Redis not saving**: Check Redis connection, verify key format
- **Webhook not receiving**: Verify URL in Discord bot config

## Import Workflow

See `n8n-workflow-export.json` for a complete importable workflow.

---

## Critical Fix: Data Flow Through Load Nodes (Jan 2026)

### The Problem

When the workflow passes through a "Load" node (Load Outline, Load Chapter), the original webhook data (novelId, metadata, callback) is **lost**. The Load node only outputs what it loaded from Redis.

**Symptom**: Chapters save to `novel:undefined:chapter:1` and Discord notifications fail with empty channelId.

### The Solution

In ALL prompt builder Code nodes that come AFTER a Load node, get webhook data directly from the Webhook node instead of `$input`:

```javascript
// ❌ WRONG - loses data after Load node
const input = $input.first().json.body || $input.first().json;
const novelId = input.novelId;  // undefined!

// ✅ CORRECT - always has the original data
const webhookData = $('Webhook').first().json.body;
const novelId = webhookData.novelId;  // correct!
const callback = webhookData.callback;  // preserved!

// Get loaded data from $input
const loadedOutline = $input.first().json.outline;
```

### Affected Nodes

These 4 prompt builder nodes needed this fix:
1. **Build Frodo Prompt** (write action) - comes after "Load Outline"
2. **Build Elrond Prompt** (critique action) - comes after "Load Chapter"
3. **Build Gandalf Prompt (revise)** (revise_outline action) - comes after "Load Outline"
4. **Build Frodo Prompt (revise)** (revise_chapter action) - comes after "Load Chapter"

**Build Gandalf Prompt** (outline action) does NOT need this fix because it receives directly from the webhook without a Load node in between.

---

## Known Issue: Chapter Truncation (Jan 2026)

### Symptom

Chapters end mid-sentence. For example:
```
一夜之间，曾经的外门第一天才，沦为
```
(Sentence is cut off mid-word "沦为")

### Cause

When using the **Anthropic Chat Model** node (LangChain integration) with **Extended Thinking** enabled, the `max_tokens` setting applies to BOTH thinking + output combined.

- Thinking: ~2000-4000 tokens
- Chapter content: ~4000-8000 tokens
- **Required minimum**: 16384 tokens

If `max_tokens` is set too low (e.g., 8192), the response gets truncated.

### Fix

1. Open N8N at http://50.18.245.194:5678
2. Navigate to the ILUVATAR workflow
3. Find the **Anthropic Chat Model** node for Frodo (writing agent)
4. In "Options", set `Max Tokens (Anthropic)` to **16384** or higher
5. Save the workflow

### Verification

After fixing, test with `/novel write chapter:1` on a test novel and verify the chapter ends with proper closing text (not mid-sentence).

---

## Discord Thread Posting for Full Content (Jan 2026)

Discord embeds have a 2048 character limit. For long content (outlines, chapters), we post:
1. A preview embed to the channel (first 500 chars)
2. Full content in a thread, split into 1900-char chunks

### Enhanced "Format Discord Message" Code Node

This unified node handles all 5 action types and prepares content for thread posting:

```javascript
// Get data from previous nodes
const webhookData = $('Webhook').first().json.body;
const action = webhookData.action;
const novelId = webhookData.novelId;
const channelId = webhookData.callback?.discordChannelId;
const botToken = webhookData.callback?.botToken;
const metadata = webhookData.metadata || {};

// Helper to split content into chunks for Discord
function splitIntoChunks(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Find last paragraph break or sentence end before limit
    let splitAt = remaining.lastIndexOf('\n\n', maxLength);
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = remaining.lastIndexOf('。', maxLength);  // Chinese period
    }
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = remaining.lastIndexOf('. ', maxLength);  // English period
    }
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = maxLength;  // Hard cut
    }
    chunks.push(remaining.substring(0, splitAt + 1));
    remaining = remaining.substring(splitAt + 1).trim();
  }
  return chunks;
}

// Get agent output based on action
let fullContent = '';
let title, description, color, fields;

switch (action) {
  case 'outline':
    const gandalfOutput = $('Gandalf').first()?.json?.text ||
                          $('Gandalf').first()?.json?.content?.[0]?.text || '';
    fullContent = gandalfOutput;
    title = '📜 Outline Generated';
    description = `**${metadata.title || 'Novel'}** outline is ready for review.`;
    color = 0x3498db;
    break;

  case 'write':
    const frodoOutput = $('Frodo').first()?.json?.text ||
                        $('Frodo').first()?.json?.content?.[0]?.text || '';
    fullContent = frodoOutput;
    title = `✍️ Chapter ${webhookData.chapterNum || 1} Written`;
    description = `**${metadata.title || 'Novel'}** - Chapter ready for review.`;
    color = 0x2ecc71;
    break;

  case 'critique':
    const elrondOutput = $('Elrond').first()?.json?.text ||
                         $('Elrond').first()?.json?.content?.[0]?.text || '';
    fullContent = elrondOutput;
    const scoreMatch = elrondOutput.match(/## SCORE\s*\n\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 'N/A';
    title = `🔍 Chapter ${webhookData.chapterNum || 1} Critique`;
    description = `Score: ${score}/100`;
    color = (typeof score === 'number' && score >= 70) ? 0x2ecc71 : 0xe74c3c;
    break;

  case 'revise_outline':
    const revisedOutline = $('Gandalf (revise)').first()?.json?.text || '';
    fullContent = revisedOutline;
    title = '📜 Outline Revised';
    description = `**${metadata.title || 'Novel'}** outline has been revised.`;
    color = 0x9b59b6;
    break;

  case 'revise_chapter':
    const revisedChapter = $('Frodo (revise)').first()?.json?.text || '';
    fullContent = revisedChapter;
    title = `✍️ Chapter ${webhookData.chapterNum || 1} Revised`;
    description = `Chapter has been revised.`;
    color = 0x9b59b6;
    break;

  default:
    title = '📢 Pipeline Update';
    description = `Action: ${action}`;
    color = 0x95a5a6;
}

// Create preview (first 500 chars)
const preview = fullContent.length > 500
  ? fullContent.substring(0, 500) + '...\n\n*[Full content in thread below]*'
  : fullContent;

// Split full content for thread posting
const fullContentChunks = splitIntoChunks(fullContent);

// Build embed with preview
const embed = {
  title,
  description: description + '\n\n' + preview,
  color,
  fields: [
    { name: 'Novel ID', value: novelId, inline: true },
    { name: 'Action', value: action, inline: true }
  ],
  timestamp: new Date().toISOString(),
  footer: { text: 'ILUVATAR Pipeline' }
};

return {
  json: {
    channelId,
    botToken,
    embed,
    fullContentChunks,
    needsThread: fullContent.length > 500
  }
};
```

### "Post to Discord Channel" HTTP Request Node

- **Method**: POST
- **URL**: `https://discord.com/api/v10/channels/{{ $json.channelId }}/messages`
- **Headers**:
  - `Authorization`: `Bot {{ $json.botToken }}`
  - `Content-Type`: `application/json`
- **Body**: `={{ JSON.stringify({ embeds: [$json.embed] }) }}`

### "Create Thread" HTTP Request Node

**CRITICAL**: The URL must include the message ID from the previous post.

- **Method**: POST
- **URL**: `https://discord.com/api/v10/channels/{{ $('Format Discord Message').first().json.channelId }}/messages/{{ $('Post to Discord Channel').first().json.id }}/threads`
- **Headers**:
  - `Authorization`: `Bot {{ $('Format Discord Message').first().json.botToken }}`
  - `Content-Type`: `application/json`
- **Body**:
```json
{
  "name": "Full Content",
  "auto_archive_duration": 1440
}
```

### "Split Into Chunks" Code Node

Prepares the chunks for the Loop Over Items node:

```javascript
const chunks = $('Format Discord Message').first().json.fullContentChunks || [];
const threadId = $('Create Thread').first().json.id;
const botToken = $('Format Discord Message').first().json.botToken;

return chunks.map((chunk, index) => ({
  json: {
    threadId,
    botToken,
    content: chunk,
    partNumber: index + 1,
    totalParts: chunks.length
  }
}));
```

### "Loop Over Items" Node

- Add the Loop Over Items node
- Connect to "Split Into Chunks"
- Inside the loop, add "Post Chunk to Thread"

### "Post Chunk to Thread" HTTP Request Node

- **Method**: POST
- **URL**: `https://discord.com/api/v10/channels/{{ $json.threadId }}/messages`
- **Headers**:
  - `Authorization`: `Bot {{ $json.botToken }}`
  - `Content-Type`: `application/json`
- **Body**: `={{ JSON.stringify({ content: "Part " + $json.partNumber + "/" + $json.totalParts + ":\n\n" + $json.content }) }}`

### Workflow Flow

```
[Save to Redis]
      ↓
[Format Discord Message] (creates embed + chunks)
      ↓
[Post to Discord Channel] (returns message.id)
      ↓
[Create Thread] (on message.id)
      ↓
[Split Into Chunks]
      ↓
[Loop Over Items]
      ↓
[Post Chunk to Thread]
```

---

## Fix 5: Discord Thread Visibility (Jan 2026)

### Problem

Threads created from messages don't show as "attached" to the message. Users see the main embed with "[Full content in thread below]" but can't see the thread indicator.

### Cause

Discord has quirky behavior with embed-only messages (messages with only `embeds` and empty `content`). The thread indicator may not display prominently or at all.

### Solution

Add a text `content` field to the message along with the embed. This ensures Discord displays the thread indicator properly.

### Node: "Post to Discord Channel" (HTTP Request)

**Current (problematic)**:
```
Body: ={{ JSON.stringify({ embeds: [$json.embed] }) }}
```

**Fixed**:
```
Body: ={{ JSON.stringify({ content: "📄 **Click the thread below to see full content** ⬇️", embeds: [$json.embed] }) }}
```

### Alternative: Update Format Discord Message

If you want more control, update the "Format Discord Message" code node to include a `messageContent` field, then use it in the body:

```javascript
// At the end of Format Discord Message, add:
return {
  json: {
    channelId,
    botToken,
    embed,
    messageContent: fullContent.length > 500 ? "📄 **Click the thread below to see full content** ⬇️" : "",
    fullContentChunks,
    needsThread: fullContent.length > 500
  }
};
```

Then update the Post to Discord Channel body:
```
Body: ={{ JSON.stringify({ content: $json.messageContent || "", embeds: [$json.embed] }) }}
```

### Verification

After applying this fix:
1. Run `/novel create` with a test novel
2. The main message should show text "📄 **Click the thread below to see full content** ⬇️"
3. Below the embed, a "See Thread" or thread indicator should appear
4. Clicking it opens the thread with the full content chunks

---

## Plan Chapter Route (Jan 2026)

The `plan_chapter` action allows Gandalf to create detailed plans for upcoming chapters before they are written.

### Purpose

- Plan one or more chapters in detail before writing
- Includes scene breakdowns, key beats, dialogue notes
- Helps ensure coherent story progression

### Webhook Payload

```json
{
  "action": "plan_chapter",
  "novelId": "novel-abc123",
  "metadata": { ... },
  "chapterNum": 5,
  "chapterCount": 3,
  "bibleContext": "...",
  "callback": { ... }
}
```

### N8N Route Setup

Add a new branch in the Route Action switch for `plan_chapter`:

1. **Route Action** - Add case for `action === "plan_chapter"`

2. **Load Outline** - Same as other routes, load the current outline from Redis

3. **Build Gandalf Plan Prompt** (Code Node):

```javascript
// Build Gandalf prompt for detailed chapter planning
const webhookData = $('Webhook').first().json.body;
const loadedOutline = $input.first().json.outline;

const metadata = webhookData.metadata || {};
const novelId = webhookData.novelId;
const chapterNum = webhookData.chapterNum || 1;
const chapterCount = webhookData.chapterCount || 1;
const bibleContext = webhookData.bibleContext || '';
const callback = webhookData.callback || {};

// Parse outline if it's a string
let outline = loadedOutline;
if (typeof outline === 'string') {
  try { outline = JSON.parse(outline); } catch(e) { /* keep as string */ }
}

const outlineText = outline?.raw || JSON.stringify(outline);
const endChapter = chapterNum + chapterCount - 1;
const chapterRange = chapterCount > 1 ? `chapters ${chapterNum}-${endChapter}` : `chapter ${chapterNum}`;

// CRITICAL: Language enforcement
const languageInstruction = metadata.language === 'zh'
  ? `\n\n**关键要求 - 语言**: 你必须使用中文（简体中文）撰写所有章节计划！`
  : `\n\n**LANGUAGE REQUIREMENT**: Write all chapter plans in English.`;

const prompt = `Create a detailed chapter plan for ${chapterRange} of "${metadata.title}".

## Current Outline
${outlineText}

## Task
For each chapter in the range ${chapterNum} to ${endChapter}, create a detailed plan including:

1. **Scene Breakdown**: List each scene with location, characters present, and purpose
2. **Key Beats**: The major story beats and emotional moments
3. **Character Development**: What each character learns or how they change
4. **Dialogue Notes**: Key conversations or lines to include
5. **Foreshadowing**: Elements to plant for future chapters
6. **Connection Points**: How this chapter connects to previous/next chapters

${languageInstruction}

${bibleContext ? `\n## STORY BIBLE CONTEXT\n${bibleContext}` : ''}

Please provide detailed plans for each chapter.`;

return { json: { prompt, metadata, chapterNum, chapterCount, novelId, callback } };
```

4. **Gandalf (Plan)** - LangChain Agent node calling Claude with the plan prompt

5. **Save Chapter Plan to Redis** - Save to `novel:{novelId}:chapter_plan:{chapterNum}`

6. **Format Discord Message** - Add case for `plan_chapter` action:

```javascript
case 'plan_chapter':
  const planChapter = webhookData.chapterNum || 1;
  const planCount = webhookData.chapterCount || 1;
  const planEnd = planChapter + planCount - 1;
  const planRange = planCount > 1 ? `Chapters ${planChapter}-${planEnd}` : `Chapter ${planChapter}`;

  const gandalfPlanOutput = $('Gandalf (Plan)').first()?.json?.text || '';
  fullContent = gandalfPlanOutput;
  title = `📋 ${planRange} Planning Complete`;
  description = `Gandalf has created detailed plans for ${planRange.toLowerCase()}.`;
  color = 0x3498db; // Blue
  break;
```

### Workflow Flow

```
[Webhook]
    ↓
[Route Action] → action === "plan_chapter"
    ↓
[Load Outline]
    ↓
[Build Gandalf Plan Prompt]
    ↓
[Gandalf (Plan)]
    ↓
[Save Chapter Plan to Redis]
    ↓
[Format Discord Message]
    ↓
[Post to Discord Channel]
    ↓
[Create Thread]
    ↓
[Split Into Chunks]
    ↓
[Loop Over Items]
    ↓
[Post Chunk to Thread]
```

---

## Fix 6: Auto-Critique Flow (Jan 2026)

### Purpose

When a novel is created with `auto_critique: true`, the system should automatically trigger Elrond's critique after each chapter is written. This saves the user from having to manually run `/novel critique` after every `/novel write`.

### How It Works

The Discord bot passes `metadata.autoCritique` in every N8N webhook call. After Frodo writes a chapter, if `autoCritique` is true, the workflow should automatically:

1. Save the chapter to Redis (as normal)
2. Post to Discord (as normal)
3. **Then** trigger the critique flow (instead of ending)

### Implementation Option A: Conditional Branch After Write

Add an IF node after "Save Chapter to Redis" in the `write` action flow:

```
[Frodo (Write)]
    ↓
[Save Chapter to Redis]
    ↓
[IF: Auto-Critique Enabled?]
    ├─ true → [Build Elrond Prompt (Auto)]
    │              ↓
    │         [Elrond (Auto)]
    │              ↓
    │         [Save Critique to Redis]
    │              ↓
    │         [Format Combined Discord Message]
    │
    └─ false → [Format Discord Message (Chapter Only)]
         ↓
[Post to Discord Channel]
    ↓
... (rest of thread flow)
```

**IF Node Configuration:**
- Condition: `{{ $('Webhook').first().json.body.metadata.autoCritique === true }}`
- True branch: Trigger auto-critique
- False branch: Normal chapter-only post

### Implementation Option B: Separate Auto-Critique Action

Simpler approach - after posting the chapter, make a second webhook call with action `auto_critique`:

**In "Format Discord Message" for write action, add:**
```javascript
// At the end, check if auto-critique should be triggered
const autoCritique = $('Webhook').first().json.body.metadata?.autoCritique;
if (autoCritique && action === 'write') {
  // Set a flag to trigger critique after Discord post
  return {
    json: {
      ...existingOutput,
      triggerAutoCritique: true,
      critiquePayload: {
        action: 'critique',
        novelId,
        chapterNum,
        metadata,
        callback
      }
    }
  };
}
```

Then add an IF node after "Post Chunk to Thread" that checks `triggerAutoCritique` and loops back to trigger the critique flow.

### Recommended Approach

Option A is cleaner because it combines chapter + critique into one Discord message thread. The user sees:
- Main message: "Chapter X written"
- Thread: Full chapter text
- Thread continuation: Elrond's critique

### Format Combined Discord Message (for Option A)

```javascript
// When auto-critique is enabled, combine chapter and critique
if (action === 'write' && autoCritique) {
  const chapterContent = $('Frodo (Write)').first()?.json?.text || '';
  const critiqueContent = $('Elrond (Auto)').first()?.json?.text || '';

  fullContent = `## Chapter ${chapterNum}\n\n${chapterContent}\n\n---\n\n## Elrond's Critique\n\n${critiqueContent}`;
  title = `📖 Chapter ${chapterNum} + Critique`;
  description = `Chapter ${chapterNum} written and auto-critiqued by Elrond.`;

  // Extract score from critique if available
  const scoreMatch = critiqueContent.match(/Score:\s*(\d+)/i);
  if (scoreMatch) {
    description += `\n\n**Quality Score:** ${scoreMatch[1]}/100`;
  }
}
```

### Verification

After implementing:
1. Create a novel with `/novel create auto_critique:true`
2. Generate outline and approve it
3. Run `/novel write` to write a chapter
4. The Discord message should show both the chapter AND Elrond's critique
5. No need to manually run `/novel critique`

### Note for Discord Bot

The Discord bot already shows an indicator when auto-critique is enabled:
```
🔄 Auto-Critique: Elrond will evaluate after writing
```

This appears in the `/novel write` response embed when `metadata.autoCritique` is true.

---

## Fix 7: Style Fields Missing (Jan 2026)

### Problem

The Discord bot captures POV, Tone, and Style Reference from `/novel create`, but these fields are NOT passed to the agent prompts. Users who set `style_reference:"金庸"` will not get that style applied.

### Root Cause

All "Build Prompt" nodes in N8N only extract:
- `metadata.title`
- `metadata.genre`
- `metadata.premise`
- `metadata.language`
- `metadata.targetChapters`
- `metadata.targetWordsPerChapter`

They do NOT extract:
- `metadata.pov` (third_limited, first_person, omniscient)
- `metadata.tone` (dark, light, comedic, serious, epic)
- `metadata.styleReference` (e.g., "金庸", "Brandon Sanderson")

### Fix: Update All Prompt Builder Nodes

Update the following nodes to include style fields:

1. **Build Gandalf Prompt** (outline generation)
2. **Build Gandalf Prompt (revise)** (outline revision)
3. **Build Gandalf Prompt (plan_chapter)** (chapter planning)
4. **Build Frodo Prompt** (chapter writing)
5. **Build Frodo Prompt (revise)** (chapter revision)

### Code Change for Build Gandalf Prompt

**Current:**
```javascript
const prompt = `Create a novel outline with the following specifications:

Title: ${metadata.title}
Genre: ${metadata.genre}
Premise: ${metadata.premise || 'No specific premise provided'}
Language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
Target Chapters: ${metadata.targetChapters}
Words Per Chapter: ${metadata.targetWordsPerChapter}
${languageInstruction}

Please create a complete outline following the format specified in your instructions.`;
```

**Fixed (add style fields):**
```javascript
// Build style section only if any style field is set
const styleSection = [];
if (metadata.pov) styleSection.push(`POV: ${metadata.pov} (${
  metadata.pov === 'first_person' ? 'First person narrator' :
  metadata.pov === 'omniscient' ? 'Third person omniscient' :
  'Third person limited - stay in one character\'s head per scene'
})`);
if (metadata.tone) styleSection.push(`Tone: ${metadata.tone}`);
if (metadata.styleReference) styleSection.push(`Style Reference: Write in the style of ${metadata.styleReference}`);
const styleInfo = styleSection.length > 0 ? '\n' + styleSection.join('\n') + '\n' : '';

const prompt = `Create a novel outline with the following specifications:

Title: ${metadata.title}
Genre: ${metadata.genre}
Premise: ${metadata.premise || 'No specific premise provided'}
Language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
Target Chapters: ${metadata.targetChapters}
Words Per Chapter: ${metadata.targetWordsPerChapter}
${styleInfo}${languageInstruction}

Please create a complete outline following the format specified in your instructions.`;
```

### Code Change for Build Frodo Prompt

**Current:**
```javascript
const prompt = `Write chapter ${chapterNum} based on the following:

Novel Outline:
${typeof loadedOutline === 'string' ? loadedOutline : JSON.stringify(loadedOutline)}

Chapter to write: ${chapterNum}
Target word count: ${metadata.targetWordsPerChapter}
Language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
${languageInstruction}

${bibleContext ? `\n## STORY BIBLE CONTEXT\n${bibleContext}` : ''}

Please write the complete chapter following the format specified in your instructions.`;
```

**Fixed (add style fields):**
```javascript
// Build style section only if any style field is set
const styleSection = [];
if (metadata.pov) styleSection.push(`POV: ${metadata.pov} (${
  metadata.pov === 'first_person' ? 'First person narrator' :
  metadata.pov === 'omniscient' ? 'Third person omniscient' :
  'Third person limited - stay in one character\'s head per scene'
})`);
if (metadata.tone) styleSection.push(`Tone: ${metadata.tone}`);
if (metadata.styleReference) styleSection.push(`Style Reference: Write in the style of ${metadata.styleReference}`);
const styleInfo = styleSection.length > 0 ? '\n' + styleSection.join('\n') + '\n' : '';

const prompt = `Write chapter ${chapterNum} based on the following:

Novel Outline:
${typeof loadedOutline === 'string' ? loadedOutline : JSON.stringify(loadedOutline)}

Chapter to write: ${chapterNum}
Target word count: ${metadata.targetWordsPerChapter}
Language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
${styleInfo}${languageInstruction}

${bibleContext ? `\n## STORY BIBLE CONTEXT\n${bibleContext}` : ''}

Please write the complete chapter following the format specified in your instructions.`;
```

### Apply to Revision Prompts Too

Add the same `styleSection` code block to:
- **Build Gandalf Prompt (revise)** - for outline revisions
- **Build Frodo Prompt (revise)** - for chapter revisions
- **Build Gandalf Prompt (plan_chapter)** - for chapter planning

The style fields should persist through revisions to maintain consistency.

### Verification

After applying this fix:
1. Create a novel with `/novel create style_reference:"金庸" pov:first_person tone:dark`
2. Generate the outline with `/novel write`
3. The outline should reflect 金庸's style (wuxia conventions, poetic prose)
4. Write a chapter - it should maintain first-person POV and dark tone
5. The style should persist through any revisions

---

## Fix 8: Two-Stage Planning (Jan 2026)

### Problem

The current system has Gandalf generate ALL chapter summaries (1-100) in the initial outline. This creates several issues:

1. **Quality**: 100 chapter summaries upfront are low-quality and generic
2. **Redundancy**: Makes `/novel plan_chapter` redundant - chapters are already summarized
3. **No Bible Context**: Initial outline generated before Story Bible exists
4. **Inflexibility**: Can't adapt story based on how chapters actually develop

### Solution: Two-Stage Planning Architecture

**Stage 1**: `/novel write` (no outline) → HIGH-LEVEL OUTLINE
- Synopsis (full story arc, beginning/middle/end)
- Story Arc Milestones (5-10 major turning points, NOT per-chapter)
- Characters (profiles, arcs)
- Worldbuilding (setting, power system, factions)
- Themes
- Story Bible foundation

**Stage 2**: `/novel plan_chapter chapter:1 count:5` → DETAILED CHAPTER PLANS
- Scene breakdown per chapter
- Key beats and emotional moments
- Dialogue notes
- Foreshadowing elements
- Connection points
- **Uses bible context from Stage 1!**

### Files Already Updated

The `gandalf-planning.md` prompt has been updated to:
- Remove `## CHAPTERS` section
- Add `## STORY ARC MILESTONES` section
- Update examples to show high-level planning only
- Update Story Bible section to remove chapter-specific references

### N8N Update Required: Build Gandalf Prompt

**Node**: "Build Gandalf Prompt" (Code)

**Replace the prompt section with this updated version:**

```javascript
// Build Gandalf prompt for HIGH-LEVEL outline (no chapter summaries)
const input = $input.first().json.body || $input.first().json;
const metadata = input.metadata || {};

// CRITICAL: Get the system prompt from environment
const systemPrompt = $env.GANDALF_PROMPT || 'You are Gandalf, the Planning Agent for ILUVATAR novel writing system. Create high-level novel outlines including a STORY BIBLE section.';

// Build style section only if any style field is set
const styleSection = [];
if (metadata.pov) styleSection.push(`POV: ${metadata.pov} (${
  metadata.pov === 'first_person' ? 'First person narrator' :
  metadata.pov === 'omniscient' ? 'Third person omniscient' :
  'Third person limited - stay in one character\'s head per scene'
})`);
if (metadata.tone) styleSection.push(`Tone: ${metadata.tone}`);
if (metadata.styleReference) styleSection.push(`Style Reference: Write in the style of ${metadata.styleReference}`);
const styleInfo = styleSection.length > 0 ? '\n' + styleSection.join('\n') + '\n' : '';

// CRITICAL: Language enforcement instruction
const languageInstruction = metadata.language === 'zh'
  ? `

**关键要求 - 语言**: 你必须使用中文（简体中文）撰写整个大纲！
- 标题必须是中文
- 故事简介必须是中文
- 故事里程碑必须是中文
- 角色名称必须是中文（如：林威、陈风、苏雨晴）
- 世界观设定必须是中文
- 禁止使用任何英文！整个输出必须是100%中文。`
  : `

**LANGUAGE REQUIREMENT**: Write the entire outline in English.`;

const prompt = `Create a HIGH-LEVEL OUTLINE for a novel with the following specifications:

Title: ${metadata.title}
Genre: ${metadata.genre}
Premise: ${metadata.premise || 'No specific premise provided'}
Language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
Target Chapters: ${metadata.targetChapters}
Words Per Chapter: ${metadata.targetWordsPerChapter}
${styleInfo}

**OUTPUT REQUIREMENTS**:
- Do NOT include individual chapter summaries
- Focus on the overall story arc and major milestones (5-10 turning points)
- Detailed chapter planning will be done separately via /plan_chapter command

Your output should include:
- Title
- Synopsis (full story arc from beginning to end in 2-3 paragraphs)
- Story Arc Milestones (5-10 major turning points with approximate % markers)
- Character profiles with arcs
- Worldbuilding foundations
- Themes
- Story Bible foundation (characters, plot threads, world facts, Chekhov's guns)
${languageInstruction}

Please create the high-level outline following the format specified in your instructions.`;

// CRITICAL: Include systemPrompt in return!
return { json: { prompt, systemPrompt, metadata, novelId: input.novelId } };
```

### Workflow for New Novel

After this fix, the workflow becomes:

```
1. User: /novel create premise:"A cultivator discovers..."
2. User: /novel write (no outline exists)
   → Gandalf generates HIGH-LEVEL outline (synopsis, milestones, characters, bible)
3. User: /novel approve (approves outline)
4. User: /novel plan_chapter chapter:1 count:5
   → Gandalf generates DETAILED plans for chapters 1-5 (with bible context!)
5. User: /novel write
   → Frodo writes chapter 1 (uses detailed plan + bible context)
6. Repeat steps 4-5 for remaining chapters
```

### Verification

After applying this fix:

1. Create a new novel with `/novel create premise:"Test premise"`
2. Run `/novel write` to generate outline
3. **CHECK**: Outline should have `## STORY ARC MILESTONES` with 5-10 major beats
4. **CHECK**: Outline should NOT have `## CHAPTERS` with 100 chapter summaries
5. Approve the outline with `/novel approve`
6. Run `/novel plan_chapter chapter:1 count:3`
7. **CHECK**: Detailed plans should include scene breakdowns, dialogue notes, etc.
8. Run `/novel write` to write chapter 1
9. **CHECK**: Chapter should follow the detailed plan from step 6
