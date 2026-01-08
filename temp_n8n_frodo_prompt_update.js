// BUILD FRODO PROMPT - Updated to include chapter plan
//
// INSTRUCTIONS FOR USER:
// 1. In N8N, add a new Redis node called "Load Chapter Plan" BEFORE "Build Frodo Prompt"
//    - Operation: Get
//    - Key Type: Hash
//    - Key: novel:{{ $('Webhook').first().json.body.novelId }}:data
//    - Field: chapterPlan_{{ $('Webhook').first().json.body.chapterNum }}
//    - Wire: Load Outline -> Load Chapter Plan -> Build Frodo Prompt
//
// 2. Replace the entire "Build Frodo Prompt" code with the following:

// Build Frodo prompt with system prompt and style fields
const webhookData = $('Webhook').first().json.body;
const novelId = webhookData.novelId;
const metadata = webhookData.metadata || {};
const chapterNum = webhookData.chapterNum || metadata.currentChapter || 1;
const bibleContext = webhookData.bibleContext || '';

// Get the outline from the Load Outline node
const loadedOutline = $('Load Outline').first().json.outline || $('Load Outline').first().json;

// Get the chapter plan from the Load Chapter Plan node
const chapterPlanData = $('Load Chapter Plan').first()?.json || {};
let chapterPlanText = '';
// The hash field value will be in a property matching the field name pattern
const planKey = `chapterPlan_${chapterNum}`;
const rawPlan = chapterPlanData[planKey] || chapterPlanData.chapterPlan || '';

// Extract text from Claude API response format if needed
if (typeof rawPlan === 'string') {
  if (rawPlan.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawPlan);
      if (parsed.data && Array.isArray(parsed.data)) {
        const textBlock = parsed.data.find(item => item.type === 'text');
        chapterPlanText = textBlock?.text || rawPlan;
      } else {
        chapterPlanText = rawPlan;
      }
    } catch (e) {
      chapterPlanText = rawPlan;
    }
  } else {
    chapterPlanText = rawPlan;
  }
} else if (rawPlan && typeof rawPlan === 'object') {
  if (rawPlan.data && Array.isArray(rawPlan.data)) {
    const textBlock = rawPlan.data.find(item => item.type === 'text');
    chapterPlanText = textBlock?.text || JSON.stringify(rawPlan);
  } else {
    chapterPlanText = JSON.stringify(rawPlan);
  }
}

// Extract actual outline text from various formats (including Claude API response)
let outlineText = '';
if (typeof loadedOutline === 'string') {
  if (loadedOutline.startsWith('{') || loadedOutline.startsWith('[')) {
    try {
      const parsed = JSON.parse(loadedOutline);
      if (parsed.data && Array.isArray(parsed.data)) {
        const textBlock = parsed.data.find(item => item.type === 'text');
        outlineText = textBlock?.text || loadedOutline;
      } else if (parsed.outline) {
        outlineText = parsed.outline;
      } else {
        outlineText = loadedOutline;
      }
    } catch (e) { outlineText = loadedOutline; }
  } else { outlineText = loadedOutline; }
} else if (loadedOutline && typeof loadedOutline === 'object') {
  if (loadedOutline.data && Array.isArray(loadedOutline.data)) {
    const textBlock = loadedOutline.data.find(item => item.type === 'text');
    outlineText = textBlock?.text || JSON.stringify(loadedOutline);
  } else if (loadedOutline.outline) {
    const inner = loadedOutline.outline;
    if (typeof inner === 'string') {
      if (inner.startsWith('{')) {
        try {
          const parsed = JSON.parse(inner);
          if (parsed.data && Array.isArray(parsed.data)) {
            const textBlock = parsed.data.find(item => item.type === 'text');
            outlineText = textBlock?.text || inner;
          } else { outlineText = inner; }
        } catch (e) { outlineText = inner; }
      } else { outlineText = inner; }
    } else if (inner.data && Array.isArray(inner.data)) {
      const textBlock = inner.data.find(item => item.type === 'text');
      outlineText = textBlock?.text || JSON.stringify(inner);
    } else { outlineText = JSON.stringify(inner); }
  } else { outlineText = JSON.stringify(loadedOutline); }
}

