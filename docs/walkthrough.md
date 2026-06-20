# APA End-to-End Walkthrough

A new-user tour of the Agent-Native Patent Artifact (APA) lifecycle: from invention disclosure to a
frozen assembly package draft. Each step pairs the **skill** you invoke (`/apa-*`) with the concrete
**CLI** that backs or checks it, what it produces, and the gate it must clear.

> Prereqs: Node >= 21, zero dependencies. Run from the repo root. A "matter" is a directory holding the
> artifact (`PATENT.md` + `logic/`, `src/`, `trace/`, `evidence/`). The worked example throughout is
> `examples/minimal-patent-artifact`.

## Read this first — posture

APA is **supervised, assistive drafting software — not legal advice and not a registered practitioner.**
A competent human reviews every output, decides, signs, and files; relying on AI alone does not satisfy
the 37 CFR 11.18 reasonable-inquiry duty. Every 101/102/103/112, patentability, novelty, FTO, or
inventorship output is a **flag/question for a human, never a conclusion or clearance** — a green
mechanical check is never a "§112 clearance."

**Structural refusals (no override):** APA never (1) signs, certifies, or pre-fills an executed
signature on any USPTO paper; (2) files autonomously (there is no public submission API — filing needs
an identity-verified human account); (3) names AI as an inventor; (4) asserts micro-entity status; or
(5) sends unfiled-disclosure substance to a non-zero-retention/foreign backend without explicit, logged
human acknowledgment. If the user is **pro-se** (unrepresented), output is reframed as neutral
self-education with a "not legal advice" banner and a recommendation to consult a practitioner.

**Confidentiality:** before *any* external sink (a prior-art query, a cloud-LLM payload, a submission),
the scan-at-sink redaction guard runs on the exact bytes — HIGH findings **block**, MEDIUM findings
**hold** for per-finding human confirmation:

```bash
node packages/apa-redact/cli.mjs --from-file <path>      # exit 0 clean · 2 MEDIUM · 3 HIGH (blocked)
```

You can run the whole sequence below under one orchestrator, **`/apa-autoprep`**, which sequences the
phase skills and halts on every gate and human checkpoint.

---

## The lifecycle (ordered)

### 1. Capture / compile
- **Skill:** `/apa-disclose` (interview a new disclosure into the artifact, file-I/O only) **or**
  `/apa-compile <path-or-url>` (lift an existing patent / publication into a validated artifact).
- **CLI (gate):** `node packages/apa-validate/validate.mjs <matter>`
  — Level-1 **mechanical** validator (antecedent basis, claim deps, edge resolution, numeral
  definedness, inventorship attestation).
- **Produces:** a populated `PATENT.md` + four layers.
- **Gate:** validator must be **error-free** (exit 0/1; exit 2 = errors, do not proceed) before any
  later drafting/assembly step. Optionally build the viewer manifest:
  `node packages/apa-viewer/build_manifest.mjs <matter> --out <matter>/manifest.json`.

### 2. Prior-art search
- **Skill:** `/apa-priorart`
- **CLI:** offline demo — `node packages/apa-search/cli.mjs --query "..." --source mock` ; against a
  matter with write-back — `node packages/apa-search/cli.mjs --matter <matter> --source patentsview --write`
  (needs `export PATENTSVIEW_API_KEY=...`).
- **Produces:** `PA##` reference blocks under `evidence/prior_art/`, updates `logic/prior_art.md`, and
  seeds `logic/reference_matrix.md`.
- **Gate:** the query is **scanned at the sink** before egress (exit 2 MEDIUM → re-run `--yes`; exit 3
  HIGH → blocked). Candidates are **unverified** and the search is **never asserted complete**; a human
  validates the closest-art selection.

### 3. Patentability analysis
- **Skill:** `/apa-analyze`
- **CLI:** none — this is a semantic, artifact-only skill (claim charts + 101/102/103/112 flags +
  statutory-bar and 112(f) screens).
- **Produces:** element-by-element claim charts and flagged issues in the artifact.
- **Gate:** outputs are **flags/questions for a practitioner, never conclusions**; a human reviews the
  statutory-bar (duty-of-candor) screen.

### 4. Claims
- **Skill:** `/apa-claims` (dual-lens ladder: examiner-survival + portfolio-protection).
- **CLI (gate):** `node packages/apa-draft/claim-lint.mjs <matter>` — deterministic legal-**form** lint
  (single-sentence, transitional phrase, contiguous numbering, multiple-dependent form, 112(f) nonce
  words). Then **re-run `apa-validate`** for antecedent basis / dependency.
