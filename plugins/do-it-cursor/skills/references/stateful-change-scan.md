# Stateful Change Scan

On-demand scan for production failure modes on stateful, asynchronous,
retried, cached, queued, externally effectful, or cross-boundary work.
Skip local, single-shot, reversible edits.

Five faces only: Identity, Interleaving, Commit, Amplification, Copies &
Recovery. They absorb idempotency, races, retry storms, partial commit,
backpressure, and cache/projection drift — they are not separate skills.
Build and Architecture consume this file with a one-line trigger; they do
not copy the faces.

Cite `core §r-recovery` instead of restating it. This scan is the body
behind the workflow-kernel **state-machine gap** class:
[`workflow-kernel.md`](workflow-kernel.md).

## Owners vs mechanism

Semantic, retry, and recovery owners are roles. Mechanism is where a lock,
inbox, queue, cache, or worker happens to run. Do not treat a retry flag
or a copy as the owner of the fact.

| Role | Owns | Is not |
| --- | --- | --- |
| **Semantic owner** | Meaning and legal states of the fact | The table, lock, or cache that stores it |
| **Retry owner** | Whether this identity may retry, plus budget and deadline | Every layer that happens to have a retry flag |
| **Recovery owner** | Commit verdict, repair, reconcile, failed-convergence escalation | The first process that sees a symptom |
| **Mechanism** | Where a check, inbox, queue, lock, cache, or worker runs | Policy. Mechanism is replaceable |

One semantic authority per fact and jurisdiction. Admission may enforce, a
projection may derive, recovery may repair — none of them re-own the source
fact. Mechanism can sit wherever execution is cheap; policy stays with the
owner of end-to-end intent.

## Identity

How the same intent is recognized; duplicates, replay, redelivery.

**Trigger signals:** webhook, queue/inbox, at-least-once delivery, client
retries, client-generated ids, payment/order/job keys, duplicate POST,
replay tests.

**Key questions:**
- What is the operation identity of this intent (not merely a payload hash
  or row id)?
- What happens on duplicate, replay, or redelivery of that identity?
- Who is the semantic owner of "this intent already happened"?
- Is the identity stable across retries, workers, and process restart?

**Common mistakes:**
- Treating HTTP 200 as uniqueness.
- Hashing a payload that changes on retry (new timestamp, new request id).
- Deduping at the edge while a downstream worker still re-applies the effect.
- Using a transport message id as business identity.

**Minimum proof:** applying the same identity twice is a no-op or a named
conflict. Evidence names the identity key and its semantic owner.

## Interleaving

Concurrency, reordering, cancel, timeout, stale read.

**Trigger signals:** read-modify-write, missing compare-and-swap/version,
shared counter or flag, overlapping jobs, cancel endpoint, request timeout,
last-write-wins without a version, stale cache read used to decide a write.

**Key questions:**
- What is the atomic unit — field, aggregate, or multi-step flow?
- What happens if two writers interleave, or a read is stale relative to a
  later commit?
- What happens if cancel or timeout races the in-flight mutation?
- Who owns the conflict rule?

**Common mistakes:**
- Read, decide, write as three unguarded steps.
- Checking "still pending" then acting after another worker already committed.
- Cancelling the client view while the mutation continues.
- Treating timeout as rollback without a commit verdict.

**Minimum proof:** a named conflict, cancel, or timeout outcome, plus a probe
that two overlapping attempts cannot both succeed as if they ran alone.

## Commit

Which step is accepted/committed; partial success; lost response.

**Trigger signals:** multi-step write, two stores, send-then-save, HTTP 5xx
after a side effect, crash between local write and ack, uncertain commit,
unowned outbox.

**Key questions:**
- After which single step is the intent accepted/committed?
- If the response is lost, how does the caller tell "never happened" from
  "happened, ack lost"?
- What is legal after partial success?
- Who is the recovery owner of an unknown commit?

**Common mistakes:**
- Treating the first side effect as commit and the rest as unowned best-effort.
- Mapping timeout or 5xx to "safe to retry" without identity.
- Writing two stores and hoping they converge.
- Returning success before the accepted state is durable.

