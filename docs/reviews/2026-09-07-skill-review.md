# First-party skill and supporting-file review

Date: 2026-09-07. Review mode: read-only, with this report as the only write. Model requested for the delegated review: Astra, maximum reasoning. The existing changes in prior-art search and filing assembly were reviewed as working-tree content and left untouched.

The 23 skills provide useful boundaries, source provenance requirements, and concrete CLI gates. The most important weaknesses are a broken distributed review-form dependency, stale browser answers that can be attached to a new review target, incorrect claim-ladder guidance, and disagreement between lifecycle instructions. Improving these matters more than adding more skill prose.

## Scope and method

Applied the eleven-dimension audit rubric from the installed `skill-helper/SKILL.md`, including its checklist and patterns references. This was an audit, so no fixes were applied.

- Inventoried all **236 files** under `skills/`: 23 `SKILL.md` files, 21 templates, 23 metadata files, 23 trigger fixtures, 117 references, 18 first-party JavaScript scripts/tests, one HTML asset, three drawing fixtures, one host metadata file, four registry/domain files, and two vendored-engine files.
- Read all 21 templates and both direct-source skills. Examined the generated skill structure, shared expansions, and notable rendered output; relied on the root review's successful generated-freshness check for template/output parity. This avoids counting the same generated prose as a second independent review.
- Read all metadata, trigger fixtures, registry/domain declarations, and distinct reference content. The 105 generated shared references reduce to five byte-identical bodies after removing their skill-specific provenance header and normalizing line endings. The other twelve reference files are distinct.
- Read the smaller runtime scripts and their tests in full. For the large PDF library/test file, HTML asset, generator, and questionnaire, inspected function inventories and the specific parsing, provenance, confirmation, persistence, export, and failure paths identified in the coverage appendix. These files were **not** all reviewed line by line.
- Excluded `third_party/`, unrelated generated host prose, and the minified PDF engine internals. The vendored engine's manifest hash and license were inspected; its underlying PDF implementation was not audited. No current-law verification, live patent search, native tldraw export, real PDF rendering, fresh-agent trigger trial, or browser visual QA was performed in this review.

The root review independently ran the test suite and selected static checks. Its final coverage retry passed 618 tests; the earlier coverage run had a review-worker concurrency failure. This report does not reinterpret a passing retry as proof that the intermittent failure is fixed. See [project review](2026-09-07-project-review.md) for those results.

## Prioritized findings

### F1 — P1: Distributed review-form commands cannot start

`skills/apa-review-form/scripts/review_fingerprint.mjs:2` imports `../../../packages/apa-review/review-fingerprint.mjs`. That path works inside the repository's `skills/` tree but escapes the packaged skill. `scripts/gen-skill-docs.mjs:147` and `:249` copy this support file unchanged into host distributions. The generator and questionnaire import the shim before processing arguments (`generate_review_form.mjs:7`; `ask_review_questions.mjs:7`).

Both existing distribution commands were reproduced as failures:

```text
node dist/codex/apa-review-form/scripts/generate_review_form.mjs --help
node dist/cursor/apa-review-form/scripts/ask_review_questions.mjs --help
```

Both exit 1 with `ERR_MODULE_NOT_FOUND` for `dist/packages/apa-review/review-fingerprint.mjs`. Supplying `--apa-kit` cannot repair a static import that fails before argument parsing. The compatibility text at `skills/apa-review-form/SKILL.md:4` says a checkout is required for enrichment and safe network fetches, which understates this unconditional dependency.

Recommended correction: package the fingerprint runtime and its dependencies inside the skill, or explicitly resolve a configured toolkit before loading it. Add a relocated/installed `--help` and offline-generation smoke check; source-tree tests alone cannot catch this.

### F2 — P1: Browser persistence discards review-target identity

