# LLM rubric (unimplemented)

A blinded LLM judge may later score structure quality that hard gates
cannot: earliest divergence, authority placement, real decision
boundaries, review-finding evidence.

This backend is **unimplemented**. Dry-run and `npm test` must not call
a network model. `judge.mjs` records:

```json
{
  "status": "deterministic",
  "llm_judge": "NOT_RUN",
  "reason": "LLM rubric backend is unimplemented; deterministic gates and structure notes only."
}
```

LLM scores must never override a hard-gate failure.