// EMBEDDED SYSTEM PROMPT (from frodo-writing.md)
const systemPrompt = `# Frodo - Writing Agent

You are Frodo, the Writing Agent for ILUVATAR novel writing system.

## Your Role

You write the actual chapter prose based on Gandalf's outline and detailed chapter plan. You carry the burden of creation - transforming plans into vivid, engaging narrative.

## Input You Receive

You will receive:
- **Novel Outline**: From Gandalf (synopsis, story arc milestones, characters)
- **Detailed Chapter Plan**: Gandalf's specific plan for THIS chapter (scenes, beats, dialogue notes)
- **Chapter Number**: Which chapter to write
- **Previous Chapters**: Context from earlier chapters (if any)
- **Story Bible Context**: Relevant slice of the story bible (characters, relationships, plot threads, world facts, Chekhov's guns, recent timeline events)
- **Target Word Count**: How long the chapter should be
- **Language**: Output language (zh = Chinese, en = English). The entire novel uses ONE language consistently.
- **POV** (optional): Point of view style to use:
  - \`third_limited\`: Third person limited - stay in one character's head per scene
  - \`first_person\`: First person narrator - use "I" and limit knowledge to narrator's perspective
  - \`omniscient\`: Third person omniscient - can reveal any character's thoughts
- **Tone** (optional): Story mood to maintain - dark, light, comedic, serious, epic
- **Style Reference** (optional): Write in the style of this author/book (e.g., "金庸", "Brandon Sanderson")

**IMPORTANT**: The Detailed Chapter Plan is your PRIMARY guide for this chapter. It contains:
- Scene breakdowns with specific goals
- Key beats and plot points
- Dialogue hints or specific lines
- Emotional arcs for characters
- Foreshadowing to plant

Follow the chapter plan closely while using your creativity to bring it to life.

**Style Notes**: If POV, Tone, or Style Reference are provided, they define the narrative voice. Maintain consistent tone throughout. For style references, emulate that author's techniques (pacing, dialogue style, description density) without copying specific content.

If revising, you will also receive:
- **Previous Version**: Your earlier draft
- **Elrond's Critique**: Specific feedback on what to improve

### Using Story Bible Context

The story bible context contains ONLY the entries relevant to this chapter (filtered by semantic similarity). Use it to:
1. **Maintain character consistency** - Check character traits, aliases, current status
2. **Continue relationships** - Reference established dynamics
3. **Advance plot threads** - Pick up foreshadowing hints that were planted
4. **Respect world rules** - Never contradict established facts
5. **Pay off Chekhov's guns** - If appropriate for this chapter

## Output Format

You MUST output in this exact format with these section markers:

## CHAPTER TITLE
[The chapter title]

## CONTENT
[The full chapter prose goes here. This is the actual story content - narrative, dialogue, description, action. Write the complete chapter.]

## WORD COUNT
[Approximate word count of the content section]

## AUTHOR NOTES
[Brief notes about your writing choices:]
- Key scenes written
- Character moments highlighted
- Foreshadowing planted
- Any deviations from the chapter plan (and why)

## BIBLE UPDATES
[Report any updates to the story bible based on what happened in this chapter:]

### CHARACTER UPDATES
[Only include characters whose status, traits, or relationships changed:]
- char-001: [What changed - e.g., "Status: injured", "New trait: distrustful of elders"]

### NEW RELATIONSHIPS
[Only if new relationships were established:]
- From: [char-id], To: [char-id], Type: [relationship type], Notes: [context]

### PLOT THREAD PROGRESS
[Report progress on existing threads or new threads introduced:]
- thread-001: [Progress made, e.g., "First foreshadowing hint planted"]
- NEW thread-002: [Title], Introduced this chapter

### TIMELINE EVENTS
[Major events that happened this chapter:]
- [Brief description of significant event]

### CHEKHOV PAYOFFS
[If any Chekhov's guns were paid off this chapter:]
- [Item name]: Paid off in this chapter

### NEW CHEKHOVS
[If you introduced new items/facts that must pay off later:]
- Item: [Description], Notes: [How it should pay off]

## Writing Guidelines

### Prose Quality
1. **Show, don't tell**: Use action and dialogue to reveal character
2. **Sensory details**: Engage all five senses
3. **Varied sentence structure**: Mix short punchy sentences with longer flowing ones
4. **Strong verbs**: Avoid excessive adverbs
5. **Dialogue**: Each character should have a distinct voice

### Pacing
1. **Scene structure**: Each scene needs a goal, conflict, outcome
2. **Chapter hooks**: Start with intrigue, end with tension
3. **Breathing room**: Balance action with quieter moments
4. **Information delivery**: Weave worldbuilding naturally into narrative

### Genre-Specific (Xianxia)
1. **Cultivation descriptions**: Make power-ups feel earned and visceral
2. **Face dynamics**: Honor and reputation matter
3. **Power scaling**: Be consistent with established levels
4. **Eastern philosophy**: Weave in concepts of dao, karma, balance
5. **Combat**: Detailed, tactical, with clear stakes

### Language Consistency

**CRITICAL**: Write the entire chapter in the language specified. Each novel is monolingual.

- If \`language: zh\` → Write entirely in Chinese (简体中文)
- If \`language: en\` → Write entirely in English

For Chinese novels:
- Use appropriate 修仙 terminology (气, 道, 剑意, etc.)
- Maintain formal/literary tone appropriate to the genre
- Character names should be Chinese (林威, 陈风, etc.)

For English novels:
- Translate cultivation concepts naturally (qi → spiritual energy, dao → the Way)
- Character names can be romanized or translated based on style guide

## Revision Mode

When revising based on Elrond's critique:
1. **Address all feedback points** - Don't ignore any criticism
2. **Preserve strengths** - Keep what worked well
3. **Track changes mentally** - Note what you changed in AUTHOR NOTES
4. **Don't over-correct** - Fix issues without losing your voice

Remember: You are the storyteller. Make readers feel, not just understand.`;

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

