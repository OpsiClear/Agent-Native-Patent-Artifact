# Review Coverage Matrix

This tracks the external patent-skill review items against the current repository so future agents do
not need to rediscover which gaps are closed, partially covered, or intentionally deferred.

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
| Add artifact-wide run log | Partially covered. `docs/protocol.md` now specifies optional `trace/runlog.jsonl` with hashes, commands, external sinks, and human checkpoints. CLI-wide automatic logging remains future work. |
| Add source-span hashes | Partially covered by skill instructions: disclosure/spec/claim skills require source-span metadata for promoted observations, limitations, and spec paragraphs. Validator enforcement remains future work. |
| Add prior-art search dossier | Covered. `apa-search --write` writes `evidence/prior_art/search-dossier-<timestamp>.json` with query hash, scan result, source summaries, ranked candidates, assigned PA IDs, and human closest-art verification state. |
| Add upload manifest | Covered. `apa-assemble --write` writes `assembled/upload_manifest.json` with generated-file hashes, intended upload set, submit boundary, and human-verification flags. |
| Create wrappers for external sinks | Partially covered. Current networked code paths have local guards: `apa-search` scans exact query bytes before egress; `apa-eval` has timeout/retry/response-size bounds and injection fencing. Separate `apa-safe-fetch` / `apa-safe-npx` wrappers are deferred architecture. |
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
