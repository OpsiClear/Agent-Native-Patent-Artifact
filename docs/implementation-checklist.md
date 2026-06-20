# Implementation Checklist

Source inputs:
- Shared external review: `https://chatgpt.com/share/6a36ca79-9774-83ea-a6a1-28d16414e3d7`
- Current coverage map: `docs/review-coverage.md`
- Current protocol contract: `docs/protocol.md`
- Current source registry: `docs/source-registry.md`

This checklist converts the latest implementation plan into executable work items. It is intentionally
more operational than `docs/review-coverage.md`: every open item lists target files, acceptance
criteria, and verification commands.

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
implements append/validation/hash helpers; `apa-search --write` and `apa-assemble --write` append
runlog entries. Rigor, prosecution, and eval integrations remain open.

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
- [ ] `apa-rigor` logs report generation.
- [ ] `apa-prosecute respond` logs OA parse/scaffold actions in practitioner mode.
- [ ] `apa-eval` logs cloud LLM sink only when attached to a matter and not in `--mock`.

Acceptance criteria:
- [x] Running `apa-search --matter <tmp> --source mock --write` creates or appends
  `trace/runlog.jsonl`.
- [x] Running `apa-assemble --matter <tmp> --write` appends generated-file output records.
- [x] Re-running a command appends a second record; it does not mutate the first record.
- [x] JSONL validation catches malformed entries with useful line numbers.

