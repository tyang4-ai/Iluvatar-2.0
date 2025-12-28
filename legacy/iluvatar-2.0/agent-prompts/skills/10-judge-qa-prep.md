# Skill: Judge Q&A Prep

Prepare for judge questions. Know what they'll ask and how to answer.

## How to Use
Tell me about your project and I'll predict questions and prepare answers.

**Input needed:**
- What your project does
- Tech stack used
- Any known weaknesses
- Target audience

## What You'll Get

```json
{
  "likely_questions": [
    {
      "question": "How does this scale?",
      "answer": "Strong answer here",
      "followup_prep": "What to say if they dig deeper"
    }
  ],
  "weakness_pivots": [
    {
      "weakness": "Only handles English",
      "pivot": "We focused on proving the core concept first. Adding multilingual support is straightforward with..."
    }
  ],
  "confidence_boosters": ["Things you can be proud of"]
}
```

## Common Judge Questions (And How to Answer)

### Technical Deep Dives

**"How does your AI/ML component work?"**
```
Good: "We use OpenAI's GPT-4 with a custom prompt engineered for [specific task].
We parse the input, send structured context, and post-process the response to ensure
consistent output format."

Avoid: "We just call the API" (too vague)
```

**"Why did you choose [technology]?"**
```
Good: "Next.js gave us server-side rendering for SEO, API routes for our backend,
and deploys instantly on Vercel. For a hackathon, that simplicity let us focus on
the product, not the infrastructure."

Avoid: "It's what we knew" (honest but weak - reframe it)
Better: "Our team has production experience with React, so we could move fast and
avoid learning curve risks."
```

**"How does this scale?"**
```
Good: "The architecture is stateless - our API routes can scale horizontally on Vercel's
edge network. The database is on Supabase with connection pooling. For this MVP, we
handle [X] concurrent users. For production, we'd add caching and optimize the [specific] query."

If you didn't think about scale:
"For this prototype, we focused on proving the concept works. The architecture is
standard [Next.js/Express/etc], so scaling patterns are well-documented when needed."
```

### Business & Impact

**"Who would use this?"**
```
Good: "Our primary user is [specific persona]. For example, [name] is a [role] who
spends [time] on [problem]. With our tool, they can [benefit]."

Avoid: "Everyone" or "Anyone who needs [vague benefit]"
```

**"What's your business model?"**
```
Good: "For this hackathon, we focused on the product. A natural model would be
[SaaS subscription / API usage fees / freemium]. [Competitor] charges [$X],
so there's clear willingness to pay."

If you haven't thought about it:
"We'd explore [freemium / enterprise licensing] once we validate the core value
proposition. The immediate focus was proving the technology works."
```

**"What's your unfair advantage?"**
```
Good: "Our team has [domain expertise / unique data / specific experience].
We've [relevant credential]. That's why we spotted this problem and knew how to solve it."

If you don't have one:
"We move fast and ship. This prototype was built in [X] hours. Our advantage is
execution speed and willingness to iterate based on user feedback."
```

### Competition & Market

**"How is this different from [competitor]?"**
```
Good: "[Competitor] focuses on [their approach]. We're different because [specific
differentiation]. For example, they require [manual step] while we [automate/simplify]."

If you don't know competitors:
"I'd love to learn more about what you're thinking of. From our research, [what you found].
Our focus was [your unique angle]."
```

**"What if [big company] builds this?"**
```
Good: "They might! But [big company] serves [broad market]. We're focused specifically
on [niche], where we can move faster and build features [big company] wouldn't prioritize."

Or: "That would validate the market. We'd differentiate through [specialization / UX /
specific feature] that a horizontal platform wouldn't build."
```

### Challenges & Limitations

**"What was the hardest part?"**
```
Good: "The [specific technical challenge]. Initially we tried [approach A], but hit
[problem]. We pivoted to [approach B] which worked because [insight]."

This shows problem-solving ability - judges love it.
```

**"What doesn't work yet?"**
```
Good: "Great question. [Feature X] is scaffolded but not complete. We prioritized
[core feature] for the demo because that's where the unique value is. [Feature X]
is next on the roadmap."

Don't: Pretend everything works if it doesn't.
```

**"What would you do with more time?"**
```
Good: "Three things: First, [improve existing feature]. Second, [add specific
feature users need]. Third, [scalability/polish item]. We have a clear roadmap."

Avoid: "Make it better" (too vague)
```

## Handling Tough Questions

### When You Don't Know
```
"That's a great question I haven't fully explored yet. My initial thought is
[best guess]. I'd want to research [specific aspect] before committing to an answer."
```

### When They're Skeptical
```
"I understand the skepticism. Let me show you [concrete evidence / demo it again].
The key insight is [core value proposition]."
```

### When They Find a Bug
```
"Thanks for catching that! [If minor: 'That's a display bug, the core logic works.']
[If major: 'We identified this issue at [time], ran out of time to fix it, but the
fix would be [specific].']"
```

### When They Love It
```
Don't just say thanks! Expand:
"Thank you! We're excited about [future direction]. The response from [other judges /
users / testers] has been [positive indicator]. We'd love to continue building this."
```

## Pre-Demo Prep

- [ ] Each team member knows 2-3 questions they'll handle
- [ ] You've identified your weakest point and have a pivot ready
- [ ] You can demo any feature on demand (not just the script)
- [ ] You have 1-2 "impressive details" ready to drop if needed
