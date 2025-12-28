# Skill: Time Boxer

Create a realistic hackathon schedule. Know what to work on each hour.

## How to Use
Tell me your situation and I'll create a time-boxed schedule.

**Input needed:**
- Total time remaining (hours)
- What you're building
- Current progress (0-100%)
- Team size
- Any fixed deadlines (demo time, submission deadline)

## What You'll Get

```json
{
  "schedule": [
    {
      "block": "Hour 1-2",
      "focus": "Core feature A",
      "deliverable": "Working upload flow",
      "checkpoint": "Can upload and see file list"
    }
  ],
  "buffer_time": "2 hours reserved for bugs/polish",
  "cut_triggers": [
    "If X not done by hour 6, cut feature Y"
  ],
  "energy_management": "Take a 10min break every 2 hours"
}
```

## Standard Hackathon Phases

### 24-Hour Hackathon
```
Hours 1-2:   Planning & Setup (10%)
Hours 3-10:  Core Development (35%)
Hours 11-16: Feature Completion (25%)
Hours 17-20: Integration & Polish (15%)
Hours 21-22: Demo Prep (10%)
Hours 23-24: Buffer & Submission (5%)
```

### 48-Hour Hackathon
```
Day 1 (Hours 1-12):
  - Planning: 2h
  - Core features: 8h
  - First integration: 2h

Day 2 (Hours 13-36):
  - Additional features: 12h
  - Polish: 6h
  - Testing: 4h
  - Sleep: 2h (yes, really)

Day 3 (Hours 37-48):
  - Demo prep: 4h
  - Bug fixes: 4h
  - Submission: 2h
  - Buffer: 2h
```

## Time Box Templates

### Solo Developer (24h)
```
Hour 1:    Idea → Architecture sketch
Hour 2-3:  Project setup, boilerplate
Hour 4-8:  Core feature #1 (the main value)
Hour 9-12: Core feature #2
Hour 13-16: UI polish, make it look good
Hour 17-18: Demo data setup
Hour 19-20: Practice demo 3x
Hour 21-22: Submission materials
Hour 23-24: Buffer, submit early
```

### Team of 3 (24h)
```
All Together (Hour 1-2):
  - Agree on idea and MVP scope
  - Split responsibilities
  - Set up shared repo

Parallel Work (Hour 3-16):
  - Dev 1: Backend/API
  - Dev 2: Frontend/UI
  - Dev 3: Integration/special feature

Sync Points (Every 4 hours):
  - Hour 6: First integration test
  - Hour 10: Feature freeze decision
  - Hour 14: Full flow works

Final Push (Hour 17-24):
  - All: Polish and bug fixes
  - One person: Demo and pitch prep
  - One person: Submission materials
```

## Red Flags & Pivots

**Hour 6 Checkpoint:**
If your core feature doesn't work, simplify NOW.

**Hour 12 Checkpoint:**
If you haven't integrated anything, stop building new features.

**Hour 18 Checkpoint:**
If demo isn't working, cut features and polish what works.

## Example Schedule

**Input:**
- 12 hours remaining
- Building: AI document analyzer
- Progress: 40% (backend done, no frontend)
- Solo developer
- Demo at hour 12

**Output:**

```json
{
  "schedule": [
    {
      "block": "Hours 1-3",
      "focus": "Minimal UI",
      "deliverable": "Upload form + results display",
      "checkpoint": "Can upload file and see raw API response"
    },
    {
      "block": "Hours 4-6",
      "focus": "Connect frontend to backend",
      "deliverable": "Full flow works",
      "checkpoint": "Upload → Process → Display results"
    },
    {
      "block": "Hours 7-8",
      "focus": "UI polish",
      "deliverable": "Looks presentable",
      "checkpoint": "Would not be embarrassed to demo"
    },
    {
      "block": "Hours 9-10",
      "focus": "Demo prep",
      "deliverable": "Sample files, script, practice",
      "checkpoint": "Can do demo in under 3 min"
    },
    {
      "block": "Hours 11-12",
      "focus": "Buffer + submission",
      "deliverable": "Submitted, working demo",
      "checkpoint": "Done!"
    }
  ],
  "cut_triggers": [
    "If UI not connected by hour 5, use plain HTML/no styling",
    "If stuck on any bug > 30min, hardcode around it"
  ],
  "critical_advice": "You have NO time for new features. Polish what exists."
}
```

## Energy Tips

- **Hour 0-8:** High energy, tackle hard problems
- **Hour 8-16:** Steady work, avoid new complexity
- **Hour 16-20:** Fatigue sets in, focus on polish not features
- **Hour 20-24:** Adrenaline returns, demo prep and submission

**Sleep:** Even 2-3 hours helps. A rested brain at hour 20 beats a zombie at hour 20.
