# Patent drafting harness implementation plan

Status: kernel implemented; evaluation expansion remains iterative
Decision date: 2026-07-29
Implementation branch: `feat/patent-drafting-harness`

## Outcome

APA will operate as a local-first patent build system rather than a collection of independent
scripts. Patent matter state remains repository- and filesystem-native. Models propose changes,
deterministic application commands validate them, humans adopt or reject them, and the append-only
matter ledger records the result.

The harness is a modular monolith with three complementary control structures:

1. a statechart defines allowed lifecycle transitions, alternatives, bounded loops, and human
   checkpoints;
2. an artifact dependency graph defines inputs, outputs, provenance, and downstream invalidation;
3. an append-only, hash-chained event ledger is the canonical record of execution and decisions.

MCP, the CLI, and the local review application are adapters over the same command service. No agent
framework or UI owns canonical matter state.

## Evidence driving the work

The baseline audit found:

- 22 package directories but only 10 package manifests and no npm workspace;
- 23 top-level skill manifests without an executable runner, causing `apa-run` to stop at
  `awaiting-agent`;
- workflow ordering and loop policy split between `skills/registry.yaml`, the autoprep prompt, the
  runner, and `trace/autoprep_state.json`;
- production imports from packages into `skills/` and `scripts/`, plus an
  `apa-assemble`/`apa-rigor` dependency cycle;
- source disclosure and generated specification output both assigned to `src/embodiments.md`;
- a strong hash-chained runlog, validation suite, safety boundary, and artifact protocol worth
  preserving.

The baseline test run contained 601 tests. It passed 600; the one failure was a generated Codex
skill bundle absent from a fresh worktree. The normal build generates that ignored bundle before
running the suite.

## Architectural invariants

1. **Canonical writes go through commands.** Agent-facing tools cannot write matter paths directly.
2. **Agents propose; humans decide.** Agent executors create immutable proposals. Only a human
   adoption decision creates a canonical artifact revision.
3. **Every mutation is compare-and-swap protected.** Commands carry the expected ledger head and an
   idempotency key.
4. **The ledger is canonical.** Status files and readable matter files are projections and can be
   regenerated.
5. **Sources are immutable.** Original disclosure bytes are content-addressed and never overwritten.
6. **Artifacts are revisioned.** An adopted revision records its content hash, exact inputs, actor,
   decision, gates, and provenance.
7. **Dependency direction points inward.** Core imports no adapters, applications, skills, or root
   scripts. Packages never import executable code from `skills/`.
8. **Human filing boundary remains absolute.** APA does not sign, certify, pay, or submit.
9. **Confidentiality is local-first.** Remote model, search, telemetry, and hosted workflow adapters
   remain explicit egress boundaries.

## Target repository structure

```text
apps/
  cli/                         unified `apa` command
  mcp-server/                  Codex, Claude, and ChatGPT interface
  review-web/                  later client of the same command service

packages/
  apa-core/                    contracts, hashes, locks, immutable objects
  apa-workflow/                statechart, proposals, decisions, ledger commands
  apa-review/                  review fingerprints and review-domain primitives
  apa-*/                       compatibility packages migrated incrementally

skills/
  */skill.yaml                 stage metadata
  */SKILL.md.tmpl              host interaction guidance
  domains/                     declarative domain packs

schemas/                       legacy contracts during migration
evals/                         later recorded sessions and drafting scorers
docs/
  architecture/               current architecture and implementation plans
  adr/                        durable decisions
```

## Delivery phases and acceptance evidence

### Phase 1 — boundaries and compatibility

- Declare npm workspaces and give every package an explicit private manifest.
- Add one `apa` executable while retaining all existing binaries.
- Add an architecture-boundary checker covering forbidden imports and package cycles.
- Move shared review, fingerprint, and untrusted-content runtime out of skills or outward packages.
- Make `build.sh` invoke the same build gate as `npm run build`.

Acceptance:

- every `packages/*` directory has a manifest;
- no production package imports from `skills/` or root `scripts/`;
- no production package dependency cycle;
- all existing CLI entry points remain callable.

### Phase 2 — canonical contracts and ledger safety

- Add strict schemas for workflow events, proposals, decisions, sources, and artifact envelopes.
- Compile runtime validators from those schemas.
- Add a matter-level exclusive writer lock and expected-head compare-and-swap to the runlog.
- Add idempotency handling to workflow commands.
- Record runner intent before invoking a deterministic runner.

