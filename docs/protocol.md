# The Patent Artifact Protocol (v0.1/v0.2, MVP)

> The on-disk, machine-executable format for a patent matter. This is the **canonical contract**:
> the validator (`packages/apa-validate`), the viewer (`packages/apa-viewer`), and every skill read
> and write this format. The validator reads legacy `apa_version: "0.1"` matters and current
> `apa_version: "0.2"` matters; unknown/future versions fail loud. See `../DESIGN.md` §2 and §11
> for the rationale. **USPTO scope.**

A patent **matter** is a directory `<matter>/` holding a `PATENT.md` manifest plus four layers
(`logic/` `src/` `trace/` `evidence/`) and a `staging/` capture buffer. The layers split the matter
by **epistemic role**, not by document section, so an agent loads only what a question needs.

```
<matter>/
  PATENT.md            # * manifest: matter header (frontmatter) + per-layer Layer Index
  logic/               # what is claimed & why it is patentable
    problem.md         # * field, problem, the gap prior art leaves
    claims.md          # * CLM## blocks (independent + dependent), each with LIM## limitations
    concepts.md        # * TERM## defined claim terms (lexicography / antecedent-basis source)
    patentability.md   # * 101/102/103/112 analyses as flags + questions (NOT legal opinions)
    prior_art.md       # * PA## prior-art references, typed by legal role
  src/
    embodiments.md     # * SPEC#### paragraphs (the specification support text)
  trace/
    prosecution.yaml   # * decision DAG: PH## nodes (decision / dead_end / pivot / question / experiment)
    runlog.jsonl       #   append-only skill/tool execution ledger for APA writes and sink calls
  evidence/
    README.md          # * index: every reference & drawing -> the claims it bears on
    prior_art/<paN>.md #   raw bibliographic record + the relied-on passage of one reference
    drawings/<figN>.md # * FIG## transcription: numerals -> elements -> defining SPEC paragraph
  staging/
    observations.yaml  #   append-only buffer of unconfirmed interpretive observations
```

`*` = **mandatory core**, but the core is **application-type-aware** (see §6). A `provisional`
needs spec + drawings but **not** `claims.md`; a `design` application needs exactly one claim.

---

## 1. `PATENT.md` frontmatter

YAML frontmatter (the ~200-token L1 relevance gate) followed by Layer Index tables (human-readable).

```yaml
---
apa_version: "0.2"
title: "<invention title; also the application title, <=500 chars>"
application_type: "utility"        # provisional | utility | design | plant | pct | cip
jurisdiction: "USPTO"                 # only active jurisdiction in v0.1; other values fail loud
user_role: "unknown"                 # registered_practitioner | pro_se | unknown
confidential_workflow_mode: "ordinary_local" # ordinary_local | counsel_controlled | shareable_redacted
source_span_policy: "warning"        # warning | strict | relaxed  (relaxed = compiled/public imports)
inventors:                         # >=1 natural person; AI MUST NOT appear here
  - id: "AINVENTOR"                # short stable ID referenced by provenance inventor:<id>
    name: "<natural-person name, or 'TBD'>"
assignee: "<applicant/owner, or 'unassigned'>"
matter_docket: "<docket no., or 'none'>"
entity_status: "unknown"           # large | small | micro | unknown  (APA never asserts micro)
application_no: "unfiled"
priority_date: "none"
filing_date: "unfiled"
related_applications: []           # family members / co-pending serials (benefit, ODP awareness)
status: "drafting"                 # disclosure | searched | analyzed | drafting | assembled | filed
provenance_summary: { inventor: 0, attorney: 0, ai-suggested: 0, ai-executed: 0, human-revised: 0 }
inventorship_matrix: {}            # CLM## -> [inventor id, ...]  (per-claim conception, 35 USC 116)
claims_summary: []                 # one-line gist per INDEPENDENT claim
abstract: "<=150-word abstract draft"
rules_effective_date: "2026-06-15" # must match the active dated rule pack; surfaced in outputs/reports
confidentiality: "UNFILED - CONFIDENTIAL. Do not externally disclose."
---
```