- **Produces:** `CLM##` / `LIM##` blocks bound to spec support and closest prior art.
- **Gate:** lint findings are advisory (exit 1); validator errors block; the practitioner approves claim
  scope. Any limitation still `ai-suggested` later **blocks assembly** until a human adopts it.

### 5. Specification
- **Skill:** `/apa-spec` (37 CFR 1.77 sections, grounding discipline, writing rubric).
- **CLI (gate):** `node packages/apa-validate/validate.mjs <matter>` (re-validate — keeps numerals and
  defined terms consistent).
- **Produces:** `SPEC##` support paragraphs under `src/`.
- **Gate:** **new-matter guard** — nothing not grounded in the disclosure; gaps written literally as
  "Not specified in disclosure." Re-validation must stay error-free.

### 6. Figures
- **Skill:** `/apa-figures` (author + render numbered B&W line-art, reconcile numerals).
- **CLI (gate):** `node packages/apa-figure/cli.mjs render <figdef.json> --out f.svg` to render;
  `node packages/apa-figure/cli.mjs legend --matter <matter>` to reconcile numerals (exit 1 = undefined
  or inconsistent numerals).
- **Produces:** `FIG##` SVGs under `evidence/drawings/` + a consolidated numeral legend.
- **Gate:** legend must be flag-free; the authoritative numeral check remains `apa-validate`. (SVG is a
  review format; formal 37 CFR 1.84 raster/PDF conversion is a later phase.)

### 7. Rigor review + examiner adversary
- **Skill:** `/apa-rigor` (read-only six-dimension audit), then `/apa-examiner` (role-play examiner;
  critique→fix loop) if the verdict is weak.
- **CLI:** `node packages/apa-rigor/cli.mjs scaffold --matter <matter> --out report.json` (seed the
  report; mechanical dims prefilled) → fill scores via the skill → `node packages/apa-rigor/cli.mjs check report.json`
  (validate schema + compute the **deterministic** verdict; a single weak dimension caps it).
- **Produces:** `patent_rigor_report.json` with a File-Ready..Do-Not-File verdict.
- **Gate:** `check` exits **1 if not fileable** (Major-Rework / Do-Not-File / Incomplete), 2 on bad
  schema. A Major-Rework / Do-Not-File verdict **blocks assembly** — loop `/apa-examiner` + re-run
  `/apa-rigor` until File-Ready / File-With-Revisions, or surface the residual risk to the human.

### 8. Filing assembly (stops at the submit boundary)
- **Skill:** `/apa-assemble`
- **CLI (gate):** `node packages/apa-assemble/cli.mjs --matter <matter> --write`
- **Produces:** `<matter>/assembled/` — the 1.77 `specification.md` + print-CSS `specification.html`
  (print to PDF), `ADS.md`, `IDS_SB08.md`, an **UNSIGNED** `declaration_UNSIGNED.md`, a `FEE_WORKSHEET.md`
  (dated estimate), `PREFLIGHT.md`, and a frozen `upload_set/MANIFEST.txt`.
- **Gate:** the **pre-filing go/no-go**. It enforces the inventorship-integrity gate and the rigor
  verdict, blocks if any `ai-suggested` limitation remains, and exits **0 = GO (pending human review) /
  2 = NO-GO**. It then **STOPS at the submit boundary — it never signs, certifies, or files.** A human
  files via Patent Center.

### 9. (Optional) Office action — post-filing
- **Skill:** `/apa-office-action` (out of the core lifecycle; deeper UPL territory).
- **CLI:** `node packages/apa-prosecute/cli.mjs parse --oa <file>` ;
  `node packages/apa-prosecute/cli.mjs deadlines --oa <file>` (or `--mailed <YYYY-MM-DD>`) ;
  `node packages/apa-prosecute/cli.mjs respond --matter <matter> --oa <file> --write`.
- **Produces:** a parsed rejection map, an **estimated** 37 CFR 1.136(a) response period, and a response
  **scaffold** under `<matter>/prosecution/response-NN.md`.
- **Gate:** everything is a flag/estimate to verify; deadlines are **not authoritative**; a registered
  practitioner argues and files — **APA never files.**

---

*Rules and fee amounts are dated (e.g. `docs/fee-schedule.2026-06-15.json`) — verify currency. See
`docs/legal-guardrails.md` and `DESIGN.md`.*