`skills/apa-review-form/assets/review-form-template.html:780` keys local storage only by matter ID/title. Lines 798–824 load and save raw answers, without their target fingerprint, and automatically merge them into a regenerated form. `exportJson` at line 1443 then combines the new `DATA` with those old answers. Backup import at lines 1606–1614 checks matter identity, but does not compare the imported review-target fingerprint.

A read-only Node VM evaluation of the template's actual initialization code reproduced this: an earlier `CLM01` answer with status `OK` and note `Reviewed earlier revision` was loaded into new `DATA` containing a different fingerprint. No explicit review/adoption occurred. The export code subsequently associates that answer with the new data object.

This contradicts `skills/apa-review-form/SKILL.md:97`, which says answers must not carry forward silently. It proves stale approval display/re-export, not an end-to-end filing-preflight bypass; the latter was not reproduced. The server also deserves a coordinated fix because its state endpoint binds submitted answers to the form's fingerprint when no previous target binding exists (`serve_review_app.mjs:376`).

Recommended correction: persist an envelope containing schema, matter identity, target fingerprint, and answers; quarantine or explicitly re-review a mismatched envelope on load/import; send the originating fingerprint with every save. Cover regenerated file mode, a new server state, and imported backups.

### F3 — P1: The generated claim ladder tells agents to recover breadth through dependent claims

`skills/claim-drafting/SKILL.md:95` prescribes a narrow lead independent claim and then says to “push breadth into dependent claims so a single anticipated dependent does not sink the independent claim” at lines 97–98. Its source is `scripts/resolvers/rubric.mjs:31`.

A dependent claim inherits the independent claim's limitations, so this instruction cannot recover breadth removed from the independent claim. The statement also reverses the usual role of narrower dependent fallback positions. Because this is shared, prescriptive drafting guidance, a human checkpoint does not make the instruction harmless.

Recommended correction for practitioner review: describe narrower dependent fallback positions, and keep any supported broader independent/continuation options separately identified. Add a small claim-tree example that demonstrates the inherited limitations. This is a question about correcting the skill's drafting instruction, not a scope recommendation for a patent matter.

### F4 — P2: The orchestration and drafting skills disagree about canonical writes

`skills/autoprep/SKILL.md.tmpl:19` declares a ledger workflow in which agent stages submit immutable proposals for human adoption. `skills/specification-drafting/SKILL.md.tmpl:34` and `:56` implement that model by writing `drafts/specification/` and calling `apa propose`.

By contrast, `skills/claim-drafting/SKILL.md.tmpl:15` and `:26` direct agents to edit `logic/claims.md` and scope-decision bindings directly. `skills/figure-generation/SKILL.md.tmpl:21` directs source edits under `src/drawing_src/`. The skills do not explain which writes are initial capture, which are draft candidates, or how these direct writes participate in the immutable proposal contract.

Recommended correction: give each agent stage an explicit candidate-output and proposal/adoption contract, and identify any deliberate initial-capture exception. Otherwise the same task has different audit behavior depending on whether the agent follows the orchestrator or a phase skill.

### F5 — P2: Office Action handoff can prematurely mark a matter responded

`skills/office-action/SKILL.md.tmpl:60` hands a draft scaffold to a practitioner, then line 61 says to change `PATENT.md` from `office-action` to `responded`. There is no intervening evidence that the human filed a response.

Recommended correction: keep the matter in its current prosecution state while recording a draft/handoff event. Change the response status only after a human supplies the corresponding completed-action evidence. Also align `skill.yaml:9`, which names `prosecution/response-scaffold.md`, with the skill's actual `response-NN.md` output at template line 47.

### F6 — P2: The date verifier invents precision absent from Crossref metadata

`skills/apa-review-form/scripts/verify_dates.mjs:154` defaults missing month/day components to 1. Lines 167–178 put the resulting values into `verifiedDates` without retaining precision.

The actual function was evaluated without network access:

```text
[[2020]]    -> 2020-01-01
[[2020, 7]] -> 2020-07-01
```

The source supports a year or month, not those exact days. A generic human-verification warning does not restore the lost evidence distinction.

