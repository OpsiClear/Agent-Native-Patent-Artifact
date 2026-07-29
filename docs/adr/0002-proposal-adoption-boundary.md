# ADR 0002: Agent proposal and human adoption boundary

Status: accepted
Date: 2026-07-29

## Context

An agent drafting directly into canonical matter files makes authorship, source grounding,
concurrency, review freshness, and downstream invalidation difficult to prove.

## Decision

Agent executors create immutable, schema-validated proposals. A proposal contains the content digest,
input artifact references, actor and model metadata, and an idempotency key. It does not update the
current artifact set.

An identified human may adopt or reject the exact proposal digest. Adoption creates an immutable,
numbered artifact envelope before a hash-chained ledger event makes that revision canonical.
Canonical status is derived from the ledger. A stale expected ledger head rejects the command.

APA refuses artifact types representing signatures, certifications, fee payment, or filing
submission.

## Consequences

- Model output is reviewable without silently becoming matter truth.
- Competing proposals can coexist.
- Human decisions remain bound to exact bytes.
- Unledgered files are harmless orphans rather than canonical state.
- Readable legacy files become explicit projections or exports.
