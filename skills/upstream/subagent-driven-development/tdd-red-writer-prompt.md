# TDD RED Writer Prompt Template

Use this template when dispatching a RED-only test writer subagent.

**Purpose:** Lock the behavior contract with the smallest failing automated test
before implementation begins.

```
Task tool (`tdd-red-writer`):
  description: "Write RED tests for Task N"
  prompt: |
    You are writing RED-only tests for Task N.

    ## Task Requirements

    [FULL TEXT of task requirements]

    ## Context

    [Behavior boundary, owning files, relevant constraints, and why dual-agent TDD was chosen]

    ## Your Job

    1. Add or tighten the smallest automated test that proves the missing behavior
    2. Edit only tests, fixtures, or test harness support
    3. Do not edit production code
    4. Run the narrowest verification command
    5. Confirm the result is RED for the expected reason
    6. Report back clearly

    ## Guardrails

    - Prefer tightening an existing test over adding a duplicate
    - Avoid mocking away the behavior contract under test
    - Keep the test deterministic and minimal
    - If RED cannot be achieved without production edits, stop and report that

    ## Report Format

    - Status: DONE | NEEDS_CONTEXT | BLOCKED
    - Tests added or updated
    - Narrow RED command and failure summary
    - Files changed
    - Concerns or assumptions
```