Recommended correction: retain the original `date-parts`, emit year/month/day precision, and avoid inventing an exact date. Add year-only and month-only metadata cases.

### F7 — P2: The compiler reference documents the wrong validator exit contract

`skills/compiler/references/validation-checklist.md:10` says mechanical validation uses “exit 0/1, never 2.” The actual contract in `packages/apa-validate/validate.mjs:650` returns 2 for errors, 1 for warnings, and 0 for clean.

An agent using this checklist to branch on subprocess status can misclassify the blocking state. Replace the contradictory text with the actual three-way contract and keep it generated or tested against the CLI behavior.

### F8 — P2: Missing-parts handoff still rejects supported checkbox work

`skills/missing-parts-response/SKILL.md.tmpl:59` allows only text-field filling and says to refuse choices, entity status, and fee/payment fields. The current `skills/apa-form-fill/SKILL.md:104` permits mechanical transcription of exact human-confirmed checkbox states, and its profile guide describes the supported fields. The working-tree filing-assembly template already reflects this distinction.

Recommended correction: update the missing-parts handoff to distinguish mechanical transcription from choosing a legal/financial response or executing a payment. The present disagreement can stop a task that the invoked form-fill skill is explicitly designed to complete.

### F9 — P2: Passing trigger fixtures do not test description-driven discovery

Fifteen of the 23 skills have **zero positive prompts without an explicit invocation**. For example, all positives in `skills/claim-drafting/trigger-tests.json:4` include `/apa-claims`. Several negatives are remote topics such as weather or JSON formatting.

More fundamentally, `scripts/check-skills.mjs:87` scores a prompt using commands and keywords from the fixture itself, giving an explicit command 100 points and a keyword two points. It does not use the skill description to route the prompt. Therefore a green trigger check cannot substantiate whether the actual description activates correctly, or whether a description rewrite preserves behavior.

Recommended correction: keep deterministic routing checks, but label them accurately. Add at least three realistic command-free positives and nearby-domain negatives per skill, and run a separate fresh-agent discovery evaluation over descriptions. Do not count the present fixture pass as a model activation test.

### F10 — P2: Two mandatory validation steps conflict with their tool declaration

`skills/disclosure-capture/SKILL.md.tmpl:6` and `skills/patentability-analysis/SKILL.md.tmpl:6` omit Bash/command execution from `allowed-tools`, while requiring Node CLI validation at disclosure lines 73–75 and analysis line 49. Both also describe their behavior as file-I/O only.

On hosts that enforce or use this field for automatic tool permission, completing the stated workflow requires undeclared access and may prompt or fail. Declare local execution of the validation gates, while preserving the intended no-network boundary. This is an autonomy/prompt-friction issue, not a request to weaken a human legal checkpoint.

### F11 — P3: Examples and generated block composition need a small correctness pass

- The figure example at `skills/figure-generation/SKILL.md.tmpl:23` declares only numeral `10`, then connects nonexistent `12` and `14` and loops on `14`. Make the smallest example self-contained and renderable.
- `skills/compiler/SKILL.md.tmpl:71` inserts the multi-line `IDS_REQUIREMENTS` block inside a sentence. Its generated result at `SKILL.md:124` contains a heading/list inside a parenthetical, ending with `do not hardcode. via the assembly stage)`. `office-action/SKILL.md.tmpl:75` similarly places a block expansion after `See`. Put block-valued tokens on standalone lines or link to the reference.
- The specification rubric assigns maxima of 30/25/20/15/10 points (`skills/specification-drafting/SKILL.md:82`) but tells the agent to clear a per-dimension floor such as 95 at line 90. Specify normalization to percentages and a bounded stop condition; raw per-dimension scores cannot reach that target.

### F12 — P3: Some long instructions and references should be routed rather than repeated

