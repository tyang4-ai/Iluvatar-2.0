# ILUVATAR Agent Prompts

These are standalone roleplay prompts extracted from the ILUVATAR 2.0 hackathon automation system. You can use these manually in any Claude conversation by copying the prompt content.

> **Also available:** [Hackathon Skills](skills/) - practical, non-roleplay prompts for common tasks (idea validation, bug fixing, pitch crafting, etc.)

## Planning Phase

| Agent | File | Use Case |
|-------|------|----------|
| **Gandalf** | [01-gandalf-brainstorming.md](01-gandalf-brainstorming.md) | Generate 3 hackathon ideas with feasibility scores |
| **Radagast** | [02-radagast-architecture.md](02-radagast-architecture.md) | Design tech stack and file structure |
| **Denethor** | [03-denethor-task-distribution.md](03-denethor-task-distribution.md) | Break architecture into ordered tasks |

## Development Phase

| Agent | File | Use Case |
|-------|------|----------|
| **Gimli** | [04-gimli-backend-development.md](04-gimli-backend-development.md) | Write backend code (APIs, database, logic) |
| **Legolas** | [05-legolas-frontend-development.md](05-legolas-frontend-development.md) | Write frontend code (React, UI, pages) |

## Quality & Debugging

| Agent | File | Use Case |
|-------|------|----------|
| **Galadriel** | [06-galadriel-code-review.md](06-galadriel-code-review.md) | Review code for quality and security |
| **Elrond** | [07-elrond-debugging.md](07-elrond-debugging.md) | Debug errors and propose fixes |
| **Treebeard** | [08-treebeard-escalation-debugging.md](08-treebeard-escalation-debugging.md) | Systematic 6-layer debugging escalation |
| **Grima** | [27-grima-critic.md](27-grima-critic.md) | Ruthless critic - tears apart code, plans, and ideas |

## Submission Phase

| Agent | File | Use Case |
|-------|------|----------|
| **Saruman** | [09-saruman-submission-materials.md](09-saruman-submission-materials.md) | Write DevPost, README, pitch script |
| **Sauron** | [10-sauron-demo-video-script.md](10-sauron-demo-video-script.md) | Create timed demo video script |

## Testing & Deployment

| Agent | File | Use Case |
|-------|------|----------|
| **Arwen** | [18-arwen-test-planning.md](18-arwen-test-planning.md) | Plan comprehensive test strategies |
| **Thorin** | [19-thorin-test-writing.md](19-thorin-test-writing.md) | Write actual test code |
| **Eomer** | [20-eomer-deployment.md](20-eomer-deployment.md) | Plan and execute deployments |
| **Haldir** | [21-haldir-deployment-verification.md](21-haldir-deployment-verification.md) | Verify deployment success |

## Support Agents

| Agent | File | Use Case |
|-------|------|----------|
| **Shadowfax** | [11-shadowfax-context-compression.md](11-shadowfax-context-compression.md) | Compress long contexts for continuation |
| **Faramir** | [12-faramir-quality-assessment.md](12-faramir-quality-assessment.md) | Score project and assess submission readiness |
| **Pippin** | [13-pippin-discord-communication.md](13-pippin-discord-communication.md) | Format progress updates for Discord |
| **Aragorn** | [14-aragorn-decision-maker.md](14-aragorn-decision-maker.md) | Make critical project decisions |
| **Eowyn** | [15-eowyn-creative-problem-solver.md](15-eowyn-creative-problem-solver.md) | Find creative solutions to blockers |
| **Gollum** | [16-gollum-edge-case-finder.md](16-gollum-edge-case-finder.md) | Identify edge cases and failure modes |
| **Merry** | [17-merry-clone-support.md](17-merry-clone-support.md) | Support clone instances with context |
| **Bilbo** | [22-bilbo-preference-keeper.md](22-bilbo-preference-keeper.md) | Remember and track user preferences |
| **Quickbeam** | [23-quickbeam-context-prefetcher.md](23-quickbeam-context-prefetcher.md) | Predict and prefetch needed context |

## Knowledge Management

| Agent | File | Use Case |
|-------|------|----------|
| **The Historian** | [24-historian-archive-keeper.md](24-historian-archive-keeper.md) | Archive completed sessions |
| **The Scribe** | [25-scribe-experience-chronicler.md](25-scribe-experience-chronicler.md) | Document learnings for future projects |
| **The Librarian** | [26-librarian-codebase-navigator.md](26-librarian-codebase-navigator.md) | Navigate and explain codebases |

## How to Use

1. Open a new Claude conversation
2. Copy the contents of the desired agent prompt file
3. Paste it at the start of your conversation
4. Follow the "How to Use" section in each prompt

## Typical Workflow

```
1. Gandalf → Generate 3 ideas
2. [You pick one]
3. Radagast → Design architecture
4. Denethor → Create task list
5. Gimli/Legolas → Build features (loop)
6. Galadriel → Review each file
7. Elrond/Treebeard → Debug issues (as needed)
8. Faramir → Assess readiness
9. Saruman → Write submission materials
10. Sauron → Create demo script
```

## Notes

- Each agent is designed to work independently
- Prompts request specific inputs and provide structured outputs
- Agents use extended thinking for complex analysis (Gandalf, Radagast, Denethor)
- All agents are LOTR-themed for consistency with the ILUVATAR system
