# ADR 0001: Repository-native patent harness kernel

Status: accepted
Date: 2026-07-29

## Context

APA already has patent-specific schemas, deterministic gates, safety boundaries, a declarative skill
graph, and a hash-chained matter runlog. A generic agent framework would duplicate these controls and
could introduce a second state store.

## Decision

The canonical workflow kernel remains local and repository-native. It uses a statechart, an artifact
dependency graph, immutable revisions, and the existing chained ledger. CLI, MCP, review UI, model
providers, search providers, and document processors are adapters.

MCP is the cross-host protocol. Agent SDKs may implement an `AgentDriver`, but their sessions,
checkpoints, traces, and conversation stores are never canonical patent matter state.

## Consequences

- Patent-specific human gates and evidence remain stable across model providers.
- Local workflows do not require a hosted orchestration service.
- The project owns workflow migration and recovery semantics.
- Temporal may later wrap idempotent commands for hosted durability without replacing the
  patent-domain ledger.