All skill bodies pass the under-500-line rule, but line count hides dense prose. Drawing-quality and SVG-upgrader instructions repeat scale, compact-sheet, typography, leader, and collision rules across workflows, heuristics, checklists, common fixes, and shared references. Their generated files are approximately 22 KB and 21 KB respectively. Consolidate the repeated detailed criteria into one routed reference while keeping the actionable gate sequence in the body.

The software-patent guide (207 lines), license guide (104 lines), and form-fill plan guide (111 lines) lack a table of contents despite exceeding the skill-helper's 100-line reference threshold. This is a lower-priority navigation issue; do not expand already concise skills merely to chase rubric scores.

## Per-skill rubric

Scores are manual assessments, not benchmark measurements. Dimensions follow skill-helper exactly: D1 description, D2 conciseness, D3 progressive disclosure, D4 structure, D5 concrete examples, D6 feedback loops, D7 freedom calibration, D8 anti-pattern avoidance, D9 cross-platform operation, D10 rationale, D11 autonomy/prompt friction. A **bold score is 5 or below**. Example scores consider both the skill and its supporting references; commands alone do not always constitute an input/output example.

| Skill directory | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | D11 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| apa-form-fill | 8 | 8 | 8 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8 |
| apa-review-form | 8 | 7 | 8 | 9 | 8 | **5** | 8 | 8 | **3** | 9 | 7 |
| autoprep | 6 | 8 | 9 | 8 | **3** | 9 | 6 | 8 | 7 | 8 | 6 |
| claim-drafting | 6 | 8 | 9 | 7 | **4** | 9 | **4** | 7 | 8 | 7 | 6 |
| compiler | **4** | 7 | 8 | 7 | **4** | 7 | 8 | 7 | 8 | 8 | 7 |
| disclosure-capture | **5** | 8 | 9 | 7 | **3** | 7 | 8 | 8 | 6 | 9 | 6 |
| examiner-adversary | **5** | 8 | 9 | 7 | **4** | 9 | 8 | 6 | 8 | 8 | 7 |
| figure-generation | 6 | 8 | 9 | 7 | **4** | 9 | 8 | 8 | 8 | 8 | 8 |
| filing-assembly | 6 | 8 | 9 | 8 | 6 | 9 | 9 | 8 | 8 | 9 | 8 |
| missing-parts-response | 9 | 8 | 9 | 10 | 9 | 9 | 8 | 9 | 7 | 9 | 7 |
| office-action | **5** | 8 | 9 | 7 | **4** | 7 | 6 | 7 | 8 | 8 | 7 |
| patent-correspondence-triage | 9 | 8 | 9 | 10 | 9 | 9 | 9 | 9 | 8 | 9 | 8 |
| patent-drawing-quality | 8 | 6 | 7 | 8 | 6 | 9 | 8 | 7 | 8 | 9 | 8 |
| patent-svg-upgrader | 9 | 6 | 7 | 8 | 6 | 9 | 8 | 7 | 8 | 9 | 8 |
| patentability-analysis | 6 | 8 | 9 | 7 | **4** | 7 | 9 | 8 | 6 | 9 | 7 |
| prior-art-search | 6 | 7 | 8 | 8 | 6 | 9 | 9 | 8 | 8 | 9 | 7 |
| public-patent-benchmark | 9 | 8 | 9 | 8 | 8 | 6 | 9 | 9 | 8 | 9 | 8 |
| real-patent-skill-tuning | 8 | 8 | 9 | 9 | 7 | 9 | 9 | 9 | 8 | 9 | 9 |
| rigor-review | 6 | 8 | 9 | 7 | **4** | 9 | 9 | 8 | 8 | 9 | 8 |
| software-license-review | 8 | 9 | 8 | 7 | 7 | **5** | 9 | 9 | 8 | 9 | 8 |
| software-patent-review | 8 | 8 | 7 | 8 | 8 | 6 | 9 | 8 | 8 | 9 | 8 |
| specification-drafting | 6 | 8 | 9 | 8 | **4** | 7 | 9 | 8 | 8 | 9 | 8 |
| tldraw-patent-drawing | 9 | 7 | 8 | 9 | 8 | 9 | 9 | 8 | 7 | 9 | 8 |

