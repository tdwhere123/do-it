---
name: do-it-retrospective
description: "Use when the user asks to reflect on an observed collaboration or engineering outcome and identify useful lessons."
---

# Retrospective

Reason from the observed episode: what outcome was intended, what happened,
which cause best explains the difference, and what change would address it.
Distinguish evidence from conjecture and recurring causes from one-off friction.

Ask what would have prevented the observed mistake without obstructing valid
work. A lesson such as "be more careful" does not identify that change. Prefer an
existing test, validation rule, or simpler ownership boundary when it can retain
the lesson reliably; use documentation for context or judgment that code cannot
capture. Do not add reminders that merely restate what the implementation or
existing checks already retain; a missing regression test can still be the right
place to preserve the lesson.

Keep conclusions proportional to the evidence: a local fix, a better question,
or no policy change may be enough. If an instruction contributed, preserve the
episode and the decision it got wrong, then use
[Skill Authoring](../do-it-skill-authoring/SKILL.md) to distinguish a writing
improvement from a measured behavior change. Do not turn a single episode into a
universal rule. Retrospective reasoning does not enable automatic recording,
personalization, or policy promotion. Use native host instructions or memory for
preferences only when the user requests persistence; do not access or modify old
do-it profiles by default.