**Progressive disclosure:** L1 = `PATENT.md` only; L2 = a layer file (`claims.md`, `prior_art.md`,
`evidence/README.md`); L3 = a detail (one claim's support, one reference's chart, one figure).

### Protocol version contract

- `0.1` remains readable for existing matters. Limitation-level `contributors` is optional.
- `0.2` is the current authoring contract. Every adopted claim limitation must carry a non-empty,
  duplicate-free `contributors: [<inventor-id>, ...]` list whose IDs resolve to `inventors`.
- Unknown or future versions are validation errors. Tools must not guess migration semantics.

`provenance` records how text was authored or adopted; `contributors` records the natural people
identified as having contributed to the limitation. They answer different questions and neither is
a legal inventorship conclusion.

### Rule Pack Contract

APA v0.1 has exactly one active rule pack: `docs/rule-packs/uspto.json` (`uspto-v1`,
`jurisdiction: USPTO`, effective date `2026-06-15`). Validators, generated skill references,
viewer manifests, and semantic reports surface that rule-pack metadata so a reviewer can see which
dated assumptions were applied.

Non-USPTO jurisdictions such as PCT or EPO are extension points only. A matter that sets
`jurisdiction` to anything other than `USPTO` must fail validation instead of silently applying USPTO
rules. A missing or stale `rules_effective_date` produces a warning requiring currency verification.

### Confidential Workflow Modes

`confidential_workflow_mode` is an explicit matter-level policy knob. It does not create or preserve
privilege; it tells deterministic tools how conservative to be around sensitive critique artifacts.

| Mode | Meaning | Deterministic behavior |
|---|---|---|
| `ordinary_local` | Default local drafting workflow. | External sinks still require scan-at-sink; shareable exports exclude sensitive critique artifacts by default. |
| `counsel_controlled` | Work is intended to be routed through counsel-controlled systems and review. | Examiner-adversary and patentability skills use stronger privilege/work-product caution; reports remain flags/questions, not legal advice. |
| `shareable_redacted` | A copy may be prepared for sharing outside the trusted drafting circle. | Validator warns when sensitive critique reports exist; upload manifests list those artifacts under `excluded_from_shareable_exports`; sharing still requires redaction guard and human approval. |

Sensitive critique artifacts include `logic/patentability_report.json`,
`trace/examiner_adversary_report.json`, `trace/prosecution_rationale.md`,
`patent_rigor_report.json`, and `prosecution/office_action_report.json`.

---

## 2. The `binding` block (machine-readable layer)

Every entity is a markdown section whose heading **starts with the entity ID**, followed by
human-readable prose, followed by a fenced ` ```binding ` block (valid YAML). Parsers read the
binding blocks; humans read the prose. This decouples machine data from narrative.

```markdown
### CLM01 - <short title>
<the human-readable claim text>

​```binding
type: claim-independent
...edges...
​```
```

### Typed IDs (the cross-layer spine)

| Prefix | Entity | Declared in |
|---|---|---|
| `CLM##` | a claim | `logic/claims.md` |
| `LIM##` | a claim limitation (nested under a `CLM##`) | within a `CLM##` binding |
| `TERM##` | a defined claim term (lexicography) | `logic/concepts.md` |
| `SPEC####` | a specification paragraph (support text) | `src/embodiments.md` |
| `FIG##` + `#<numeral>` | a drawing figure and its reference numerals | `evidence/drawings/` |
| `PA##` | a prior-art reference | `logic/prior_art.md` + `evidence/prior_art/` |
| `PH##` | a prosecution / decision event | `trace/prosecution.yaml` |
| `INV##` / `inventor:<id>` | a natural-person inventor | `PATENT.md` `inventors` |

### Typed edges