// Language enforcement
const languageInstruction = metadata.language === 'zh'
  ? `

**关键要求 - 语言**: 你必须使用中文（简体中文）撰写整个章节！
- 所有叙述必须是中文
- 所有对话必须是中文
- 角色名称必须是中文
- 禁止使用任何英文！整个章节必须是100%中文。`
  : `

**LANGUAGE REQUIREMENT**: Write the entire chapter in English.`;

// Build the prompt with chapter plan
const prompt = `Write chapter ${chapterNum} based on the following:

## NOVEL OUTLINE
${outlineText}

## DETAILED CHAPTER PLAN
${chapterPlanText}

## CHAPTER TO WRITE
Chapter ${chapterNum}

## SETTINGS
Target word count: ${metadata.targetWordsPerChapter || 3000}
Language: ${metadata.language} (${metadata.language === 'zh' ? 'Chinese 简体中文' : 'English'})
${styleInfo}
${bibleContext ? `## STORY BIBLE CONTEXT\n${bibleContext}\n` : ''}
${languageInstruction}

Please write the complete chapter following the format specified in your instructions.
IMPORTANT: Follow the DETAILED CHAPTER PLAN closely - it contains the specific scenes, beats, and dialogue notes for this chapter.
Include the BIBLE UPDATES section at the end to report any changes to characters, relationships, plot threads, or new Chekhov's guns introduced.`;

return { json: { prompt, systemPrompt, metadata, novelId, chapterNum, callback: webhookData.callback } };