Acceptance:

- a stale expected head cannot mutate a matter;
- a reused idempotency key returns the existing event or fails on different payload;
- an interrupted runner has a pre-execution ledger record;
- schema-invalid proposals and decisions fail before ledger append.

### Phase 3 — proposal/adoption harness

- Scaffold canonical matter directories.
- Ingest immutable source objects.
- Store agent proposals without changing canonical drafts.
- Require a human decision to adopt or reject.
- Store adopted content as a numbered artifact revision and derive the current artifact set from the
  ledger.
- Provide `init`, `ingest`, `propose`, `review`, `adopt`, `reject`, `checkpoint`, `verify`, and
  `summary` commands.

Acceptance:

- proposal creation never changes an adopted artifact;
- adoption is digest-bound to the exact proposal;
- rejection creates no artifact revision;
- signatures, certifications, payments, and filing submissions are prohibited artifact types;
- verification detects changed or missing objects and records.

### Phase 4 — executable workflow v2

- Compile existing registry metadata into explicit executor, proposal, gate, checkpoint,
  invalidation, alternative, and bounded-loop contracts.
- Make agent stages proposal-only and deterministic stages engine-owned.
- Record and enforce examiner loop counts.
- Derive status and invalidation from the ledger.

Acceptance:

- every lifecycle stage has an executor kind and commit mode;
- the disclosure/compile alternative and both bounded examiner loops are machine-visible;
- exceeding a loop cap is blocked unless an identified human records an override;
- a loop request invalidates its target until new evidence is recorded;
- a later upstream adoption invalidates downstream evidence, and checkpoints recorded before the
  replacement evidence cannot satisfy the new revision.

### Phase 5 — MCP and review surfaces

- Expose minimal resources for summary, plan, status, artifacts, and pending proposals.
- Expose narrow tools for proposal, validation, adoption, rejection, human checkpoints, and loop
  requests.
- Require matter root confinement, expected heads, and idempotency keys on every MCP mutation.
- Keep the local review UI as a client of these same commands.

Acceptance:

- MCP cannot address a matter outside its configured root;
- MCP has no unrestricted filesystem-write tool;
- a protocol smoke test lists and calls resources/tools over stdio;
- returned state contains hashes and review requirements rather than confidential bulk content by
  default.

### Phase 6 — drafting and filing-quality evaluation

- Add disclosure-to-claims-to-specification recorded sessions.
- Add cross-host replay for Codex, Claude, ChatGPT, manual, and mock executors.
- Score unsupported-detail rate, source-attribution precision/recall, claim support, term
  consistency, drawing reciprocity, and provisional-to-nonprovisional continuity.
- Add practitioner-labelled held-out fixtures before promoting model-based gates.

Acceptance:

- every drafting stage has at least one public or synthetic end-to-end fixture;
- model judges remain advisory and are calibrated against human labels;
- no generator is its own sole judge;
- signatures and submission remain outside all automated fixtures.

## Migration strategy

The existing four-layer matter format remains supported as a readable compatibility projection.
New immutable stores are introduced alongside it. Package moves use re-export shims until consumers
are migrated. Generated skill documents and legacy CLI paths remain available during the transition.

Temporal is deferred until runs must survive machine loss, jobs span hours or days, multiple workers
write one matter, or scheduled correspondence monitoring requires durable coordination. If adopted,
Temporal activities will call these same idempotent commands and store opaque artifact handles where
possible. A client-side payload codec is mandatory before confidential patent content enters its
history.

## Delivery evidence

Validated on 2026-07-29:

- `npm run build` passed, including generated-host freshness, skill graph, syntax, source registry,
  architecture boundaries, 614 tests, package-isolation installs, and smoke checks;
- `npm run coverage` passed with 132/138 first-party files loaded (95.7%, floor 95%) and
  2295/2527 functions covered among loaded files (90.8%, floor 90%);
- the architecture checker reported 26 packages, 2 applications, 66 dependency edges, no package
  cycle, and no prohibited package-to-skill runtime dependency;
- the skill graph reported 23 skills and 3 domain packs, with 148 positive/negative trigger prompts
  passing the offline skill checker;
- in-memory MCP tests exercised matter-confined resources plus proposal, human adoption, and
  exact-head checkpoint tools without exposing proposal bytes by default.
