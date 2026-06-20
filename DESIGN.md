# Agent-Native-Patent-Artifact (APA) — Engineering Design

> Status: proposed architecture (lead-architect design doc). Grounded in a deep study of two
> reference repos vendored under `third_party/`: **ARA** (`Agent-Native-Research-Artifact` —
> the artifact-protocol + capture/compile/verify skills + npm installer + viewer) and **gstack**
> (the full-stack substrate of template-generated skills + headless-browser CLI + PDF/DOCX
> generator + image CLI + multi-host installer + 3-tier test/safety harness), plus a map of the
> real USPTO patent-prep lifecycle and its legal guardrails.
>
> **§§1-10 are the original lead-architect design. §11 (Hardening & g2tree integration) records the
> corrections from a 3-critic adversarial review and the features lifted from a real worked patent
> package; where §11 conflicts with §§1-10, §11 controls.**

---

## 1. Vision & thesis

APA recasts a patent matter from a pile of lossy linear documents (a disclosure narrative, a
filed spec, a file wrapper) into a **machine-executable patent knowledge package** — exactly as
ARA does for research papers — and then wraps that protocol in **gstack's proven full-stack
substrate**: compiled binaries for the genuinely hard engineering (a warm headless-browser
daemon driving prior-art databases, a Chromium-backed USPTO-formatted PDF/DOCX renderer, a
figure generator), a template-driven multi-host skill suite, an npx installer, and a two-tier
test/safety harness. The fusion is direct: ARA's four-layer artifact (`logic`/`src`/`trace`/
`evidence`) re-roles cleanly onto the patent lifecycle (claims+patentability / embodiments+
figures / prosecution+prior-art decisions / reference exhibits), its cross-layer stable-ID
binding becomes an automated §112-support / antecedent-basis / figure-numeral checker, and its
provenance tagging becomes an inventorship-integrity and duty-of-candor gate. **Human-in-the-loop
is the non-negotiable posture, asserted up front:** APA is *supervised drafting/assistive
software*, never an autonomous practitioner. It will structurally refuse the two acts the law
reserves for humans — **signing/certifying any USPTO paper** and **filing autonomously** — will
treat every AI output as an unverified draft that a competent human must independently review
(merely relying on AI does not satisfy the human reasonable-inquiry duty), will force at least one
named natural-person inventor under ordinary inventorship law (Thaler v. Vidal; USPTO revised
AI-inventorship guidance, Nov. 26, 2025),
and will keep unfiled inventions confidential behind a scan-at-sink redaction guard. APA assists;
the registered practitioner (or pro-se inventor) decides, signs, and files.

---

## 2. The Patent Artifact protocol

### 2.1 Design principle (carried verbatim from ARA)

Split the matter by **epistemic role, not document section**. Each layer answers a distinct agent
question, which is what enables token-cheap selective loading:

- `logic/` — **what is claimed and why it's patentable** (claims, patentability theory, prior-art landscape)
- `src/` — **how it works** (embodiments, working code/configs, figure source)
- `trace/` — **the journey** (prosecution + prior-art + claim-scope decision DAG, with abandoned approaches as first-class leaves)
- `evidence/` — **raw proof** (each cited prior-art reference + each drawing, indexed and bound back to claims)

