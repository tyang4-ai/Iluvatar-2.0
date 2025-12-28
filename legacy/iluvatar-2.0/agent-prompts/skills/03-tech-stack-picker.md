# Skill: Tech Stack Picker

Choose the right technologies for your hackathon project based on requirements, team skills, and time constraints.

## How to Use
Tell me what you're building and I'll recommend a tech stack.

**Input needed:**
- Project type (web app, mobile, CLI, API, etc.)
- Key requirements (real-time, AI, payments, etc.)
- Team skills (what you know well)
- Deployment needs (demo-only vs live)

## What You'll Get

```json
{
  "recommended_stack": {
    "frontend": "Next.js 14",
    "backend": "Next.js API Routes",
    "database": "Supabase (PostgreSQL)",
    "auth": "NextAuth.js",
    "deployment": "Vercel",
    "extras": ["Tailwind CSS", "shadcn/ui"]
  },
  "why_this_stack": [
    "All-in-one: less configuration time",
    "Team knows React already",
    "Free tier covers hackathon needs"
  ],
  "alternatives_considered": [
    {
      "stack": "React + Express + MongoDB",
      "rejected_because": "More setup time, separate deployments"
    }
  ],
  "gotchas": [
    "Supabase free tier has connection limits",
    "Vercel serverless functions timeout at 10s"
  ],
  "boilerplate_command": "npx create-next-app@latest --typescript --tailwind --app"
}
```

## Hackathon Stack Principles

### Speed > Perfection
- Use what you know
- Prefer all-in-one solutions
- Free tiers are your friend
- Boilerplates save hours

### Common Winning Stacks

**Web App (Full-stack)**
```
Next.js + Supabase + Vercel
- Why: Zero config, free hosting, built-in auth
```

**AI/ML Project**
```
Next.js + OpenAI API + Vercel
- Why: AI is the hard part, simplify everything else
```

**Real-time App**
```
Next.js + Supabase Realtime + Vercel
- Why: WebSocket complexity handled for you
```

**Mobile-first**
```
React Native + Expo + Firebase
- Why: Cross-platform, instant reload, easy backend
```

**Data/Visualization**
```
Next.js + D3.js + Vercel
- Why: React + D3 is powerful combo
```

### Red Flags (Avoid in Hackathons)

| Technology | Why Risky |
|------------|-----------|
| Kubernetes | Overkill, setup takes hours |
| GraphQL | REST is faster to build |
| Microservices | Monolith is fine for demos |
| Custom auth | Use OAuth/NextAuth |
| Self-hosted DB | Use managed service |
| New framework you've never used | Stick to what you know |

## Example

**Input:**
- Project: Real-time collaborative document editor
- Requirements: Multiple users editing, see changes live
- Team: 2 devs, strong React, some Node
- Needs to work for demo

**Output:**
```json
{
  "recommended_stack": {
    "frontend": "Next.js 14 with App Router",
    "backend": "Next.js API Routes + Liveblocks",
    "database": "Liveblocks (handles real-time state)",
    "auth": "Hardcoded demo users (skip auth for hackathon)",
    "deployment": "Vercel",
    "extras": ["Tiptap editor", "Tailwind CSS"]
  },
  "why_this_stack": [
    "Liveblocks handles ALL real-time complexity",
    "Tiptap is a plug-and-play rich text editor",
    "Skip auth entirely - just demo with 2 browser windows"
  ],
  "gotchas": [
    "Liveblocks free tier: 100 MAU (plenty for demo)",
    "Tiptap learning curve: 2-3 hours to customize"
  ],
  "time_saved": "Building real-time sync from scratch: 8+ hours. With Liveblocks: 2 hours."
}
```
