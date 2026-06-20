---
name: specification-drafting
description: "Draft the 37 CFR 1.77 specification sections for a matter from its embodiments and claims, keeping reference numerals and defined terms consistent, grounding every statement in the disclosure, and scoring against the writing rubric. Invoke as /apa-spec."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/specification-drafting/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# specification-drafting (`/apa-spec`)

## Operating Posture
- APA is supervised drafting software, not a registered practitioner and not legal advice.
- A competent human must independently review every output; flags are not patentability, FTO, validity, infringement, or 112 conclusions.
- Only natural persons may be named as inventors; AI systems are tools and are never inventor names.
- APA never signs, certifies, asserts micro-entity status, or files; Patent Center submission remains a human act.
- For pro-se users, provide neutral education, options, and questions only; do not choose claim scope, filing timing, art to cite, or amendments.
- Do not add new matter: unsupported limitations, embodiments, advantages, or figure details stay marked as gaps.
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
Generates the specification text from `src/embodiments.md` (`SPEC####` support paragraphs) and the
claims, in 37 CFR 1.77 order, with numeral and lexicographic consistency. Every limitation in a claim
must trace to a `SPEC####` paragraph (the `supported_by` binding) - that is the §112 spine.

## Sections (37 CFR 1.77 order; include conditionally-present ones only when warranted)
1. Title of the invention (matches `PATENT.md`, <=500 chars)
2. Cross-reference to related applications (if any benefit/priority claim)
3. Statement re: federally sponsored research (if any)
4. Field of the invention
5. Background (neutral - state the problem; do NOT disparage prior art or over-admit)
6. Brief summary
7. Brief description of the drawings (one line per figure; must list EVERY figure)
8. Detailed description (definitions -> system overview -> worked examples -> additional embodiments;
   every reference numeral introduced here and shown in a figure)
9. Abstract (<=150 words)

## Procedure
1. For each claim limitation, ensure a `SPEC####` paragraph teaches and enables it; add/extend paragraphs
   in `src/embodiments.md` with `grounding: transcribed` (inventor-sourced) or `reconstructed`
   (drafted from figures), and `defines_numerals` for any numbered element. Preserve source-span
   metadata where available (`source`, `source_span`, `speaker`, `timestamp`, `source_sha256`) so a
   reviewer can trace each paragraph to inventor disclosure, figure reconstruction, attorney authorship,
   or human adoption.
2. **Grounding discipline / new-matter guard:** never state a limitation, advantage, or figure detail
   not grounded in the disclosure. Write any gap literally as **"Not specified in disclosure"** for the
   human - do not fill it.
3. Keep numerals and defined terms consistent with `evidence/drawings/*` and `logic/concepts.md`.
4. **Specification report.** Emit `src/specification_report.json` using the shared report schema
   (`schema: apa-specification-report-v1`, `legal_posture: flags-not-conclusions`). Record each
   conditionally-present 37 CFR 1.77 section in `conditional_sections` as `supported`,
   `not_applicable`, `unsupported`, or `human_reviewed`; record each drafted/adopted `SPEC####`
   paragraph in `spec_paragraphs` with grounding and source-span metadata; and record unsupported
   domains such as ST.26 sequence listings in `unsupported_domains` instead of drafting around them.
   Then run
   `node packages/apa-reports/cli.mjs check <matter>/src/specification_report.json --kind specification`.
5. Validate: `node packages/apa-validate/validate.mjs <matter>` (numeral definedness, support edges,
   term bounds). Resolve or flag warnings; do not assert §112 sufficiency - that is the human's call.

### Specification quality rubric (100 points; optimize to a MIN-score floor, not just the mean)
Score the drafted spec on five dimensions; a single weak dimension caps quality (a low floor is a
rework signal, mirroring the rigor reviewer's per-dimension floor).

| Pts | Dimension | What it rewards |
|---|---|---|
| 30 | Form & filing style (37 CFR 1.77/1.52) | correct section order; numbered `[0001]` paragraphs; neutral, non-argumentative voice; consistent terminology |
| 25 | Written description & enablement (112(a); MPEP 2163/2164) | every claim limitation taught and enabled; concrete worked examples; structures named, not just functions |
| 20 | Definiteness (112(b); MPEP 2173.05) | terms of degree given objective bounds; lexicography for coined terms; no purely functional limitations without structure |
| 15 | Figure integration & reference numerals | every numeral introduced in the spec and shown in a figure; consistent numbering; Brief Description lists every figure |
| 10 | Neutral background | states the problem without disparaging prior art or admitting more than necessary |

Iterate draft -> score -> revise the lowest dimension until the floor clears the target (e.g. 95).
Log iterations if you autotune (iteration / min_score / avg_score / kept|discarded / change).

## Do NOT
- Invent subject matter (new matter is fatal). Disparage prior art. Claim the spec "enables" anything -
  the validator proves the support EDGE resolves; enablement sufficiency is a human/LLM-judge flag.
- Rules as of 2026-06-15; verify currency.