## Individual assessments and next actions

“Description pass” below means valid and usable under the audit, not proven natural-language activation. “Needs work” identifies rubric deficiencies such as workflow summaries, absent negative boundaries, or weak discovery evidence. All 23 canonical names match their directories, use forward-slash artifact paths, and have explicit compatibility text. Host-specific invocation syntax and POSIX-only command examples still deserve relocated execution checks. Body counts exclude frontmatter and surrounding blank lines; all pass the size rule.

| Skill / body lines | Description | Structure and cross-platform assessment | Prioritized action |
|---|---|---|---|
| `apa-form-fill` / 232 | Pass; specific positives and negative boundaries | Startup contract, route, phases, example, guardrails. Installed-directory resolution and chat-only limitation are explicit. | Keep the confirmation/digest model. Add a TOC to the plan reference and retain independent rendered-form review for new profile hashes. No confirmed engine defect in inspected paths. |
| `apa-review-form` / 215 | Pass | Quick start, workflow, options, example; portability fails in distributed commands. | Fix F1 and F2 first, then F6. Add visible save failures and worker recovery before relying on unattended review sessions. |
| `autoprep` / 86 | Needs work: workflow-heavy description; no command-free positives | Ordered pipeline and stop gates; no worked resume example. A startup checkpoint uses a host-specific question tool, although host generation translates instructions. | Align proposal contracts (F4). Infer already-known matter config and approval context; make human questions target missing facts. Add one plan/resume example. |
| `claim-drafting` / 103 | Needs work: mostly workflow summary; no negative scope boundary | Procedure, generated ladder, validation, prohibitions; no complete claim/binding input-output example. | Correct F3 with practitioner review, then F4. Add a small inherited-limitation example and a pro-se option-only output example. |
| `compiler` / 126 | Fails strict description checklist: literal `<path>` resembles an XML tag; workflow summary | Stages and bounded fix loop with schema/checklist references; block expansion damages final Markdown. | Correct validator exit codes (F7), then F11 and frontmatter placeholder wording. Show one claim and its verbatim source-span binding. |
| `disclosure-capture` / 89 | Needs work: second-person “as you interview”; start/end-session description tension | Procedure, provenance, bar-date rules, validation; no example. Declared tools conflict with local CLI requirements. | Correct F10 and give a staged observation -> explicit adoption -> bound artifact example. Reuse already-recorded candor answers rather than applying “always ask” mechanically. |
| `examiner-adversary` / 108 | Needs work: persona/workflow framing; no command-free positives | Clear critique/fix procedure and cap, with approval boundary. No worked critique record. | Add a critique/proposal example; make loop override wording consistent with autoprep's hard loop cap. Avoid recording “Fix made” before a proposed fix is adopted. |
| `figure-generation` / 83 | Needs work: workflow summary; no command-free positives | Source -> report -> render -> reconcile -> review is concrete. Example is internally inconsistent. | Repair the renderable example (F11), identify proposal write boundaries (F4), and show expected generation-report success. |
| `filing-assembly` / 106 | Needs work: long output/workflow description | Command, output inventory, hard gates, submit boundary; repository dependency explicit. | Preserve updated checkbox-transcription wording and synchronize its callers (F8). Add minimal GO/NO-GO command outputs and the expected human handoff. |
| `missing-parts-response` / 148 | Pass | Quick start, route table, workflow, input/output example, validation loop, gotchas; shell continuations are POSIX-specific. | Fix obsolete form-fill scope (F8). Keep unresolved items and required factual verification; label example JSON as an excerpt because it is not a complete verified record. |
| `office-action` / 100 | Needs work: starts “OPTIONAL”; mixes workflow and warning language | Workflow and boundaries, but no complete example or specific receipt-evidence transition. | Fix F5 and output metadata path; make multi-line resolver standalone (F11). Give unsupported-event and draft-handoff examples. |
| `patent-correspondence-triage` / 148 | Pass | Strong quick start, routing, source/expected-output example, validation loop, gotchas. | Add an explicit local PDF/OCR-tool prerequisite and one supported extraction command/handoff. Retain all-page source comparison and privacy minimization. |
| `patent-drawing-quality` / 280 | Pass, but negative boundaries could be clearer | Thorough visual workflow, report schema, iteration, export guidance; substantial repetition. | Consolidate detailed repeated criteria (F12). Keep actual rendered-sheet evidence separate from deterministic geometry results. Add one annotated before/after defect example. |
| `patent-svg-upgrader` / 256 | Pass | Route selection, target, workflow, iteration checklist, external-tool example, report schema. | Reduce repeated layout criteria (F12). Preserve source JSON/PDG and pre-upgrade artifacts. Make the example `--source-route` value shell-safe and singular. |
| `patentability-analysis` / 80 | Needs work: workflow summary; no adjacent-domain boundary | Quote-backed chart procedure and report check; no complete chart cell example. Tool declaration under-specifies execution. | Correct F10. Add one yes/partial/no/unknown chart example that preserves quote and locator evidence. |
| `prior-art-search` / 148 | Needs work: output/workflow detail dominates description | Concrete commands, source registry, verification and scoring gates. Broad retrieval and archival ID requirements are clear. | Add a command-free discovery case and a small dossier/verification example. Make the dry-run then `--write` instruction explicit that it performs another retrieval, if that is intended. Preserve working-tree ID reservation changes. |
| `public-patent-benchmark` / 88 | Pass | Procedure, output contract, routed guide with examples and TOC. | Name the executable scorer/validation command and expected output for a completed fixture. Define whether the source hash covers original bytes or normalized body; avoid a self-referential `source.md` hash header. |
| `real-patent-skill-tuning` / 102 | Pass with excess workflow detail | Strong startup contract, routed references, metric floors, keep/discard, output contract. | Parameterize software-only branch/commands when tuning another skill. Replace freshness `git diff --exit-code` against HEAD with a generate-twice/no-drift check that allows intentional generated changes. |
| `rigor-review` / 78 | Needs work: workflow/output summary | Level-1 gate, scaffold, anchored scoring, deterministic verdict, boundaries. | Add one anchored finding/report example. Route external inspection to a separate prior-art task consistently with the “artifact-only/no fetch” promise. |
| `software-license-review` / 65 | Pass, with negative boundaries mainly in body | Short workflow and rich inventory/report reference; no executable or explicit final evidence audit. | Add a bounded inventory completeness/source-evidence check and TOC in the reference. Keep release decisions with the human without requiring confirmation for routine evidence collection. |
| `software-patent-review` / 78 | Pass, with adjacent-domain exclusions mainly in body | Domain-only write boundary and detailed scenario guide; report shape included. | Add a TOC and an explicit report-validation step. Keep public-fixture examples from becoming a required list of mechanism terms in unrelated inventions. |
| `specification-drafting` / 88 | Needs work: workflow-heavy description; no negative boundary | Section order, candidate output, proposal/adoption, validation and rubric. | Clarify normalized rubric scores and stop condition (F11). Add a complete source paragraph -> proposed paragraph -> proposal command example. Keep immutable disclosure separation. |
| `tldraw-patent-drawing` / 180 | Pass | Decision rule, workflow, comparison rubric, quick start, checklist, report; POSIX `export`/`mkdir -p` example limits copyability on Windows. | Add a shell-neutral command example. Keep fixture scope explicit: the synthetic snapshot/SVG pair proves acceptance checks, not native tldraw export compatibility. |

