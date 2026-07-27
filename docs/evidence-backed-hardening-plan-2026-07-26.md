# Evidence-Backed Hardening Plan — 2026-07-26

This plan records the three-lane review and hardening pass performed against the current working
tree. It separates controls implemented in this pass from larger product and distribution work that
remains open. APA remains assistive drafting software; none of these checks is a legal conclusion or
a representation that an application is ready to file.

## Review method and baseline

Three independent review lanes covered:

1. architecture, graph integrity, provenance, and viewer consistency;
2. filing assembly, rigor, application-type, role, and product-contract behavior;
3. prior-art/IDS evidence, search failure semantics, release tests, and operations.

The starting mechanical baseline was 413 passing tests, 8/8 offline benchmarks, and 93.1% reported
function coverage. Reproductions showed that the percentage excluded completely unloaded files and
that several safety/product states failed open despite the green baseline.

## Implemented now

| Risk demonstrated by review | Implemented control | Regression evidence |
|---|---|---|
| Missing rigor still returned `GO`; `--write` created a package even on `NO-GO` | Missing rigor, unknown role, and unsupported assembler application types now block. Preflight runs before generation, and a blocked write logs `outputs: []` without creating `assembled/`. | `packages/apa-assemble/test/assemble-cli.test.mjs`; `packages/apa-assemble/test/assemble.test.mjs` |
| Stored rigor `evaluated_at` froze prior-art age | Rigor recomputes age from current time; tests inject `now` for determinism. | `packages/apa-rigor/test/verdict.test.mjs` |
| Typo/arbitrary provenance and wrong-kind edges passed validation | Provenance uses a closed vocabulary, `inventor:<id>` resolves to a declared inventor, IDs are globally unique across graph kinds, and every typed edge verifies its target kind. | `packages/apa-validate/test/graph-integrity.test.mjs` |
| Viewer silently resolved wrong-kind targets or discarded claims on ID collision | Wrong-kind edges remain visible but unresolved; collisions retain canonical nodes and appear in review metadata/UI. | `packages/apa-viewer/test/build_manifest.test.mjs` |
| A legacy `verification.verified` boolean bypassed dossier checks | IDS readiness comes from the newest valid search-dossier assignment and requires explicit human verification plus all four required checks. | `packages/apa-assemble/test/ids-dossier-readiness.test.mjs` |
| Rigor counted parseable but schema-invalid dossiers and overstated wrong-kind support | Rigor and IDS now share the canonical dossier validator; wrong-kind support edges fail Level 1, force P4 to 1, and are counted by code. | `packages/apa-rigor/test/scaffold.test.mjs` |
| Drawing `defined_in` and SPEC `defines_numerals` data could disagree silently | Reciprocal missing/mismatch findings are deterministic validator errors and block the assembly drawing gate. | `packages/apa-validate/test/validate.test.mjs`; `packages/apa-assemble/test/assemble.test.mjs` |
| A historical saved `GO` package was not bound to the inputs that produced it | Upload-manifest v2 fingerprints canonical inputs; missing or mismatched fingerprints are stale and cannot carry forward `GO`. | `packages/apa-assemble/test/assemble.test.mjs` |
| A confidential real matter was useful regression evidence but unsafe to vendor | The opt-in external verifier is read-only and aggregate-only, skips when unconfigured, and keeps the private matter outside Git and benchmark fixtures. | `scripts/verify-external-matter.test.mjs`; `docs/external-patent-validation-2026-07-26.md` |
| Source failures appeared as successful zero-result searches | PatentsView and NPL adapters return explicit errors for network, HTTP, parse, and malformed-success responses. Total runnable-source failure exits 1 before writes; partial success remains usable. | `packages/apa-search/test/source-failure-status.test.mjs`; `packages/apa-search/test/source-failure-cli.test.mjs` |
| A failed search attempt disappeared from the audit ledger, and reflected API errors could be persisted | Failed all-source attempts append exit 1 with no outputs, a query-sink hash, requested sources, and normalized error classes. PatentsView retains only a bounded allowlisted error code. | source-failure CLI/status tests; `packages/apa-search/sources/patentsview.mjs` |
| Concatenated SVG roots could retain an HTML image between otherwise valid drawings | SVG composition now requires exactly one structurally balanced root and passive element/attribute allowlists; scripts, HTML, unknown attributes, external references, active CSS, DTD/entities, and trailing roots fail closed. | `packages/apa-figure/test/figure.test.mjs`; `packages/apa-figure/test/quality.test.mjs` |
| `user_role: unknown` could receive strategic claim/OA outputs | Unknown-role claim reports are neutral-options-only, and OA response generation requires an affirmative registered-practitioner role. | `packages/apa-reports/test/reports.test.mjs`; `packages/apa-prosecute/test/prosecute.test.mjs` |
| Weekly evals compared unrelated matters, could promote failed candidates, and recomputed a dirty cache key after mutating example runlogs | Eval baselines are matter-specific. The workflow freezes its clean fingerprint before evaluation, promotes only passing candidates, and still uploads failed runs as diagnostic artifacts. | `packages/apa-eval/test/eval.test.mjs`; `.github/workflows/periodic-evals.yml` |
| Fee code 4011 was assumed without explicit route evidence | Code 4011 is selected only when the caller affirmatively supplies `electronicFiling: true`; omission uses ordinary small-entity code 2011. The dated schedule records the official description, live-page hash, retrieval date, and page revision date. | `packages/apa-assemble/test/fees.test.mjs`; `docs/fee-schedule.2026-07-26.json` |
| Skill install/uninstall could overwrite or delete unrelated prefixed skills | Installation refuses unowned collisions; uninstall removes only lockfile-owned directories. | `packages/apa-skills/test/installer.test.mjs` |
| Review-form state, serving, and public metadata egress lacked release coverage | A root-discovered E2E covers loopback-only serving, Host/Origin/CSP/static-file controls, optimistic state conflicts, request/SSE/worker/cancellation behavior, and synthetic privacy sentinels. Optional date fetches use exact-URL redaction, allowlisted HTTPS, bounded redirects/responses, and hashed audit records. | `test/review-form-agent-bridge.test.mjs`; `skills/apa-review-form/scripts/safe_metadata_fetch.test.mjs` |
| Skill bundling could recursively replace an arbitrary destination and its pack test mutated the repository copy | Bundling is contained to `<packageRoot>/skills`, rejects overlap, stages transactionally, and tests `npm pack` in a disposable package tree. | `packages/apa-skills/test/bundle-freshness.test.mjs` |
| tldraw support was guidance-only and did not prove its SVG acceptance boundary | The skill now provides an executable local gate sequence, conditional pinned `apa-safe-npx` guidance, and paired safe/unsafe snapshot/export fixtures that verify numeral parity and active-content rejection. | `skills/tldraw-patent-drawing/tldraw-fixture.test.mjs` |
| Coverage omitted unexecuted files from the denominator | Coverage now reports tracked-file load coverage separately from function coverage among loaded files and lists unloaded modules. | `scripts/coverage-summary.mjs` |
| `apa-run status` treated the presence of a skill ID in the runlog as proof of completion | Status schema v2 requires a successful latest command, current input/output hashes, evidence for declared outputs, safe matter-local paths, and satisfied required checkpoints. Pending, failed, and stale states include stable machine-readable reason codes. | `packages/apa-run/test/runner.test.mjs`; aggregate-only external-matter revalidation |

