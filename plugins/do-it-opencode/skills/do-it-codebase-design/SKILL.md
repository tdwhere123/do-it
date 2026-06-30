---
name: do-it-codebase-design
description: "Use when designing or restructuring a module, evaluating whether an abstraction earns its keep, finding clean seams, or when review-loop or architecture-scan needs a shared vocabulary for depth, leverage, and locality."
---

# Do-It Codebase Design

A shared vocabulary for designing **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use these terms and tests whenever you are deciding where a boundary goes, whether an abstraction is worth it, or why a change feels hard to test.

**In one sentence:** prefer deep modules (small interface, rich implementation) at clean seams; reject shallow wrappers and speculative seams.

## Glossary — use these terms exactly

Consistent language is the point. Do not substitute "component", "service", "API", or "boundary" without a reason.

- **Module** — anything with an interface and an implementation. Scale-agnostic: a function, class, package, or vertical slice. Use instead of: unit, component, service.
- **Interface** — everything a caller must know to use the module correctly: signature, invariants, ordering, errors, config, and performance. Not just the type signature.
- **Implementation** — the code inside a module. Distinct from **adapter**.
- **Seam** — a place where you can alter behaviour without editing in that place; the location of a module's interface. Where the seam goes is a separate decision from what goes behind it.
- **Adapter** — a concrete thing that satisfies an interface at a seam (e.g. Postgres repo, in-memory fake, HTTP client). Describes role, not substance.
- **Depth** — leverage at the interface: behaviour a caller gets per unit of interface they must learn. A module is **deep** when a large behaviour sits behind a small interface; **shallow** when the interface is nearly as complex as the implementation.
- **Leverage** — what callers gain from depth: more capability per unit of learned interface. One deep module pays back across N call sites and M tests.
- **Locality** — what maintainers gain from depth: change, bugs, and verification concentrate in one place rather than spreading across callers.

## Deep vs shallow

**Deep module** = small interface + lots of implementation.

```text
┌─────────────────────┐
│   Small Interface   │  ← few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  ← complex logic hidden
│                     │
└─────────────────────┘
```

**Shallow module** = large interface + little implementation. Avoid.

```text
┌─────────────────────────────────┐
│       Large Interface           │  ← many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  ← mostly passes through
└─────────────────────────────────┘
```

When designing an interface, ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?

## Design tests

Apply these before adding or accepting a new module:

1. **The deletion test.** Imagine deleting the module. If complexity just moves to callers, it was a pass-through. If complexity vanishes or concentrates, it was earning its keep.
2. **One adapter = hypothetical seam. Two adapters = real seam.** Do not introduce a seam unless something actually varies across it.
3. **The interface is the test surface.** If you want to test past the interface, the module is probably the wrong shape.
4. **Accept dependencies, don't create them.** A testable module receives its collaborators; it does not `new` them up.
5. **Return results, don't produce hidden side effects.** Prefer pure calculations; keep side effects at the seam.

## When to deepen, when to inline

**Deepen** when a concept has multiple callers, the implementation is genuinely complex, and a small interface gives leverage and locality.

**Inline / delete** when:

- the module is a thin wrapper around another module;
- there is only one caller and no realistic second caller;
- the abstraction exists "in case we need it later";
- the interface is as complex as the implementation it hides.

## Code quality hook-up

- The **YAGNI lens** in `do-it-review-loop` flags rung-1 violations (does it need to exist?).
- The **anti-patterns-lint** hook flags newly-exported symbols with no other-file consumer.
- This skill gives you the vocabulary to explain *why* those findings matter and what "done" looks like.

## Output

When this skill is invoked explicitly or by another skill, return:

- the module and seam being decided;
- interface size vs implementation depth verdict (deep / shallow / borderline);
- result of the five design tests;
- recommendation: keep, deepen, inline, split, or defer;
- tests that would survive a refactor of the implementation.