## Supporting-file coverage appendix

The inventory below accounts for every file under `skills/`. Full reads of generated duplicate reference bodies are not counted 21 times. Counts include vendored files so the accounting reconciles with the filesystem.

### Common generated bundle — 21 skill directories

For each directory listed in the following table, inspected these nine files:

```text
SKILL.md
SKILL.md.tmpl
skill.yaml
trigger-tests.json
references/confidentiality-sinks.md
references/drawing-standards.md
references/legal-guardrails.md
references/source-registry.md
references/uspto-rule-pack.md
```

The five reference bodies were read using the autoprep copies, with a hash comparison covering all 105 copies after provenance-header removal. They consistently route exact-byte sink scans, human verification, rule currency, drawing QA, and canonical source IDs. No additional independent variant was hidden by deduplication.

| Directory | Total files | Additional files inspected |
|---|---:|---|
| autoprep | 9 | None |
| claim-drafting | 9 | None |
| compiler | 11 | `references/apa-schema.md`; `references/validation-checklist.md` |
| disclosure-capture | 9 | None |
| examiner-adversary | 9 | None |
| figure-generation | 9 | None |
| filing-assembly | 9 | None |
| missing-parts-response | 9 | None |
| office-action | 9 | None |
| patent-correspondence-triage | 9 | None |
| patent-drawing-quality | 9 | None |
| patent-svg-upgrader | 9 | None |
| patentability-analysis | 9 | None |
| prior-art-search | 9 | None |
| public-patent-benchmark | 10 | `references/public-patent-benchmark.md` |
| real-patent-skill-tuning | 13 | `references/auto-tune-loop.md`; `references/oracle-isolation.md`; `references/scorer-contract.md`; `references/tuning-checklist.md` |
| rigor-review | 9 | None |
| software-license-review | 10 | `references/software-license-review.md` |
| software-patent-review | 10 | `references/software-patent-review.md` |
| specification-drafting | 9 | None |
| tldraw-patent-drawing | 13 | `tldraw-fixture.test.mjs`; `fixtures/minimal-snapshot.json`; `fixtures/minimal-export.svg`; `fixtures/unsafe-foreign-object.svg` |

