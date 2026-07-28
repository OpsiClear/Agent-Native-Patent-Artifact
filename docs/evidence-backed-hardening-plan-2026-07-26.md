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
| Skill bundling could recursively replace an arbitrary destination and its pack test mutated the repository copy | Bundling is contained to `<packageRoot>/skills`, rejects overlap, stages transactionally, requires exact cross-host skill-set parity, and tests `npm pack` in a disposable package tree. | `packages/apa-skills/test/bundle-freshness.test.mjs` |
| tldraw support was guidance-only and did not prove its SVG acceptance boundary | The skill now provides an executable local gate sequence, conditional pinned `apa-safe-npx` guidance, and paired safe/unsafe snapshot/export fixtures that verify numeral parity and active-content rejection. | `skills/tldraw-patent-drawing/tldraw-fixture.test.mjs` |
| Coverage omitted unexecuted files from the denominator | Coverage now reports tracked-file load coverage separately from function coverage among loaded files, documents browser/controller exclusions, and enforces 95% file-load plus 90% loaded-function floors. | `scripts/coverage-summary.mjs`; full `npm run coverage` |
| `apa-run status` treated the presence of a skill ID in the runlog as proof of completion | Status schema v2 requires a successful latest command, current input/output hashes, evidence for declared outputs, safe matter-local paths, and satisfied required checkpoints. Pending, failed, and stale states include stable machine-readable reason codes. | `packages/apa-run/test/runner.test.mjs`; aggregate-only external-matter revalidation |
| Runlog history could be reordered, truncated, or downgraded, and `apa-run run` was a handoff only | Runlog v2 chains every entry to its predecessor and maintains a separate tail head; a retained head detects complete ledger removal and v1 is allowed only as a prefix. The runner executes only contained declared Node scripts without a shell, reserves the selected matter path, retries failures, rejects incomplete evidence before checkpoint review, and requires a fresh explicit continuation after reruns. | `packages/apa-trace/test/runlog.test.mjs`; `packages/apa-run/test/runner.test.mjs` |
| Source hashes were shape-checked but not dereferenced | Strict mode now requires one or more `{path, locator, sha256}` records under allowed matter roots and fails on escape, missing/non-file targets, symlink escape, or hash drift; `not-recoverable` remains an explicit honesty boundary. | `packages/apa-validate/test/source-spans.test.mjs`; validator regressions |
| Protocol changes and joint contribution were not migration-aware | `apa_version` accepts 0.1/0.2 and rejects unknown future versions. v0.2 requires a non-empty, duplicate-free limitation-level `contributors` list resolving to declared inventors; the viewer emits contribution edges. | `packages/apa-validate/test/graph-integrity.test.mjs`; `packages/apa-viewer/test/build_manifest.test.mjs` |
| Rigor could remain apparently current after claims/spec/drawing/dossier changes | Rigor reports now contain a canonical input fingerprint independent of the report itself; preflight blocks changed, added, removed, or unsafe linked inputs, including symlinked target roots and ancestors. | `packages/apa-rigor/test/scaffold.test.mjs`; `packages/apa-assemble/test/assemble.test.mjs` |
| Private-matter drift had no exact local oracle without exposing a digest | The optional `apa-external-matter-oracle-v1` checks fixed time, exact code histograms, dossier counts, blocked gates, and a private canonical digest while verification v2 never emits that digest. | `scripts/verify-external-matter.test.mjs` |
| Inactive evidence, claim prose/binding drift, and thin graph evidence were silent | The validator inventories active/evidence PA records, hashes normalized prose/binding text, and warns when independent claims lack expected distinction/illustration links. | `packages/apa-validate/test/validate.test.mjs` |
| Human review and questionnaires could outlive changed claims, IDS, drawings, or filing files | Review-state/questionnaire v2 binds exact target hashes/counts; stale answers, unanswered/unresolved required facts, unsupported affirmative answers, and PDF approval with no bound PDF/DOCX block preflight. | `skills/apa-review-form/scripts/review_fingerprint.test.mjs`; `ask_review_questions.test.mjs`; assembly preflight tests |
| Validation supported provisional/design matters but their assembly shape was undocumented | Type-specific provisional/design collation profiles and checked-in snapshots now exist. They remain fail-closed review candidates until authorized legal-rule and rendered-document approval. | `packages/apa-assemble/test/application-profiles.test.mjs`; `packages/apa-assemble/test/assemble.test.mjs` |
| Repository-coupled packages appeared publishable and installed skills mixed host variants | Only `apa-redact` and `@apa/patent-skills` remain public. Public package CLIs pack/install/execute in empty projects and host variants bundle independently. Installed lifecycle skills explicitly require an APA checkout for repository CLI gates; the bundled `apa-form-fill` runtime is independently executable. | `scripts/check-package-isolation.mjs`; installer/bundle tests; `.github/workflows/gate.yml` |
| Viewer/browser and CLI boundaries lacked direct release regressions | A real Chrome/Edge/Chromium test proves review panels, wrong-kind diagnostics, duplicate IDs, and unresolved-edge visibility; CLI tests cover redact, skillgraph, installer, and questionnaires. | `test/viewer-browser.test.mjs`; package/skill CLI tests |

