---
name: patentability-analysis
description: "Build element-by-element claim charts mapping prior-art references to claim limitations and flag 101/102/103/112 issues as questions for a registered practitioner - never a conclusion. Includes an interview-driven statutory-bar screen and a 112(f) screen. Invoke as /apa-analyze."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/patentability-analysis/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# patentability-analysis (`/apa-analyze`)

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
Maps each prior-art `PA##` to each `CLM##.LIM##` (element-by-element claim charts) and writes
`logic/patentability.md` as **flags and questions for a registered practitioner**. It renders NO
patentability, novelty, non-obviousness, FTO, validity, or infringement conclusion. File-I/O only.
If `confidential_workflow_mode: counsel_controlled`, keep the analysis inside counsel-controlled
systems. If `shareable_redacted`, do not treat `logic/patentability_report.json` as shareable until
the redaction guard and a human reviewer approve it.

## Procedure
1. **Claim chart.** For each independent claim, build a table: rows = limitations (`LIM##`), columns =
   the closest `PA##` references (use `logic/reference_matrix.md` if present). Each cell must carry
   `appears_teaches: yes|partial|no|unknown`, a short quote or "not located", page/paragraph/location,
   confidence, and `human_verified`. Mark teaching as an observation to verify, not a finding.
2. **102 (anticipation):** flag any single reference that appears to teach ALL limitations of a claim.
3. **102 statutory bars (interview-driven, NOT search):** screen the disclosure's captured bar-date
   events (on-sale, public use, the inventor's own publication/demo) against the effective filing date
   and the one-year grace window. These are not found by a database search - surface as flags for the human.
4. **103 (obviousness):** for plausible combinations, name the KSR rationale and prompt for the Graham
   factors; capture inventor-supplied secondary considerations (commercial success, long-felt need,
   unexpected results) as rebuttal in a `secondary_considerations` note.
5. **112:** (a) confirm each limitation has a resolving `supported_by` SPEC (the validator does the
   mechanical part; sufficiency is a human flag); (b) flag terms of degree lacking an objective bound;
   (f) flag any nonce/`means-for` limitation and check corresponding structure is disclosed.
6. **101:** Alice/Mayo abstract-idea screen - flag risk and whether the claim recites concrete structure.
7. Write findings with `questions_for_attorney` / `questions_for_inventor` arrays. Surface contradictions
   (a reference that undermines a staged novelty claim) rather than resolving them.
8. Emit `logic/patentability_report.json` using the shared report envelope
   (`schema: apa-patentability-report-v1`, `legal_posture: flags-not-conclusions`). Include
   quote-backed `claim_charts`, statutory flags, human checkpoints, and `search_completeness:
   not_asserted`. Validate it with
   `node packages/apa-reports/cli.mjs check <matter>/logic/patentability_report.json --kind patentability`.
   In `shareable_redacted` mode, the upload/shareable manifest excludes this report by default.

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
- Render any conclusion (patentable / novel / non-obvious / clear / valid). Output is flags + questions.
- Assert a search was complete or "no anticipating art found." Rules as of 2026-06-15.