All additional Markdown references and all four additional tldraw files were read in full. The SVGs were inspected as source, not rendered for appearance.

### `apa-form-fill` — 12 files

| File | Review depth and result |
|---|---|
| `SKILL.md` | Full read; detailed intake/confirmation/verification contract. |
| `skill.yaml` | Full read; outputs and gates align with current text/checkbox support. |
| `trigger-tests.json` | Full read; native host invocations and six command-free positive prompts. |
| `agents/openai.yaml` | Full read; explicit invocation and local-execution qualification. |
| `references/form-support.md` | Full read; six AcroForm profiles plus three XFA refusals. |
| `references/plan-schema.md` | Full read; human and verified-JSON provenance examples, field exclusions. |
| `references/form-profiles.json` | Full read; official URLs, byte/hash bindings, labels, signature exclusions, checkbox allowlists. Printed-label accuracy was not independently visually revalidated. |
| `scripts/patent_form_fill.mjs` | Full read; command parsing, local plan I/O, explicit confirmation flag, typed error routing. |
| `scripts/form_fill_lib.mjs` | Targeted review of path/matter validation, confidentiality-mode parsing, engine integrity, field policy, PDF inspection, plan validation, provenance, confirmation digest, font sizing, field application/comparison, fill cleanup, manifest verification and exclusive output helpers. Not every label-mapping/registry-helper line was read. No confirmed defect in inspected paths. |
| `scripts/form_fill_lib.test.mjs` | Enumerated all 22 test cases and helper structure; mapped named regressions to inspected runtime paths. Test bodies were not all manually read. Root suite results supply execution evidence, not visual PDF evidence. |
| `scripts/vendor/PDF-LIB-LICENSE.md` | Full read; MIT notice present. |
| `scripts/vendor/pdf-lib-1.17.1.cjs` | Inventory and pinned-integrity metadata only; minified vendor internals excluded. |

### `apa-review-form` — 18 files

