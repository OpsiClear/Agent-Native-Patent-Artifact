# External Patent Matter Validation — 2026-07-26

This generically named report records a three-agent, evidence-backed hardening pass against a local, confidential,
Git-ignored patent matter. It contains aggregate mechanics only. The external matter was read but
not copied, edited, committed, packaged, or added as a benchmark fixture. No title, person, citation,
excerpt, absolute path, or source-content hash is recorded here.

The scores assess APA's software controls and regression value. They are not legal conclusions,
patentability opinions, or filing-readiness scores.

## Method

Three independent review lanes were used:

1. **Benchmark harness:** reproducibility, regression coverage, signal quality, and privacy/operational
   safety.
2. **Corpus integrity:** ingest compatibility, typed graph integrity, provenance/traceability, and
   fail-closed behavior.
3. **Patent fidelity:** content coverage, claim-support traceability, reciprocal drawing references,
   and filing-state evidence.

The final local check used a pinned evaluation time and the opt-in aggregate verifier:

```powershell
$env:APA_EXTERNAL_MATTER = "<local-gitignored-matter>"
npm run --silent verify:external-matter -- --now 2026-07-26T12:00:00.000Z --expect no-go `
  --domain software `
  --support apa-review-form `
  --support apa-tldraw-drawings `
  --support apa-svg-upgrader `
  --json --require
