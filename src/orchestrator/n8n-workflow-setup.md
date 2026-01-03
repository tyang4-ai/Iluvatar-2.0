# ILUVATAR N8N Workflow Setup

## Overview

The N8N workflow orchestrates the three agents (Gandalf, Frodo, Elrond) in response to Discord bot triggers.

**Workflow URL**: http://50.18.245.194:5678

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
  "action": "outline" | "write" | "critique" | "revise_outline" | "revise_chapter",
  "novelId": "novel-abc123",
  "metadata": { "title": "...", "genre": "...", "language": "zh|en", ... },
  "chapterNum": 1,
  "feedback": "...",
  "bibleContext": "## STORY BIBLE CONTEXT\n\n### CHARACTERS\n...",
  "callback": {
    "discordChannelId": "123456789012345678",
    "botToken": "MTQ0OTcwNjcxMDU5MDU1..."
  }
}
```

**Field Notes:**
- `bibleContext`: Pre-formatted story bible slice (characters, relationships, plot threads, Chekhov's guns, timeline). Included for `write`, `critique`, and `revise_chapter` actions. Pass this directly to the agent prompt.
- `chapterNum`: Which chapter is being written/critiqued/revised
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
