# Independent key contracts

## Provider subject lookup

`subjectKey(subject)` receives an opaque, case-sensitive provider subject. It
must preserve the exact subject. `User7` and `user7` are distinct identities.
There are no lookup aliases.

## Export archive

`archiveKey({customerId, createdAt, runId})` identifies an export run. createdAt
is a millisecond timestamp. The caller supplies a unique runId for each run.
All runs must be retained, including two runs for the same customer within one
second. Export runs and provider subjects share no storage or namespace.

## Webhook deduplication

`eventKey({tenantId, eventId})` identifies a tenant-scoped event. Different tenants
may legitimately reuse eventId. The pair is the full identity. There is no
cross-tenant eventId uniqueness policy.

## Legacy session marker

`sessionKey(accountId)` keys an internal map of lastSeen timestamps. No supported
device model, session lifetime, expiry, or authentication decision contract has
been established for this legacy marker. Its name alone does not settle those
semantics. This map is not shared with provider lookup, exports, or webhooks.
