---
name: self-improvement
description: "Self-evolution: analyze sessions, optimize skills/tools/prompts via GEPA, review improvements."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [evolution, optimization, self-improvement, dspy, gepa]
    related_skills: []
---

# Self-Improvement: Zeus Self-Evolution System

## Overview

This skill guides you through Zeus's self-improvement system. Zeus can
analyze its own session history to find areas where it underperforms,
then automatically optimize its skills, tool descriptions, and system
prompt sections using DSPy + GEPA (genetic prompt optimization).

**Key principle**: All improvements are written to git branches for
human review. Zeus never auto-modifies its running configuration —
that would break prompt caching and could destabilize the agent.

## Prerequisites

- The `zeus-self-evolution` repo must be available (sibling directory
  or `ZEUS_SELF_EVOLUTION_REPO` env var)
- DSPy + GEPA dependencies installed
- An OpenAI API key (or other LLM provider) configured for the
  optimization models

## Commands

### Check status
```
hermes evolve status
```
Shows available skills, current config, and open evolution branches.

### Analyze sessions for improvement opportunities
```
hermes evolve monitor --days 7
```
Scans recent session history for patterns: tool failures, retries,
user corrections, rewind cycles, clarify overuse.

### Run the full auto-improvement loop
```
hermes evolve auto --days 7 --max-candidates 5
```
Analyzes sessions, ranks improvement candidates, and automatically
evolves the top candidates. Results saved to git branches.

### Evolve a specific skill
```
hermes evolve skill <skill-name> --iterations 10
```
Runs GEPA optimization on a single skill's SKILL.md instructions.

### Evolve a tool description
```
hermes evolve tool <tool-name> --iterations 5
```
Optimizes a tool's description text for better tool selection accuracy.

### Evolve a system prompt section
```
hermes evolve prompt <section-name> --iterations 5
```
Optimizes a system prompt section (e.g., DEFAULT_AGENT_IDENTITY,
MEMORY_GUIDANCE, SKILLS_GUIDANCE).

### List evolvable prompt sections
```
hermes evolve prompt --list-sections
```

## Workflow

### When the user says "improve yourself" or "evolve"

1. Run `hermes evolve status` to show what's available
2. Run `hermes evolve monitor --days 7` to analyze recent sessions
3. Report the findings: what patterns were detected, what candidates exist
4. Ask the user which area they'd like to evolve (or suggest the top candidate)
5. Run the appropriate evolution command
6. Report the results: improvement score, output location, branch name
7. Tell the user to review the git branch and merge if satisfied

### When the user says "analyze my sessions"

1. Run `hermes evolve monitor --days 7` (or the requested time range)
2. Report the analysis: session count, token usage, tool call patterns
3. Highlight any improvement candidates found
4. Suggest next steps (evolve a specific target)

### When the user says "evolve my <skill/tool/prompt>"

1. Identify the target type (skill name, tool name, or prompt section)
2. Run the appropriate evolution command with sensible defaults
   - Skills: 10 iterations
   - Tools: 5 iterations
   - Prompts: 5 iterations
3. Report results and next steps

### When the user says "run the improvement loop"

1. Run `hermes evolve auto --days 7`
2. This analyzes, triages, and evolves automatically
3. Report which targets were evolved and the improvement scores
4. List any git branches created for review

## Important Notes

- **Prompt caching is sacred**: System prompt changes invalidate the
  cache. Evolved prompt sections must be reviewed carefully before
  merging.
- **Human-in-the-loop**: Zeus creates git branches with improvements,
  but never auto-merges. The user must review and merge.
- **Cost**: Each evolution run makes LLM API calls for dataset
  generation and GEPA optimization. A typical 10-iteration run costs
  ~$0.50-$2.00 depending on the model.
- **Constraints**: All evolved artifacts must pass size limits (skills:
  15KB, tool descriptions: 500 chars) and growth limits (max 20%
  growth over baseline).
