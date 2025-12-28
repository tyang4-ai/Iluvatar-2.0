# Skill: MVP Scoper

Define the minimum viable product for your hackathon project - what to build first, what to cut, and what to fake.

## How to Use
Provide your full vision and I'll help you scope down to an achievable MVP.

**Input needed:**
- Full project vision (all features you want)
- Time remaining (hours)
- Team size
- Current progress (if any)

## What You'll Get

```json
{
  "mvp_features": [
    {
      "feature": "User login",
      "priority": "MUST",
      "effort_hours": 2,
      "implementation": "Use NextAuth with GitHub OAuth"
    }
  ],
  "cut_features": [
    {
      "feature": "Multi-language support",
      "reason": "Nice-to-have, not core value prop"
    }
  ],
  "fake_features": [
    {
      "feature": "AI recommendations",
      "how_to_fake": "Hardcode 3 good recommendations, demo those paths only"
    }
  ],
  "demo_script": "Show login → upload → results (the golden path)",
  "time_allocation": {
    "core_features": "60%",
    "ui_polish": "20%",
    "demo_prep": "20%"
  }
}
```

## The MVP Framework

### MUST Have (Demo fails without it)
- Core value proposition
- Main user flow works
- Looks presentable

### SHOULD Have (Makes demo better)
- Error handling for common cases
- Loading states
- Basic responsive design

### COULD Have (If time permits)
- Edge case handling
- Additional features
- Animations

### WON'T Have (Cut ruthlessly)
- Admin panels
- User settings
- Multiple auth methods
- Full CRUD (often just Create + Read)

## Faking Strategies

| Instead of... | Fake it with... |
|---------------|-----------------|
| Real AI API | Hardcoded responses for demo cases |
| Full database | JSON files or localStorage |
| User accounts | Single hardcoded user |
| File upload processing | Pre-processed sample files |
| Real-time updates | Timed setTimeout refreshes |
| Payment integration | "Payment successful" button |

## Example

**Input:** "I want to build a full project management tool with teams, tasks, Gantt charts, time tracking, and AI task suggestions"

**Output:**
```json
{
  "mvp_features": [
    {
      "feature": "Create a project",
      "priority": "MUST",
      "effort_hours": 1,
      "implementation": "Simple form → store in state"
    },
    {
      "feature": "Add tasks to project",
      "priority": "MUST",
      "effort_hours": 2,
      "implementation": "Task list with add/complete toggle"
    },
    {
      "feature": "AI task suggestions",
      "priority": "MUST",
      "effort_hours": 1,
      "implementation": "FAKE: Hardcode 5 smart suggestions per project type"
    }
  ],
  "cut_features": [
    {"feature": "Teams/collaboration", "reason": "Adds auth complexity"},
    {"feature": "Gantt charts", "reason": "Complex UI, not core value"},
    {"feature": "Time tracking", "reason": "Separate feature, not MVP"}
  ],
  "demo_script": "Create project → AI suggests tasks → Add a few → Mark complete → Show progress",
  "honest_assessment": "You described a 6-month product. For hackathon: task list + AI suggestions = differentiated MVP"
}
```