**Minimum proof:** a stated commit point; an unknown-commit path that is
retry-safe or explicitly repaired; evidence that lost-ack replay does not
double-apply.

## Amplification

Retry, fan-out, queue, cardinality growth; caps and backpressure.

**Trigger signals:** retry loops, nested retries (client + worker + SDK),
fan-out to N children, unbounded queue or pagination, retry-forever,
missing deadline, no backpressure on a hot path.

**Key questions:**
- Who owns the retry budget and deadline for this identity?
- What happens when every layer retries independently?
- Where does cardinality stop (retry count, children, queue depth)?
- What backpressure signal exists, and who honors it?

**Common mistakes:**
- Client retry × worker retry × SDK retry on the same POST.
- Fan-out with no bound and no join.
- Retrying a non-idempotent effect because the transport error was "retryable".
- No deadline owner — work lives until it storms.

**Minimum proof:** one retry/deadline owner named; a cap or backpressure on
each growth axis this task touches; a probe that one failure does not
multiply work without bound.

## Copies & Recovery

Cache/index/UI/external side-effect drift; who reconciles; terminal
invariant and evidence.

**Trigger signals:** cache, search index, materialized view, denormalized
UI, third-party webhook, email/SMS, rebuild job, repair script, an
"eventual" copy used as if it were source.

**Key questions:**
- Which copy is a projection, and which fact is the source?
- Who may rebuild or repair the copy, and from what source?
- What is the terminal invariant if copies drift?
- What evidence shows convergence — or failed convergence that escalates?

**Common mistakes:**
- Hand-editing the cache or UI because that is the symptom the user sees.
- Letting a projection become a second semantic authority.
- No reconcile owner — drift is patched at the symptom forever.
- Retrying until it "looks right" with no terminal invariant.

**Minimum proof:** source vs copy named; reconcile owner and trigger; a
terminal invariant; evidence that planted drift is repaired or escalated.

## Anti-checklist

This is not a required pass on every task. Scan only applicable faces.

- Docs-only, pure-function, or local rename work skips this file. If no
  face triggers: `failure-mode forecast: none identified` plus why
  ([`workflow-kernel.md`](workflow-kernel.md)).
- Do not import saga, outbox, two-phase commit, quorum, or other
  database/distributed ritual unless that mechanism is already in the
  change cone.
- Do not add a skill per face (`do-it-idempotency`, `do-it-retries`,
  `do-it-cache`). Load this reference instead.
- A one-line trigger in Code Quality or Architecture is enough to consume
  these faces. Do not paste this file into a SKILL.md.

## Short examples

Tiny inline cases. They name the failing face; they are not required
fixtures or a preferred mechanism.

### Webhook duplicate

Provider delivers payment event `E` twice (B05). Identity is `E` (or
provider + event id), owned by billing — not the HTTP request, not the
worker attempt. The second delivery observes the first commit and stops.
An inbox row is mechanism and replaceable; the identity key is not.

Failure without Identity: each redelivery charges again.

### Read-modify-write

Two workers read `count=3` and both write `4` (B06). The atomic unit is a
version or compare-and-swap at the semantic owner of `count`, not "we
saw 3". A timeout is not a rollback. A lost-ack retry must use the same
identity so Commit can tell replay from a new intent.

Failure without Interleaving + Commit: both writes succeed; lost-ack
retries double-apply.

### Multi-layer retry

Client retries 3×, the worker 5×, the SDK 3× on the same POST (B07).
Retry owner is the layer that owns the operation identity and deadline;
other layers must not multiply independently. Cap and backpressure sit
with that owner.

Failure without Amplification: 45 attempts, duplicate effects, retry storm.

### Stale projection

The UI cache still shows a deleted order. The order record is semantic
authority; the cache is a projection. The recovery owner rebuilds from
the source or marks the copy stale. The UI must not grow a repair
fallback that becomes a second authority.

Failure without Copies & Recovery: the cache is patched; the source still
says deleted; copies drift forever.
