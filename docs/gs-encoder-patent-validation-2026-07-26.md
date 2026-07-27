# External Patent Matter Validation — 2026-07-26

This report records a three-agent, evidence-backed hardening pass against a local, confidential,
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
npm run --silent verify:external-matter -- --now 2026-07-26T12:00:00.000Z --expect no-go --json --require
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

## Post-fix aggregate result

The pinned verifier returned exit 0 because the observed state matched the expected `NO-GO`.

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

## Three-agent post-fix scores

| Review lane | Dimension scores | Overall |
|---|---|---:|
| Benchmark harness | Reproducibility 3; regression coverage 4; signal quality 5; operational/privacy safety 4 | 4.0/5 |
| Corpus integrity | Ingest compatibility 5; structural integrity 4; traceability 4; fail-closed behavior 5 | 4.5/5 |
| Patent fidelity | Content coverage 4.5; claim-support traceability 4; drawing-reference consistency 4.5; filing-state evidence 4.5 | 4.4/5 |
| **Combined control score** | Mean of the twelve dimension scores | **4.3/5** |

Reproducibility remains below 5 because the confidential corpus is intentionally untracked and the
current `--expect no-go` assertion detects status drift but not exact aggregate drift. Traceability
remains below 5 because source-span hashes are shape-checked rather than dereferenced and joint
inventor contribution is not yet representable at limitation granularity.

## Verification performed

- External-verifier privacy/read-only tests: 2/2 passed.
- Combined rigor, assembly, validator, viewer, verifier, and lifecycle regressions: 132/132 passed.
- Two pinned external-verifier runs produced byte-identical JSON.
- Aggregate output contained no absolute/home path, email address, URL, or matter text.
- External matter changes after review: zero.
- `npm test`: 425/425 passed.
- `npm run build`: generation/freshness, skill graph, syntax, skill/source checks, tests, and smoke
  passed.
- `npm run benchmark`: 8/8 offline cases passed.
- `npm run score:prior-art-search`: recall@20 1.00, recall@5 1.00, MRR 0.75, zero blocking failures.
- `npm run coverage`: 1399/1504 functions covered (93%) across 91 first-party files.
- `git diff --check`: passed.

## Prioritized remaining improvement plan

| Priority | Work | Acceptance evidence |
|---|---|---|
| P0 — human-controlled matter migration | Resolve 70 legacy provenance records with explicit declared contributors; move 21 TERM links to `defined_by`; repair seven reciprocal numeral relationships; confirm `user_role`; then rerun rigor/IDS and regenerate assembly only after all gates pass. Never infer one inventor where multiple people are declared. | Exact aggregate counts fall for the intended codes; all migrated IDs resolve; no filing output is generated while any gate remains blocked. |
| P1 — strict source-span verification | Replace hash-shape checks with an allowed-root, per-artifact `{path, locator, sha256}` contract; block missing, escaped, or mismatched sources under strict mode. | Regressions for changed, missing, outside-root, multi-source, and `not-recoverable` inputs. |
| P1 — joint-inventor/version contract | Add an explicit list-valued contributor/adoption relation and validate `apa_version` so breaking provenance and edge semantics are migration-aware. | Two declared contributors pass; empty/unknown contributors and unknown future versions fail loud. |
| P1 — bind rigor to evaluated inputs | Record canonical claims/specification/drawing/dossier hashes inside the rigor report and recompute them during preflight. | Any covered source change makes rigor stale independently of upload-manifest freshness. |
| P1 — exact private regression contract | Add an optional local aggregate oracle for the verifier: exact code histogram, valid-dossier count, required blocked-gate set, and non-emitted canonical digest. Do not commit a confidential matter digest. | Fixed-time identity, `--require`, invalid-path, unsafe-link, and contract-drift tests using public/synthetic fixtures. |
| P2 — semantic runlog audit | Verify record hashes and state transitions, flag nonzero commands claiming successful outputs, and detect latest-output drift. | A current-state audit reports stale rigor/output records and impossible success transitions. |
| P2 — graph completeness and drift | Inventory inactive prior-art evidence; add warning-level claim-prose/binding parity hashes; define minimum `illustrated_by`/`distinguished_over` evidence expectations. | Prose-only/binding-only mutations and orphan evidence produce stable machine findings without pretending to decide legal sufficiency. |
| P2 — freshness-bind human review | Bind review cards, questionnaires, and human-produced PDF checks to target hashes/counts. | A review state for a different IDS count or changed PDF becomes stale; unanswered factual questions block a readiness label without drawing legal conclusions. |

The external matter itself remains unchanged. Its current result is intentionally `NO-GO`; the value
of this pass is that APA now explains and preserves that state consistently instead of allowing
schema drift, wrong-kind edges, or historical package labels to imply readiness.
