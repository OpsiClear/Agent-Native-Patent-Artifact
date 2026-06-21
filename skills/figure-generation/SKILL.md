---
name: figure-generation
description: "Author and render numbered patent figures for a matter from its method claims and embodiments, then reconcile every reference numeral against the spec. Renders deterministic B&W SVG line-art (numbered parts, lead lines, arrows). Invoke as /apa-figures."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/figure-generation/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# figure-generation (`/apa-figures`)

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
Turns the embodiments and method claims into numbered figures: you author a figure-definition JSON, the
`apa-figure` tool renders deterministic black-and-white SVG line-art, and the numerals are reconciled
against the spec. Final 37 CFR 1.84 compliance (and any formal raster/PDF conversion) stays
human-verified, often by a professional draftsperson.

## Procedure
1. **Author a figure definition** at `src/drawing_src/<figN>.json` from the claims/embodiments:
   ```json
   { "fig":"FIG01", "title":"Sectional view", "representative":true,
     "parts":[ {"numeral":"10","label":"reservoir","shape":"box","x":60,"y":80,"w":200,"h":140} ],
     "arrows":[ {"from":"12","to":"14","kind":"flow"}, {"self":"14","kind":"loop"} ] }
   ```
   Method claims become flowcharts (one box per step, flow arrows); apparatus claims become structural
   views. Use a numeral for every claimed element; never invent a part not in the disclosure. Each
   visual part must either carry source/support metadata (`source`, `source_span`, `source_sha256`,
   `defined_in`, or `supported_by`) or match a transcribed drawing numeral with `defined_in: SPEC####`.
2. **Transcribe** the numerals into `evidence/drawings/<figN>.md` (the protocol `numerals` binding:
   each `{numeral, element, defined_in: SPEC####}`); exactly one figure is `representative: true`.
3. **Generate the first-pass report before rendering SVGs:**
   `node packages/apa-figure/cli.mjs generation-report --matter <matter> --source-dir <matter>/src/drawing_src --out <matter>/evidence/drawings/figure_generation_report.json`.
   Stop on a nonzero exit. Fix any `unsupported_visual_change_risks`, `removed_numerals`, or
   untraceable generated numerals before rendering.
4. **Render:** `node packages/apa-figure/cli.mjs render-dir <matter>/src/drawing_src --out-dir <matter>/evidence/drawings`.
5. **Reconcile:** `node packages/apa-figure/cli.mjs legend --matter <matter>` - it builds the numeral
   legend + the Brief Description of the Drawings and flags any numeral with no `defined_in` SPEC. Then
   `node packages/apa-validate/validate.mjs <matter>` confirms every numeral resolves both ways.
6. **Preflight rendered SVG quality:** `node packages/apa-figure/cli.mjs review-dir <matter>/src/drawing_src --svg-dir <matter>/evidence/drawings --out <matter>/evidence/drawings/quality-review.json --min-score 88`.
7. **Polish rough SVGs before filing.** The renderer is deterministic but intentionally simple. If a
   figure looks crowded, web-diagram-like, or not draftsperson quality, route it through
   `/apa-svg-upgrader` and then `/apa-drawing-quality` before relying on it in assembly.

### Drawings (37 CFR 1.84 / 1.83) — formal pre-check (final compliance stays human/draftsperson)
- Black solid lines; numbered parts with lead lines; `FIG. N` labels; one representative figure.
- Reference characters >= 0.32 cm (1/8 in) high; **drawing-sheet** margins (top 2.5cm, left 2.5cm,
  right 1.5cm, bottom 1.0cm) — distinct from the 1.52 SPECIFICATION margins.
- Every claimed/spec numeral appears in >= 1 figure (1.83(a)) and vice versa; the Brief Description
  of the Drawings lists every figure. Color/photo drawings require a petition.

## Do NOT
- Invent a reference numeral or part not present in the disclosure/claims.
- Claim 1.84 compliance is met - the tool does a pre-check; a human verifies formal compliance.
- Use color/photographs without noting they require a petition. Rules as of 2026-06-15.
