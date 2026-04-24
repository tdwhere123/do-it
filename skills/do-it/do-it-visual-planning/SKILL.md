---
name: do-it-visual-planning
description: Use when optional visual artifacts, diagrams, sketches, mockups, or side-by-side comparisons would clarify a do-it plan or design decision.
---

# Do-It Visual Planning

## Purpose

Use this as an auxiliary planning aid for visual comparison. It is not part of the core do-it tier flow and must not promote a task from Light to Standard or Heavy by itself.

Use `.do-it/visual/` as the workspace for sketches, diagrams, screenshots, notes, or generated visual assets. Keep product code and non-visual docs out of this skill unless another do-it skill explicitly owns that edit.

## Tier Rules

### Light

Use a quick sketch, ASCII diagram, or one comparison image to resolve a narrow ambiguity.

### Standard

Default for subagents and ordinary visual planning. Produce 2-3 options and compare tradeoffs.

### Heavy

Parent-only unless explicitly assigned. Use for cross-screen UI flows, architecture diagrams for wave/phase planning, or visual decisions that affect multiple workers.

## When To Use

Use when seeing the option is materially better than reading it:

- UI layout or interaction alternatives;
- architecture or data-flow diagrams;
- before/after visual states;
- side-by-side interface shapes;
- visual task sequencing for multi-agent work.

Skip it for text-only decisions, one-line questions, or plans where a table is clearer.

## Workspace Rules

- Store artifacts under `.do-it/visual/<topic>/`.
- Use descriptive filenames like `option-a-flow.md`, `api-boundary.svg`, or `screen-compare.png`.
- Treat the workspace as auxiliary evidence, not final product output.
- Do not edit manifest, install scripts, package files, or unrelated docs from this skill.
- If generated artifacts are temporary, say so in closeout.
- For browser-based comparisons, use `scripts/start-server.sh` and
  `references/visual-companion.md`. Load that reference only when you actually
  need the local browser companion.
- Browser session HTML must be written to the `screen_dir` returned by the
  companion server. Use `.do-it/visual/<topic>/` for static artifacts, notes,
  screenshots, or generated assets outside the live browser session.

## Sequence

1. Inspect the current design context or code surface.
2. Decide whether visual treatment will reduce ambiguity.
3. Create or update the smallest useful artifact in `.do-it/visual/`, or in the
   returned `screen_dir` when using the browser companion.
4. Compare options with explicit tradeoffs and a recommendation.
5. Feed the decision back into `do-it-planning`, `do-it-interface-drill`, or `do-it-architecture-scan`.

## Output Shape

- Visual workspace path.
- Options or diagram created.
- Decision clarified.
- Recommendation.
- Follow-up do-it skill or delivery step.

## Common Mistakes

- Making visuals because they look nice, not because they clarify a decision.
- Letting visual planning replace acceptance criteria or verification.
- Mixing temporary sketches into product docs.
- Treating this auxiliary skill as a required gate in the core do-it flow.