| Edge | From -> To | Meaning | Unresolved target |
|---|---|---|---|
| `supported_by` | LIM -> SPEC | §112 written-description/enablement support | **warning** ("unsupported-edge") |
| `defined_by` | LIM -> TERM | lexicographic/claim-term definition link; never a substitute for SPEC support | warning |
| `illustrated_by` | LIM -> FIG#numeral | drawing support | warning |
| `practiced_by` | LIM -> SPEC (embodiment) | the embodiment implementing it | warning |
| `antecedent_of` | LIM -> LIM (earlier, same claim) | antecedent basis (`the X` -> earlier `a X`) | **error** |
| `depends_on` | CLM -> CLM | dependent-claim base | **error** |
| `distinguished_over` | CLM -> PA | the reference it must read past (102/103) | warning |
| `scope_set_at` | CLM -> PH | the decision node where breadth was chosen | warning |
| `contributed_to` | INV -> CLM | claim-level attestation from `inventorship_matrix` (35 USC 116) | error |
| `contributed_to_limitation` | INV -> LIM | limitation-level contribution from v0.2 `contributors` | error |

**Provenance** tags (every limitation, embodiment, prior-art characterization, decision):
`inventor:<id>` · `attorney` · `ai-suggested` (default) · `ai-executed` · `human-revised`.
Never auto-upgrades. A claim limitation tagged `ai-suggested` is an **assembly blocker** (human must
adopt it). Under v0.2, adoption also requires `contributors`. See DESIGN §2.4 / §11.1.

**Source-span metadata** accompanies promoted facts where available. `source` is one of
`transcript|upload|inventor-confirmation|attorney-note|figure-reconstruction|source-extracted|
inferred-from-document|not-recoverable`.

The default `source_span_policy: "warning"` contract uses scalar `source_span` and `source_sha256`
metadata and warns when an adopted limitation or `SPEC####` paragraph lacks it. `relaxed` permits
missing source metadata for compiled/public imports but still warns on invalid values.

Strict mode uses verifiable records:

```yaml
source: inventor-confirmation
source_spans:
  - path: evidence/interview-transcript.txt
    locator: "lines:42-45"
    sha256: "<SHA-256 of the exact source-file bytes>"
```

Each strict record must contain a matter-relative `path`, a non-empty `locator`, and a 64-character
SHA-256 digest. Paths must remain under `staging/`, `evidence/`, `src/`, `logic/`, or `source/`;
absolute paths, `..`, missing/non-file targets, symlink escapes, and hash mismatches are validation
errors. Multiple records are permitted and every record is verified. Use `source: not-recoverable`
only when the source genuinely cannot be recovered; it explicitly records that limitation instead
of fabricating provenance and still requires human review.

---

## 3. Layer file formats

### `logic/claims.md`
One section per claim. Binding schema:
```yaml
type: claim-independent | claim-dependent
depends_on: CLM01            # required iff claim-dependent
category: apparatus | method | composition | crm | system   # statutory category
distinguished_over: [PA01]
scope_set_at: [PH01]
provenance: inventor:AINVENTOR
limitations:
  - id: LIM01
    text: "a frame"
    introduces: "frame"      # the noun phrase this limitation introduces ('a/an ...')
    supported_by: [SPEC0002]
    defined_by: [TERM01]     # optional lexicographic link; supported_by remains LIM -> SPEC
    illustrated_by: [FIG01#10]
    provenance: inventor:AINVENTOR
    contributors: [AINVENTOR] # required for adopted limitations in apa_version 0.2
  - id: LIM02
    text: "a fastener coupled to the frame"
    references: ["frame"]    # noun phrases referenced as 'the/said ...' -> need antecedent
    antecedent_of: [LIM01]   # resolves each 'references' to an earlier introducing limitation
    supported_by: [SPEC0003]
    provenance: inventor:AINVENTOR
    contributors: [AINVENTOR]
```

### `logic/concepts.md`
One `### TERM## - <term>` section per defined term; prose definition; binding:
```yaml
term: "selected tolerance"
objective_bound: true        # 112(b): a term of degree must have an objective bound
provenance: attorney
```

### `logic/prior_art.md`
One `### PA## - <citation>` section; binding:
```yaml
role: prior-art-for-patentability | potential-blocking-right
citation: "<full bib record>"
relied_on_passage: "<the exact passage relied on>"
discloses: ["<what it teaches>"]
lacks: ["<what it does NOT teach>"]
verification: { verified: false, confidence: low }   # hardened-verification stage fills this
provenance: ai-executed
```