Remove-Item Env:APA_EXTERNAL_MATTER
```

## Review evidence that drove the changes

| Exposed gap | Before the fix | Required behavior |
|---|---|---|
| Wrong-kind support edges | Twenty-one limitation-to-term links were present in `supported_by`; rigor still mechanically scored P4 as 4. | A TERM is not §112 specification support. The edge must fail Level 1, remain visible in the viewer, and force P4 to 1. |
| Search-dossier disagreement | Rigor counted two parseable dossiers although only one satisfied the canonical schema; IDS already rejected the invalid one. | Rigor and IDS must use the same strict dossier boundary. |
| One-sided drawing checks | Seven drawing/SPEC reciprocal inconsistencies produced no mechanical finding. | Both sides of each numeral relationship must agree, and mismatch/missing declarations must block the drawing gate. |
| Legacy filing authority | A historical saved package still displayed `GO` without binding that status to the source inputs that produced it. | A package without a current canonical-input fingerprint must be stale and unable to carry forward `GO`. |
| Provenance visibility | Repeated invalid provenance values were hard to audit consistently across validator, viewer, rigor, and preflight. | All affected entities must remain visible, counts must agree, and preflight must fail closed with grouped evidence. |
| Definition-edge overloading | Lexicographic TERM links had no typed field distinct from §112 support. | `defined_by: LIM -> TERM` must coexist with, and never replace, `supported_by: LIM -> SPEC`. |

## Implemented controls

| Control | Implementation | Regression evidence |
|---|---|---|
| Strict typed edges and provenance | `packages/apa-validate/validate.mjs` validates target kinds, declared provenance, reciprocal numeral declarations, and missing `user_role`; `defined_by` is a first-class edge. | `packages/apa-validate/test/graph-integrity.test.mjs`; `packages/apa-validate/test/validate.test.mjs` |
| Evidence-aware rigor | `packages/apa-rigor/scaffold.mjs` records Level-1 error histograms, treats wrong-kind support edges as P4 failures, and ignores schema-invalid dossiers. | `packages/apa-rigor/test/scaffold.test.mjs` |
| Dossier parity | Rigor and IDS both use the canonical `apa-search-dossier-v1` validator; a legacy boolean cannot confer IDS readiness. | `packages/apa-assemble/test/ids-dossier-readiness.test.mjs`; rigor scaffold tests |
| Viewer parity | Invalid/undeclared provenance and wrong-kind targets remain visible as blockers/unresolved edges instead of silently resolving. | `packages/apa-viewer/test/build_manifest.test.mjs` |
| Stale-package prevention | `apa-upload-manifest-v2` embeds an `apa-assembly-input-fingerprint-v1`; preflight recomputes it and blocks missing or mismatched historical manifests. | `packages/apa-assemble/test/assemble.test.mjs` |
| Local private-corpus verifier | `scripts/verify-external-matter.mjs` composes read-only APIs and emits aggregate counts/status only; absence skips unless `--require` is set. | `scripts/verify-external-matter.test.mjs` |
| Evidence-based orchestration status | `apa-run-status-v2` checks the latest command result, current recorded input/output hashes, declared output evidence, safe matter-local paths, and required human checkpoints before setting `completed: true`. | `packages/apa-run/test/runner.test.mjs` |
| Strict source identity | Strict source spans are verified as allowed-root `{path, locator, sha256}` records, including multiple sources, missing/changed files, path escape, symlink escape, and explicit `not-recoverable`. | `packages/apa-validate/test/source-spans.test.mjs` |
| Versioned joint contribution | The validator accepts v0.1/v0.2, rejects future versions, and requires valid limitation-level contributor lists for adopted v0.2 limitations; the viewer retains contribution edges. | validator/viewer graph-integrity tests |
| Rigor input identity | The saved rigor review is bound to canonical claims/specification/drawing/dossier inputs independently of upload-package freshness. | rigor scaffold and assembly preflight tests |
| Exact private aggregate oracle | An optional private oracle binds fixed time, exact error/warning histograms, valid-dossier counts, blocked gates, and the canonical input digest; verifier v2 never emits the digest. | `scripts/verify-external-matter.test.mjs` |
| Chained execution evidence | Runlog v2 plus its independent head detect mutation, reordering, retained-head truncation, full ledger removal, and v2-to-v1 downgrade. `apa-run run` confines runners and matter paths, retries failed checkpointed attempts, rejects incomplete evidence before review, and requires continuation newer than rerun evidence. | runlog/runner tests |
| Graph-completeness signals | Inactive/missing PA evidence, normalized claim prose/binding drift, and missing illustration/distinction evidence now produce stable mechanical warnings. | validator regressions |
| Review-target freshness | Human review state, questionnaires, and answers bind claims/IDS/drawings/PDFs by digest and count; stale or unresolved required review blocks preflight. | review-fingerprint/questionnaire/preflight tests |
| Application profiles | Utility is repository-reviewed; provisional/design have distinct candidate snapshots and remain blocked pending authorized rule/visual review. | application-profile snapshots and preflight tests |
| Distribution/UI/coverage release gates | Only two packages are public and both package CLIs pass empty-project isolation; host variants have exact skill-set parity; lifecycle skills declare their APA-checkout dependency; the self-contained form-fill runtime is packed and smoke-tested separately; a real browser verifies the viewer; 95%/90% coverage floors block regressions. | distribution script, viewer browser test, coverage command, CI |

## Historical post-fix aggregate result

The following snapshot is the evidence that originally exposed the migration gaps. It is retained as
historical audit evidence and is not the matter's current mechanical state. The pinned verifier
returned exit 0 because the observed state matched the expected `NO-GO`.

| Surface | Aggregate result |
|---|---|
| Mechanical validation | 98 errors, 1 warning |
| Error histogram | `PROVENANCE_UNKNOWN` 70; `EDGE_TARGET_KIND` 21; `NUMERAL_SPEC_RECIPROCAL_MISSING` 6; `NUMERAL_SPEC_RECIPROCAL_MISMATCH` 1 |
| Warning histogram | `USER_ROLE_MISSING` 1 |
| Parsed scope | 20 claims; 2 inventors; 6 figures; 18 active prior-art references |
| Viewer graph | 222 nodes; 306 edges; 21 unresolved/wrong-kind edges; 70 provenance blockers |
| Claim support | Every one of 50 limitations retains at least one valid SPEC target; 99 of 120 recorded support links are valid SPEC links |
| Rigor | Level 1 failed; P3 = 5; P4 = 1; one valid dossier; prior-art cap required; saved verdict `Major-Rework`, mean 3.33 |
| IDS | 18 references; 18 unverified; one valid dossier |
| Drawings | 6 figures; 52 numerals; no legend flags; seven reciprocal relationship defects now detected |
| Filing gate | `NO-GO`; six blocked gates, including drawings, rigor, and stale saved-package authority |
| Input/privacy check | 93 canonical input files; zero unsafe linked paths; aggregate-only output |

The 98 errors are not 98 independent substantive defects. They comprise one repeated legacy
provenance migration (70 records), one repeated legacy edge-typing migration (21 links), and seven
newly exposed reciprocal drawing/SPEC inconsistencies.

## Current aggregate revalidation

After the external matter evolved, the same pinned, read-only verifier was rerun. The migration
findings from the historical snapshot are now mechanically clear, but unresolved human and
freshness evidence correctly keep the matter at `NO-GO`.

| Surface | Current aggregate result |
|---|---|
| Mechanical validation | 0 errors; 3 warnings (`DISTINGUISHED_OVER_MISSING` x3) |
| Parsed scope | 20 claims; 2 inventors; 6 figures; 18 active prior-art references |
| Viewer graph | 223 nodes; 357 edges; 0 unresolved/wrong-kind edges; 0 provenance blockers |
| Rigor | Level 1 passed; P3 = 5; P4 = 5; one valid dossier; prior-art cap still required because closest art is not human-verified; saved verdict `Major-Rework`, mean 3.67 |
| IDS | 18 references; 18 unverified; one valid dossier |
| Drawings | 6 figures; 52 numerals; no legend flags |
| Filing gate | `NO-GO`; blocked on stale human-review state, stale/incomplete questionnaire evidence, rigor review, and stale assembled-package authority; user-role and mechanical warnings remain |
| Input/privacy check | 100 canonical input files; zero unsafe linked paths; aggregate-only output |
| Orchestration status v2 | 19 total steps; 14 pending; 5 stale; 0 completed or failed; 56 pending required checkpoints (human checkpoints plus declared gates) |

Before status v2, the same ledger named prior-art search, rigor, and assembly as completed. After the
fix, prior-art search reports input/output hash drift plus a pending checkpoint; rigor reports output
hash drift plus pending checkpoints; and assembly reports input drift plus pending checkpoints.
No private content is needed to explain any of those state transitions.

The three distinction warnings do not represent a software regression: they are the new
graph-completeness signal on three independent claims whose `distinguished_over` evidence is empty.
Selecting closest art is a human-controlled factual/legal checkpoint, so the verifier surfaces the
condition and preserves `NO-GO` rather than editing the confidential matter.

## Three-agent baseline scores and closure disposition

| Review lane | Baseline evidence | Baseline score | Closure disposition |
|---|---|---:|---|
| Benchmark harness | Clean fingerprint is frozen once; failed or missing-key runs cannot become baselines; evidence remains available for failed runs. | 9.0/10 PASS | Exact private oracle, executable runner, isolation matrix, and coverage floors close the identified software deductions. |
| Corpus integrity | Aggregate verifier exposes no private paths; review/date boundaries fail closed; bundle replacement is transactional and confined to `packageRoot/skills`. | 9.2/10 PASS | Strict dereferenced spans, versioned contributors, chained ledger/head, and review fingerprints close the identified software deductions. |
| Patent fidelity | Multi-root SVG payload is rejected; 11 gallery artifacts are hash-bound; tldraw safe/unsafe fixtures exercise the export boundary. | 9.2/10 PASS | Rigor input binding, graph-completeness warnings, browser parity, and type-specific profile snapshots close the identified software deductions. |
| **Combined control score** | Mean of the three independent baseline scores | **9.1/10 PASS** | **No scoped software gap remains open; human authority boundaries remain fail-closed.** |

The corpus lane initially blocked release packaging because reviewed files were untracked. This
release includes them. The later closure pass also resolves the runner handoff, strict source
dereference, and limitation-level joint-contributor deductions. The confidential corpus remains
intentionally outside Git, and the matter/profile decisions listed below remain human-controlled.

## Verification performed

- Full build: 530/530 tests plus generation/freshness, skill graph, syntax, skill/source checks,
  public-package isolation, and smoke passed.
- External-verifier regressions cover read-only/privacy behavior, absent/required/invalid paths,
  fixed-time oracle identity/drift, and unsafe links.
- Two fixed-time CLI runs with the software domain and all three support hooks produced byte-identical
  aggregate v2 JSON and matched expected `NO-GO`.
- An in-memory private oracle matched twice; its canonical digest was not emitted.
- Aggregate output contained no absolute/home path, email address, URL, matter text, or private digest.
- External Git HEAD and exact status digest were identical before and after; status was clean both times.
- Playwright CLI + Edge rendered the review/support panels, loaded `manifest.json` with HTTP 200, and
  reported zero console errors/warnings after the favicon fix; the dedicated wrong-kind/collision
  browser regression also passed.
- `npm run distribution:check`: both public packages packed, installed, and executed in empty projects.
- `npm run benchmark`: 8/8 offline cases passed.
- `npm run score:prior-art-search`: recall@20 1.00, recall@5 1.00, MRR 0.75, zero blocking failures.
- `npm run score:real-software-patents`: 3/3 cases, score 1.00, zero blocking failures.
- `npm run coverage`: 108/108 included first-party files loaded (100%; floor 95%); 1875/2061
  functions covered among loaded files (91%; floor 90%).
- `git diff --check`: passed.

## Retained human authority boundaries

All software items in the prior improvement table are implemented and regression-tested. Two
categories remain intentionally `NO-GO`:

| Boundary | Why software cannot close it | Required human evidence |
|---|---|---|
| External matter factual/legal/filing review | The verifier can prove structure and freshness, but cannot verify facts, choose legal positions, sign, or file. | Authorized reviewers verify IDS references and closest art, confirm role, resolve rigor findings, review rendered PDFs/DOCX, complete forms/signatures, and perform any filing act. |
| Provisional/design profile authorization | Deterministic snapshots prove stable collation, not correctness under current legal rules or rendered-document quality. | Authorized legal-rule and visual reviewers approve each candidate profile before its preflight block can be removed. |

The external matter itself remains unchanged. Its current result is intentionally `NO-GO`; the value
of this pass is that APA now explains and preserves that state consistently instead of allowing
schema drift, wrong-kind edges, or historical package labels to imply readiness.
