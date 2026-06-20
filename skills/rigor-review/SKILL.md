---
name: rigor-review
description: "Audit a matter's epistemic rigor across six patent dimensions (101 eligibility, 112 WD/enablement/definiteness, antecedent basis, claim-spec-drawing support, prior-art distinction, prosecution integrity) and emit patent_rigor_report.json with a deterministic File-Ready..Do-Not-File verdict. Read-only, artifact-only, report-only. Invoke as /apa-rigor."
allowed-tools: Read, Glob, Grep, Bash, Write
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/rigor-review/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# rigor-review (`/apa-rigor`)

## Operating Posture
- APA is supervised drafting software, not a registered practitioner and not legal advice.
- A competent human must independently review every output; flags are not patentability, FTO, validity, infringement, or 112 conclusions.
- Only natural persons may be named as inventors; AI systems are tools and are never inventor names.
- APA never signs, certifies, asserts micro-entity status, or files; Patent Center submission remains a human act.
- For pro-se users, provide neutral education, options, and questions only; do not choose claim scope, filing timing, art to cite, or amendments.
- Before any external egress, use scan-at-sink on the exact bytes and block HIGH findings.

### Safety References
| Reference | Load when |
|---|---|
| [Legal guardrails](references/legal-guardrails.md) | Need detailed no-legal-advice, inventorship, pro-se, candor, or submit-boundary rules. |
| [USPTO rule pack](references/uspto-rule-pack.md) | Need claim form, 101/102/103/112, IDS, or dated USPTO rule anchors. |
| [Confidentiality sinks](references/confidentiality-sinks.md) | Any content may leave the local machine, including prior-art queries, cloud LLMs, fetches, npx, or filing exports. |
| [Drawing standards](references/drawing-standards.md) | Creating, upgrading, reviewing, exporting, or assembling patent drawings. |
| [Source registry](references/source-registry.md) | Prior-art search needs canonical source IDs, access modes, or human-verification requirements. |

## What this does
ARA Seal **Level 2**: a SEMANTIC audit that assumes Level 1 (mechanical, `apa-validate`) passed. It is
**read-only and artifact-only** (no fetch, no edits) and **report-only** - it scores, flags, and
recommends; it does not apply fixes (that is `/apa-examiner`). It scores six dimensions 1-5 against
anchors and emits `patent_rigor_report.json`; the **verdict is computed deterministically** (not chosen).

## Procedure
1. **Level-1 gate:** `node packages/apa-validate/validate.mjs <matter>` must have no errors. If it does,
   stop and report - Level 2 assumes Level 1 is clean.
2. **Scaffold:** `node packages/apa-rigor/cli.mjs scaffold --matter <matter> --out <matter>/patent_rigor_report.json`.
   This pre-fills the mechanical dimensions (P3 antecedent basis, P4 support/numeral) from the validator.
3. **Score the judgment dimensions** by reading the artifact and reasoning against the anchors:
   - **P1 101 Eligibility** - Alice/Mayo: abstract idea vs. concrete structure / practical application.
   - **P2 112 WD/Enablement/Definiteness** - is every limitation described and enabled? terms of degree bounded? 112(f) structure present?
   - **P5 Prior-art Distinction** - is every `distinguished_over` reference substantively distinguished, or does one anticipate? The report's `prior_art_state` must show a current search dossier and human-verified closest-art selection; stale or unverified prior art deterministically caps P5.
   - **P6 Prosecution Integrity** - is the decision record honest? does any claim re-argue a recorded `dead_end` (estoppel)?
   Confirm or adjust the mechanical P3/P4 with reasoning. Score each 1-5; a single weak dimension caps the verdict.
4. **Findings:** for each issue add `{ dimension, severity (critical|major|minor|suggestion), evidence_span (VERBATIM quote from the artifact), weakness, amendment (a concrete suggested fix) }`. Severity maps to statutory fatality (critical = 102/101/missing antecedent; major = 103/enablement; minor = definiteness; suggestion = scope).
5. Fill `questions_for_inventor` / `questions_for_attorney` and `read_order` (the files you reviewed).
6. **Compute + validate:** `node packages/apa-rigor/cli.mjs check <matter>/patent_rigor_report.json`.
   It schema-validates and computes the legacy internal verdict: **File-Ready / File-With-Revisions /
   Major-Rework / Do-Not-File / Incomplete**, plus a safer display alias such as
   `Artifact-Quality: High For Human Final Review`. The LLM never sets the verdict; any dimension
   scoring 1 caps at Do-Not-File, a 2 caps at Major-Rework, and stale or unverified prior-art state caps
   P5 to 2.
   The filing gate (`/apa-assemble`) reads this verdict and blocks unless File-Ready/File-With-Revisions.

### 101/102/103/112 — analysis as FLAGS + QUESTIONS for a human (never conclusions)
- **101 (eligibility):** Alice/Mayo two-step. Flag abstract-idea risk; check the claim recites a
  practical application / concrete structure. Do not opine on eligibility.
- **102 (novelty):** element-by-element — anticipation = every limitation in ONE reference. Each
  prior-art chart cell must be quote-backed with page/paragraph/location and human-verification state.
  ALSO run a statutory-bar screen from the INTERVIEW (on-sale, public use, the inventor's own disclosure, with
  dates vs the effective filing date and the one-year grace window) — these are not found by search.
- **103 (obviousness):** apply the Graham factors and name the relevant KSR rationale (MPEP 2143 A-G):
  (A) combine prior-art elements by known methods for predictable results; (B) simple substitution of one
  known element for another; (C) use a known technique to improve a similar device the same way; (D) apply
  a known technique to a known device ready for improvement; (E) obvious-to-try among a finite set of
  predictable solutions; (F) design incentives / market forces prompting a known variation; (G) teaching,
  suggestion, or motivation (TSM). Capture secondary considerations (commercial success, long-felt need,
  unexpected results) from the inventor as rebuttal.
- **112:** (a) written description / enablement — each limitation traced to spec support; (b)
  definiteness — terms of degree need an objective bound; (f) means-plus-function structure.
- Output is flags and `questions_for_attorney` / `questions_for_inventor`, never an opinion or FTO/
  validity/infringement conclusion.

## Do NOT
- Render any conclusion (patentable / valid / clear). Every finding is a flag/question; a verdict is a
  drafting-quality recommendation, not a legal opinion or §112 clearance.
- Edit the artifact (use `/apa-examiner` to drive fixes). Choose the verdict by hand - it is computed.
- Fetch external material directly. If a current external reference must be inspected, run
  `/apa-priorart` or `node packages/apa-safe/cli.mjs fetch <url> --matter <matter> --out <path>` so
  sink scanning, untrusted-content wrapping, and runlog hashing are preserved.
- Rules as of 2026-06-15; verify currency. For a fresh external 102/103 sweep against the
  current claims, run `/apa-priorart` (fetch-enabled) separately - this internal audit does not fetch.

