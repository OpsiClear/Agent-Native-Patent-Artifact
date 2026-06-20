# Implementation Checklist

Source inputs:
- Shared external review: `https://chatgpt.com/share/6a36ca79-9774-83ea-a6a1-28d16414e3d7`
- Rendered shared-review contents checked through browser on 2026-06-20. No separate
  `implementation_plan.md` file is present in this repository; this checklist treats the shared
  review's P0/P1/P2 backlog plus the 14 skill-by-skill recommendations as the implementation plan.
- Current coverage map: `docs/review-coverage.md`
- Current protocol contract: `docs/protocol.md`
- Current source registry: `docs/source-registry.md`

This checklist converts the latest implementation plan into executable work items. It is intentionally
more operational than `docs/review-coverage.md`: every open item lists target files, acceptance
criteria, and verification commands.

Status legend:
- `[x]` means implemented and covered by at least the verification listed for that item.
- `[ ]` means open work.
- "Covered by Phase N" means the detailed implementation is tracked in that earlier section; the
  skill-by-skill item is kept so future reviewers can see which skill concern it closes.

## Source Coverage Index

Use this index to confirm that every substantive recommendation from the external review is either
implemented, preserved as a regression guard, or tracked as open work below.

| Source-plan item | Checklist coverage |
|---|---|
| P0: update AI-inventorship language to current USPTO posture | `0.1`, `2.3`, Global DoD legal-rule update requirement |
| P0: rename "filing-ready" outputs and preserve submit boundary | `0.2`, `1.7`, `3.11` |
| P0: standardize PatentSearch / PatentsView / PPS naming | `0.3`, `1.6`, `3.4` |
| P0: add drawing-quality as an autoprep / assembly gate | `0.4`, `3.1`, `3.8`, `3.10` |
| P0: cap examiner loops | `3.1`, `3.13` |
| P0: require practitioner-mode approval before claim/OA edits | `0.5`, `3.6`, `3.13`, `3.14` |
| P1: move long legal preamble into references | `1.4` |
| P1: add artifact-wide runlog | `1.1`, `3.1`, `3.11`, `3.12`, `3.14` |
| P1: add source-span hashes and strict/relaxed provenance handling | `1.2`, `3.2`, `3.3`, `3.7`, `3.8` |
| P1: create package-level wrappers for external sinks | `1.3`, `3.3`, `3.9`, Release Gate |
| P1: add JSON report schemas for semantic skills | `1.5`, `3.5`, `3.6`, `3.13`, `3.14`, Release Gate |
| P1: expand prior-art dossier and closest-art verification | `1.6`, `3.4`, `3.5`, `3.12` |
| P1: expand upload manifest and deferred human actions | `1.7`, `3.11`, Release Gate |
| P1: add rigor prior-art staleness caps and safer verdict display | `1.8`, `3.12` |
| P2: add public/synthetic benchmark suite | `2.1` |
| P2: add skill trigger tests | `2.2` |
| P2: add jurisdiction/rule-pack scaffolding | `2.3`, `3.7` |
| P2: add counsel/work-product workflow mode | `2.4`, `3.5`, `3.13` |
| P2: add human review UI for provenance, IDS, support, drawings | `2.5`, Release Gate |
| `/apa-autoprep` review recommendations | `3.1` |
| `/apa-disclose` review recommendations | `3.2` |
| `/apa-compile` review recommendations | `3.3` |
| `/apa-priorart` review recommendations | `3.4` |
| `/apa-analyze` review recommendations | `3.5` |
| `/apa-claims` review recommendations | `3.6` |
| `/apa-spec` review recommendations | `3.7` |
| `/apa-figures` review recommendations | `3.8` |
| `/apa-svg-upgrader` review recommendations | `3.9` |
| `/apa-drawing-quality` review recommendations | `3.10` |
| `/apa-assemble` review recommendations | `3.11` |
| `/apa-rigor` review recommendations | `3.12` |
| `/apa-examiner` review recommendations | `3.13` |
| `/apa-office-action` review recommendations | `3.14` |

## Global Definition Of Done

Every implementation PR or commit must satisfy:

- [ ] No generated skill drift:
  `node scripts/gen-skill-docs.mjs --check`
- [ ] Syntax check passes:
  `npm run syntax`
- [ ] Smoke checks pass:
  `npm run smoke`
- [ ] Full build passes:
  `npm run build`
- [ ] If a package behavior changed, add or update package-level `node --test` coverage.
- [ ] If a skill template changed, edit `skills/*/SKILL.md.tmpl`, then regenerate with
  `node scripts/gen-skill-docs.mjs`.
- [ ] If a legal-rule statement changed, update `docs/legal-guardrails.md`,
  `scripts/resolvers/preamble.mjs` or `scripts/resolvers/legal-rules.mjs`, and all generated skills.
- [ ] No final output may claim legal advice, filing readiness, search completeness, patentability,
  novelty, FTO clearance, or USPTO compliance.

## Phase 0 - Preserve Already-Closed P0 Items

These are already implemented, but future work must not regress them.

### 0.1 AI Inventorship Posture

- [ ] Keep rule text current: only natural persons may be named as inventors; AI systems are tools;
  apply ordinary inventorship/conception law; verify current USPTO guidance.
- [ ] Preserve validator rejection of AI-named inventors.
- [ ] Preserve generated skill preamble language.

Target files:
- `docs/legal-guardrails.md`
- `scripts/resolvers/preamble.mjs`
- `packages/apa-validate/validate.mjs`
- `packages/apa-assemble/preflight.mjs`
- `skills/*/SKILL.md.tmpl`

Acceptance criteria:
- [ ] A human inventor named `Claude Monet` is not blocked.
- [ ] An inventor named `DABUS`, `GPT`, `LLM`, or `AI` is blocked.
- [ ] Generated skill docs contain no superseded February 2024-only AI guidance framing.

