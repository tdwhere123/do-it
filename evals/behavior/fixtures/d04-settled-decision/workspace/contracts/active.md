# Store persistence

## Goal

Keep every write in the in-memory store.

## Decisions

- D1 [user] persist in memory, not sqlite

## Boundary

- In: src/store.mjs, tests
- Out: docs, new datastore

## Acceptance

- A1 a second set is readable via get
