# Review Coverage Matrix

This tracks the external patent-skill review items against the current repository so future agents do
not need to rediscover which gaps are closed, partially covered, or intentionally deferred.

For the detailed implementation checklist derived from these items, see
`docs/implementation-checklist.md`.

## P0 Items

| Review item | Current coverage |
|---|---|
| Update AI-inventorship legal language to current USPTO posture | Covered in `docs/legal-guardrails.md`, generated preamble, and validator posture: only natural persons may be inventors; AI systems are tools; apply ordinary inventorship/conception law and verify current USPTO guidance. |
| Rename "filing-ready" product language | Covered in assembly skill/CLI language: output is an "assembly package draft" and APA stops at the submit boundary. Historical rigor verdict names remain in `apa-rigor` for compatibility. |
| Standardize PatentSearch / PatentsView / PPS naming | Covered by `docs/source-registry.md` and source IDs: `patentsview`, `uspto-pps`, `google-patents-ui`, `google-bigquery`. |
| Add drawing-quality as an autoprep / assembly gate | Covered: `/apa-autoprep` routes `/apa-figures` to `/apa-drawing-quality`; `packages/apa-assemble/preflight.mjs` warns when missing and blocks on blocking drawing findings. |
| Cap examiner-adversary loops | Covered in `/apa-autoprep` and `/apa-examiner`: default `max_examiner_loops` is 2; after the cap the agent emits residual risk instead of looping. |
| Require practitioner-mode approval before claim/OA edits | Covered in generated preamble, claim/examiner/OA skills, and `packages/apa-prosecute` refusal for `user_role: pro_se`. |

## P1 Items

| Review item | Current coverage |
|---|---|
| Move long legal preamble into references | Deferred. The generator keeps the full hard-refusal preamble inline because safety posture currently relies on every host loading it. Progressive-disclosure refactoring should be a separate compatibility change. |
| Add artifact-wide run log | Partially covered. `docs/protocol.md` specifies `trace/runlog.jsonl`; `packages/apa-trace` implements append/validation/hash helpers; `apa-search --write` and `apa-assemble --write` append runlog entries. Rigor, prosecution, and eval integrations remain future work. |
| Add source-span hashes | Covered in warning mode. `packages/apa-validate/source-spans.mjs` defines the allowed source-span fields and sources; the validator warns on adopted limitations and adopted `SPEC####` paragraphs missing source metadata, supports `source_span_policy: "relaxed"` for compiled/public imports, and allows `source: not-recoverable` without pretending conception evidence. |
| Add prior-art search dossier | Covered. `apa-search --write` writes `evidence/prior_art/search-dossier-<timestamp>.json` with query hash, scan result, source summaries, ranked candidates, assigned PA IDs, and human closest-art verification state. |
| Add upload manifest | Covered. `apa-assemble --write` writes `assembled/upload_manifest.json` with generated-file hashes, intended upload set, submit boundary, and human-verification flags. |
| Create wrappers for external sinks | Covered for generic send/fetch/npx paths. `packages/apa-safe` provides `apa-safe-send`, `apa-safe-fetch`, and `apa-safe-npx` aliases with exact-byte `apa-redact` scanning, HIGH blocking, MEDIUM `--yes` approval, `trace/runlog.jsonl` sink hashes, untrusted fetch envelopes, and pinned package enforcement. `apa-search` and `apa-eval` retain their path-specific guards. |
| Add JSON report schemas for skills | Partially covered. Drawing-quality, SVG-upgrader, search dossier, upload manifest, and rigor already emit/require structured outputs. Claims, patentability, examiner, and OA still need formal JSON schema modules. |

## P2 Items

| Review item | Current coverage |
|---|---|
| Benchmark suite with public patents/OAs/synthetic disclosures | Deferred. Existing tests cover deterministic mechanics and example matters; broader legal-drafting benchmark data is a separate dataset effort. |
| Trigger tests for each skill | Deferred. Skill docs are generated and checked for freshness; host-trigger behavioral tests are not implemented. |
| Jurisdiction/rule packs | Deferred. The current protocol is USPTO-scoped; rule-pack abstraction is future work. |
| Counsel/work-product mode | Partially covered by guardrail text and warnings. A formal mode bit and privilege-preserving workflow are future work. |
| Human review UI for provenance, IDS, support, and drawings | Deferred. Existing viewer renders unresolved graph warnings; review/adoption UI is future work. |

## Compatibility Notes

- Historical `File-Ready / File-With-Revisions / Major-Rework / Do-Not-File` rigor verdict strings are
  retained for compatibility with existing tests, docs, and preflight gates.
- `packages/apa-skills/skills` is generated output; edit `skills/*/SKILL.md.tmpl` and run
  `node scripts/gen-skill-docs.mjs`.
- None of these entries is legal advice or a representation that a patent application is ready to file.