### `logic/patentability.md`
Freeform analysis written as **flags + questions for the attorney**, never opinions/conclusions.
Optional binding blocks may reference `CLM##`/`PA##`. (Full claim-chart structure: Phase 3.)

### `logic/problem.md`
Freeform: field of invention, the problem, the gap prior art leaves.

### `src/embodiments.md`
One `### SPEC#### - <gist>` section per support paragraph; binding:
```yaml
grounding: transcribed | reconstructed     # transcribed = inventor-sourced; reconstructed = drafted-from-figures
defines_numerals: ["FIG01#10"]             # numerals this paragraph defines
provenance: inventor:AINVENTOR
source: inventor-confirmation
source_spans:                               # required for adopted paragraphs in strict mode
  - { path: "evidence/interview-transcript.txt", locator: "lines:42-45", sha256: "<64 hex chars>" }
```
Any gap is written literally as **"Not specified in disclosure"** (new-matter guard) — never invented.

### `evidence/drawings/<figN>.md`
One `### FIG## - <title>` section; binding:
```yaml
representative: true          # exactly one figure should be representative (front page)
numerals:
  - numeral: "10"
    element: "frame"
    defined_in: SPEC0002      # the SPEC paragraph that describes this numbered element
```

### `evidence/README.md`
Markdown index table: each reference/drawing -> source -> claims it bears on (the IDS / claim-chart seed).

