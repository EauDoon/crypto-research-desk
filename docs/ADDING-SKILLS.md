# Adding a skill

A skill is a named procedure a lane must apply. It is not a slogan and not a second agent.

## Shape

Create `.agents/skills/<skill-id>/SKILL.md`:

```markdown
---
name: skill-id
description: One line. Lane. Research only.
---

# Skill name

Lane: Market regime (`market_regime`)

One-line summary.

## Procedure

1. ...
2. ...

## Do not

- ...

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
```

## Checklist

1. The skill belongs to **one** lane. If two lanes need it, write two skills or move it to Chief routing.
2. Add the skill to that agent's list so runtime prompts name it.
3. Add a pass/fail line in [EVAL.md](EVAL.md).
4. Export it in the Claude / ChatGPT / Grok packs. Do not leave it as a local note.
5. Never teach execution, credentials, or wallet connection.

## What not to add

- A sixth specialist.
- "Be thorough" with no procedure.
- A skill that quietly assigns accepted research state.
- A skill that sizes a position while the mandate is incomplete.
