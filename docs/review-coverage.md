# Review Coverage Matrix

This tracks the external patent-skill review items against the current repository so future agents do
not need to rediscover which gaps are closed, partially covered, or intentionally deferred.

For the detailed implementation checklist derived from these items, see
`docs/implementation-checklist.md`.

## P0 Items

| Review item | Current coverage |
|---|---|
| Update AI-inventorship legal language to current USPTO posture | Covered in `docs/legal-guardrails.md`, generated preamble, and validator posture: only natural persons may be inventors; AI systems are tools; apply ordinary inventorship/conception law and verify current USPTO guidance. |
| Rename "filing-ready" product language | Covered in assembly skill/CLI language: output is an "assembly package draft" and APA stops at the submit boundary. Historical rigor verdict names remain in `apa-rigor` for compatibility, with safer display aliases such as `Artifact-Quality: High For Human Final Review`. |
| Standardize PatentSearch / PatentsView / PPS naming | Covered by `docs/source-registry.md` and source IDs: `patentsview`, `uspto-pps`, `google-patents-ui`, `google-bigquery`. |
| Add drawing-quality as an autoprep / assembly gate | Covered: `/apa-autoprep` routes `/apa-figures` to `/apa-drawing-quality`; `packages/apa-assemble/preflight.mjs` warns when missing and blocks on blocking drawing findings. |
| Cap examiner-adversary loops | Covered in `/apa-autoprep` and `/apa-examiner`: default `max_examiner_loops` is 2; after the cap the agent emits residual risk instead of looping. |
| Require practitioner-mode approval before claim/OA edits | Covered in generated preamble, claim/examiner/OA skills, and `packages/apa-prosecute` refusal for `user_role: pro_se`. |

## P1 Items

| Review item | Current coverage |
|---|---|
| Move long legal preamble into references | Covered. `PATENT_PREAMBLE` now emits a concise inline hard-refusal block plus a routing table; `scripts/gen-skill-docs.mjs` generates one-level `references/` files for legal guardrails, USPTO rule pack, confidentiality sinks, drawing standards, and source registry beside every skill. Host tests verify safety references are retained. |
| Add artifact-wide run log | Covered for the current deterministic write/live-sink paths. `docs/protocol.md` specifies `trace/runlog.jsonl`; `packages/apa-trace` implements append/validation/hash helpers; `apa-search --write`, `apa-search verify-reference`, `apa-search verify-closest-art`, `apa-assemble --write`, `apa-reports scaffold`, `apa-rigor scaffold --out`, `apa-prosecute respond --write`, and live `apa-eval --matter` append runlog entries. `apa-eval --mock` stays offline and does not create a cloud-sink runlog. |
| Add source-span hashes | Covered in warning and strict modes. `packages/apa-validate/source-spans.mjs` defines the allowed source-span fields and sources; the validator warns on adopted limitations and adopted `SPEC####` paragraphs missing source metadata by default, turns those findings into validation errors under `source_span_policy: "strict"`, supports `source_span_policy: "relaxed"` for compiled/public imports, and allows `source: not-recoverable` without pretending conception evidence. |
| Add prior-art search dossier | Covered. `apa-search --write` writes `evidence/prior_art/search-dossier-<timestamp>.json` with query hash, scan result, source parameters, source summaries, top-N before/after dedupe/ranking, dedupe clusters, excluded results/reasons, assigned PA IDs, and human closest-art verification state. `apa-search verify-reference` and `apa-search verify-closest-art` update verification state, append runlog entries for the dossier mutation, and keep IDS readiness false until title, venue, canonical link, and relied-on passage are verified. |
| Add upload manifest | Covered. `apa-assemble --write` writes `assembled/upload_manifest.json` with generated-source hashes, separate human-produced upload-PDF placeholders, ADS/IDS/declaration/fee-schedule metadata, fee schedule source hash/effective date, IDS no-admission/no-search-completeness notes, PDF export verification fields, explicit `deferred_human_actions` linked to the manifest fields they complete, Patent Center human-upload checklist fields, submit boundary, and human-verification/completion flags defaulting false. |
| Add prior-art staleness caps to rigor | Covered. `apa-rigor scaffold` records `prior_art_state` from the newest search dossier; `apa-rigor check` caps P5 to 2 when prior-art state is missing, stale, lacks a usable search date, or lacks human-verified closest art, preventing fileable verdicts from stale/unverified prior-art posture. |
| Create wrappers for external sinks | Covered for generic send/fetch/npx paths. `packages/apa-safe` provides `apa-safe-send`, `apa-safe-fetch`, and `apa-safe-npx` aliases with exact-byte `apa-redact` scanning, HIGH blocking, MEDIUM `--yes` approval, `trace/runlog.jsonl` sink hashes, untrusted fetch envelopes, and pinned package enforcement. `apa-search` and `apa-eval` retain their path-specific guards. |
| Add JSON report schemas for skills | Covered for the four remaining semantic report types. `packages/apa-reports` defines and validates the shared report envelope plus `claims`, `patentability`, `examiner_adversary`, and `office_action` schemas; `claim-lint --report-out` writes `claims_report.json`; `apa-prosecute respond --write` writes `office_action_report.json`; `/apa-claims`, `/apa-analyze`, `/apa-examiner`, and `/apa-office-action` now require report validation. |