### `trace/prosecution.yaml`
A decision DAG (re-roled from ARA's `exploration_tree.yaml`):
```yaml
root: PH01
nodes:
  - id: PH01
    type: question | decision | dead_end | pivot | experiment
    summary: "<text>"
    choice: "<for decision>"
    alternatives: ["<...>"]          # for decision
    failure_mode: "<102/103/112 ground>"   # for dead_end
    lesson: "<the foreclosed scope>"        # for dead_end
    children: [PH02]
    also_depends_on: []
    provenance: attorney
```
`trace/` and `staging/` are **append-only / immutable**; `logic/` is the mutable clean current draft.

### `trace/runlog.jsonl`
Append-only, hash-chained execution ledger for agent/tool runs. It is optional in the MVP validator
so static imported/public matters can still validate, but APA commands that write files, call an
external sink, or create a human checkpoint should append it. One JSON object per line:

```json
{
  "schema": "apa-runlog-v2",
  "timestamp": "2026-06-20T00:00:00.000Z",
  "skill": "apa-priorart",
  "rule_version": "2026-06-15",
  "inputs": [{ "path": "logic/claims.md", "sha256": "..." }],
  "outputs": [{ "path": "evidence/prior_art/search-dossier-2026-06-20T00-00-00-000Z.json", "sha256": "..." }],
  "commands": [{ "argv": ["node", "packages/apa-search/cli.mjs", "--matter", "<matter>", "--source", "patentsview"], "exit_code": 0 }],
  "external_sinks": [{ "kind": "prior-art-query", "bytes_sha256": "...", "human_approved": true }],
  "human_checkpoints": [{ "id": "closest-art-selection", "required": true, "satisfied": false }],
  "adopted_changes": [],
  "rejected_changes": [],
  "chain": {
    "sequence": 1,
    "previous_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "entry_sha256": "..."
  }
}
```

The companion `trace/runlog.head.json` contains
`{"schema":"apa-runlog-head-v1","entries":<count>,"sha256":"<tail digest>"}`. Before appending, tools
validate the entire ledger and head. Payload mutation, reordering, broken predecessor links, and
suffix/full-ledger truncation fail closed while the companion head remains. Legacy
`apa-runlog-v1` lines remain readable only as a contiguous prefix; the first v2 entry chains to the
SHA-256 of the preceding raw legacy line, and a later downgrade to v1 is rejected. Because the
ledger is optional for static/imported matters, deletion of both the ledger and its head cannot be
distinguished locally from a matter that never had a ledger; adversarial deletion requires an
external immutable anchor.

Runlog entries do not make a legal conclusion. They exist so a reviewer can tell what was run, what
bytes left the machine, which outputs were produced, and which human checks remain open.

### Executable lifecycle runner

`node packages/apa-run/cli.mjs run --matter <matter> [--domain <id>] [--support <id>]` executes only
the `node <repo-relative-script>` runners declared in skill/domain metadata. It does not invoke a
shell, rejects metacharacters, runner-root escapes, and declared overrides of the selected matter,
hashes declared inputs and successful outputs, and appends an attempt record even when a runner
fails (failed attempts record no outputs).

Steps without a deterministic runner stop as `awaiting-agent`. Gates and human checkpoints stop as
`awaiting-checkpoint`. After the checkpoint evidence is satisfied, the operator must explicitly
resume with `--continue-after <step-id>`; that continuation is itself recorded and must postdate the
most recent step evidence. Failed checkpointed runners remain retryable. An invalid chained ledger
or a nominally successful runner with incomplete declared output evidence fails before checkpoint
review is exposed.

---

## 4. Semantic report JSON files

Semantic skills that write or materially revise artifacts should emit a machine-readable report
validated by `packages/apa-reports`. These reports are structural records of flags, questions,
evidence spans, recommendations, and human checkpoints. They are not legal opinions and do not
certify patentability, novelty, validity, FTO, filing readiness, search completeness, or USPTO
compliance.

Default report files:

| Report type | Skill | Default path |
|---|---|---|
| `claims` | `/apa-claims` | `logic/claims_report.json` |
| `patentability` | `/apa-analyze` | `logic/patentability_report.json` |
| `examiner_adversary` | `/apa-examiner` | `trace/examiner_adversary_report.json` |
| `office_action` | `/apa-office-action` | `prosecution/office_action_report.json` |

Shared envelope fields: `schema`, `report_type`, `skill`, `matter`, `legal_posture:
flags-not-conclusions`, `inputs`, `outputs`, `human_checkpoints`, `findings`,
`questions_for_attorney`, `questions_for_inventor`, and `next_allowed_steps`. Every finding must
include `finding_type`, `severity`, `rule_anchor`, `evidence_span`, and `recommendation`.

Use:

```sh
node packages/apa-reports/cli.mjs scaffold claims --matter <matter>
node packages/apa-reports/cli.mjs check <matter>/logic/claims_report.json --kind claims
```

---

## 5. `manifest.json` (viewer build target)

`packages/apa-viewer/build_manifest.mjs` walks the matter and emits:
```json
{
  "meta": { "title": "...", "application_type": "utility", "status": "drafting",
            "rules_effective_date": "...", "provenance_summary": {...} },
  "nodes": [ { "id": "CLM01", "kind": "claim", "title": "...", "fields": {...}, "provenance": "..." } ],
  "edges": [ { "from": "CLM01.LIM02", "to": "SPEC0003", "kind": "supported_by", "resolved": true } ],
  "review": {
    "schema": "apa-viewer-review-v1",
    "provenance": { "unadopted_limitations": [], "blocking_count": 0 },
    "ids": { "unverified_prior_art": [], "warning_count": 0 },
    "support": { "unresolved_edges": [], "unsupported_support_edges": [], "warning_count": 0 },
    "drawings": { "status": "reviewed", "findings": [], "blocking_count": 0 }
  }
}
```
Node kinds: `claim`, `claim-limitation`, `spec-paragraph`, `drawing-figure`, `reference-numeral`,
`prior-art-reference`, `defined-term`, `prosecution-node`, `inventor`.
The `review` block is read-only UI state. It surfaces human-review work queues for adoption,
IDS/reference verification, unresolved support edges, and drawing-quality issues; it does not perform
writeback or legal review.
**Deliberate divergence from ARA:** an edge whose target does not exist is **emitted with
`"resolved": false`** (and rendered as a visible warning) — it is **not** silently dropped. This must
hold in **both** `build_manifest.mjs` and `viewer.js`.

---

## 6. Validation (Level 1 — mechanical, deterministic)

`node packages/apa-validate/validate.mjs <matter>/` parses all binding blocks and the manifest and checks
**only what is mechanical**. It never decides §112 sufficiency or 101/102/103 merits — those are
LLM-judge **flags for the attorney**, never a clearance. Exit codes: `0` clean · `1` warnings ·
`2` errors (do not proceed).

**Errors (exit 2):**
- A `depends_on` / `antecedent_of` / `contributed_to` edge whose target does not exist.
- A dependent claim with no `depends_on`, or a cycle in the dependency graph.
- A `the/said` noun phrase in a limitation (`references:`) with no resolving `antecedent_of` to an
  earlier limitation in the same claim (broken antecedent basis).
- A figure numeral used in `illustrated_by` not defined in any `FIG##` block; or a numeral defined in
  a `FIG##` whose `defined_in` SPEC does not exist.
- A mandatory-core file missing for the matter's `application_type` (type-aware, §6).
- An AI-named inventor, or zero `inventors`, in `PATENT.md`.
- An **unsupported matter type or feature** (fail loud — e.g. `application_type` not in the supported
  set; a detected nucleotide/amino-acid sequence with no ST.26 listing -> "not supported, route to counsel").
- An unsupported or future `apa_version`.
- Unknown `source_span_policy`.
- Under strict source-span policy, a missing strict record, unsafe/missing/non-file source path, or
  SHA-256 mismatch.
- Under v0.2, an adopted limitation with a missing/empty/malformed `contributors` list, an unknown
  inventor ID, or a duplicate contributor.

**Warnings (exit 1):**
- An unresolved `supported_by` / `defined_by` / `illustrated_by` / `practiced_by` / `distinguished_over` /
  `scope_set_at` edge (the "unsupported-edge" / §112-support warning).
- A claim limitation with provenance `ai-suggested` (assembly blocker — must be adopted by a human).
- An adopted claim limitation or adopted `SPEC####` paragraph missing source-span metadata.
- Invalid source-span metadata, such as an unknown `source` value or malformed `source_sha256`.
- An independent claim with no `contributed_to` from any inventor (inventorship not attested).
- A defined `TERM##` flagged `objective_bound: false` (112(b) term-of-degree risk).
- More or fewer than one `representative: true` figure.
- Prior-art evidence with no active `PA##`, or an active `PA##` with no evidence record.
- Claim prose/binding drift, or an independent claim lacking expected `distinguished_over` /
  `illustrated_by` graph evidence when prior art / figures exist.

The validator emits `validation_report.json` (machine) + a human summary, and stamps it with
`rules_effective_date`.

---

## 7. Application-type-aware mandatory core

| `application_type` | Required | Notably NOT required | Special rule |
|---|---|---|---|
| `provisional` | `PATENT.md`, `logic/problem.md`, `src/embodiments.md`, `evidence/` (drawings if any) | `claims.md`, oath, IDS | surfaces a **12-month clock** from `priority_date` |
| `utility` | full core (incl. `claims.md`) | — | default |
| `design` | full core | — | **exactly one** claim |
| `plant` / `pct` / `cip` | — | — | **not supported in MVP -> fail loud, route to counsel** |

If `application_type` is missing or outside `{provisional, utility, design}`, the validator fails loud
rather than guessing. Silent mis-validation (e.g. flagging a provisional's correctly-absent claims as a
missing-core error) is the more dangerous failure mode and is explicitly forbidden.

Validation support is broader than filing-assembly authorization. The deterministic assembler has:

- a repository-reviewed `us-utility-v1` profile enabled for gated assembly;
- checked-in `us-provisional-candidate-v1` and `us-design-candidate-v1` collation snapshots.

The provisional and design profiles are **review candidates**, not filing-enabled profiles.
Preflight blocks them until authorized humans complete legal-rule and rendered-document review.

---

## 8. Assembly package freshness

`apa-assemble --write` emits `assembled/upload_manifest.json` with schema
`apa-upload-manifest-v2`. Its `input_fingerprint` uses
`apa-assembly-input-fingerprint-v1` to hash canonical matter inputs by relative POSIX path, byte
length, and SHA-256 digest. The aggregate digest is location-independent, so moving an unchanged
matter does not make the package stale.

The fingerprint covers the manifest, claims/concepts/patentability/prior-art logic, specification
sources, prosecution trace, rigor report, drawing source/bindings/QA, and schema-validatable search
dossiers. Generated assembly output, exported PDFs/PNGs, staging notes, runlogs, and free-form review
memos are excluded because they are not authoritative source inputs. Symbolic links in the
fingerprinted input set are unsafe and block freshness.

Preflight recomputes the fingerprint whenever it assesses an existing package:

- a matching manifest may be described only as a current assembly snapshot, still subject to every
  live gate and human filing action;
- a changed/added/removed canonical input makes the saved package `STALE` and prevents its old `GO`
  from carrying forward;
- a historical manifest without a fingerprint is stale by construction and must be regenerated
  after the live gates pass.

The manifest is an audit record, not evidence that a filing act occurred and not a legal-readiness
conclusion. Human-produced PDFs, signatures, form completion, and Patent Center activity remain
separate deferred actions.

### Rigor and human-review freshness

`patent_rigor_report.json` carries an `apa-rigor-input-fingerprint-v1` over the canonical claims,
specification, drawing, dossier, and matter inputs it evaluated (excluding the report itself).
Preflight recomputes it; any changed, added, removed, or unsafe linked input makes rigor stale and
blocks assembly.

Human-review state and questionnaires bind to
`apa-human-review-target-fingerprint-v1` under
`apa-human-review-target-contract-v2`, covering claims, IDS/evidence counts, drawing artifacts,
assembly review targets, every assembled PDF/DOCX hash, and every supported JSON/Markdown/PDF file
under `correspondence/`. The dynamic app persists
`apa-human-review-state-v2`; questionnaire queues and answers use
`apa-agent-question-queue-v2` / `apa-agent-question-answers-v2`. Changed targets make existing
review evidence stale. Unanswered/unresolved readiness-required factual questions, affirmative
answers without supporting notes, or a claimed final-PDF approval with no bound PDF/DOCX block
preflight. These are evidence-freshness controls, not legal conclusions.

---

## 9. Naming

- Matter directory: kebab-case slug of the title.
- Files: lowercase; entity IDs uppercase with zero-padded numbers (`CLM01`, `SPEC0002`, `FIG01`).
- All paths inside a matter are **matter-relative** (never absolute — see DESIGN §11.4).

---

## 10. Post-filing correspondence and filing-receipt records

The optional `correspondence/` area keeps privacy-minimized procedural records after provisional or
nonprovisional filing:

```text
<matter>/correspondence/
  notice-NN.json                 # apa-correspondence-record-v1
  response-NN.json               # apa-missing-parts-response-v1
  response-NN.md                 # blocked human-action checklist
  filing-receipt-audit.json      # apa-filing-receipt-audit-v1
```

Original notices, filing receipts, confirmation receipts, applicant data, application numbers,
addresses, and extracted source text remain private source evidence. `notice-NN.json` records only
the source basename/hash/byte count and procedural facts: taxonomy, application type, mailing date,
notice-stated response period, issues, stated fees, extension language, response channel,
consequences, confidence, and human-verification flags. It must keep
`authoritative_deadline: false`, `legal_conclusion: false`, and `human_filing_required: true`.

The canonical schemas are:

- `docs/schemas/apa-correspondence-record-v1.schema.json`;
- `docs/schemas/apa-missing-parts-response-v1.schema.json`;
- `docs/schemas/apa-filing-receipt-input-v1.schema.json`;
- `docs/schemas/apa-filing-receipt-audit-v1.schema.json`.

`/apa-correspondence` recognizes supported provisional and utility nonprovisional Notices to File
Missing Parts. Corrected-application-paper and omitted-item notices are summary-only; Office Actions
route to `/apa-office-action`; unknown, ambiguous, conflicting, or low-confidence papers generate no
response package. PDF input fails with a local render/extraction/OCR handoff so image-only pages
cannot silently disappear.

Notice-date calculations use strict calendar-month arithmetic only after the notice classification,
mailing date, stated period, and captured procedural facts are human-verified. They preserve the
unadjusted date and a tentative weekend/federal-holiday adjustment. Extension rows appear only when
the notice's extension language is verified. Provisional extension estimates use 37 CFR 1.17(u);
ordinary nonprovisional estimates use 37 CFR 1.17(a); the late provisional filing-fee/cover-sheet
surcharge is separately identified under 37 CFR 1.16(g). A stale or unpinned official fee source,
unknown entity status, or mismatched fee family produces a null amount rather than a payable quote.

`/apa-missing-parts` generates only `BLOCKED-HUMAN-ACTIONS` manifests. Document options start
unselected, completion flags start false, and the manifest never supplies a signature, certification,
entity assertion, payment, filing confirmation, or Patent Center submission. A human chooses the
paper route, verifies dates/forms/fees/signer authority, opens every final PDF page, submits, and
saves the confirmation.

The filing-receipt audit compares human-transcribed receipt fields against `PATENT.md` for application
type, title, filing date, application number, inventor list, applicant, entity status, correspondence,
and related applications. It emits stable discrepancy codes plus corrected-ADS and priority-chain
review flags, not a legal conclusion or selected correction. All receipt and confirmation evidence
remains matter-local.

`docs/uspto-forms.json` pins official HTTPS source URLs, byte counts, and SHA-256 values for the core
SB/16, AIA/14, AIA/15, AIA/01, SB/08, and AIA/22P forms plus static SB/16 and SB/08 fallbacks. The
release builder refuses changed bytes, non-USPTO redirects, oversized bodies, non-PDF media, or an
invalid PDF signature. Patent Center auto-load XFA forms require Adobe Acrobat Reader; generic
renderers may show a blank page or a `Please wait` placeholder.

---

## 11. Post-filing prosecution extension (optional — beyond the core pre-filing scope)

The core protocol stops at filing (DESIGN §8). This **optional** extension models the post-filing
examination round-trip. It is deeper UPL territory: everything here is a flag/question for a registered
practitioner, deadlines are **estimates to verify**, and APA still never signs or files. Implemented by
`packages/apa-prosecute` + the `/apa-office-action` skill.

`PATENT.md` `status` gains post-filing values: `filed | under-examination | office-action | responded`.

A new optional area `prosecution/` holds the round-trip:

```
<matter>/prosecution/
  oa-NN.md           # an Office Action: header (mailing date, examiner, app no) + REJ## rejections
  response-NN.md     # the response to oa-NN: per-rejection argument + amendment (flags, not opinions)
  office_action_report.json # machine report: flags/checkpoints, not legal conclusions
```

### `prosecution/oa-NN.md` — Office Action
One `### REJ## - <gist>` section per rejection; binding:
```yaml
ground: "102"                 # 101 | 102 | 103 | 112a | 112b | 112f | double-patenting
claims: [CLM01, CLM02]        # rejected claims
references: [PA01]            # art the examiner cited (102/103)
examiner_reasoning: "<verbatim or summarized>"
```
A file-level fenced ` ```oa ` block carries the header: `mailing_date` (YYYY-MM-DD), `examiner`,
`application_no`, `action_type` (non-final | final | restriction).

### Deadlines (37 CFR 1.136(a))
Computed from `mailing_date`: a 3-month shortened statutory period, extensible month-by-month to a
6-month statutory maximum with escalating extension fees (from the dated fee schedule). The tool
surfaces both dates and the per-month extension fees as an **estimate to verify** — never a docketing
system of record.

### `prosecution/response-NN.md` — Response (scaffold)
Per `REJ##`: the affected claims, a **flags-and-questions** argument block, and a proposed amendment
written under the **new-matter guard** ("Not supported by the spec as filed" rather than inventing
support). A response is never a legal conclusion; a human practitioner authors and files it.

Office-action response is the only post-filing capability; further prosecution (appeals, RCEs,
continuations as new matters) remains out of scope.
