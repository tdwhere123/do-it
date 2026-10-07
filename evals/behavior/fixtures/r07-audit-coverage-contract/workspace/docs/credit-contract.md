# Credit queue contract

`enqueue(request, queue)` accepts trusted internal requests with `tenantId`,
`eventId`, and integer `amount` in cents. The queued job must preserve all three
fields. `drain(queue, ledger)` applies each job and returns its acceptance result.

An event is a duplicate only when both tenantId and eventId match a prior event.
Different tenants may use the same eventId. A duplicate must not change the first
amount. This contract is shared by the API, job mapper, worker, and ledger.

The current deployment drains an in-memory queue serially. Distributed retries,
authentication, persistent storage, and external delivery are not promised here.