A small **mandatory core** always exists; everything else is created **only when the matter
warrants it** (ARA's "fit the artifact to the source, not to a template" rule, schema lines 4-7).
There is no domain template to pad out.

### 2.2 The manifest: `PATENT.md`

The ARA `PAPER.md` manifest (~200-token relevance gate + per-layer Layer Index tables) becomes
`PATENT.md`. The frontmatter is re-roled from a bibliographic-paper header to a patent-matter
header; the Layer Index tables are preserved verbatim, including the resnet example's pattern of a
third **Claims** column on the physical layer binding each `src/` file to the claim IDs it supports
(`residual_block.py -> C01,C02,C04,C05`).

```yaml
---
apa_version: "1.0"
title: "{invention title — also the application title, <=500 chars}"
inventors: ["{natural-person name}", ...]   # >=1 required; AI MUST NOT appear here
assignee: "{applicant/owner, or 'unassigned'}"
matter_docket: "{attorney/firm docket no.}"
jurisdiction: "USPTO"                        # USPTO | EPO | PCT (drives rule packs)
entity_status: "{large|small|micro|unknown}"
application_no: "{serial no., or 'unfiled'}"
priority_date: "{date or 'none'}"
filing_date: "{date or 'unfiled'}"
cpc_class: "{primary CPC, if known}"
status: "{disclosure|searched|analyzed|drafting|assembled|filed}"
provenance_summary: { user: N, ai-suggested: N, ai-executed: N, human-revised: N }
claims_summary:
  - "{one-line gist of each INDEPENDENT claim}"
abstract: "{<=150-word abstract draft}"
confidentiality: "UNFILED — CONFIDENTIAL. Do not externally disclose."
---
```

The three-level progressive-disclosure contract is preserved exactly: **L1** read `PATENT.md`
only (which matter is this, what's claimed, has it filed); **L2** layer files (`claims.md`,
`prior_art.md`, `evidence/README.md`); **L3** detail files (one claim's spec support, one
reference's claim chart, one figure).

### 2.3 Directory tree (one-line comment per entry)

`*` marks the **mandatory core** (always present once the matter reaches that lifecycle stage).
Everything else is created only as the matter warrants it.

```
<matter>/
  PATENT.md                          # * Root manifest: matter header + per-layer Layer Index (L1 relevance gate)

  logic/                             # COGNITIVE layer — what is claimed & why it is patentable
    problem.md                       # * Field of invention, problem solved, the gap prior art leaves (ARA problem.md: O##/G##/Insight)
    claims.md                        # * Independent + dependent claims; one CLM## block each (ARA claims.md analogue)
    concepts.md                      # * Lexicography / defined claim terms (one ## per term) — antecedent-basis source of truth
    patentability.md                 # * 101/102/103/112 analyses as declarative test plans (ARA experiments.md re-role); flags, NOT legal opinions
    prior_art.md                     # * Typed prior-art landscape: one PA## block per reference (ARA related_work.md RDO graph)
    solution/
      inventive_concept.md           #   The core inventive contribution (ARA solution/algorithm.md|architecture.md)
      claim_scope.md                 #   Claim-breadth boundary conditions + over-claiming guard (ARA constraints.md)
      drafting_notes.md              #   Drafting/strategy heuristics, e.g. 112(f) means-plus-function calls (ARA heuristics.md)

  src/                               # PHYSICAL layer — how it works (embodiments)
    embodiments.md                   # * Embodiments + alternatives/variations, each bound to claim IDs (ARA artifacts.md re-role)
    environment.md                   #   Reduction-to-practice context: stack, hardware, build (ARA environment.md)
    configs/                         #   Parameter tables with per-value rationale, when an embodiment has them (ARA configs/)
    execution/<module>.py            #   Grounded working code for a software embodiment (ARA execution/, transcribed|reconstructed tags)
    drawing_src/<figN>.mmd|.excalidraw  # Diagram source for each figure (mermaid/excalidraw) feeding the figure renderer

  trace/                             # EXPLORATION graph — the prosecution + decision journey
    prosecution.yaml                 # * Decision DAG (ARA exploration_tree.yaml re-role): typed nodes, dead_end as leaf

  evidence/                          # RAW PROOF — prior-art references + drawings
    README.md                        # * Index: every reference/drawing -> source -> claims it bears on (machine-readable claim chart / IDS seed)
    prior_art/refN.md                # * Full bibliographic record + the relied-on passage of one cited reference (raw)
    prior_art/refN.png               #   Screenshot of the relied-on figure/passage of that reference
    prior_art/derived_from_refN_chart.md  # Claim-chart slice mapping refN to specific claim limitations (declares parent; never masquerades as full ref)
    drawings/figureN.md              # * Transcription: components + reference numerals + lead-line targets of one figure (raw)
    drawings/figureN.png             #   The rendered/as-filed drawing image

  staging/                           # Capture buffer (append-only) — unconfirmed interpretive observations
    observations.yaml                #   Staged novel-features / prior-art hits awaiting an inventor closure signal
    sessions/<date>.md               #   Per-day session record incl. logic_revisions: before/after (the only history of logic/)
```

**Mandatory-core rationale.** `PATENT.md`, `logic/{problem,claims,concepts,patentability,prior_art}.md`,
`trace/prosecution.yaml`, and `evidence/{README.md, >=1 prior_art ref, >=1 drawing}` are the
backbone every matter shares. `solution/*`, `src/configs`, `src/execution`, and biotech-only files
(a future `src/sequence_listing.md`) appear only when the disclosure supports them — never invented.

### 2.4 Provenance tags

**APA forks ARA's *four* tags (`user` / `ai-suggested` / `ai-executed` / `user-revised`) into *five*
by splitting `user` into `inventor` / `attorney`** (a deliberate legal re-role, not "carried
unchanged" — corrected per review). Applied to every claim limitation, embodiment, prior-art
characterization, and prosecution node. The `inventor` tag **carries the specific natural-person ID**
(e.g. `inventor:JSMITH`), because inventorship is per-claim (§11.1):

| Tag | Meaning | Legal significance |
|---|---|---|
| `inventor` | A named natural-person inventor stated it directly | Conception evidence; the only tag safe to assert as inventor-conceived |
| `attorney` | The registered practitioner authored/revised it | Attorney work product |
| `ai-suggested` | The agent inferred/drafted it (conservative **default**) | **Legally unsafe until reviewed** — cannot stand as inventor-conceived |
| `ai-executed` | The agent performed an action (e.g. ran a search) | Tool action, not conception |
| `human-revised` | A human edited an AI suggestion | Promoted from `ai-suggested` by a human act |

ARA's hard rules carry over: provenance **never auto-upgrades**; `ai-suggested` is the default when
uncertain. Upgrade targets are explicit (re-roled from ARA's `ai-suggested -> user-revised | user`):
a **verbatim** affirmation by the *inventor* upgrades `ai-suggested -> inventor` (conception
evidence); a **paraphrased** human edit upgrades to `human-revised`; an attorney authoring/revision
upgrades to `attorney`. ARA's other three closure signals license crystallization but **never**
change provenance. The provenance distribution (surfaced in `PATENT.md` frontmatter) is a trust
signal and a **human-attestation gate, not an AI-absence gate**: assembly-package generation is
blocked while any *claim limitation* still carries `ai-suggested`, forcing a human to adopt/attest each
limitation (promoting it to `inventor`/`attorney`/`human-revised`). AI systems are tools, not inventors,
and ordinary inventorship/conception law applies under the USPTO revised guidance published Nov. 26,
2025. See the attribution flow in §11.1.

### 2.5 Cross-layer binding (the load-bearing spine)

The single most reusable ARA mechanism. Every entity gets a global, persistent, typed ID assigned
at crystallization, and every link must resolve bidirectionally (ARA's Seal Level 1 + the viewer's
"drop edges to non-existent nodes" rule become live legal checks):

| Prefix | Entity | Lives in |
|---|---|---|
| `CLM##` | A claim | `logic/claims.md` |
| `LIM##` | A claim limitation/element | within a `CLM##` block |
| `SPEC##` | A specification paragraph providing support | `src/embodiments.md` / `solution/*` |
| `FIG##` + numeral | A drawing figure and its reference numerals | `evidence/drawings/` |
| `PA##` | A prior-art reference | `logic/prior_art.md` + `evidence/prior_art/` |
| `PH##` | A prosecution-history / decision event | `trace/prosecution.yaml` |
| `TERM##` | A defined claim term (lexicography) | `logic/concepts.md` |

**The binding chain (claim -> spec support -> prior-art distinction -> figure):**

```
CLM07.LIM03  --supported_by-->  SPEC0042        (112 written-description/enablement support)
CLM07.LIM03  --illustrated_by--> FIG02#numeral-214   (drawing support; numeral defined in spec)
CLM07.LIM03  --practiced_by-->  src/embodiments.md#emb-3   (the embodiment that implements it)
CLM07        --distinguished_over--> PA03         (the reference it must read past; 102/103)
CLM07        --scope_set_at-->  PH09             (the decision node where its breadth was chosen)
LIM03 ("the said widget") --antecedent-of--> LIM01 ("a widget")   (antecedent basis within the claim)
```

A validator then checks what is **genuinely mechanical** and only **flags** what needs legal judgment
(corrected per review — overstating this is a UPL/capability hazard). **Deterministic PASS/FAIL:**
every dependent claim references a valid base claim, every claimed term of art is defined in
`concepts.md`, every claim element has antecedent basis (`a/an` then `the/said`), every figure numeral
is defined in the spec and vice versa, and every declared `supported_by` / `distinguished_over` edge
*resolves to an existing target*. **What it does NOT decide:** whether the cited paragraph actually
*enables/describes* the limitation (§112 sufficiency) or whether a reference is *substantively*
distinguished — those stay in the LLM-judge rigor dimensions (§7) as flags for attorney review, never
a clearance. A dropped/unresolved `supported_by` edge surfaces as a visible **"unsupported-edge
warning"** (read: "a §112 support edge is missing", not "§112 violation/clearance") rather than being
silently discarded — the deliberate APA divergence from ARA's silent edge-drop, which **must be
implemented in BOTH `build_manifest.py` and `viewer.js`** (the orphan-edge drop lives in the manifest
builder too, so a viewer-only fix would still let unsupported claims vanish before the warning renders).

### 2.6 `trace/prosecution.yaml` — the decision DAG

ARA's `exploration_tree.yaml` schema is reused directly (`children:` + `also_depends_on:` cross-edges,
`support_level: explicit|inferred` with `source_refs`, `dead_end` as a childless leaf — "the most
valuable node type"). Node types re-role onto patents:

- `question` — the patentability question driving a branch ("can we claim X over the closest art?")
- `decision` — a claim-scope strategy / amendment, with `choice` + `alternatives` + `evidence`; **creates a documented, searchable scope/estoppel record**
- `dead_end` — an abandoned claim limitation or refused argument; `hypothesis` + `failure_mode` (= the rejection ground 102/103/112) + `lesson` (= the foreclosed scope). **Prevents an agent re-arguing a losing position.**
- `pivot` — a strategy change (continuation/divisional split, apparatus->method, provisional->utility) with `trigger`
- `experiment` — an in-scope pre-filing run that produced a result: a prior-art search execution with
  its hits, or a reduction-to-practice / embodiment test (the office-action-response meaning is an
  explicitly-deferred post-filing extension per §8, *not* the in-scope re-role — corrected per review)

`trace/` and `staging/` are **append-only / immutable**; `logic/` is the **mutable clean current
draft** with no internal history. The before/after of any `logic/` edit lives only in
`staging/sessions/<date>.md` under a `logic_revisions:` block — giving prosecution exactly what it
needs: a clean current draft plus an immutable conception/revision record for inventorship and
§102/103 date defense.

---

## 3. The skill suite

Skills are generated `SKILL.md` files (see §6), one specialist per lifecycle phase, each with a
**report-only variant** where a human approval gate matters, mirroring gstack's `/qa` vs `/qa-only`
split. The pipeline chains via `{{INVOKE_SKILL:...}}` into an `/apa-autoprep` command (disclosure ->
search -> patentability), mirroring gstack's `/autoplan`. Every skill is `allowed-tools`-scoped; the
internal-rigor reviewer and capture skill are file-I/O-only (no fetch, no exec).

| Skill | Invoke | Purpose | Inputs | Outputs | Analogous to |
|---|---|---|---|---|---|
| **disclosure-capture** | `/apa-disclose` | End-of-interview epilogue that captures invention events into the artifact via progressive crystallization | Inventor narrative, docs, code/CAD, conception/RTP & bar dates | `trace/` events (direct), `staging/observations.yaml` (staged), crystallized `logic/` entries | ARA `research-manager` |
| **prior-art-search** | `/apa-priorart` | Drives patent + NPL databases, dedupes, ranks, builds the landscape | Key features / claim concepts, CPC hints, assignee names | `prior_art.md` (PA## blocks), `evidence/prior_art/refN.{md,png}`, search-strategy log | gstack `/scrape` + `browse` daemon |
| **patentability-analysis** | `/apa-analyze` | Element-by-element 101/102/103/112 flagging + claim charts (drafts, not legal opinions) | `claims.md`, closest `PA##` refs, `embodiments.md` | `patentability.md`, `derived_from_refN_chart.md`, questions-for-attorney | ARA `experiments.md` generation |
| **claim-drafting** | `/apa-claims` | Drafts independent + dependent claims, builds the claim tree, enforces antecedent basis & spec support | Patentability analysis, embodiments, scope strategy | `claims.md` (CLM##/LIM## blocks), claim dependency tree, `concepts.md` term seeds | ARA `claims.md` (Statement/Interpretation split) |
| **specification-drafting** | `/apa-spec` | Drafts the full 37 CFR 1.77 spec, keeping numerals/terms consistent with claims & drawings | `claims.md` + glossary, `embodiments.md`, drawing list | `embodiments.md`/`solution/*` -> specification sections, abstract, brief-description-of-drawings | gstack `make-pdf` source + ARA `solution/` |
| **figure-generation** | `/apa-figures` | Renders numbered patent drawings/flowcharts from diagram source; reconciles numerals | `drawing_src/*.mmd`, numeral table, method claims | `evidence/drawings/figureN.{md,png}`, numeral-to-element legend | gstack `make-pdf` diagram-prepass + `design` |
| **filing-assembly** | `/apa-assemble` | Assembles the USPTO-formatted package & runs mechanical filing-readiness | Final spec/claims/abstract, drawings, matter config | Spec/claims/abstract DOCX+PDF, ADS draft, IDS (SB/08) seed, fee worksheet, pre-filing checklist | gstack `make-pdf` orchestrator |
| **rigor-review** | `/apa-rigor` (+ `/apa-rigor-only`) | Internal §112/antecedent/support rigor audit -> `File-Ready..Do-Not-File` verdict | The assembled artifact (read-only) | `patent_rigor_report.json` (verdict + severity-ranked findings + amendments) | ARA `rigor-reviewer` |
| **prior-art-novelty-review** | `/apa-novelty` | SEPARATE fetch-enabled 102/103 reviewer (the deliberate ARA divergence) | `claims.md`, `prior_art.md`, fresh fetched art | Novelty/obviousness findings, supplemental PA## refs | ARA `rigor-reviewer` (fetch-enabled fork) |
| **compiler** | `/apa-compile <path>` | Lifts an existing patent/publication/disclosure into a validated APA artifact | PDF patent/pub, repo, disclosure doc, or combination | A complete validated `<matter>/` artifact | ARA `compiler` |
| **setup-matter** | `/apa-setup-matter` | Persists per-matter config (inventors, jurisdiction, entity status, docket) | AskUserQuestion answers | `## Patent Matter Config` block persisted to matter `CLAUDE.md` | gstack `/setup-deploy` (`generateDeployBootstrap`) |

How each works (2-4 sentences):

- **disclosure-capture.** A pure end-of-turn epilogue (file-I/O only). It classifies each harvested
  event on ARA's two axes — *Kind* (journey vs interpretive) and *Routing* (direct vs staged) — then
  writes journey facts (interview-decisions with `alternatives[]`, abandoned embodiments, scope pivots)
  immediately and immutably to `trace/`, while staging interpretive facts (novel-feature claims,
  prior-art hits) in `staging/observations.yaml`. A staged feature crystallizes into a formal `logic/`
  entry only on one of ARA's four closure signals (verbal affirmation / empirical resolution /
  artifact commitment / topic abandonment), defaulting to non-promotion — so a half-formed invention
  is never frozen into a claim. Every entry is provenance-tagged, defaulting to `ai-suggested`.

- **prior-art-search.** Uses the `apa-browse` daemon (§4) to drive PatentsView/ODP/EPO-OPS/PATENTSCOPE
  APIs plus the Patent Public Search and Google Patents UIs via ref-based `snapshot -> act`. Every
  fetched page is wrapped in gstack's untrusted-content envelope before reaching the LLM. It logs the
  query strategy (CPC classes, keywords, citation chains), files each closest reference as a raw
  `evidence/prior_art/refN.md` + screenshot, and emits a ranked landscape — but flags closest-art
  *selection* for human validation (examiner-grade PPS is UI-only; key NPL is paywalled).

- **patentability-analysis.** Builds element-by-element claim charts mapping each `PA##` reference to
  each `CLM##.LIM##`, surfaces 102 anticipation (all elements in one reference), 103 combinations with
  a motivation-to-combine note, 101 abstract-idea risk (Alice/Mayo two-step screen), and 112
  enablement gaps. Output is written as *flags and questions for the attorney*, never as a legal
  opinion or FTO conclusion — those are human-only work product (§7). It surfaces contradictions
  (a prior-art hit that undermines a staged novelty claim) rather than auto-resolving them.

- **claim-drafting.** Generates broad independent claims plus dependent fallbacks across statutory
  categories, enforcing single-sentence form, antecedent basis (`a/an` first, `the/said` after), valid
  dependency, and the ARA **Statement-vs-Interpretation split** — the claim stays at the strongest
  level the disclosure directly supports, broader reading quarantined — which *is* a built-in
  over-claiming / §112 guard. It builds the `CLM##`->`SPEC##` support map and seeds `concepts.md` for
  every introduced term of art. Claim scope/breadth remains an attorney decision; the agent recommends.

- **specification-drafting.** Generates the 1.77 sections (Title; Cross-Reference; Field; Background;
  Summary; Brief Description of Drawings; Detailed Description; Abstract <=150 words) from the
  embodiments and claims, maintaining numeral and lexicographic consistency. It follows ARA's grounding
  discipline: every limitation/advantage cites a grounded disclosure source (`transcribed` =
  inventor-disclosure-sourced, `reconstructed` = attorney-drafted-from-figures), and any gap is written
  as **"Not specified in disclosure"** for the attorney rather than silently filled (new-matter guard).

- **figure-generation.** Reuses `make-pdf`'s diagram-prepass to render `drawing_src/*.mmd|.excalidraw`
  into numbered figures with deterministic `FIG. N` ordinals that drive spec cross-references, and the
  `design` image CLI + GPT-4o vision gate for conceptual embodiment illustrations. It reconciles every
  reference numeral against `concepts.md`/spec and emits the numeral-to-element legend. It never invents
  a numeral or part not present in the source.

- **filing-assembly.** Renders each part to USPTO-formatted DOCX+PDF via `apa-make-doc` (§4), auto-
  populates the ADS from `PATENT.md` frontmatter, generates the SB/08 IDS from the `prior_art.md`
  index, computes fees from entity status, and runs the mechanical Level-1 filing-readiness checklist.
  It **stops at the submit boundary** — it produces an assembly package draft and a checklist, but cannot
  sign or file (§7). It surfaces inconsistencies (a numeral used for two parts, an undefined claim
  term) for human resolution rather than auto-harmonizing.

- **rigor-review.** ARA Seal Level 2 re-roled. Read-only, artifact-only (no fetch), it scores six
  patent dimensions (§7) 1-5 against anchors, emits severity-ranked findings with a verbatim
  `evidence_span` and a mandatory concrete amendment suggestion per finding, and computes a
  mean-plus-per-dimension-floor verdict where any dimension scoring 1 caps the result at **Do-Not-File**.

- **prior-art-novelty-review.** The one consciously fetch-enabled reviewer, because 102/103 inherently
  need external art. It re-runs targeted searches against the current claim set, looks for anticipation
  and obvious combinations the internal pass could not see, and adds supplemental `PA##` references.
  Kept separate from rigor-review so the internal §112/antecedent/support audit stays self-contained.

- **compiler.** Clones ARA's single-file 4-stage epistemic chain (Semantic Deconstruction -> Cognitive
  Mapping -> Artifact Layer -> Exploration Graph) re-roled to a patent **lift**: extract every claim
  *verbatim* (paraphrase changes legal scope), every defined term, every reference numeral, every
  embodiment, and every prior-art citation + its role; map them into `claims.md`/`concepts.md`/
  `embodiments.md`/`prior_art.md`; build the conception/claim-derivation DAG; then run the bounded
  coverage + validation + fix loop (max 3 rounds each). Carries ARA's zero-hallucination Critical Rules
  hardened for legal use — gaps become "Not present in source," never invented limitations (new matter).

- **setup-matter.** The platform-agnostic config resolver: read the persisted `## Patent Matter Config`
  block first, AskUserQuestion if absent, then persist — so the agent never re-asks inventor names.

---

## 4. Full-stack tooling (binaries/services)

Following gstack's lesson — *put the engineering budget in the binaries, not in hand-tuning skill
prose* — APA ships a small number of compiled single-file binaries (`bun build --compile`, a `bin/`
map, `build.sh` writing git-HEAD `.version` files). All are agent-native: stdout = artifact path or
result JSON only, stderr = progress, semantic per-failure exit codes, generated docs synced to a
single command registry.

### 4.1 `apa-browse` — prior-art search browser  *(adapt from gstack `browse`)*

**Copy from gstack, adapt the command surface.** Reuse the persistent-Chromium-daemon + thin-CLI
architecture wholesale: project-local `.apa/browse.json` state file (random port + bearer token +
PID + binaryVersion), auto-start (~3s) / 30-min idle auto-stop / version-auto-restart / crash-retry,
per-matter workspace isolation, the ref-based `snapshot -i` -> `@e` -> `click/fill` primitive, and —
critically — `wrapUntrustedContent()` around every fetched-reference channel.

**Specific databases and how queries run:**

| Source | Access | How the daemon queries it |
|---|---|---|
| PatentsView **PatentSearch API** (`search.patentsview.org`) | Official REST API — the legacy `api.patentsview.org` returns **410 Gone** (since May 2025); target the new endpoint and pin its base URL in a CI test | Direct HTTP: structured metadata, citations, CPC for landscape/citation chaining |
| USPTO Open Data Portal (ODP) | Free REST API (key) | Direct HTTP: file-wrapper/bibliographic data, status polling, ADS population |
| EPO Espacenet / OPS | Free REST API (OAuth) | Direct HTTP: worldwide families, INPADOC legal status, classifications |
| WIPO PATENTSCOPE | Web UI + web services | API where available, else `snapshot -> act` for PCT-stage art |
| Google Patents | **BigQuery `patents-public-data` (sanctioned, free) — default**; the Web UI is **ToS-restricted** | BigQuery SQL only; UI `snapshot -> act` is **disabled by default** (automated access to the Google Patents UI violates Google's ToS) |
| Semantic (PQAI / The Lens) | REST (PQAI free; Lens subscription) | Direct HTTP: embedding/semantic retrieval, design-around discovery |
| **USPTO Patent Public Search (PPS)** | **Web UI only — no API** | Ref-based `snapshot -> act` drives the query builder and result pagination; results exported, never auto-trusted |
| NPL (IEEE/ACM/Scholar/arXiv) | Mostly paywalled | Open sources fetched + cited; licensed access stays human/institution-gated |

API-backed sources are preferred for automation; PPS (examiner-grade but UI-only) and paywalled NPL
get the snapshot loop or human handoff. **Each source carries an explicit *access mode* — sanctioned
(API/dataset) vs ToS-restricted (UI scraping) — and ToS-restricted UI access is off by default.**
Every fetched-reference channel is wrapped not only in `wrapUntrustedContent()` but in gstack's
compile-safe **content-security envelope + canary** layers (the pure-string `security.ts` pieces;
`security-classifier.ts` cannot be imported into a Bun-compiled binary, per gstack CLAUDE.md).
Closest-art selection is always human-validated.

### 4.2 `apa-make-doc` — USPTO PDF/DOCX/HTML generator  *(adapt from gstack `make-pdf`)*

**Copy the pipeline from gstack `make-pdf`, fork the stylesheet.** Reuse `orchestrator.ts`
(markdown -> sanitized HTML -> render in a dedicated `apa-browse` tab in try/finally -> Chromium
`page.pdf`), the multi-format branch (PDF for Patent Center, DOCX for attorney editing, HTML for
client review — emitted from one canonical source), the `browseClient.ts` cross-binary shell-out
(binary auto-resolution + `--from-file` large-payload transport, mandatory because full specs run
tens of KB and exceed argv limits), and the diagram-prepass for numbered drawings.

**Build-new: fork `print-css.ts` into a USPTO stylesheet** enforcing 37 CFR 1.52 (margins ~1in
top/left, ~0.75in right/bottom; **1.5 OR double** line spacing — single is not allowed; 12pt
non-script font; bracketed four-digit paragraph numbers `[0001]` — recommended practice under
1.52(b)(6), and expected in DOCX), with the `@page` running header carrying docket/application no.
and `@bottom-center` page numbering, plus `--tagged` + `--outline` for accessible, bookmarked filings.

**PDF is the filing-faithful format; DOCX out of this fork is NOT schema-valid (corrected per
review).** The reused path gives a reliable Chromium `page.pdf` (the as-filed-faithful format Patent
Center accepts) plus **content-fidelity-only** DOCX (gstack routes DOCX through `html-to-docx`, which
explicitly warns "layout is Word's"). A schema-valid USPTO DOCX — and the fact that under the DOCX
regime **the applicant owns the USPTO-rendered version** — is genuine **build-new** work (a DOCX
post-processor), not a `make-pdf` copy; until it exists, always emit the auxiliary "true copy" PDF the
USPTO permits alongside DOCX and require human review of the USPTO-rendered DOCX before submission.
The format-fidelity gate mirrors gstack's real gate exactly: assert **copy-paste-extractable claim text
in filing order on the PDF** (via `pdftotext`); it does **not** assert DOCX layout/schema (gstack's own
gate doesn't either). Do not hardcode the non-DOCX surcharge amount — drive it from the dated fee
schedule (§11.1).

### 4.3 `apa-figure` — figure/diagram generator  *(mostly copy from gstack)*

**Copy from gstack `make-pdf` diagram-prepass + `design`.** The diagram-prepass already renders
mermaid/excalidraw fences into numbered vector/raster figures with deterministic ordinals and 300dpi
rasterization — a direct fit for 37 CFR 1.84 patent drawings and method-claim flowcharts. For
conceptual embodiment illustrations, copy `design`'s OpenAI `image_generation` integration + the
GPT-4o vision quality gate (re-roled to check legibility of reference numerals and presence of
required elements) + the HTML compare-board daemon for human figure approval. **Build-new: a 1.84
formal-compliance pre-check** (sheet size/margins, black solid lines, reference-character height
>=0.32cm, lead lines, figure numbering, front-page representative view) — but final 1.84 compliance
stays human-verified (often a professional draftsperson).

### 4.4 `apa-viewer` — artifact viewer  *(adapt from ARA `ara-viewer`)*

**Copy from ARA `ara-viewer`, extend node/edge kinds.** Reuse `build_manifest.py` (stdlib-only:
parse-by-ID-prefix + cross-reference extraction -> typed `{meta, nodes, edges}` `manifest.json`) and
the dependency-light claims-first `viewer.js` (always-visible headlines, lazy field expansion, typed-
edge chip groups that recursively expand linked nodes, search, TOC scroll-spy, `showFatal`). New node
kinds: `claim`, `claim-limitation`, `spec-paragraph`, `drawing-figure`, `reference-numeral`,
`prior-art-reference`, `rigor-finding`. New edge kinds: `supported_by`, `illustrated_by`,
`antecedent_of`, `distinguished_over`, `flagged_by`. **The deliberate divergence:** a dropped
unsupported `supported_by` edge renders as a **visible §112 warning**, not a silent drop. Clicking a
claim walks to its spec support, drawings, prior-art hits, and rigor findings inline — static, near-
zero-dep, embeddable in a filing-review deliverable.

---

## 5. Repo layout

The repo currently contains only `third_party/`. Top-level layout mirrors how ARA and gstack are
organized (skills directories at root, `packages/`, `examples/`, `docs/`, tests, installer):

```
Agent-Native-Patent-Artifact/
  README.md                          # Protocol overview + four-layer diagram + the skill table (ARA README shape)
  DESIGN.md                          # This document
  ETHOS.md                           # Builder philosophy injected into every skill preamble (gstack ETHOS.md shape), patent-valued
  LICENSE                            # MIT (matches ARA)
  CLAUDE.md                          # Dev operating manual: SKILL.md gen workflow, redaction guard, matter-config rule (gstack CLAUDE.md shape)
  package.json                       # bin map + build/test/eval script taxonomy (gstack package.json shape)
  setup                              # npx/installer entry: build binaries, detect hosts, link skills (gstack setup + ARA installer)
  build.sh                           # gen:skill-docs --host all, then bun build --compile each binary, write .version files

  skills/                            # Source-of-truth skill directories (one SKILL.md.tmpl each)
    disclosure-capture/SKILL.md.tmpl #   /apa-disclose
    prior-art-search/SKILL.md.tmpl   #   /apa-priorart
    patentability-analysis/SKILL.md.tmpl  # /apa-analyze
    claim-drafting/SKILL.md.tmpl     #   /apa-claims
    specification-drafting/SKILL.md.tmpl  # /apa-spec
    figure-generation/SKILL.md.tmpl  #   /apa-figures
    filing-assembly/SKILL.md.tmpl    #   /apa-assemble
    rigor-review/SKILL.md.tmpl       #   /apa-rigor (+ rigor-review-only/ report variant)
    prior-art-novelty-review/SKILL.md.tmpl  # /apa-novelty (fetch-enabled)
    compiler/SKILL.md.tmpl           #   /apa-compile  (+ references/: apa-schema, prosecution-tree-spec, drawing-extraction-guide, validation-checklist)
    setup-matter/SKILL.md.tmpl       #   /apa-setup-matter
    autoprep/SKILL.md.tmpl           #   /apa-autoprep — chains disclose->search->analyze via INVOKE_SKILL

  packages/                          # Compiled binaries + the npx installer (gstack packages/ + ARA packages/)
    apa-browse/                      #   Prior-art search daemon (gstack browse fork) — src/, test/, dist/
    apa-make-doc/                    #   USPTO PDF/DOCX/HTML generator (gstack make-pdf fork) — incl. src/print-css-uspto.ts
    apa-figure/                      #   Figure/diagram generator (gstack diagram-prepass + design fork)
    apa-viewer/                      #   build_manifest.py + viewer.js (ARA ara-viewer fork)
    apa-skills/                      #   npx installer: agents.js host registry, installer.js, skills.js, index.js, bundle scripts (ARA ara-skills fork)
    apa-redact/                      #   Redaction/confidentiality engine + CLI (gstack lib/redact-* + bin/gstack-redact fork)

  scripts/                           # Build + DX tooling (gstack scripts/ shape)
    gen-skill-docs.ts                #   .tmpl -> SKILL.md compiler (multi-pass, hard-error on unresolved {{...}})
    host-config.ts                   #   HostConfig interface + validateAllConfigs
    discover-skills.ts               #   Dynamic, deterministically-sorted skill discovery
    skill-check.ts                   #   `apa skill:check` health dashboard
    resolvers/                       #   Shared-rule resolver modules (see §6)
      index.ts                       #     RESOLVERS registry (token name -> generator)
      preamble.ts                    #     {{PATENT_PREAMBLE}} tier-gated composite (UPL/candor/confidentiality)
      legal-rules.ts                 #     {{USPTO_MPEP_RULES}}, {{CLAIM_FORMAT_GUIDE}}, {{IDS_REQUIREMENTS}}, {{ANALYSIS_101_102_103_112}}
      redact-doc.ts                  #     {{REDACT_INVOCATION_BLOCK:<sink>}} scan-at-sink procedure
    matter-config.ts                 #   read-CLAUDE.md -> AskUserQuestion -> persist resolver (gstack generateDeployBootstrap fork)

  hosts/                             # Typed per-agent HostConfig objects (gstack hosts/)
    claude.ts                        #   Primary host (no rewrites)
    codex.ts, cursor.ts              #   Secondary hosts (pathRewrites/toolRewrites/suppressedResolvers)
    index.ts                         #   ALL_HOST_CONFIGS registry; derives Host union; validateAllConfigs

  examples/                          # Worked artifacts (ARA examples/ shape)
    minimal-patent-artifact/         #   Smallest PATENT.md + logic/ + trace/ — the ~200-token relevance-gate demo
    sample-lifted-patent/            #   A granted patent compiled by /apa-compile into a full artifact

  test/                              # 3-tier harness (gstack test/)
    helpers/                         #   skill-parser.ts, llm-judge.ts (judgeClaim/judgeSpec), session-runner.ts, eval-store.ts, touchfiles.ts
    fixtures/                        #   Planted-defect fixtures, ground-truth prior-art sets, confidentiality canaries
    skill-validation.test.ts         #   Tier 1: static structural validation (free, <1s)
    apa-rigor-eval.test.ts           #   Tier 3: LLM-as-judge on drafting quality (periodic, paid)
    apa-pipeline-e2e.test.ts         #   Tier 2: full pipeline on a fixture disclosure (periodic, paid)
    redaction-guard.test.ts          #   Tier 1/Gate: scan-at-sink + planted-secret blocking (gate, blocks every PR)
    make-doc-fidelity.test.ts        #   Gate: USPTO PDF/DOCX format fidelity (gstack make-pdf-gate fork)

  docs/                              # Protocol spec, MPEP rule references, howtos (ARA/gstack docs/)
    protocol.md                      #   The full PATENT.md + four-layer field-level spec (ARA ara-schema.md analogue)
    legal-guardrails.md              #   The disclaimers, must-not-claim list, human-in-loop gates (verbatim from §7)

  .github/workflows/                 # CI (gstack .github/)
    evals.yml                        #   Gate CI: static + safety, blocks PRs, Docker matrix, PR comment
    evals-periodic.yml               #   Periodic CI: weekly LLM-judge drafting-quality evals
    skill-docs.yml                   #   Freshness gate: regen all SKILL.md, fail on non-empty git diff

  third_party/                       # (existing) vendored reference repos
    Agent-Native-Research-Artifact/
    gstack/
```

---

## 6. Skill-generation + packaging pipeline

**Adopt gstack's `.tmpl -> SKILL.md` generation wholesale, and ARA's npm installer + multi-host
detection wholesale.** This is compliance-critical, not polish: the generated `SKILL.md` *is* the
legal-procedure spec, so drift between intended rules and shipped prompt is a correctness/liability
risk.

**Generation (gstack pattern).** Each skill is a directory with one `SKILL.md.tmpl` (frontmatter:
`name`, `preamble-tier 1-4`, `version`, `description` doubling as the trigger contract,
`allowed-tools`, `triggers`; body markdown with `{{TOKEN}}` placeholders). `scripts/gen-skill-docs.ts`
does discover -> buildContext -> `resolvePlaceholders()` (multi-pass up to 6, **hard-error on any
leftover `{{...}}`**) -> per-host frontmatter transform / pathRewrites / toolRewrites /
suppressedResolvers -> prepend an `AUTO-GENERATED` header -> write. **Shared legal rules live once**
as resolvers and inject into every dependent skill so a rule change propagates on regen:
`{{PATENT_PREAMBLE}}` (UPL/duty-of-candor/confidentiality, tier-gated), `{{CLAIM_FORMAT_GUIDE}}`,
`{{USPTO_MPEP_RULES}}`, `{{IDS_REQUIREMENTS}}`, `{{ANALYSIS_101_102_103_112}}`, `{{DRAWING_STANDARDS}}`,
and `{{REDACT_INVOCATION_BLOCK:<sink>}}`. Keep gstack's soft 160KB token-ceiling warning + budget
table (patent skills are legitimately content-heavy), the `--dry-run` STALE/FRESH freshness gate in
CI, and the `apa skill:check` health dashboard. Multi-host portability stays pure data via typed
`HostConfig` objects.

**Packaging + install (ARA pattern).** `packages/apa-skills/` forks ARA's `ara-skills` npx installer
near-verbatim: the `agents.js` config-dir host-detection registry (`~/.claude`, `~/.cursor`, ...),
`installer.js` recursive copy + `.apa-skills.json` lock for update/uninstall, `skills.js` discovery +
frontmatter parse, `index.js` `resolveAgents` fallback (explicit `--agent` -> auto-detected ->
default `claude-code`), and the `prepack` hook bundling repo-root `skills/` into the tarball so npx is
self-contained. Single-source-of-truth discipline: edit `skills/` at repo root, never the bundled
copy.

**End-user setup flow.** `setup` (gstack-derived) does: Bun check -> smart-rebuild binaries on
mtime change -> ensure Playwright Chromium + fonts -> for each detected host create a minimal runtime
root and link skills via `_link_or_copy` (Windows symlink fallback — important, since this installs on
Windows law-firm laptops) -> skill-prefix toggle (`/apa-claims` vs `/claims`) with bidirectional
cleanup migrations -> idempotent versioned migrations gated on `~/.apa/.last-setup-version` (so
evolving per-matter formats upgrade safely). `--team` mode registers a SessionStart auto-update hook so
a whole firm stays on the same vetted ruleset, using the consent-gated settings.json pattern (backup,
diff preview, time-bounded prompt defaulting to skip, source-tagged idempotent hooks). One command:
`npx @apa/patent-skills`.

---

## 7. Quality, safety & legal guardrails

### 7.1 Three-tier test model, adapted to patent drafting

Copy gstack's cost-pyramid-keyed-to-determinism model directly; patent quality splits cleanly into
deterministic and judgment halves.

- **Tier 1 — static (free, <2s, every commit).** Fork `skill-parser.ts`: required phases present
  (disclosure->search->analyze->claims->spec->figures->assembly->review), required output sections,
  weight tables sum to 100%, no unresolved `{{placeholders}}`, `AUTO-GENERATED` header present. Plus
  the deterministic *legal-form lint* (the free pre-check before any LLM): every claim ends in one
  sentence with a period, dependent claims reference a valid base claim, no claim-numbering gaps,
  antecedent basis resolves (`a/an` first, `the/said` after), every claimed term appears in
  `concepts.md`, every drawing numeral resolves to a figure and a spec paragraph, abstract <=150 words,
  title <=500 chars.

- **Tier 3 — LLM-as-judge (paid, periodic).** Fork `llm-judge.ts` with patent judges:
  `judgeClaim()` (breadth-vs-support, dependency validity 1-5), `judgeSpec()` (112
  enablement/written-description 1-5, claim support), `judgePatentability()` (planted-prior-art
  detection rate via `outcomeJudge()`). Keep ARA/gstack's **deterministic-regex-before-LLM layering**
  (skip the paid call when structure fails) and the `<<<UNTRUSTED>>>` injection-fencing + score
  clamping — patent text is long and adversarial-input-prone.

- **Tier 2 — E2E (paid, periodic).** Fork `session-runner.ts`: spawn `claude -p` on a fixture
  disclosure and assert the full pipeline runs end to end and produces an assembly package draft.

- **Gate vs periodic split.** All **confidentiality/PII guardrail tests are gate-tier** and block
  every PR ("planted HIGH secret in a disclosure is blocked", "a confidential-marked disclosure cannot
  reach a filing sink", "a prior-art query is scanned before send"); non-deterministic drafting-quality
  LLM evals are periodic (weekly cron). The format-fidelity gate (USPTO PDF/DOCX) is gate-tier. Eval
  results persist to a versioned git-aware store with budget-regression gating (fail on a claim-quality
  score drop or >2x cost growth) and diff-based test selection via declared touchfiles.

### 7.2 Redaction / confidentiality guard (scan-at-sink)

THE core safety primitive. **Fork gstack's `lib/redact-patterns.ts` + `redact-engine.ts` +
`bin/gstack-redact` into `packages/apa-redact/`**, keep the single-source-of-truth 3-tier taxonomy,
the NFKC + zero-width normalization (defeats evasion), the fail-closed oversize guard, and the
offset-mapping. **Scan the EXACT bytes at every external sink** — write to a temp file, scan that
file, send that same file; never scan-then-rerender. Sinks that MUST be guarded: prior-art search
queries to public APIs, any cloud LLM payload carrying disclosure text, and any filing submission.
Exit-code branching: **HIGH = block (exit 3)**, **MEDIUM = per-finding AskUserQuestion (exit 2,
sterner on anything externally visible)**, LOW = FYI.

**Extend the taxonomy with patent-specific categories.** HIGH: unpublished application/serial
numbers, inventor SSN. MEDIUM: `CONFIDENTIAL`/`DO NOT FILE`/NDA markers (gstack's `legal.nda_marker`
already exists as a seed), employer trade-secret codenames, bar-date/public-disclosure-risk phrases,
inventor PII. The guard is explicitly a *guardrail that catches accidents, not airtight enforcement*
— framed honestly, calibrated so high-FP shapes sit at MEDIUM. The scan-at-sink instruction is
generated into every external-sink skill from one resolver so it never drifts from the engine.

### 7.3 Statutory quality checks wired into the rigor reviewer

Two tiers, mirroring ARA's Level1/Level2 split, with the deliberate APA divergence that 102/103 needs
external art (so it lives in the *separate* fetch-enabled `/apa-novelty` reviewer, while the
internal `/apa-rigor` reviewer stays artifact-only/read-only like `rigor-reviewer`).

**Level 1 — mechanical filing-readiness** (deterministic, in code; the legal-form lint of §7.1 plus):
every claim limitation has a resolving `supported_by` (§112 — a dangling edge is flagged, not
dropped), every figure numeral defined in spec and vice versa, claim dependency graph acyclic and
references existing claims, every IDS reference indexed, declared counts match files.

**Level 2 — six patent rigor dimensions** (re-roling ARA's six, scored 1-5 against anchors):

| Dim | What it audits | ARA dimension re-roled |
|---|---|---|
| P1 — 101 Eligibility | Alice/Mayo abstract-idea screen + practical-application/inventive-concept | Evidence Relevance |
| P2 — 112 Written-Description/Enablement/Definiteness | Spec teaches & enables every limitation; not indefinite | Scope Calibration (the over-claiming check ~= 112 verbatim) |
| P3 — Antecedent Basis | Every `the/said X` has a prior `a/an X` in the same claim | Methodological Rigor |
| P4 — Claim-Spec-Drawing Support | Every claim term defined, structurally illustrated, consistently numbered | Argument Coherence |
| P5 — Prior-art Distinction (internal) | Every `distinguished_over` reference is substantively addressed | Falsifiability Quality |
| P6 — Prosecution Integrity | Honest decision record; no claim advocates a `dead_end` (estoppel) | Exploration Integrity |

**Grade = mean-plus-per-dimension-floor**, but hardened: any dimension scoring 1 (full anticipation,
101 ineligibility, broken antecedent basis) caps the overall verdict at **Do-Not-File** regardless of
mean. Verdict scale: **File-Ready / File-With-Revisions / Major-Rework / Do-Not-File**. Findings keep
ARA's schema (verbatim `evidence_span`, severity, mandatory concrete amendment suggestion) plus a
`questions_for_inventor`/`questions_for_attorney` array and a `read_order` audit trail, written to
`patent_rigor_report.json`. Severity maps to statutory fatality: critical = 102/101/missing antecedent;
major = 103 combination or enablement gap; minor = definiteness nit; suggestion = scope optimization.

### 7.4 Human-in-the-loop + UPL / duty-of-candor disclaimers (MUST be enforced)

These are enforced structurally, surfaced persistently in every skill via `{{PATENT_PREAMBLE}}`, and
documented in `docs/legal-guardrails.md`.

**Acts APA structurally refuses (hard-coded, no override):**
1. **Signing or certifying any USPTO paper** — the inventor's oath/declaration (35 USC 115; 37 CFR
   1.63) and the 37 CFR 1.4 / 11.18 certifications require a personally-inserted human signature. APA
   never applies, generates-as-final, or submits a signature. It also **never generates a completed
   declaration/oath with a pre-filled signature block as if executed**, and **never asserts
   micro-entity status** (37 CFR 1.29) — both are human certifications.
2. **Filing autonomously** — Patent Center exposes a *view/status* API (Workbench XML, since Apr 2025)
   but **no public submission/filing API**; filing requires an identity-verified human account +
   per-submission human authorization. `/apa-assemble` stops at the submit boundary and emits a checklist.
3. **Naming AI as inventor** — at least one natural-person inventor must be named, and the conception of
   each claim must be attested by listed natural-person inventors (Thaler v. Vidal; USPTO revised
   AI-inventorship guidance, Nov. 26, 2025). The `PATENT.md` validator rejects a frontmatter
   with zero `inventors` or any AI-named inventor; the inventorship gate measures **human attestation of
   conception**, not AI absence (§11.1).
4. **Sending unfiled-disclosure substance to a non-zero-retention or foreign backend without explicit,
   logged human acknowledgment** — the data-residency guardrail (§7.2 / §11.2). Confidentiality of an
   unfiled invention is a 102-novelty and trade-secret matter; the redaction guard catches accidental
   secrets but does not make it safe to ship invention substance to an unvetted model.

**Gates that block downstream stages:**
- Assembly-package generation is **blocked while any claim limitation carries `ai-suggested`** (inventorship-
  integrity gate) — a formal claim must be `inventor`/`attorney`/`human-revised`.
- The rigor verdict must be **File-Ready or File-With-Revisions** (a human accepts the revisions list)
  before assembly proceeds; **Do-Not-File** blocks.
- Every external sink passes the redaction guard (§7.2).

**Persistent disclaimers (surfaced, not buried):** APA is drafting/assistive software, not a law firm
or registered practitioner, and gives no legal advice; all outputs are drafts requiring independent
human review (relying solely on AI does not satisfy the human reasonable-inquiry duty, and does not
discharge the 37 CFR 1.56 duty of candor — AI may hallucinate prior
art/citations/facts); APA cannot sign/certify/file; only natural persons may be inventors;
confidentiality/privilege/work-product/trade-secret status of inputs is not guaranteed; do not
publicly disclose/sell/offer the invention before filing (US one-year grace, absolute novelty abroad);
transmitting invention data abroad may implicate export control / foreign-filing license (35 USC 184).

**Must-not-claim (enforced in skill prose review):** APA must not claim to be a registered
attorney/agent, to give legal advice or render patentability/FTO/validity/infringement/inventorship
conclusions as authoritative, to sign/file on a user's behalf, that AI can be an inventor, that its
outputs are verified, that it guarantees a patent will issue, or that inputting disclosures preserves
privilege.

---

## 8. Build roadmap

Phased, each milestone with concrete deliverables and a rough effort sense (CC-assisted). **The MVP
is Phase 1's smallest valuable slice, marked below.** Office-action/prosecution-response is out of
scope; the artifact is built up to filing + post-filing docketing handoff.

**Phase 0 — Scaffold (~2-3 days).** Repo skeleton per §5; fork the gstack `gen-skill-docs.ts`,
`host-config.ts`, `discover-skills.ts`, `skill-check.ts` pipeline and the ARA `apa-skills` installer;
one `claude.ts` primary host; CI freshness + Tier-1 static gates green; `ETHOS.md` + `CLAUDE.md` +
matter-config rule. Deliverable: `npx @apa/patent-skills` installs an empty-but-valid skill that runs.

**Phase 1 — Disclosure + artifact protocol (~1 week). [MVP]** The smallest valuable first slice is
**`/apa-disclose` (capture) + `/apa-compile` (lift) producing a validated `<matter>/` artifact with
`PATENT.md` + `logic/` + `trace/` + provenance, plus `apa-viewer` to read it, plus the redaction
guard.** Deliverables: the `PATENT.md`/four-layer schema in `docs/protocol.md`; `disclosure-capture`
and `compiler` skills with `apa-schema.md` + `validation-checklist.md` references; the Level-1
mechanical validator (cross-layer binding resolution, antecedent basis, numeral definedness);
`packages/apa-viewer/` (manifest + claims-first reader with §112-warning edges); `packages/apa-redact/`
with the patent-extended taxonomy and scan-at-sink wired into capture. **This alone is useful:** a
practitioner can capture a disclosure or lift an existing patent into a navigable, provenance-tagged,
mechanically-validated artifact — the core protocol value, no external dependencies, fully
confidential.

**Phase 2 — Prior-art search (~1.5 weeks).** Build `packages/apa-browse/` (fork gstack `browse`);
wire PatentsView/ODP/EPO-OPS/PQAI APIs + PPS/Google-Patents snapshot loops; untrusted-content envelope;
`/apa-priorart` skill filing `PA##` blocks + `evidence/prior_art/` exhibits + the landscape; redaction
guard on every query sink. Deliverable: ranked closest-art set bound to claims, human-validated.

**Phase 3 — Drafting (~2 weeks).** `/apa-claims` (claim tree, antecedent basis, Statement/Interpretation
split), `/apa-spec` (1.77 sections, grounding discipline, "Not specified in disclosure" gaps),
`/apa-figures` (diagram-prepass numbered drawings + numeral reconciliation), `/apa-analyze` (101/102/
103/112 claim charts as flags). Tier-3 LLM judges (`judgeClaim`/`judgeSpec`) + ground-truth fixtures.

**Phase 4 — Assembly + filing prep (~1.5 weeks).** `packages/apa-make-doc/` (fork gstack `make-pdf` +
USPTO `print-css`); `/apa-assemble` (DOCX/PDF spec/claims/abstract, ADS auto-populate, SB/08 IDS seed,
fee worksheet, pre-filing checklist); the format-fidelity gate; the submit-boundary stop + signing/
filing refusals; the inventorship-integrity assembly gate.

**Phase 5 — Rigor + packaging (~1.5 weeks).** `/apa-rigor` (six dimensions, mean-plus-floor,
Do-Not-File cap) + `/apa-novelty` (fetch-enabled 102/103); the full gate/periodic CI split with
versioned eval store + budget regression; `--team` mode + versioned migrations; `examples/` worked
artifacts; `docs/legal-guardrails.md` finalized; the `/apa-autoprep` chain.

---

## 9. Reuse map

### Copy/adapt from gstack

| What | -> Target in APA |
|---|---|
| `browse` persistent-daemon + thin-CLI + ref-snapshot + `wrapUntrustedContent` | `packages/apa-browse/` (adapt command surface to patent DBs) |
| `make-pdf` orchestrator + `browseClient.ts` + diagram-prepass + multi-format | `packages/apa-make-doc/` |
| `make-pdf/src/print-css.ts` | `packages/apa-make-doc/src/print-css-uspto.ts` (fork to 37 CFR 1.52/1.84) |
| `design` image-gen + GPT-4o vision gate + compare-board daemon | `packages/apa-figure/` |
| `lib/redact-patterns.ts` + `redact-engine.ts` + `bin/gstack-redact` | `packages/apa-redact/` (extend taxonomy with patent categories) |
| `gen-skill-docs.ts` + `host-config.ts` + `discover-skills.ts` + `skill-check.ts` + resolvers | `scripts/` |
| `hosts/claude.ts` + `index.ts` HostConfig registry | `hosts/` |
| `generateDeployBootstrap` (read-config -> ask -> persist) | `scripts/matter-config.ts` |
| 3-tier harness: `skill-parser.ts`, `llm-judge.ts`, `session-runner.ts`, `eval-store.ts`, `touchfiles.ts` | `test/helpers/` |
| `make-pdf-gate.yml` + `format-gate.test.ts` | `test/make-doc-fidelity.test.ts` |
| `evals.yml` / `evals-periodic.yml` / `skill-docs.yml` + gate/periodic split | `.github/workflows/` |
| `setup` installer (`_link_or_copy`, smart-rebuild, prefix toggle, `--team`, migrations) | `setup` |
| `ETHOS.md` philosophy injected into every preamble | `ETHOS.md` + `scripts/resolvers/preamble.ts` |
| `{{INVOKE_SKILL}}` / `{{SECTION}}` composition + `/autoplan` chain pattern | `skills/autoprep/` |

### Copy/adapt from ARA

| What | -> Target in APA |
|---|---|
| Four-layer skeleton + mandatory-core rule | The `<matter>/` artifact (§2.3) |
| `PAPER.md` manifest + Layer-Index + 3-level progressive disclosure | `PATENT.md` (§2.2) |
| Stable typed-ID + bidirectional cross-layer binding | The CLM##/LIM##/SPEC##/FIG##/PA##/PH##/TERM## spine (§2.5) |
| `claims.md` field set + Statement-vs-Interpretation split | `logic/claims.md` (over-claiming/§112 guard) |
| `related_work.md` typed RDO graph (incl. `refutes`) | `logic/prior_art.md` (typed by legal role) |
| `exploration_tree.yaml` schema + `dead_end`-as-leaf | `trace/prosecution.yaml` (estoppel record) |
| Evidence raw-vs-derived + per-object PNG+markdown + README index | `evidence/prior_art/` + `evidence/drawings/` (+ claim-chart/IDS) |
| `research-manager` provenance + direct/staged routing + closure signals | `disclosure-capture` skill + `staging/` |
| `compiler` single-file 4-stage chain + bounded coverage/validate/fix loop | `compiler` skill |
| `compiler/references/validation-checklist.md` (Seal Level 1) | The Level-1 mechanical filing-readiness validator |
| `rigor-reviewer` six-dimension Level-2 rubric + severity + grade mapping | `/apa-rigor` (six patent dimensions, mean-plus-floor) |
| Grounding discipline (`transcribed`/`reconstructed`, "Not specified") | The new-matter guard across drafting skills |
| `ara-viewer` `build_manifest.py` + `viewer.js` | `packages/apa-viewer/` (§112-warning edges) |
| `ara-skills` npx installer (agents/installer/skills/index + prepack bundling) | `packages/apa-skills/` |

---

## 10. Open questions & risks

### Decisions that need the user

1. **Jurisdiction scope for v1.** USPTO-only (recommended, since the findings ground USPTO rules and
   Patent Center), or include EPO/PCT rule packs from the start? This sizes the `legal-rules.ts`
   resolvers and `apa-browse` sources.
2. **Target user.** Registered practitioners (supervised tool, the safe default) vs pro-se inventors
   (broader UPL exposure, sterner disclaimers, simpler scope)? Affects disclaimer posture and which
   stages get report-only gates.
3. **Confidentiality posture / data residency.** Which LLM and search backends are acceptable given
   the export-control / privilege risk of sending unfiled disclosures to third-party or foreign
   servers? May force a local/on-prem inference option.
4. **Compiler input priority.** Optimize the lift for granted patents (clean structure) vs raw
   invention disclosures (messy, the higher-value capture case) first?
5. **Prior-art API budget.** PQAI is free; The Lens and most NPL are paywalled. Which licensed
   sources, if any, get credentials wired in?

### Top technical/legal risks + mitigations

| Risk | Mitigation |
|---|---|
| **AI hallucinates prior art / claim limitations / spec text (new matter, fatal).** | Port ARA's zero-hallucination Critical Rules verbatim; "Not specified in disclosure" is a mandatory explicit value; cite-by-verification (open the cited ¶ and confirm); every generated limitation/figure/advantage carries a grounded provenance source or is flagged a gap. |
| **Confidential unfiled disclosure leaks to an external sink.** | Scan-at-sink redaction guard (§7.2) on every query/LLM/filing sink, fail-closed, gate-tier tests block every PR; data-residency disclosed in `docs/legal-guardrails.md`. |
| **UPL — APA presents itself as counsel or renders legal conclusions.** | Structural refusals (sign/file/inventor); `{{PATENT_PREAMBLE}}` persistent disclaimers; must-not-claim list enforced in skill-prose review; patentability output framed as flags + questions, never opinions. |
| **Examiner-grade PPS is UI-only; key NPL paywalled — incomplete search masquerades as complete.** | Blend API sources with snapshot-driven PPS; always human-validate closest-art selection; log the search strategy; never assert "no anticipating art found" autonomously. |
| **A claim limitation lacks §112 support / antecedent basis ships undetected.** | Cross-layer binding makes it mechanically checkable; dangling `supported_by` surfaces as a §112 warning (not silently dropped); Level-1 validator + P2/P3/P4 rigor dimensions; Do-Not-File cap on a 1-score. |
| **Inventorship integrity — AI-conceived limitation slips into a filed claim.** | Provenance default `ai-suggested`, no auto-upgrade; assembly blocked while any claim limitation is `ai-suggested`; AI never named inventor; provenance distribution surfaced as a candor signal. |
| **Premature public disclosure forfeits rights (US grace clock / absolute novelty abroad).** | Bar-date capture in disclosure intake + `PATENT.md`; redaction taxonomy flags public-disclosure-risk phrases; disclaimer warns; timing decisions explicitly handed to counsel. |
| **Generated SKILL.md drifts from the legal rules (correctness/liability).** | Single-source-of-truth resolvers + `--dry-run` freshness gate in CI (fail on non-empty git diff) + `apa skill:check` dashboard; `--team` mode keeps a firm on one vetted ruleset. |
| **Windows install staleness (frozen symlink copies on law-firm laptops).** | gstack's `_link_or_copy` Windows fallback + static CI test forbidding raw `ln`; smart-rebuild on mtime; re-run-after-pull note. |
| **Drafting-quality regression or cost blowup from a prompt tweak.** | Versioned git-aware eval store + budget-regression gating (fail on score drop or >2x cost) + diff-based test selection; LLM-judge against ground-truth fixtures. |

---

## 11. Hardening & g2tree integration (post-critique + real-package study)

This section records (A) corrections from a three-critic adversarial review, (B) legal/feasibility
guardrails promoted from "open questions" to hard requirements, and (C) advantageous features lifted
from a real, completed patent package (`g2tree/docs/patent_gaussian_tree/`, treated as **reference,
not ground truth**). Where this conflicts with §§1-10, this controls.

### 11.1 Domain-completeness hardening

- **Type-aware, fail-loud validator (highest-leverage fix).** Add `application_type` to `PATENT.md`:
  `provisional | utility | design | plant | pct | cip`. Mandatory-core and the Level-1 validator become
  type-aware — a **provisional** needs spec + drawings but *not* claims/oath/IDS (the single-utility-path
  validator would wrongly flag "missing claims"); a **design** app has exactly one claim (1.151-1.154);
  **PCT** uses unity-of-invention, not restriction. Provisionals surface a prominent **12-month clock**
  (35 USC 111(b)). For any unsupported matter type/feature the validator **fails loud** ("not supported,
  route to counsel") rather than silently mis-validating (the more dangerous failure mode).
- **Per-claim inventorship (35 USC 116 / Pannu).** A person is an inventor only if they contributed to
  the conception of ≥1 claim. Add an `INV##` entity to the cross-layer spine with `contributed_to -->
  CLM##`; the `inventor` tag carries the person ID (`inventor:JSMITH`). `PATENT.md` surfaces an
  **inventorship matrix**. Level-1: every independent claim traces to ≥1 named inventor's conception;
  flag (don't decide) when a claim amendment changes the inventive entity (1.48 correction). The
  assembly gate measures **human attestation** via a lightweight adopt/affirm flow, not AI absence.
- **ADS / oath as first-class artifacts (37 CFR 1.76 / 1.63).** Model the Application Data Sheet
  (`logic/filing_paths.md` or `ads.md`) with domestic-benefit (continuation/divisional/CIP, 120/365(c))
  and foreign-priority (119/365(b)) fields + applicant-vs-inventor distinction (1.46). Level-1: benefit/
  priority claims present, internally consistent, plausible vs deadlines (a wrong/missing benefit claim
  forfeits priority). Human still signs the declaration.
- **102 statutory bars from the interview, not just search.** On-sale, public-use, and the inventor's
  own pre-filing disclosure / 102(b)(1) grace exception are *not* found by a database search. Add a
  102(a)(1)/(b) statutory-bar screen driven by `disclosure-capture`'s bar-date/activity events (sales,
  demos, papers, dates vs the effective filing date and the one-year window), flagged distinctly from
  search-derived anticipation.
- **103 = KSR/Graham, not just "motivation to combine."** Name the relevant KSR rationale and prompt
  for Graham-factor inputs; add a `secondary_considerations` block (commercial success, long-felt need,
  unexpected results) for inventor-supplied rebuttal. Flags/questions, never a conclusion.
- **112(f) means-plus-function screen.** Flag candidate nonce-word ("module/mechanism/unit for")
  limitations (Williamson presumption) and verify each has corresponding structure disclosed and linked
  (a special case of the `supported_by` edge); missing structure → indefiniteness flag. Folds into P2.
- **Double-patenting / family awareness.** Add `related_applications` to `PATENT.md` (family members,
  co-pending serials, common ownership) + a Level-2 ODP flag; capture any terminal disclaimer (1.321) as
  a human-only `PH##`. Family awareness must exist *at filing* (benefit claims + ODP arise there).
- **Patentability ≠ FTO.** Each `PA##` carries a role: `prior-art-for-patentability` vs
  `potential-blocking-right`; `evidence/README.md` states the landscape is **not** an FTO/clearance
  opinion. Closes a common inventor confusion and a UPL/expectation gap.
- **Fees as versioned, dated data.** Drive fees from a dated schedule (USPTO revised substantially Jan
  2025). Itemize base filing/search/exam; excess claims (>3 indep, >20 total, multiple-dependent);
  application-size fee (>100 sheets); continuing-application + IDS-size surcharges; entity multiplier;
  micro-entity 1.29 flag (APA never asserts it). Never hardcode a dollar amount. Stamp output with the
  rules/fees effective date ("as of YYYY-MM-DD; verify currency") + a CI freshness check.
- **Sequence listings (ST.26) gate.** If the disclosure contains sequences (detectable), Level-1
  **blocks**: "WIPO ST.26 XML sequence listing required (mandatory since Jul 2022) — not supported,
  route to counsel/tooling." Never reach `assembled` silently.
- **Restriction / unity advisory.** Detect distinct inventive groupings (apparatus + method +
  composition that may be unrelated) → restriction-risk note (1.142 / MPEP 808; unity for PCT) feeding
  the continuation/divisional pivot — advisory, not a decision.
- **Drawings.** Extend the 1.84 pre-check: every claim/spec numeral appears in ≥1 figure (1.83(a)) and
  vice versa; flag color/photo drawings as petition-required (1.84(a)(2),(b)); verify the Brief
  Description lists every figure. Figures use **drawing-sheet margins** (1.84(g): top 2.5cm, left 2.5cm,
  right 1.5cm, bottom 1.0cm) — distinct from the 1.52 spec margins.
- **Duty of candor is broader than the IDS.** 1.56 also covers material non-prior-art information
  (inventor's own bar activities, known inconsistent statements, litigation art). Broaden P6 and have
  `disclosure-capture` prompt "anything you know that might be material to patentability." Add to the
  pre-filing checklist a **foreign-filing-license** gate (35 USC 184) and a **continuing-IDS-duty** note
  (1.97 windows) — both straddle the filing boundary the tool owns.

### 11.2 Legal & feasibility guardrails (promoted to hard requirements)

- **Target user is a blocking decision.** v1 supports **registered practitioners only** (the defensible
  UPL posture). A pro-se path requires a distinct, sterner self-education preamble tier that suppresses
  any course-of-action recommendation (scope choices, which art to cite, file/don't-file timing) + counsel
  sign-off of the disclaimers — or it is cut from v1.
- **Data residency is a guardrail, not an open question.** Require explicit, logged human acknowledgment
  before any unfiled-disclosure text crosses to a cloud LLM or external search API; default to a
  **zero-retention / no-training** backend; treat sending US-origin invention substance to a *foreign*
  backend as potentially the regulated act (35 USC 184 / export of technical data) and gate it.
- **No capability overstatement.** The mechanical validator proves mechanical facts only (§2.5);
  patentability output is flags/questions. The must-not-claim list polices the tool's own copy (README,
  marketing, validator PASS labels), not just skill prose — a green check is never "§112 clearance."
- **Third-party ToS.** Prefer sanctioned APIs/datasets; ToS-restricted UI scraping (Google Patents,
  possibly PATENTSCOPE) is off by default (§4.1).
- **DOCX-as-filed.** The applicant owns the USPTO-rendered DOCX; always emit the auxiliary "true copy"
  PDF and require human review of the rendered DOCX (§4.2).

### 11.3 g2tree advantageous features (new/enhanced capability)

| Feature | New/changed surface | What it adds |
|---|---|---|
| **Examiner-adversary loop** | new skill `/apa-examiner` → `trace/prosecution_rationale.md` | An agent role-plays a USPTO examiner, enumerates the strongest likely 101/102/103/112 rejections, and pairs each with the fix applied — hardens the application *before* the real examiner and leaves a documented rationale record. (Adversarial-verify; runs after drafting, before assembly.) |
| **Hardened prior-art verification** | stage in `/apa-priorart` + `/apa-novelty` | Per cited reference: independently re-verify title/authors/venue/canonical link, then record **discloses vs. lacks** + confidence — catches mis-citations and citing a paper for what it doesn't teach; produces an accurate IDS seed. (Configurable fan-out, not a magic count.) |
| **Reference/claim matrix** | canonical output of `/apa-priorart` | Tiered references × claim-elements with explicit **Blocks / Does-NOT-block**, a named "strongest examiner combination," and a "practical claim boundary" — turns a flat list into claim-narrowing guidance. |
| **Claim-architect (dual lens)** | `/apa-claims` emits both views | A ranked **examiner-survival** ladder (narrow lead independent on the defensible kernel; method/system/CRM mirror; breadth in dependents) **and** a separate **portfolio-protection** ladder (continuation-reserved genus) — the breadth tradeoff made explicit, not silently over-narrowed. |
| **Style-reference** | input step to `/apa-spec` | Retrieve 2-4 analogous *granted* patents, extract a style checklist (section cadence, "systems, apparatus, articles of manufacture, and methods" framing, "like reference numerals identify like elements") + what *not* to import — moves research-memo voice to filing voice. |
| **Writing rubric + autotune** | `rubric.ts` resolver + `optimization-pack:auto-tune` loop; per-artifact `*_autotune.tsv` | A versioned 100-point rubric (form/filing-style, written-description/enablement, definiteness, figure-integration/numerals, neutral background) scored by N independent reviewers, optimized to a **min-score floor** (not just mean) via keep/discard iterations logged `iteration / min_score / avg_score / status / description`. Feeds the `/apa-rigor` dimensions. |
| **ReportLab figure path** | option in `apa-figure` + lifted primitive lib | For formal B&W line-art, the g2tree primitives (`box`+numbered part+sub-lines, `arrow` w/ computed head, `loop_arrow`, `white_text` to mask crossings, `build_combined_drawings()`) are directly liftable and arguably better-suited than mermaid for 1.84 drawings; figure part-numbers are **shared state with the spec** so support-trace verifies each numbered part is described. (Needs cross-platform fonts — §11.4.) |
| **Preflight + frozen upload set** | `apa-preflight` in `/apa-assemble` | Programmatically validate output PDFs (letter size, **embedded fonts**, no password/layers/JS/multimedia) → go/no-go; freeze a minimal `upload_set/` (1 spec PDF + 1 combined-drawings PDF) separate from internal output. Catches the real Patent Center e-filing rejection modes. |

The §112 **support-gap audit** g2tree does by hand (family-by-family Strong/Medium/Weak scorecard) is
exactly the P2/cross-layer-binding check (§2.5/§7.3) — adopt its **scorecard output format**. g2tree's
missing **IDS / 1.56 artifact** is a gap APA closes with the SB/08 IDS seed (§3) — keep it.

### 11.4 Anti-patterns designed out (observed in g2tree)

- **No hardcoded font paths** (g2tree hardcodes `C:/Windows/Fonts/times.ttf`): cross-platform font
  resolution + a redistributable substitute (Liberation Serif / Tinos — Times New Roman is MS-licensed).
- **No stale absolute paths** in artifacts (g2tree's links point at a different, stale project root):
  all references are repo-/matter-relative.
- **No FPDF table-dropping** (g2tree silently `continue`s on `|`-table lines = content loss): use the
  ReportLab/TTF path and render tables.
- **No heading-string section-skipping** (brittle): use explicit **artifact-layer tagging** (filing-body
  vs internal), which the `logic/`-internal vs spec-filing split already provides.
- **No leftover `[INVENTOR NAME]` placeholders**: require matter metadata resolved (or explicitly stubbed
  and gated) before any artifact is labeled "filing."
- **No fixed magic agent counts** ("3 reviewers"/"6-agent sweep"): configurable fan-out.
- **One canonical track per invention** (g2tree's parallel Merge-Tree/CD packets were a re-scope artifact):
  claim families live *inside* one matter.

### 11.5 Repo-layout delta (amends §5)

Add `skills/examiner-adversary/` (`/apa-examiner`), `skills/claim-architect/`, `skills/style-reference/`;
`packages/apa-figure/` gains a `reportlab/` renderer + lifted primitive lib + an `apa-preflight` entry;
`scripts/resolvers/` gains `rubric.ts` and `fee-schedule.ts` (dated, versioned); `test/` gains autotune
traces + `legal-rules-freshness.test.ts`; `docs/` gains `fee-schedule.<date>.json` + `rule-effective-dates.md`.
`PATENT.md` frontmatter gains `application_type`, `related_applications`, an inventorship matrix, and a
rules/fees effective-date stamp. New artifact file `trace/prosecution_rationale.md` (examiner critique→fix log).

### 11.6 Reuse-map additions (amend §9)

- gstack **content-security envelope + canary** (compile-safe `security.ts`; *not* `security-classifier.ts`,
  which can't load in a Bun-compiled binary) → the `apa-browse` fetched-reference channel.
- gstack **cross-session decision store** (`gstack-decision-log` / `-search`, `--supersede`, `--redact`,
  scope, HIGH-secret-block-on-write) → backing index for `trace/prosecution.yaml` scope/estoppel decisions
  (searchable, supersede-aware) instead of a bare YAML DAG.
- gstack `scripts/resolvers/preamble.ts` + the `preamble-tier` frontmatter field → the home of
  `{{PATENT_PREAMBLE}}` (inherit multi-pass resolution, jargon-gloss baking, AUTO-GENERATED freshness gate;
  don't reinvent).
- g2tree **ReportLab figure primitives** → `packages/apa-figure/reportlab/`.

### 11.7 Locked recommendations & tightened v1 scope

Recommended locks (pending the user's confirmation): **USPTO-only**, **registered-practitioner-only**,
**zero-retention backend by default**, and **ship Phase 1 first** (capture/compile + viewer + Level-1
type-aware validator + redaction guard, no external dependencies) — keeping the highest-liability surfaces
(cloud search, drafting, filing-assembly) behind their own go/no-go legal review. Prior-art search,
drafting, figures, and assembly are follow-on milestones, each gated.
