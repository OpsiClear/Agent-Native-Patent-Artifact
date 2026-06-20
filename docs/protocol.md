# The Patent Artifact Protocol (v0.1, MVP)

> The on-disk, machine-executable format for a patent matter. This is the **canonical contract**:
> the validator (`packages/apa-validate`), the viewer (`packages/apa-viewer`), and every skill read
> and write this format. See `../DESIGN.md` §2 and §11 for the rationale. **USPTO scope.**

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
apa_version: "0.1"
title: "<invention title; also the application title, <=500 chars>"
application_type: "utility"        # provisional | utility | design | plant | pct | cip
jurisdiction: "USPTO"
user_role: "unknown"                 # registered_practitioner | pro_se | unknown
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
rules_effective_date: "2026-06-15" # the date the encoded USPTO rules/fees were valid; surfaced in output
confidentiality: "UNFILED - CONFIDENTIAL. Do not externally disclose."
---
```

**Progressive disclosure:** L1 = `PATENT.md` only; L2 = a layer file (`claims.md`, `prior_art.md`,
`evidence/README.md`); L3 = a detail (one claim's support, one reference's chart, one figure).

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
| `illustrated_by` | LIM -> FIG#numeral | drawing support | warning |
| `practiced_by` | LIM -> SPEC (embodiment) | the embodiment implementing it | warning |
| `antecedent_of` | LIM -> LIM (earlier, same claim) | antecedent basis (`the X` -> earlier `a X`) | **error** |
| `depends_on` | CLM -> CLM | dependent-claim base | **error** |
| `distinguished_over` | CLM -> PA | the reference it must read past (102/103) | warning |
| `scope_set_at` | CLM -> PH | the decision node where breadth was chosen | warning |
| `contributed_to` | INV -> CLM | which inventor conceived which claim (35 USC 116) | error |

**Provenance** tags (every limitation, embodiment, prior-art characterization, decision):
`inventor:<id>` · `attorney` · `ai-suggested` (default) · `ai-executed` · `human-revised`.
Never auto-upgrades. A claim limitation tagged `ai-suggested` is an **assembly blocker** (human must
adopt it). See DESIGN §2.4 / §11.1.

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
    illustrated_by: [FIG01#10]
    provenance: inventor:AINVENTOR
  - id: LIM02
    text: "a fastener coupled to the frame"
    references: ["frame"]    # noun phrases referenced as 'the/said ...' -> need antecedent
    antecedent_of: [LIM01]   # resolves each 'references' to an earlier introducing limitation
    supported_by: [SPEC0003]
    provenance: inventor:AINVENTOR
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

---

## 4. `manifest.json` (viewer build target)

`packages/apa-viewer/build_manifest.mjs` walks the matter and emits:
```json
{
  "meta": { "title": "...", "application_type": "utility", "status": "drafting",
            "rules_effective_date": "...", "provenance_summary": {...} },
  "nodes": [ { "id": "CLM01", "kind": "claim", "title": "...", "fields": {...}, "provenance": "..." } ],
  "edges": [ { "from": "CLM01.LIM02", "to": "SPEC0003", "kind": "supported_by", "resolved": true } ]
}
```
Node kinds: `claim`, `claim-limitation`, `spec-paragraph`, `drawing-figure`, `reference-numeral`,
`prior-art-reference`, `defined-term`, `prosecution-node`, `inventor`.
**Deliberate divergence from ARA:** an edge whose target does not exist is **emitted with
`"resolved": false`** (and rendered as a visible warning) — it is **not** silently dropped. This must
hold in **both** `build_manifest.mjs` and `viewer.js`.

---

## 5. Validation (Level 1 — mechanical, deterministic)

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

**Warnings (exit 1):**
- An unresolved `supported_by` / `illustrated_by` / `practiced_by` / `distinguished_over` /
  `scope_set_at` edge (the "unsupported-edge" / §112-support warning).
- A claim limitation with provenance `ai-suggested` (assembly blocker — must be adopted by a human).
- An independent claim with no `contributed_to` from any inventor (inventorship not attested).
- A defined `TERM##` flagged `objective_bound: false` (112(b) term-of-degree risk).
- More or fewer than one `representative: true` figure.

The validator emits `validation_report.json` (machine) + a human summary, and stamps it with
`rules_effective_date`.

---

## 6. Application-type-aware mandatory core

| `application_type` | Required | Notably NOT required | Special rule |
|---|---|---|---|
| `provisional` | `PATENT.md`, `logic/problem.md`, `src/embodiments.md`, `evidence/` (drawings if any) | `claims.md`, oath, IDS | surfaces a **12-month clock** from `priority_date` |
| `utility` | full core (incl. `claims.md`) | — | default |
| `design` | full core | — | **exactly one** claim |
| `plant` / `pct` / `cip` | — | — | **not supported in MVP -> fail loud, route to counsel** |

If `application_type` is missing or outside `{provisional, utility, design}`, the validator fails loud
rather than guessing. Silent mis-validation (e.g. flagging a provisional's correctly-absent claims as a
missing-core error) is the more dangerous failure mode and is explicitly forbidden.

---

## 7. Naming

- Matter directory: kebab-case slug of the title.
- Files: lowercase; entity IDs uppercase with zero-padded numbers (`CLM01`, `SPEC0002`, `FIG01`).
- All paths inside a matter are **matter-relative** (never absolute — see DESIGN §11.4).

---

## 8. Post-filing prosecution extension (optional — beyond the core pre-filing scope)

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
