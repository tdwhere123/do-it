# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

```
Task tool (`code-quality-cleaner`):
  description: "Review maintainability and implementation quality for Task N"
  prompt: |
    You are reviewing maintainability and implementation quality for Task N.

    ## What Was Implemented

    [from implementer's report]

    ## Plan Or Requirements

    [task text or plan section]

    ## Diff Range Or Files

    [git range or changed files]

    ## Your Job

    Inspect the actual diff or changed files and report findings first:
    - Blocking
    - Important
    - Nice-to-have

    Focus on duplication, dead code, avoidable abstraction, weak tests, broad changes,
    missed reuse, low cohesion, and future maintenance risk.

    Return exact file:line evidence when possible, plus the smallest recommended cleanup.
```

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)

**Code reviewer returns:** Findings first, residual quality risk, and approval status