Verification:
- [x] `node --test packages/apa-trace/test/*.test.mjs`
- [x] `node --test packages/apa-search/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

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

Current state: long generated legal preamble remains inline for safety and host compatibility.

Tasks:
- [ ] Design a reference-loading scheme that keeps hard refusals inline but moves detailed legal text
  to one-level `references/` files.
- [ ] Add generated references, not hand-copied per-skill text.
- [ ] Keep a 6-8 line inline hard-refusal block in every skill.
- [ ] Add routing table entries for legal guardrails, USPTO rule pack, confidentiality sinks, and
  source registry.
- [ ] Confirm host adapters cannot suppress safety-critical references.
- [ ] Add trigger/skill-size tests to make sure generated skills stay concise without underloading
  safety rules.

Suggested targets:
- `scripts/resolvers/preamble.mjs`
- `scripts/gen-skill-docs.mjs`
- `hosts/*`
- `skills/*/SKILL.md.tmpl`
- `skills/*/references/*.md` or generated shared references
- `hosts/*/*.test.mjs`

Acceptance criteria:
- [ ] Every generated skill still contains hard refusals inline.
- [ ] Detailed legal text appears in generated reference files.
- [ ] No generated `SKILL.md` loses submit-boundary, no-legal-advice, no-AI-inventor, or scan-at-sink
  safety language.
- [ ] Host suppression tests prove safety-critical material is retained.

Verification:
- [ ] `node scripts/gen-skill-docs.mjs`
- [ ] `node scripts/gen-skill-docs.mjs --check`
- [ ] `node --test hosts/**/*.test.mjs scripts/**/*.test.mjs`

### 1.5 JSON Report Schemas

Current state: rigor, drawing QA, SVG upgrader, search dossier, and upload manifest are structured.
Claims, patentability, examiner, and OA still need formal report schemas.

Tasks:
- [ ] Define shared report envelope: skill, matter, inputs, outputs, human checkpoints, findings,
  next allowed steps.
- [ ] Add `claims_report.json` schema and validator.
- [ ] Add `patentability_report.json` schema and validator.
- [ ] Add `examiner_adversary_report.json` schema and validator.
- [ ] Add `office_action_report.json` schema and validator.
- [ ] Add schema validation to package CLIs where applicable.
- [ ] Update skills to require the report files when they write or materially revise an artifact.

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
- [ ] Each report has deterministic validation with useful errors.
- [ ] Findings include severity, rule anchor, evidence span, and recommendation.
- [ ] Reports do not contain legal conclusions; they contain flags/questions and human checkpoints.
- [ ] Existing examples can produce or include minimal valid reports.

Verification:
- [ ] `node --test packages/apa-reports/test/*.test.mjs`
- [ ] `npm run smoke`

### 1.6 Prior-Art Dossier Expansion

Current state: `apa-search --write` writes a dossier with query hash, sources, ranked candidates,
assigned references, and human closest-art state.

Tasks:
- [ ] Record API parameters per source, not only source counts.
- [ ] Record excluded results and exclusion reasons.
- [ ] Record dedupe clusters and winner rationale.
- [ ] Record top-N before and after dedupe/ranking.
- [ ] Add human-verified closest-art selection update helper.
- [ ] Add IDS-ready verification status only after title, venue, canonical link, and relied-on passage
  are verified.

Suggested targets:
- `packages/apa-search/writers.mjs`
- `packages/apa-search/search.mjs`
- `packages/apa-search/lib/refs.mjs`
- `packages/apa-search/test/*.test.mjs`

Acceptance criteria:
- [ ] Dossier can answer: what was searched, where, when, with what parameters, what was excluded, and
  why the closest-art candidate was selected.
- [ ] Dossier still states the search is incomplete and not a clearance.
- [ ] Dedupe decisions are auditable.

Verification:
- [ ] `node --test packages/apa-search/test/*.test.mjs`

### 1.7 Upload Manifest Expansion

Current state: `apa-assemble --write` writes `assembled/upload_manifest.json` with hashes and human
verification flags.

Tasks:
- [ ] Add form/version metadata for ADS, IDS, declaration template, fee schedule, and generated date.
- [ ] Add current fee schedule source hash and effective date.
- [ ] Add explicit "not an admission of materiality" IDS note in machine-readable form.
- [ ] Add PDF export verification fields: page size, page count, visual QA completed, reviewer.
- [ ] Add Patent Center upload checklist fields without implying APA files.

Suggested targets:
- `packages/apa-assemble/upload-manifest.mjs`
- `packages/apa-assemble/cli.mjs`
- `packages/apa-assemble/test/*.test.mjs`

Acceptance criteria:
- [ ] Manifest distinguishes generated files from human-produced upload PDFs.
- [ ] Manifest hashes every generated local file.
- [ ] Manifest never marks a human filing act complete by default.

Verification:
- [ ] `node --test packages/apa-assemble/test/*.test.mjs`

### 1.8 Rigor Staleness And Verdict Wording

Current state: historical verdict strings are retained for compatibility.

Tasks:
- [ ] Add staleness checks for prior-art search date and human closest-art verification.
- [ ] Cap P5 / prior-art distinction score when no human-verified closest art exists.
- [ ] Decide whether to rename `File-Ready` verdicts or add display aliases while keeping internal enum
  compatibility.
- [ ] If renaming, migrate tests, docs, and preflight gates in one compatibility-aware change.

Suggested targets:
- `packages/apa-rigor/verdict.mjs`
- `packages/apa-rigor/scaffold.mjs`
- `packages/apa-assemble/preflight.mjs`
- `skills/rigor-review/SKILL.md.tmpl`

Acceptance criteria:
- [ ] Stale or unverified prior-art state cannot produce an overconfident filing-quality signal.
- [ ] Any verdict label change preserves backward compatibility or includes a deliberate migration.

Verification:
- [ ] `node --test packages/apa-rigor/test/*.test.mjs packages/apa-assemble/test/*.test.mjs`

## Phase 2 - Broaden Assurance And Product Surface

### 2.1 Benchmark Suite

Tasks:
- [ ] Create benchmark fixture policy: public patents, public OAs, and synthetic disclosures only.
- [ ] Add one public utility patent compile fixture.
- [ ] Add one public Office Action fixture.
- [ ] Add one synthetic disclosure-to-assembly fixture.
- [ ] Add expected mechanical outputs and semantic review snapshots.
- [ ] Keep fixtures small enough for offline CI.

Suggested targets:
- `benchmarks/`
- `packages/apa-eval/*`
- `scripts/benchmark.mjs`
- `.github/workflows/periodic-evals.yml`

Acceptance criteria:
- [ ] Benchmarks run offline in deterministic mode.
- [ ] Paid LLM evaluation remains periodic/advisory, not per-commit required.
- [ ] Benchmark results are visible as artifacts or JSON summaries.

Verification:
- [ ] `node scripts/benchmark.mjs --mock`

### 2.2 Skill Trigger Tests

Tasks:
- [ ] Define positive and negative trigger prompts for every committed skill.
- [ ] Validate frontmatter descriptions are under 1024 chars, imperative, and boundary-aware.
- [ ] Add host-specific trigger behavior tests where possible.
- [ ] Add a "no accidental legal-advice trigger" test set.

Suggested targets:
- `scripts/check-skills.mjs`
- `skills/*/trigger-tests.json`
- `scripts/**/*.test.mjs`

Acceptance criteria:
- [ ] Every skill has at least three should-trigger and three should-not-trigger cases.
- [ ] Trigger tests run without network.
- [ ] Generated descriptions do not summarize workflows in a way that encourages agents to skip bodies.

Verification:
- [ ] `node --test scripts/**/*.test.mjs`

### 2.3 Jurisdiction And Rule Packs

Tasks:
- [ ] Keep USPTO as the only default active jurisdiction.
- [ ] Move USPTO-specific rules into an explicit rule pack.
- [ ] Add fail-loud behavior for unsupported jurisdictions.
- [ ] Add dated rule-pack metadata and freshness warnings.
- [ ] Prepare extension points for PCT/EPO without enabling them prematurely.

Suggested targets:
- `docs/rule-packs/`
- `scripts/resolvers/legal-rules.mjs`
- `docs/protocol.md`
- `packages/apa-validate/validate.mjs`

Acceptance criteria:
- [ ] USPTO matters behave exactly as before.
- [ ] Non-USPTO jurisdiction does not silently validate under USPTO rules.
- [ ] Rule effective date appears in outputs and reports.

Verification:
- [ ] `node --test packages/apa-validate/test/*.test.mjs scripts/**/*.test.mjs`

### 2.4 Counsel / Work-Product Mode

Tasks:
- [ ] Add `confidential_workflow_mode` or equivalent matter config.
- [ ] Define modes: ordinary local, counsel-controlled, shareable-redacted.
- [ ] Make examiner-adversary and patentability-analysis default to stronger caution in
  counsel-controlled mode.
- [ ] Add export/redaction behavior for shareable artifacts.
- [ ] Keep privilege disclaimers: APA cannot guarantee privilege.

Suggested targets:
- `docs/legal-guardrails.md`
- `docs/protocol.md`
- `scripts/resolvers/preamble.mjs`
- `skills/examiner-adversary/SKILL.md.tmpl`
- `skills/patentability-analysis/SKILL.md.tmpl`
- `packages/apa-redact/*`

Acceptance criteria:
- [ ] Sensitive critique reports are not accidentally included in shareable/export packages.
- [ ] Mode changes are explicit and visible in `PATENT.md`.
- [ ] No text claims APA creates or preserves privilege.

Verification:
- [ ] `node --test packages/apa-redact/test/*.test.mjs packages/apa-validate/test/*.test.mjs`

### 2.5 Human Review UI

Tasks:
- [ ] Add viewer panels for provenance adoption state.
- [ ] Add viewer panels for IDS verification state.
- [ ] Add viewer panels for claim support / unresolved edges.
- [ ] Add viewer panels for drawing-quality findings.
- [ ] Add a read-only review checklist view first; writeback can be a later phase.
- [ ] Keep all warning states visible and non-silent.

Suggested targets:
- `packages/apa-viewer/build_manifest.mjs`
- `packages/apa-viewer/viewer.js`
- `packages/apa-viewer/style.css`
- `packages/apa-viewer/test/*.test.mjs`

Acceptance criteria:
- [ ] Viewer surfaces unadopted `ai-suggested` limitations.
- [ ] Viewer surfaces unverified IDS/prior-art references.
- [ ] Viewer surfaces unresolved support and drawing-quality issues.
- [ ] Viewer remains static and works from a generated `manifest.json`.

Verification:
- [ ] `node --test packages/apa-viewer/test/*.test.mjs`
- [ ] `node packages/apa-viewer/build_manifest.mjs examples/minimal-patent-artifact --out examples/minimal-patent-artifact/manifest.json`

## Phase 3 - Skill-By-Skill Cleanup Items

### 3.1 `/apa-autoprep`

- [ ] Implement `trace/autoprep_state.json`.
- [ ] Stage hashes prevent unnecessary reruns.
- [ ] Human checkpoints are written and resumed.
- [ ] Examiner loop cap is machine-enforced, not just skill text.

### 3.2 `/apa-disclose`

- [ ] Source spans on every promoted observation.
- [ ] Limitation-level inventor attribution prompt.
- [ ] Bar-date facts get immutable trace entries.

### 3.3 `/apa-compile`

- [ ] Add OCR/text-quality flags.
- [ ] Preserve claim page/line spans.
- [ ] Use `source-extracted`, `inferred-from-document`, and `not-recoverable` labels.
- [ ] Never reconstruct conception decisions from public documents without evidence.
- [ ] Wrap fetched content in untrusted envelope.

### 3.4 `/apa-priorart`

- [ ] Expand search dossier as described in Phase 1.6.
- [ ] Add closest-art human verification update flow.
- [ ] Preserve all unverified defaults.

### 3.5 `/apa-analyze`

- [ ] Make every chart cell quote-backed.
- [ ] Add exact obviousness motivation/rationale.
- [ ] Add reasonable expectation of success.
- [ ] Add secondary-consideration nexus fields.

### 3.6 `/apa-claims`

- [ ] Keep multiple-dependent claims unsupported unless implemented deliberately.
- [ ] If implemented, update fee logic, claim lint, validator, examples, and docs together.
- [ ] Preserve pro-se neutral options only.

### 3.7 `/apa-spec`

- [ ] Add conditional 37 CFR 1.77 sections to output when warranted.
- [ ] Fail loud on unsupported domains such as ST.26 sequence listings.
- [ ] Require source-span proof for `SPEC####` in strict mode.

### 3.8 `/apa-figures`

- [ ] Keep drawing-quality review as downstream gate.
- [ ] Ensure figure generator does not add unsupported visual matter.
- [ ] Keep numeral reconciliation deterministic.

### 3.9 `/apa-svg-upgrader`

- [x] Route unpinned external generators through `apa-safe-npx`.
- [ ] Require pre/post SVG diff.
- [ ] Require numeral parity report.
- [ ] Require `svg_upgrade_report.json`.

### 3.10 `/apa-drawing-quality`

- [ ] Persist machine-readable findings with sheet, figure, bbox, severity, rule reference, and
  measured/visual status.
- [ ] Add visual regression examples: good set, crowded flowchart, bad callouts, PDF font substitution.

### 3.11 `/apa-assemble`

- [ ] Expand `upload_manifest.json` as described in Phase 1.7.
- [ ] Keep final package language as "assembly package draft."
- [ ] Add runlog integration.

### 3.12 `/apa-rigor`

- [ ] Add prior-art staleness checks.
- [ ] Add human-verified closest-art cap.
- [ ] Consider display aliases for verdict labels.

### 3.13 `/apa-examiner`

- [ ] Make loop cap machine-enforced.
- [ ] Ensure no claim/spec edits happen without registered-practitioner approval.
- [ ] Keep privilege/work-product caution visible.

### 3.14 `/apa-office-action`

- [ ] Expand taxonomy for restriction/election, final/non-final, advisory actions, after-final, RCE,
  appeal, ODP/terminal disclaimer, 101 examples, and drawing objections.
- [ ] Fail loud on unsupported event types.
- [ ] Keep pro-se mode summary-only.

## Recommended Execution Order

1. [x] Implement runlog helper and integrate `apa-search` + `apa-assemble`.
2. [x] Expand source-span validation in warning mode.
3. [x] Implement external sink wrappers, starting with `apa-safe-npx` and `apa-safe-fetch`.
4. [ ] Add report schema package and wire claims/patentability/examiner/OA reports.
5. [ ] Expand prior-art dossier and upload manifest fields.
6. [ ] Add rigor staleness caps.
7. [ ] Decide and implement legal-preamble progressive disclosure.
8. [ ] Add trigger tests.
9. [ ] Add benchmarks.
10. [ ] Add human review UI.

## Release Gate

Before declaring this implementation plan complete:

- [ ] `docs/review-coverage.md` has no "Deferred" item without a linked issue, checklist item, or
  explicit out-of-scope rationale.
- [ ] Every skill that writes files emits or references a machine-readable report.
- [ ] Every external sink goes through a package-level guard, not only prompt instructions.
- [ ] Every human checkpoint is represented in a machine-readable artifact.
- [ ] The example matters still validate and smoke-test cleanly.
- [ ] The final repository state is pushed only after `npm run build` passes.
