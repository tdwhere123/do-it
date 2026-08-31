# Resume counter

## Goal

Increment the counter by the settled delta.

## Decisions

- [user] delta is 2, not 1

## Boundary

- in: src/counter.mjs, tests
- out: docs

## Acceptance

- A1: counter() returns previous + 2
