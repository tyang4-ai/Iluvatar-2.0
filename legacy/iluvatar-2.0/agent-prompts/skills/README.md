# Hackathon Skills

Practical, reusable prompts for common hackathon tasks. Unlike the LOTR-themed agent prompts, these are direct skill guides you can use in any conversation.

## Quick Reference

| Skill | When to Use | Time to Apply |
|-------|-------------|---------------|
| [Idea Validator](01-idea-validator.md) | Before committing to an idea | 5 min |
| [MVP Scoper](02-mvp-scoper.md) | After choosing idea, before building | 10 min |
| [Tech Stack Picker](03-tech-stack-picker.md) | Before writing any code | 5 min |
| [Rapid Prototyper](04-rapid-prototyper.md) | When building features | Ongoing |
| [Bug Squasher](05-bug-squasher.md) | When stuck on errors | 2-15 min |
| [Pitch Crafter](06-pitch-crafter.md) | 2-4 hours before submission | 30 min |
| [Time Boxer](07-time-boxer.md) | At start, and every 4-6 hours | 10 min |
| [UI Polisher](08-ui-polisher.md) | Last 2-4 hours | 30-60 min |
| [Last Hour Checklist](09-last-hour-checklist.md) | 60 minutes before deadline | 60 min |
| [Judge Q&A Prep](10-judge-qa-prep.md) | Before demo/judging | 20 min |

---

## How to Use These Skills

### Method 1: Copy-Paste into Claude
1. Open a new Claude conversation
2. Copy the entire skill file content
3. Paste it as your first message
4. Follow up with your specific request

**Example:**
```
[Paste contents of 01-idea-validator.md]

My idea: An app that uses AI to generate personalized workout plans based on available equipment and time constraints.

Hackathon: 24 hours
Team: 2 developers (React + Python experience)
Theme: Health & Wellness
```

### Method 2: Reference in Existing Conversation
If you're already in a conversation:
```
"Act as an Idea Validator. Evaluate this hackathon idea for feasibility:
[describe your idea]"
```

### Method 3: Chain Skills Together
Use multiple skills in sequence:

```
1. [Idea Validator] → Pick best idea
2. [MVP Scoper] → Define what to build
3. [Tech Stack Picker] → Choose technologies
4. [Time Boxer] → Create schedule
5. [Build with Rapid Prototyper along the way]
6. [Bug Squasher when stuck]
7. [UI Polisher] → Make it look good
8. [Pitch Crafter] → Prepare submission
9. [Last Hour Checklist] → Submit!
10. [Judge Q&A Prep] → Nail the demo
```

---

## Hackathon Timeline Quick Guide

### Hour 0-2: Planning
- ✅ **Idea Validator** - Evaluate 2-3 ideas
- ✅ **MVP Scoper** - Define minimal scope
- ✅ **Tech Stack Picker** - Lock in technologies

### Hour 2-12: Building
- ✅ **Rapid Prototyper** - Get code fast
- ✅ **Bug Squasher** - When stuck
- ✅ **Time Boxer** - Check progress at hour 6

### Hour 12-20: Features + Polish
- ✅ **Time Boxer** - Adjust schedule at hour 12
- ✅ **UI Polisher** - Start in final 4 hours
- ✅ **Rapid Prototyper** - For remaining features

### Hour 20-24: Submission
- ✅ **Pitch Crafter** - 3-4 hours before deadline
- ✅ **Last Hour Checklist** - Final 60 minutes
- ✅ **Judge Q&A Prep** - After submission, before demo

---

## Skill Categories

### Planning Skills
Help you make decisions before writing code.
- **Idea Validator**: Is this idea worth building?
- **MVP Scoper**: What's the smallest thing that works?
- **Tech Stack Picker**: What technologies should I use?
- **Time Boxer**: How should I spend my hours?

### Building Skills
Help you write code faster.
- **Rapid Prototyper**: Give me working code for common patterns
- **Bug Squasher**: Fix this error quickly

### Finishing Skills
Help you submit and present well.
- **UI Polisher**: Make it look professional
- **Pitch Crafter**: Write compelling submission materials
- **Last Hour Checklist**: Don't forget anything
- **Judge Q&A Prep**: Answer questions confidently

---

## Pro Tips

### Start with Time Boxing
Before anything else, know how many hours you have and sketch a rough schedule. Adjust every 4-6 hours.

### Validate Ideas Quickly
Don't spend 2 hours debating. Use Idea Validator for 5 minutes per idea, pick one, move on.

### Cut Early, Cut Often
If something isn't working by the 50% mark, use MVP Scoper to cut scope. A finished MVP beats an unfinished "full" product.

### Save 20% for Polish
A polished simple project beats a rough complex one. Budget time for UI Polisher and demo prep.

### Practice the Demo
Use Pitch Crafter output and practice 3-5 times. Judges remember smooth demos.

---

## vs. Agent Prompts

| Aspect | Skills | Agent Prompts |
|--------|--------|---------------|
| Format | Practical guides + templates | Roleplay prompts |
| Personality | None - just the task | LOTR character personas |
| Use case | Quick, specific tasks | Immersive work sessions |
| Examples | Idea Validator, Bug Squasher | Gandalf, Gimli, Galadriel |

Use **Skills** when you need quick answers.
Use **Agent Prompts** when you want a focused work session with a specialized "assistant."