## Verification evidence

The integrated closure working tree passed:

- `npm run build`: generated-skill freshness, skillgraph, syntax, source registry, 530/530 tests,
  public-package isolation, and smoke;
- `npm run distribution:check`: `apa-redact` and `@apa/patent-skills` both packed, installed, and
  executed in empty projects;
- `npm run benchmark`: 8/8 offline benchmark cases;
- `npm run score:prior-art-search`: recall@20 1.00, recall@5 1.00, MRR 0.75;
- `npm run score:real-software-patents`: 3/3 cases, score 1.00, zero blocking failures;
- `npm run coverage`: 108/108 included first-party files loaded (100%; floor 95%) and 1875/2061
  functions covered among loaded files (91%; floor 90%);
- Playwright CLI + Edge: review/support panels rendered, manifest HTTP 200, and zero browser console
  errors/warnings after the favicon fix; the dedicated wrong-kind/collision browser regression passed;
- pinned private-matter verification: two byte-identical aggregate v2 results, expected `NO-GO`,
  zero unsafe linked inputs, and a matching in-memory private oracle whose canonical digest was not
  emitted;
- external Git HEAD and status digest: unchanged, with a clean status before and after;
- `git diff --check`: no whitespace errors.

## Closure status and retained human boundaries

| Former improvement item | Closure evidence | Status |
|---|---|---|
| Honest executable distribution boundary | Repository-coupled packages are private; both public package CLIs execute in empty projects; Claude/Codex/Cursor variants are independently verified; installed lifecycle skills declare their checkout dependency; and the packed `apa-form-fill` runtime executes without a checkout. | Closed |
| Execute rather than only plan | `apa-run run` executes declared deterministic runners and logs evidence. Semantic agent steps intentionally stop as `awaiting-agent`; checkpoints require recorded satisfaction plus explicit continuation. | Closed software boundary |
| Application-type-aware assembly | Utility is enabled. Provisional/design render distinct checked-in candidate profiles, but preflight remains blocked until human legal and visual approval. | Software closed; human approval retained |
| Bind rigor to exact inputs | Rigor fingerprint is generated and enforced independently of upload-package freshness. | Closed |
| Operational/UI coverage | Dedicated real-browser and CLI regressions exist; blocking coverage floors and documented exclusions are active. | Closed |

Two boundaries intentionally remain open because software cannot supply the missing authority:

1. A confidential external matter remains `NO-GO` until authorized people verify its factual/legal
   checkpoints, including IDS references, closest art, role, rigor disposition, rendered filing
   documents, signatures, and filing acts.
2. Provisional/design profiles remain review candidates until authorized legal-rule and rendered-
   document reviewers approve those profiles. A snapshot test cannot substitute for that approval.