Verification:
- [ ] `node --test packages/apa-validate/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

### 0.2 Assembly Package Draft Language

- [ ] Preserve "assembly package draft" wording.
- [ ] Avoid "filing-ready" except when referring to legacy rigor verdict names or historical review text.
- [ ] Keep submit-boundary language explicit.

Target files:
- `packages/apa-assemble/cli.mjs`
- `skills/filing-assembly/SKILL.md.tmpl`
- `README.md`
- `docs/walkthrough.md`

Acceptance criteria:
- [ ] CLI and skill output make clear APA never signs, certifies, or files.
- [ ] `assembled/upload_manifest.json` is described as an audit checklist, not proof of readiness.

Verification:
- [ ] `rg -n "filing-ready|ready to file|file-ready" README.md docs packages skills`
  and manually confirm any remaining hits are compatibility references or explicit prohibitions.

### 0.3 Prior-Art Source Naming

- [ ] Use only source IDs from `docs/source-registry.md`.
- [ ] Keep `patentsview` as PatentsView PatentSearch API.
- [ ] Keep `uspto-pps` as UI-only human handoff.
- [ ] Keep `google-patents-ui` disabled for automation.

Target files:
- `docs/source-registry.md`
- `packages/apa-search/sources/index.mjs`
- `skills/prior-art-search/SKILL.md.tmpl`
- `packages/apa-search/README.md`

Acceptance criteria:
- [ ] No skill uses ad hoc source names like "USPTO PatentSearch" without the canonical `source_id`.
- [ ] `node packages/apa-search/cli.mjs --list-sources` reflects the registry.

Verification:
- [ ] `node packages/apa-search/cli.mjs --list-sources`
- [ ] `node --test packages/apa-search/test/*.test.mjs`

### 0.4 Drawing-Quality Gate

- [ ] Keep `/apa-autoprep` routing `/apa-figures` to `/apa-drawing-quality`.
- [ ] Keep `apa-assemble` warning on missing drawing review and blocking on blocking drawing findings.
- [ ] Keep deterministic drawing review output at `evidence/drawings/quality-review.json`.

Target files:
- `packages/apa-assemble/preflight.mjs`
- `skills/autoprep/SKILL.md.tmpl`
- `skills/patent-drawing-quality/SKILL.md.tmpl`
- `packages/apa-figure/*`

Acceptance criteria:
- [ ] Missing drawing QA warns when drawings exist.
- [ ] `blocking_count > 0` blocks assembly.
- [ ] Clean gallery examples pass deterministic review.

Verification:
- [ ] `node --test packages/apa-assemble/test/assemble.test.mjs packages/apa-figure/test/*.test.mjs`
- [ ] `npm run smoke`

### 0.5 Practitioner / Pro-Se Branching

- [ ] Preserve `user_role` frontmatter validation.
- [ ] Preserve pro-se neutral-output behavior in claims, examiner, and office-action skills.
- [ ] Preserve `apa-prosecute respond --write` refusal for `user_role: pro_se`.

Target files:
- `docs/protocol.md`
- `packages/apa-validate/validate.mjs`
- `packages/apa-prosecute/cli.mjs`
- `skills/claim-drafting/SKILL.md.tmpl`
- `skills/examiner-adversary/SKILL.md.tmpl`
- `skills/office-action/SKILL.md.tmpl`

Acceptance criteria:
- [ ] Unknown `user_role` fails validation.
- [ ] Pro-se OA response scaffold is refused.
- [ ] Practitioner-mode edits still require explicit human approval.

Verification:
- [ ] `node --test packages/apa-validate/test/*.test.mjs packages/apa-prosecute/test/*.test.mjs`

## Phase 1 - Make The Remaining Safety Rules Executable

### 1.1 Runlog Automation

Current state: `docs/protocol.md` specifies optional `trace/runlog.jsonl`; `packages/apa-trace`
implements append/validation/hash helpers; `apa-search --write`, `apa-assemble --write`,
`apa-rigor scaffold --out`, `apa-prosecute respond --write`, and live `apa-eval --matter` runs append
runlog entries. `apa-eval --mock` remains offline and does not create a cloud-sink ledger.

Tasks:
- [x] Add a zero-dependency runlog helper module.
- [x] Compute SHA-256 hashes for inputs and outputs.
- [x] Append one JSON object per line to `<matter>/trace/runlog.jsonl`.
- [x] Support command records: argv, cwd, exit code, started/ended timestamps.
- [x] Support external sink records: kind, bytes SHA-256, scan verdict, human approval state.
- [x] Support human checkpoint records: required, satisfied, reviewer, timestamp.
- [x] Make helper tolerate missing `trace/` by creating it.
- [x] Make helper fail loud on invalid JSONL only when asked to validate; appending must not rewrite
  prior records.

Suggested targets:
- `packages/apa-trace/runlog.mjs` or `lib/runlog.mjs`
- `packages/apa-trace/test/runlog.test.mjs`
- `docs/protocol.md`

Integration tasks:
- [x] `apa-search --write` logs query sink hash, dossier output, PA outputs, and closest-art checkpoint.
- [x] `apa-assemble --write` logs generated package outputs and human filing checkpoints.
- [x] `apa-rigor` logs report generation.
- [x] `apa-prosecute respond` logs OA parse/scaffold actions in practitioner mode.
- [x] `apa-eval` logs cloud LLM sink only when attached to a matter and not in `--mock`.

Acceptance criteria:
- [x] Running `apa-search --matter <tmp> --source mock --write` creates or appends
  `trace/runlog.jsonl`.
- [x] Running `apa-assemble --matter <tmp> --write` appends generated-file output records.
- [x] Running `apa-rigor scaffold --matter <tmp> --out <tmp>/patent_rigor_report.json`
  appends report-generation records and review checkpoints.
- [x] Running `apa-prosecute respond --matter <tmp> --oa <file> --write` in practitioner mode
  appends OA scaffold records and practitioner checkpoints.
- [x] Live `apa-eval --matter <tmp>` appends cloud LLM sink hashes; `--mock` does not.
- [x] Re-running a command appends a second record; it does not mutate the first record.
- [x] JSONL validation catches malformed entries with useful line numbers.

Verification:
- [x] `node --test packages/apa-trace/test/*.test.mjs`
- [x] `node --test packages/apa-search/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`
- [x] `node --test packages/apa-rigor/test/*.test.mjs packages/apa-prosecute/test/*.test.mjs packages/apa-eval/test/*.test.mjs`

### 1.2 Source-Span Validation

Current state: protocol and skills request source-span metadata, and the validator now emits
warning-mode findings for adopted claim limitations and adopted `SPEC####` paragraphs that lack
source-span metadata. `source_span_policy: "relaxed"` supports compiled/public imports where source
spans cannot honestly be reconstructed.

Tasks:
- [x] Define source-span field names and allowed `source` enum centrally.
- [x] Add optional validator warnings for adopted claim limitations missing source metadata.
- [x] Add optional validator warnings for `SPEC####` paragraphs missing source metadata.
- [x] Avoid warning on `ai-suggested` content, because it already blocks assembly.
- [x] Add a config switch if strict source spans should not apply to compiled public patents.
- [x] Update examples with at least one valid source-span entry.

Suggested targets:
- `docs/protocol.md`
- `packages/apa-validate/validate.mjs`
- `packages/apa-validate/test/*.test.mjs`
- `examples/minimal-patent-artifact/logic/claims.md`
- `examples/minimal-patent-artifact/src/embodiments.md`

Acceptance criteria:
- [x] Adopted limitation without source span produces a warning, not a hard error.
- [x] `ai-suggested` limitation remains an assembly blocker regardless of source span.
- [x] Public-patent compile mode can mark `not-recoverable` without pretending conception evidence.

Verification:
- [x] `node --test packages/apa-validate/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

### 1.3 External Sink Wrappers

Current state: `apa-search` has scan-at-sink; `apa-eval` has network bounds and injection fencing.
`packages/apa-safe` now provides generic guarded wrappers for send/fetch/npx, with exact-byte
redaction scanning, MEDIUM approval, runlog sink hashes, untrusted fetch envelopes, and pinned-npx
policy. `apa-safe-send --kind cloud-llm` is the generic cloud-payload guard; `apa-eval` keeps its
native bounded client/injection fence.

Tasks:
- [x] Define the external sink contract: exact bytes scanned, redaction verdict, human approval policy,
  and runlog entry.
- [x] Add `apa-safe-fetch` for URL fetches with untrusted-content envelope output.
- [x] Add `apa-safe-npx` for network package execution with version pinning and approval checks.
- [x] Add `apa-safe-send` for generic outbound payloads.
- [x] Add `apa-safe-cloud-llm` or extend `apa-eval` so cloud sends share the same guardrail contract.
- [x] Make wrappers use `packages/apa-redact` exact-byte scanning.
- [x] Make wrappers fail closed on HIGH findings.
- [x] Make wrappers require `--yes` or explicit approval for MEDIUM findings.
- [x] Make wrappers write runlog sink hashes when `--matter <dir>` is supplied.
- [x] Update skills to call wrappers instead of raw `WebFetch`, raw network `Bash`, or unpinned `npx`.

Suggested targets:
- `packages/apa-safe/cli.mjs`
- `packages/apa-safe/sinks.mjs`
- `packages/apa-safe/test/*.test.mjs`
- `package.json` `bin` entries
- `skills/compiler/SKILL.md.tmpl`
- `skills/patent-svg-upgrader/SKILL.md.tmpl`
- `skills/prior-art-search/SKILL.md.tmpl`
- `skills/rigor-review/SKILL.md.tmpl`

Acceptance criteria:
- [x] HIGH secret in outbound payload exits nonzero before egress.
- [x] MEDIUM finding exits hold state unless approved.
- [x] `apa-safe-npx @pkg@version -- ...` records exact package spec and command.
- [x] Unpinned `npx @pkg` is refused unless an explicit override is provided and logged.
- [x] Fetched content is wrapped as untrusted data with canary protection before any model-facing use.

Verification:
- [x] `node --test packages/apa-safe/test/*.test.mjs packages/apa-redact/test/*.test.mjs`
- [x] `npm run build`

### 1.4 Progressive Disclosure For Legal Preamble

Current state: generated skills keep a concise inline hard-refusal block, then route detailed legal,
USPTO, confidentiality, drawing, and source-registry content to generated one-level `references/`
files beside each skill.

Tasks:
- [x] Design a reference-loading scheme that keeps hard refusals inline but moves detailed legal text
  to one-level `references/` files.
- [x] Add generated references, not hand-copied per-skill text.
- [x] Keep a 6-8 line inline hard-refusal block in every skill.
- [x] Add routing table entries for legal guardrails, USPTO rule pack, confidentiality sinks, and
  source registry.
- [x] Confirm host adapters cannot suppress safety-critical references.
- [x] Add trigger/skill-size tests to make sure generated skills stay concise without underloading
  safety rules.

Suggested targets:
- `scripts/resolvers/preamble.mjs`
- `scripts/gen-skill-docs.mjs`
- `hosts/*`
- `skills/*/SKILL.md.tmpl`
- `skills/*/references/*.md` or generated shared references
- `hosts/*/*.test.mjs`

Acceptance criteria:
- [x] Every generated skill still contains hard refusals inline.
- [x] Detailed legal text appears in generated reference files.
- [x] No generated `SKILL.md` loses submit-boundary, no-legal-advice, no-AI-inventor, or scan-at-sink
  safety language.
- [x] Host suppression tests prove safety-critical material is retained.

Verification:
- [x] `node scripts/gen-skill-docs.mjs`
- [x] `node scripts/gen-skill-docs.mjs --check`
- [x] `node --test hosts/**/*.test.mjs scripts/**/*.test.mjs`

### 1.5 JSON Report Schemas

Current state: `packages/apa-reports` defines the shared semantic report envelope and validates
`claims`, `patentability`, `examiner_adversary`, and `office_action` report schemas. `claim-lint`
can write `logic/claims_report.json`, `apa-prosecute respond --write` writes
`prosecution/office_action_report.json`, and the four semantic skills require report validation.

Tasks:
- [x] Define shared report envelope: skill, matter, inputs, outputs, human checkpoints, findings,
  next allowed steps.
- [x] Add `claims_report.json` schema and validator.
- [x] Add `patentability_report.json` schema and validator.
- [x] Add `examiner_adversary_report.json` schema and validator.
- [x] Add `office_action_report.json` schema and validator.
- [x] Add schema validation to package CLIs where applicable.
- [x] Update skills to require the report files when they write or materially revise an artifact.

Suggested targets:
- `packages/apa-reports/schemas.mjs`
- `packages/apa-reports/validate.mjs`
- `packages/apa-reports/test/*.test.mjs`
- `packages/apa-draft/*`
- `packages/apa-prosecute/*`
- `skills/claim-drafting/SKILL.md.tmpl`
- `skills/patentability-analysis/SKILL.md.tmpl`
- `skills/examiner-adversary/SKILL.md.tmpl`
- `skills/office-action/SKILL.md.tmpl`

Acceptance criteria:
- [x] Each report has deterministic validation with useful errors.
- [x] Findings include severity, rule anchor, evidence span, and recommendation.
- [x] Reports do not contain legal conclusions; they contain flags/questions and human checkpoints.
- [x] Existing examples can produce or include minimal valid reports.

Verification:
- [x] `node --test packages/apa-reports/test/*.test.mjs`
- [x] `npm run smoke`

### 1.6 Prior-Art Dossier Expansion

Current state: `apa-search --write` writes a dossier with query hash, source parameters, source
summaries, top-N before/after dedupe/ranking, dedupe clusters, excluded results/reasons, assigned
references, and human closest-art state. `apa-search verify-closest-art` updates the human closest-art
selection and keeps IDS readiness false until title, venue, canonical link, and relied-on passage are
verified.

Tasks:
- [x] Record API parameters per source, not only source counts.
- [x] Record excluded results and exclusion reasons.
- [x] Record dedupe clusters and winner rationale.
- [x] Record top-N before and after dedupe/ranking.
- [x] Add human-verified closest-art selection update helper.
- [x] Add IDS-ready verification status only after title, venue, canonical link, and relied-on passage
  are verified.

Suggested targets:
- `packages/apa-search/writers.mjs`
- `packages/apa-search/search.mjs`
- `packages/apa-search/lib/refs.mjs`
- `packages/apa-search/test/*.test.mjs`

Acceptance criteria:
- [x] Dossier can answer: what was searched, where, when, with what parameters, what was excluded, and
  why the closest-art candidate was selected.
- [x] Dossier still states the search is incomplete and not a clearance.
- [x] Dedupe decisions are auditable.

Verification:
- [x] `node --test packages/apa-search/test/*.test.mjs`

### 1.7 Upload Manifest Expansion

Current state: `apa-assemble --write` writes `assembled/upload_manifest.json` with generated-source
hashes, human-produced upload-PDF placeholders, form/version metadata, fee-schedule provenance,
PDF-export verification fields, IDS caveats, explicit `deferred_human_actions` linked to the
manifest fields they complete, Patent Center human-upload checklist fields, and human verification /
completion flags defaulting false.

Tasks:
- [x] Add form/version metadata for ADS, IDS, declaration template, fee schedule, and generated date.
- [x] Add current fee schedule source hash and effective date.
- [x] Add explicit "not an admission of materiality" IDS note in machine-readable form.
- [x] Add PDF export verification fields: page size, page count, visual QA completed, reviewer.
- [x] Add Patent Center upload checklist fields without implying APA files.

Suggested targets:
- `packages/apa-assemble/upload-manifest.mjs`
- `packages/apa-assemble/cli.mjs`
- `packages/apa-assemble/test/*.test.mjs`

Acceptance criteria:
- [x] Manifest distinguishes generated files from human-produced upload PDFs.
- [x] Manifest hashes every generated local file.
- [x] Manifest never marks a human filing act complete by default.

Verification:
- [x] `node --test packages/apa-assemble/test/*.test.mjs`

### 1.8 Rigor Staleness And Verdict Wording

Current state: historical verdict strings are retained for compatibility, safer display aliases are
returned with computed verdicts, and stale/missing/unverified prior-art state caps P5 to a non-fileable
Major-Rework maximum.

Tasks:
- [x] Add staleness checks for prior-art search date and human closest-art verification.
- [x] Cap P5 / prior-art distinction score when no human-verified closest art exists.
- [x] Decide whether to rename `File-Ready` verdicts or add display aliases while keeping internal enum
  compatibility.
- [x] If renaming, migrate tests, docs, and preflight gates in one compatibility-aware change. No enum
  rename was made; display aliases preserve backward compatibility.

Suggested targets:
- `packages/apa-rigor/verdict.mjs`
- `packages/apa-rigor/scaffold.mjs`
- `packages/apa-assemble/preflight.mjs`
- `skills/rigor-review/SKILL.md.tmpl`

Acceptance criteria:
- [x] Stale or unverified prior-art state cannot produce an overconfident filing-quality signal.
- [x] Any verdict label change preserves backward compatibility or includes a deliberate migration.

Verification:
- [x] `node --test packages/apa-rigor/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

## Phase 2 - Broaden Assurance And Product Surface

### 2.1 Benchmark Suite

Current state: `benchmarks/` contains one public utility patent compile fixture, one public USPTO
Office Action/sample fixture, and one synthetic disclosure-to-assembly fixture. `scripts/benchmark.mjs
--mock` verifies fixture policy, expected mechanical outputs, and semantic snapshots offline; live LLM
evaluation remains periodic/advisory outside the commit gate.

Tasks:
- [x] Create benchmark fixture policy: public patents, public OAs, and synthetic disclosures only.
- [x] Add one public utility patent compile fixture.
- [x] Add one public Office Action fixture.
- [x] Add one synthetic disclosure-to-assembly fixture.
- [x] Add expected mechanical outputs and semantic review snapshots.
- [x] Keep fixtures small enough for offline CI.

Suggested targets:
- `benchmarks/`
- `packages/apa-eval/*`
- `scripts/benchmark.mjs`
- `.github/workflows/periodic-evals.yml`

Acceptance criteria:
- [x] Benchmarks run offline in deterministic mode.
- [x] Paid LLM evaluation remains periodic/advisory, not per-commit required.
- [x] Benchmark results are visible as artifacts or JSON summaries.

Verification:
- [x] `node scripts/benchmark.mjs --mock`

### 2.2 Skill Trigger Tests

Tasks:
- [x] Define positive and negative trigger prompts for every committed skill.
- [x] Validate frontmatter descriptions are under 1024 chars, imperative, and boundary-aware.
- [x] Add host-specific trigger behavior tests where possible.
- [x] Add a "no accidental legal-advice trigger" test set.

Suggested targets:
- `scripts/check-skills.mjs`
- `skills/*/trigger-tests.json`
- `scripts/**/*.test.mjs`

Acceptance criteria:
- [x] Every skill has at least three should-trigger and three should-not-trigger cases.
- [x] Trigger tests run without network.
- [x] Generated descriptions do not summarize workflows in a way that encourages agents to skip bodies.

Verification:
- [x] `node --test scripts/**/*.test.mjs`

### 2.3 Jurisdiction And Rule Packs

Tasks:
- [x] Keep USPTO as the only default active jurisdiction.
- [x] Move USPTO-specific rules into an explicit rule pack.
- [x] Add fail-loud behavior for unsupported jurisdictions.
- [x] Add dated rule-pack metadata and freshness warnings.
- [x] Prepare extension points for PCT/EPO without enabling them prematurely.

Suggested targets:
- `docs/rule-packs/`
- `scripts/resolvers/legal-rules.mjs`
- `docs/protocol.md`
- `packages/apa-validate/validate.mjs`

Acceptance criteria:
- [x] USPTO matters behave exactly as before.
- [x] Non-USPTO jurisdiction does not silently validate under USPTO rules.
- [x] Rule effective date appears in outputs and reports.

Verification:
- [x] `node --test packages/apa-rules/test/*.test.mjs packages/apa-validate/test/*.test.mjs packages/apa-reports/test/*.test.mjs packages/apa-rigor/test/*.test.mjs packages/apa-viewer/test/*.test.mjs scripts/gen-skill-docs.test.mjs`

### 2.4 Counsel / Work-Product Mode

Current state: `PATENT.md` supports explicit `confidential_workflow_mode` values
(`ordinary_local`, `counsel_controlled`, `shareable_redacted`). Validators fail loud on unknown
values, warn on missing mode, and warn when shareable-redacted matters contain sensitive critique
reports. `packages/apa-redact/confidential-workflow.mjs` centralizes the sensitive-artifact exclusion
policy; assembly preflight surfaces the mode and `assembled/upload_manifest.json` records
shareable-export exclusions. APA still does not claim to create or preserve privilege.

Tasks:
- [x] Add `confidential_workflow_mode` or equivalent matter config.
- [x] Define modes: ordinary local, counsel-controlled, shareable-redacted.
- [x] Make examiner-adversary and patentability-analysis default to stronger caution in
  counsel-controlled mode.
- [x] Add export/redaction behavior for shareable artifacts.
- [x] Keep privilege disclaimers: APA cannot guarantee privilege.

Suggested targets:
- `docs/legal-guardrails.md`
- `docs/protocol.md`
- `scripts/resolvers/preamble.mjs`
- `skills/examiner-adversary/SKILL.md.tmpl`
- `skills/patentability-analysis/SKILL.md.tmpl`
- `packages/apa-redact/*`

Acceptance criteria:
- [x] Sensitive critique reports are not accidentally included in shareable/export packages.
- [x] Mode changes are explicit and visible in `PATENT.md`.
- [x] No text claims APA creates or preserves privilege.

Verification:
- [x] `node --test packages/apa-redact/test/*.test.mjs packages/apa-validate/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

### 2.5 Human Review UI

Current state: `packages/apa-viewer/build_manifest.mjs` emits `review.schema:
apa-viewer-review-v1` with provenance adoption, IDS/prior-art verification, unresolved-edge, and
drawing-quality summaries. `viewer.js` renders those summaries as a read-only Review section before
the artifact cards; `style.css` keeps the panels responsive. No writeback is implemented.

Tasks:
- [x] Add viewer panels for provenance adoption state.
- [x] Add viewer panels for IDS verification state.
- [x] Add viewer panels for claim support / unresolved edges.
- [x] Add viewer panels for drawing-quality findings.
- [x] Add a read-only review checklist view first; writeback can be a later phase.
- [x] Keep all warning states visible and non-silent.

Suggested targets:
- `packages/apa-viewer/build_manifest.mjs`
- `packages/apa-viewer/viewer.js`
- `packages/apa-viewer/style.css`
- `packages/apa-viewer/test/*.test.mjs`

Acceptance criteria:
- [x] Viewer surfaces unadopted `ai-suggested` limitations.
- [x] Viewer surfaces unverified IDS/prior-art references.
- [x] Viewer surfaces unresolved support and drawing-quality issues.
- [x] Viewer remains static and works from a generated `manifest.json`.

Verification:
- [x] `node --test packages/apa-viewer/test/*.test.mjs`
- [x] `node packages/apa-viewer/build_manifest.mjs examples/minimal-patent-artifact --out examples/minimal-patent-artifact/manifest.json`

## Phase 3 - Skill-By-Skill Cleanup Items

This section reconciles the skill-by-skill review against the package-level work above. When a skill
item is already covered by a Phase 1 implementation, it is marked done here too so this checklist does
not overstate the remaining gap.

### 3.1 `/apa-autoprep`

Detailed tasks:
- [x] Implement `trace/autoprep_state.json` with current stage, stage input hashes, output hashes,
  last completed timestamp, and next recommended stage.
- [x] Stage hashes prevent unnecessary reruns when inputs and outputs have not changed.
- [x] Human checkpoints are written to `trace/runlog.jsonl` and resumable from
  `trace/autoprep_state.json`.
- [x] Skill text caps examiner loops and requires residual-risk output after the cap.
- [x] Enforce `max_examiner_loops` in an autoprep runner or deterministic state helper, not only in
  prompt instructions.
- [x] Add a recovery path for interrupted runs: resume, restart stage, or emit blocked-state report.

Suggested targets:
- `skills/autoprep/SKILL.md.tmpl`
- `packages/apa-trace/runlog.mjs`
- `packages/apa-trace/autoprep-state.mjs`
- `packages/apa-trace/test/*.test.mjs`
- Optional future runner: `packages/apa-autoprep/*`

Acceptance criteria:
- [x] Re-running autoprep after no input changes does not repeat file-writing stages.
- [x] A partially completed run can resume without losing earlier checkpoint state.
- [x] Examiner loop count is recorded and cannot exceed configured cap without a human override.

Verification:
- [x] `node --test packages/apa-trace/test/*.test.mjs`
- [x] `node scripts/gen-skill-docs.mjs --check`

### 3.2 `/apa-disclose`

Detailed tasks:
- [ ] Source spans on every promoted observation that becomes claim, embodiment, or spec support.
- [ ] Limitation-level inventor attribution prompt: "who conceived this limitation?" not only
  claim-level attribution.
- [ ] Bar-date facts get immutable trace entries with source, speaker, timestamp/date, and hash.
- [ ] Distinguish raw transcript/upload facts from agent observations and human-adopted conclusions.
- [ ] Add relaxed-mode guidance for public/compiled imports where source spans cannot be recovered.

Suggested targets:
- `skills/disclosure-capture/SKILL.md.tmpl`
- `docs/protocol.md`
- `packages/apa-validate/source-spans.mjs`

Acceptance criteria:
- [ ] New promoted observations include `source`, `source_span`, `source_sha256`, and adoption state.
- [ ] Inventorship prompt operates at limitation granularity.
- [ ] Bar-date/candor facts are not silently overwritten by later disclosure sessions.

Verification:
- [ ] `node scripts/gen-skill-docs.mjs --check`
- [ ] `node --test packages/apa-validate/test/*.test.mjs`

### 3.3 `/apa-compile`

Detailed tasks:
- [ ] Add OCR/text-quality flags for each imported document and each claim extraction.
- [ ] Preserve claim page/line/paragraph spans where the source supports it.
- [ ] Use `source-extracted`, `inferred-from-document`, and `not-recoverable` labels.
- [ ] Never reconstruct conception decisions from public documents without evidence.
- [x] Skills route raw fetched content through safe wrappers and untrusted-content handling.
- [ ] Add compile report output describing extraction confidence, OCR uncertainty, and unrecoverable
  provenance.

Suggested targets:
- `skills/compiler/SKILL.md.tmpl`
- `skills/compiler/references/validation-checklist.md`
- `packages/apa-safe/*`
- Future compile package files if a deterministic compiler is added.

Acceptance criteria:
- [ ] Compiled public patent claims retain original numbering and source spans.
- [ ] Inferred facts are never upgraded to invention-conception provenance.
- [ ] Low-confidence OCR/text extraction blocks automatic claim drafting from that text.

Verification:
- [ ] `node scripts/gen-skill-docs.mjs --check`
- [ ] Future deterministic compile tests once compiler code exists.

### 3.4 `/apa-priorart`

Detailed tasks:
- [x] Expand search dossier as described in Phase 1.6.
- [x] Add closest-art human verification update flow.
- [x] Preserve all unverified defaults.
- [x] Add quote-backed chart handoff from prior-art records into `/apa-analyze`.
- [x] Add a "search coverage limits" field that records known unsearched sources/classes.

Suggested targets:
- `packages/apa-search/writers.mjs`
- `packages/apa-search/cli.mjs`
- `skills/prior-art-search/SKILL.md.tmpl`
- `skills/patentability-analysis/SKILL.md.tmpl`

Acceptance criteria:
- [x] Dossier records what was searched, where, when, with what parameters, and why results were
  assigned/excluded.
- [x] Closest-art selection remains human-unverified by default.
- [x] `/apa-analyze` can consume prior-art records without losing quote/page/paragraph proof.

Verification:
- [x] `node --test packages/apa-search/test/*.test.mjs`
- [x] `node scripts/gen-skill-docs.mjs --check`

### 3.5 `/apa-analyze`

Detailed tasks:
- [x] Make every chart cell quote-backed: `appears_teaches`, quote, page/paragraph, confidence, and
  human verification.
- [x] Add exact obviousness motivation/rationale and identify whether it is record evidence, common
  sense, design need, market pressure, or another KSR-style rationale.
- [x] Add reasonable expectation of success field for each proposed combination.
- [x] Add secondary-consideration nexus fields and require evidence citation before relying on them.
- [x] Require `patentability_report.json` schema validation for material analysis outputs.

Suggested targets:
- `skills/patentability-analysis/SKILL.md.tmpl`
- `packages/apa-reports/schemas.mjs`
- `packages/apa-reports/test/*.test.mjs`
- Future patentability-analysis package if deterministic chart writing is added.

Acceptance criteria:
- [x] No limitation chart cell can be marked `yes` or `partial` without a source quote/span.
- [x] Obviousness combinations separate rationale, expectation of success, and counter-teaching.
- [x] Analysis report remains flags/questions, not a legal conclusion of patentability.

Verification:
- [x] `node --test packages/apa-reports/test/*.test.mjs`
- [x] Add report fixture tests for quote-backed chart cells.

### 3.6 `/apa-claims`

Detailed tasks:
- [x] Keep multiple-dependent claims unsupported unless implemented deliberately.
- [ ] If implemented, update fee logic, claim lint, validator, examples, and docs together.
- [x] Preserve pro-se neutral options only.
- [x] Require `claims_report.json` schema validation when claim-lint writes a report.
- [x] Add an explicit unsupported-feature warning when a user requests multiple-dependent claims in
  MVP mode.

Suggested targets:
- `skills/claim-drafting/SKILL.md.tmpl`
- `packages/apa-validate/validate.mjs`
- `packages/apa-draft/*`
- `packages/apa-reports/*`

Acceptance criteria:
- [x] Multiple-dependent claim syntax is either rejected clearly or fully supported across fees,
  dependencies, examples, and validation.
- [ ] Pro-se mode returns neutral organization options/questions, not strategic claim-scope advice.
- [x] AI-suggested limitations still block assembly until human adoption.

Verification:
- [x] `node --test packages/apa-validate/test/*.test.mjs packages/apa-draft/test/*.test.mjs packages/apa-reports/test/*.test.mjs`

### 3.7 `/apa-spec`

Detailed tasks:
- [ ] Add conditional 37 CFR 1.77 sections to output when warranted, including government support,
  joint research agreement parties, sequence listings, and incorporation by reference.
- [ ] Fail loud on unsupported domains such as ST.26 sequence listings instead of drafting around
  them.
- [ ] Require source-span proof for `SPEC####` in strict mode.
- [x] Validator warns on adopted `SPEC####` paragraphs missing source-span metadata.
- [ ] Add `specification_report.json` or extend shared report schemas if spec drafting becomes a
  deterministic writer.

Suggested targets:
- `skills/specification-drafting/SKILL.md.tmpl`
- `docs/protocol.md`
- `packages/apa-validate/validate.mjs`
- `packages/apa-reports/schemas.mjs`

Acceptance criteria:
- [ ] Conditional sections appear only when supported by matter facts or are marked not applicable.
- [ ] Unsupported sequence-listing cases stop with a counsel/tooling handoff.
- [ ] Strict source-span mode can block assembly on unsupported `SPEC####` content if enabled.

Verification:
- [ ] `node scripts/gen-skill-docs.mjs --check`
- [ ] `node --test packages/apa-validate/test/*.test.mjs`

### 3.8 `/apa-figures`

Detailed tasks:
- [x] Keep drawing-quality review as downstream gate.
- [ ] Ensure figure generator does not add unsupported visual matter by requiring support edges or
  source facts for each newly visualized element.
- [x] Keep numeral reconciliation deterministic.
- [ ] Add figure-generation report fields for generated numerals, removed numerals, and unsupported
  visual-change risks.

Suggested targets:
- `skills/figure-generation/SKILL.md.tmpl`
- `packages/apa-figure/*`
- `packages/apa-assemble/preflight.mjs`
- `packages/apa-reports/schemas.mjs`

Acceptance criteria:
- [x] Missing drawing QA warns and blocking drawing findings block assembly.
- [ ] New numerals/elements are traceable to claim/spec/support facts.
- [ ] Figure report can be reviewed without manually diffing SVG text.

Verification:
- [x] `node --test packages/apa-figure/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

### 3.9 `/apa-svg-upgrader`

Detailed tasks:
- [x] Route unpinned external generators through `apa-safe-npx`.
- [ ] Require pre/post SVG diff for every upgraded file.
- [ ] Require numeral parity report comparing before/after reference numerals and labels.
- [ ] Require `svg_upgrade_report.json`.
- [ ] Block upgrades that add new visual structures not present in the source drawing spec.

Suggested targets:
- `skills/patent-svg-upgrader/SKILL.md.tmpl`
- `packages/apa-figure/*`
- `packages/apa-safe/*`
- `packages/apa-reports/schemas.mjs`

Acceptance criteria:
- [ ] The upgrade report lists changed files, preflight before/after, numerals added/removed, and
  human-review-required flags.
- [ ] Version-pinned external tools are logged; unpinned tools require explicit override and runlog
  entry.
- [ ] Numeral parity failure blocks marking the upgrade ready for drawing QA.

Verification:
- [ ] `node --test packages/apa-figure/test/*.test.mjs packages/apa-safe/test/*.test.mjs`

### 3.10 `/apa-drawing-quality`

Detailed tasks:
- [x] Persist machine-readable findings with sheet, figure, bbox, severity, rule reference, and
  measured/visual status.
- [x] Add visual regression examples: good set, crowded flowchart, bad callouts, PDF font
  substitution.
- [x] Record when text-size, line-weight, and margin checks are measured versus visually assessed.
- [x] Keep final-compliance caveat explicit: drawing QA is a precheck, not USPTO compliance
  certification.

Suggested targets:
- `skills/patent-drawing-quality/SKILL.md.tmpl`
- `packages/apa-figure/*`
- `examples/*/evidence/drawings/`
- `packages/apa-assemble/preflight.mjs`

Acceptance criteria:
- [x] `evidence/drawings/quality-review.json` contains actionable findings with locations.
- [x] Example gallery includes known-good and known-bad drawing sets.
- [x] Blocking drawing findings still block assembly.

Verification:
- [x] `node --test packages/apa-figure/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`
- [x] `node scripts/gen-skill-docs.mjs --check`

### 3.11 `/apa-assemble`

Detailed tasks:
- [x] Expand `upload_manifest.json` as described in Phase 1.7.
- [x] Keep final package language as "assembly package draft."
- [x] Add runlog integration.
- [x] Add explicit issue/link from any deferred human filing/signature act to the relevant upload
  manifest field.
- [x] Keep generated-source files separate from human-produced upload PDFs.

Suggested targets:
- `packages/apa-assemble/upload-manifest.mjs`
- `packages/apa-assemble/cli.mjs`
- `packages/apa-assemble/preflight.mjs`
- `skills/filing-assembly/SKILL.md.tmpl`

Acceptance criteria:
- [x] Upload manifest hashes generated local files and defaults human filing acts to incomplete.
- [x] Assembly output never says APA signed, certified, uploaded, or filed.
- [x] Human-signature and Patent Center actions can be tracked without being auto-completed.

Verification:
- [x] `node --test packages/apa-assemble/test/*.test.mjs`
- [x] `node scripts/gen-skill-docs.mjs --check`

### 3.12 `/apa-rigor`

Detailed tasks:
- [x] Add prior-art staleness checks.
- [x] Add human-verified closest-art cap.
- [x] Add display aliases for verdict labels while retaining historical enum compatibility.
- [x] Add runlog entry when `apa-rigor scaffold` writes a report.
- [x] Add a report freshness summary that states which prior-art dossier was used.

Suggested targets:
- `packages/apa-rigor/cli.mjs`
- `packages/apa-rigor/scaffold.mjs`
- `packages/apa-rigor/verdict.mjs`
- `skills/rigor-review/SKILL.md.tmpl`

Acceptance criteria:
- [x] Stale or unverified prior art prevents overconfident filing-quality verdicts.
- [x] Rigor report generation appends inputs, outputs, command record, and human checkpoint to
  `trace/runlog.jsonl` when attached to a matter.
- [x] Rigor output identifies prior-art search age and closest-art verification state.

Verification:
- [x] `node --test packages/apa-rigor/test/*.test.mjs`
- [x] Add runlog integration tests for `apa-rigor`.

### 3.13 `/apa-examiner`

Detailed tasks:
- [x] Skill text and autoprep routing cap examiner loops.
- [ ] Make loop cap machine-enforced through autoprep state or examiner report metadata.
- [x] Ensure no claim/spec edits happen without registered-practitioner approval.
- [x] Keep privilege/work-product caution visible.
- [x] Require `examiner_adversary_report.json` schema validation for material examiner reports.
- [ ] Add report field for `dead_end` arguments so later prosecution work does not reuse them.

Suggested targets:
- `skills/examiner-adversary/SKILL.md.tmpl`
- `packages/apa-reports/schemas.mjs`
- Future autoprep/examiner deterministic runner if added.

Acceptance criteria:
- [ ] Examiner loop count is visible in machine-readable state.
- [ ] Pro-se mode produces neutral issues/questions only.
- [ ] Any proposed amendment is a proposal requiring practitioner/human approval before adoption.

Verification:
- [x] `node --test packages/apa-reports/test/*.test.mjs`
- [ ] `node scripts/gen-skill-docs.mjs --check`

### 3.14 `/apa-office-action`

Detailed tasks:
- [x] Expand taxonomy for restriction/election, final/non-final, advisory actions, after-final, RCE,
  appeal, ODP/terminal disclaimer, 101 examples, and drawing objections.
- [x] Fail loud on unsupported event types.
- [x] Keep pro-se mode summary-only.
- [x] `apa-prosecute respond --write` refuses pro-se write mode.
- [x] `apa-prosecute respond --write` emits `office_action_report.json`.
- [x] Add runlog entry for OA parse/scaffold actions in practitioner mode.
- [x] Add deadline-support matrix that explicitly identifies which event types the estimator supports.

Suggested targets:
- `packages/apa-prosecute/cli.mjs`
- `packages/apa-prosecute/deadlines.mjs`
- `packages/apa-prosecute/test/*.test.mjs`
- `skills/office-action/SKILL.md.tmpl`

Acceptance criteria:
- [x] Unsupported OA event types produce a clear unsupported-event finding instead of a misleading
  draft response.
- [x] Pro-se mode cannot write amendment/argument scaffolds.
- [x] Practitioner-mode OA scaffold writes runlog inputs, outputs, command record, and required human
  checkpoints.

Verification:
- [x] `node --test packages/apa-prosecute/test/*.test.mjs`
- [x] `node --test packages/apa-prosecute/test/*.test.mjs packages/apa-reports/test/*.test.mjs`
- [x] Add OA runlog integration test.

## Recommended Execution Order

1. [x] Implement runlog helper and integrate `apa-search` + `apa-assemble`.
2. [x] Expand source-span validation in warning mode.
3. [x] Implement external sink wrappers, starting with `apa-safe-npx` and `apa-safe-fetch`.
4. [x] Add report schema package and wire claims/patentability/examiner/OA reports.
5. [x] Expand upload manifest fields. Prior-art dossier expansion complete.
6. [x] Add rigor staleness caps.
7. [x] Decide and implement legal-preamble progressive disclosure.
8. [x] Add trigger tests.
9. [x] Add benchmarks.
10. [x] Add human review UI.

## Release Gate

Before declaring this implementation plan complete:

- [x] `docs/review-coverage.md` has no "Deferred" item without a linked issue, checklist item, or
  explicit out-of-scope rationale.
- [ ] Every skill that writes files emits or references a machine-readable report.
- [ ] Every external sink goes through a package-level guard, not only prompt instructions.
- [ ] Every human checkpoint is represented in a machine-readable artifact.
- [x] The example matters still validate and smoke-test cleanly.
- [ ] The final repository state is pushed only after `npm run build` passes.