## P2 Items

| Review item | Current coverage |
|---|---|
| Benchmark suite with public patents/OAs/synthetic disclosures | Covered for the deterministic v0.1 gate. `benchmarks/` contains a public-patent compile fixture, a public USPTO Office Action/sample fixture, and a synthetic disclosure-to-assembly fixture; `scripts/benchmark.mjs --mock` verifies fixture policy, expected mechanical outputs, and semantic snapshots offline. Larger legal-drafting benchmark datasets remain a future expansion. |
| Trigger tests for each skill | Covered. Every committed skill has `trigger-tests.json` with at least three should-trigger and three should-not-trigger prompts; `scripts/check-skills.mjs` validates frontmatter length, explicit `/apa-*` invocation triggers, offline routing fixtures, pure legal-advice non-triggers, and host-rendered Claude/Codex/Cursor frontmatter behavior. |
| Jurisdiction/rule packs | Covered for the USPTO-only v0.1 scope. `docs/rule-packs/uspto.json` is the active dated `uspto-v1` pack; generated skill references, validator meta, viewer manifest meta, semantic reports, and rigor reports surface the rule-pack id/effective date. Non-USPTO `jurisdiction` values fail validation instead of silently applying USPTO rules; PCT/EPO remain explicit disabled extension points. |
| Counsel/work-product mode | Covered for v0.1. `PATENT.md` has explicit `confidential_workflow_mode` values (`ordinary_local`, `counsel_controlled`, `shareable_redacted`); `packages/apa-validate` fails loud on unknown modes and warns on shareable-redacted matters containing sensitive critique reports; `packages/apa-redact/confidential-workflow.mjs` centralizes sensitive-artifact exclusions; `apa-assemble` preflight and `assembled/upload_manifest.json` surface the mode and exclude critique artifacts from shareable exports by default. APA still does not claim to create or preserve privilege. |
| Human review UI for provenance, IDS, support, and drawings | Covered as a read-only static review surface. `build_manifest.mjs` emits `review.schema: apa-viewer-review-v1`; `viewer.js` renders Review panels for unadopted limitations, unverified prior art/IDS references, unresolved support edges, and drawing-quality state before the artifact cards. Writeback/adoption controls remain future work. |

## Compatibility Notes

- Historical `File-Ready / File-With-Revisions / Major-Rework / Do-Not-File` rigor verdict strings are
  retained for compatibility with existing tests, docs, and preflight gates; display aliases should be
  shown to users where possible.
- `packages/apa-skills/skills` is generated output; edit `skills/*/SKILL.md.tmpl` and run
  `node scripts/gen-skill-docs.mjs`.
- None of these entries is legal advice or a representation that a patent application is ready to file.
