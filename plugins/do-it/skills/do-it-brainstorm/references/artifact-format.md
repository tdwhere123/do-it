# Brainstorm artifact — file format

Load this only when writing a durable `.do-it/brainstorm/<task-slug>.md`. Discussion-first mode (the default) returns the inline stack and does not write a file. `<cwd>/.do-it/brainstorm/.gitkeep` should exist when the project tracks do-it artifacts.

```markdown
---
task: <one-line title>
session_id: <id>
created: <YYYY-MM-DD>
status: open
lenses_run: [product, architecture, ...]
tier: <light | standard | heavy>
mode: <artifact | discussion-first>
---

## Frame

<one-sentence problem statement all viewpoints received>

## Core Viewpoints

### Product
<requirement shape, product boundary, core goal, and option tradeoffs; cap ~30 lines>

### Architecture
<foundation, extension modules, stage closure, and verification route; cap ~30 lines>

## Supplemental Lenses

### <Lens Name>
<distilled return; cap ~30 lines>

Or `none selected`.

## Requirement Shape

<what the demand appears to be, including plausible forms it could take>

## Product Boundary

- In scope: <what belongs to this product or feature>
- Out of scope: <what does not belong here>
- Boundary risk: <what breaks if this line is wrong>

## Core Goal

<the stage-defining success target>

## Options

Map each option along the decision ladder (skip-it → stdlib/native → existing dependency → minimal custom → full build) and compare on the same axes.

### Option A: <name>
- Ladder rung: <where this sits — and why a cheaper rung does not suffice>
- Benefits: <why it helps>
- Costs: <what it consumes or complicates>
- Risks: <how it can fail or mislead>
- Choose when: <conditions where this path fits>

### Option B: <name>
- Ladder rung: <...>
- Benefits / Costs / Risks / Choose when

## Architecture Foundation

- Core bottom layer: <foundation pieces and invariants>
- Ownership/contract: <stable boundaries others depend on>
- Stage closure: <what should finish now unless there is a concrete reason not to>

## Extension Modules

- <module or capability that can attach later without reshaping the foundation>

## Grill Handoff

### Must Resolve In Grill
- <decision or premise that changes product direction, foundation, implementation route, proof path, or operator behavior>

### Can Decide During Planning
- <detail that should not block requirement discovery or grill convergence>

## Tensions

- <viewpoint A says ..., viewpoint B says ..., the conflict is ...>

Or `none surfaced`.
```

`status: open` means grill has not converged on `Must Resolve In Grill`. Grill flips it to `converged` once every execution-blocking item is resolved or explicitly deferred. Do not collapse option tradeoffs into one answer inside brainstorm; for each user-facing decision, keep the available options, the practical tradeoff, and the recommended default that grill should present.
