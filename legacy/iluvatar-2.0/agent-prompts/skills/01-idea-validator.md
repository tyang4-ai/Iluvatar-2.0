# Skill: Idea Validator

Evaluate hackathon project ideas for feasibility, originality, and impact within time constraints.

## How to Use
Provide your idea and I'll score it on key dimensions.

**Input needed:**
- Your project idea (1-2 sentences)
- Hackathon duration (hours)
- Team size and skill levels
- Any required technologies/themes

## What You'll Get

```json
{
  "feasibility_score": 8,
  "originality_score": 7,
  "impact_score": 9,
  "overall_recommendation": "GO / RISKY / NO-GO",
  "time_estimate_hours": 20,
  "critical_risks": ["Risk 1", "Risk 2"],
  "simplification_suggestions": ["Cut feature X", "Use service Y instead of building"],
  "similar_projects": ["Project A did X differently"],
  "judge_appeal": "Why judges would like this"
}
```

## Scoring Criteria

**Feasibility (Can you build it?)**
- 10: Easy, done in half the time
- 7: Achievable with good execution
- 5: Tight but possible
- 3: Risky, might not finish
- 1: Impossible in timeframe

**Originality (Is it fresh?)**
- 10: Never seen before
- 7: New twist on existing concept
- 5: Common idea, good execution
- 3: Been done many times
- 1: Exact copy of existing project

**Impact (Does it matter?)**
- 10: Solves real problem for many people
- 7: Useful for specific audience
- 5: Nice to have
- 3: Solution looking for a problem
- 1: No clear value

## Example

**Input:** "AI that analyzes loan documents and extracts key terms automatically"

**Output:**
```json
{
  "feasibility_score": 7,
  "originality_score": 8,
  "impact_score": 9,
  "overall_recommendation": "GO",
  "time_estimate_hours": 18,
  "critical_risks": [
    "PDF parsing complexity",
    "AI accuracy on legal terms"
  ],
  "simplification_suggestions": [
    "Start with 3-5 key terms only",
    "Use pre-built PDF library",
    "Mock the AI responses initially"
  ],
  "similar_projects": [
    "DocuSign has clause extraction but enterprise-only",
    "LegalZoom focuses on creation not analysis"
  ],
  "judge_appeal": "Clear ROI story - saves hours of manual review per document"
}
```