## Verification evidence

The integrated working tree passed:

- `npm test`: 494/494 tests;
- `npm run build`: generated-skill freshness, skillgraph, syntax, source registry, tests, and smoke;
- `npm run benchmark`: 8/8 offline benchmark cases;
- `npm run score:prior-art-search`: recall@20 1.00, recall@5 1.00, MRR 0.75;
- `npm run score:real-software-patents`: 3/3 cases, score 1.00, zero blocking failures;
- `npm run coverage`: 101/110 first-party worktree files loaded (91.8%); 1712/1876 functions
  covered among loaded files (91.3%);
- pinned private-matter verification: zero mechanical errors/warnings, expected `NO-GO`, zero unsafe
  linked inputs, and orchestration status of 14 pending plus 5 stale steps rather than unsupported
  completion labels;
- `git diff --check`: no whitespace errors.

## Remaining improvement plan

### P1 — Make distribution artifacts independently executable

Evidence: isolated `npm pack` execution previously produced `ERR_MODULE_NOT_FOUND` for `apa-eval`,
`apa-figure`, `apa-prosecute`, and `apa-assemble`; the skills installer also omits the repo toolkit
invoked by installed skill instructions and does not install host-specific generated variants.

Acceptance criteria:

- install each tarball into an empty temporary project and execute every exported CLI/import;
- either bundle declared runtime/toolkit dependencies or mark non-standalone packages private;
- package and install the generated Claude, Codex, and Cursor variants independently;
- publish only after the isolation matrix is a blocking CI job.

### P2 — Execute, rather than only plan, the lifecycle

Evidence: evidence-based status is implemented, but `apa-run run` still prints an ordered handoff
instead of executing runners or agent checkpoints.

Acceptance criteria:

- add a lifecycle test that starts from disclosure input and generates claims/specification rather
  than cloning an already-authored matter;
- execute only declared runners, stop at blocking gates, and require an explicit continuation after
  human checkpoints;
- append an execution record for every attempted step, including failed attempts with no outputs.

### P1 — Complete application-type-aware assembly

Evidence: validation supports provisional, utility, and design matters, while the deterministic
assembler is utility-specific. This pass safely blocks non-utility assembly.

Acceptance criteria:

- separate provisional, utility, and design document/upload/fee profiles;
- add one end-to-end example and artifact snapshot per supported type;
- keep the current fail-closed block until each profile passes legal-rule and visual review.

### P1 — Bind rigor to exact matter inputs

Evidence: current-time staleness is fixed, but a rigor report still lacks authoritative hashes for
the claims, specification, drawings, and dossier state it evaluated.

Acceptance criteria:

- record canonical input hashes in the rigor report;
- preflight recomputes and compares them;
- any changed input makes the report stale and blocks assembly until rigor is rerun.

### P2 — Expand operational and UI coverage

Evidence: nine first-party production modules remain unloaded by tests, including the browser viewer,
several CLIs, and the review-form questionnaire entrypoint.

Acceptance criteria:

- add a browser test for viewer review panels and wrong-kind/collision diagnostics;
- add CLI artifact tests for currently unloaded entrypoints;
- expand direct API/CLI coverage for the review-form server and questionnaire entrypoint;
- establish blocking file-load and function-coverage floors only after intentional CLI/browser
  exclusions are documented.