| File | Review depth and result |
|---|---|
| `SKILL.md` | Full read; F1/F2 show that implementation falls short of portability/freshness claims. |
| `skill.yaml` | Full read; declared outputs and network host policy inspected. |
| `trigger-tests.json` | Full read; three command-free positives and neighboring skill negatives. |
| `assets/review-form-template.html` | Full function/event/persistence inventory; targeted DOM shell, initialization, local/server save, card value rendering, questionnaire storage, reset, agent response application, import/export. F2 reproduced using actual initialization code. CSS/layout and all UI handlers not reviewed line by line; no browser visual check. |
| `scripts/agent_worker.mjs` | Full read; claim token and cancellation checks present. Crashed `running` requests have no lease/reclaim path. Completion errors may produce an `error` request with process exit 0; E2E diagnostics lose the underlying request error. |
| `scripts/apa-safe-review-metadata-fetch.mjs` | Full read; exact-URL redaction, host/scheme/port checks, redirect/size/time bounds. No live fetch performed. |
| `scripts/ask_review_questions.mjs` | Targeted parser/input loading, queue building, freshness, answer loading/upsert/save, record parser, interactive/agent main paths; question catalogs structurally inventoried. Atomic replacement exists, but answer read-modify-write is not protected by the shared update lock. |
| `scripts/generate_review_form.mjs` | Targeted arguments, claim/IDS/figure parsers, command invocation, path redaction, question queue composition, embedded data and final output. Repeated card/question text not read line by line. Claim category inference uses heading text rather than canonical bindings; consider core parser reuse. |
| `scripts/review_fingerprint.mjs` | Full read; unconditional repository-relative shim causes F1. |
| `scripts/review_io.mjs` | Full read; atomic replacement and lock coordination. No live-lock heartbeat/ownership token and no replacement retry. Do not attribute the intermittent Windows failure to these details without a captured cause. |
| `scripts/serve_review_app.mjs` | Full read; loopback/origin checks, bounded mutation bodies, state revisions, request patch/cancel, SSE, fixed form serving. F2 requires server/client identity coordination. |
| `scripts/verify_dates.mjs` | Full read; source-specific extraction and offline/network report paths. Partial-date precision loss reproduced as F6. |
| `scripts/ask_review_questions.test.mjs` | Full read; stale answer fingerprint regression. |
| `scripts/review_fingerprint.test.mjs` | Full read; IDS/PDF/correspondence mutation and symlink regression coverage. |
| `scripts/review_io.test.mjs` | Full read; concurrent appends and malformed-JSON preservation. |
| `scripts/safe_metadata_fetch.test.mjs` | Full read; host bounds, redirect rejection, decoded-size cap, exact-egress/HIGH block. |
| `scripts/test_agent_bridge_e2e.mjs` | Full read; isolated matter copy, local API/SSE, concurrency, cancellation and cleanup. Root observed one intermittent worker assertion failure; no confirmed root cause. |
| `scripts/verify_dates.test.mjs` | Full read; offline default and hostile-lookalike source. Missing partial Crossref date regression. |

### Four global files

`skills/registry.yaml`, `skills/domains/device/domain.yaml`, `skills/domains/formulation/domain.yaml`, and `skills/domains/software/domain.yaml` were read in full. The domain packs declare confined proposal/report outputs and nonblocking hooks; software has one linked first-party skill plus command-runner entries. The device/formulation runner entries are metadata, not extra `SKILL.md` skills, so they are not counted as additional skills. Root reviewed selected runtime implementations and the package architecture separately; this does not establish an exhaustive review of every domain implementation.

## Suggested correction order

First repair distributed execution and browser target binding (F1/F2). Have the shared claim-ladder instruction corrected and reviewed (F3). Then align proposal/status/tool contracts and date/validator behavior (F4–F10). Finish with the small example/generation fixes and genuine description-discovery evaluation. Preserve the existing human adoption, exact-source hashing, XFA refusal, and submit boundary while making these changes.
