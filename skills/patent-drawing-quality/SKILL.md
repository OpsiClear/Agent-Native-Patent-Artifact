---
name: patent-drawing-quality
description: "Review utility-patent drawings for professional draftsperson quality and USPTO formal-risk precheck: line art, margins, FIG labels, sheet numbering, text/reference-numeral size, lead lines, crowding, claim/spec feature coverage under 37 CFR 1.83, and HTML/SVG/PDF rendering choices. Use when asked whether drawings look professional, filing-polished, or ready for patent filing. Invoke as /apa-drawing-quality."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/patent-drawing-quality/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# patent-drawing-quality (`/apa-drawing-quality`)

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
Reviews utility-patent drawings as a pre-filing quality gate. It produces flags, not a legal
certification. Keep three verdicts separate:
- **Professional appearance:** whether the sheets look like conventional patent draftsperson work.
- **Substantive coverage:** whether the drawings show claimed/spec features and reference numerals.
- **Formal-risk precheck:** whether obvious 37 CFR 1.83/1.84 risks are visible before human review.

Final compliance remains with the applicant, registered practitioner, and often a professional
draftsperson. Do not say "USPTO compliant" unless a human has verified the final filed sheets.

### Drawings (37 CFR 1.84 / 1.83) — formal pre-check (final compliance stays human/draftsperson)
- Black solid lines; numbered parts with lead lines; `FIG. N` labels; one representative figure.
- Reference characters >= 0.32 cm (1/8 in) high; **drawing-sheet** margins (top 2.5cm, left 2.5cm,
  right 1.5cm, bottom 1.0cm) — distinct from the 1.52 SPECIFICATION margins.
- Every claimed/spec numeral appears in >= 1 figure (1.83(a)) and vice versa; the Brief Description
  of the Drawings lists every figure. Color/photo drawings require a petition.

## Source rules to verify when currency matters
- USPTO Nonprovisional Utility Patent Application Filing Guide, Drawing Requirements.
- 37 CFR 1.83, Content of Drawing: drawings must show every feature specified in the claims, subject
  to the conventional-feature/labeled-representation rule.
- 37 CFR 1.84, Standards for Drawings: sheet size, margins, black line work, views, reference
  characters, lead lines, arrows, and color/photo petition constraints.
- MPEP 608.02 and form paragraphs 6.22/6.36: common objection patterns for missing details,
  duplicate/missing reference characters, inadequate quality, and drawing amendments.

## Inputs to inspect
1. Final assembled sheets: `assembled/drawings.pdf` and/or `assembled/drawings.html`.
2. Source figures: `evidence/drawings/*.svg` and `src/drawing_src/*`.
3. Drawing legend / brief description: generated figure descriptions and numeral table.
4. Claims and spec sections that introduce reference numerals or visually claim a feature.

Render the final sheet view before judging. Prefer PDF rendering if tools are available; otherwise
use browser screenshots of the assembled HTML at a tall viewport. Inspect both whole-sheet scale and
zoomed views.

If the matter uses APA figure JSON, run the deterministic SVG preflight first:
`node packages/apa-figure/cli.mjs review-dir <matter>/src/drawing_src --svg-dir <matter>/evidence/drawings --out <matter>/evidence/drawings/quality-review.json --min-score 88`.
Treat a clean preflight as a useful screen, not as final professional judgment.

## Review workflow
1. **Render and measure risk.** Check page size, margins, `FIG.` labels, sheet numbering, and whether
   text/reference numerals look at least 0.32 cm high on the final sheet. If not measured, say
   "visually small; not measured."
2. **Scan for professional appearance.** Look for black-and-white line art, consistent stroke weight,
   conventional fonts, aligned boxes, even spacing, no decorative color/gradients/shadows, no clipped
   elements, no labels touching borders, and no captions crowded into drawings.
3. **Check reference numerals.** Numerals should be plain, legible, consistently oriented, outside
   hatching/shading, not encircled or bracketed, not crossing/mingling with lines, and not reused for
   different parts. Lead lines should be short, clear, and non-crossing where practical.
4. **Check substantive coverage.** Spot-check claimed features against the drawings. Flag any claimed
   element that is absent, merely implied when it should be shown, or shown with a numeral not defined
   in the specification. Conventional features may be shown as labeled boxes when detail is not needed.
5. **Check figure discipline.** Each figure should have a `FIG. N` label, the brief description should
   match the figure content, only old/prior-art-only views should be marked "Prior Art", and no figure
   should include unsupported new matter.
6. **Classify issues.** Use:
   - `blocking`: likely to prevent examination/publication or create a serious 1.83/1.84 objection.
   - `fix-before-filing`: professional polish or legibility issue that should be corrected now.
   - `acceptable`: stylistic preference or low-risk issue.

## Professional-quality heuristics
- Use more white space than ordinary engineering diagrams; patent drawings should scan cleanly on a
  printed page.
- Prefer one clear concept per figure. Split a crowded system diagram instead of shrinking labels.
- Make flowchart steps wide enough for text without tiny type. Break long labels into two lines.
- Keep reference numerals near the indicated feature but not inside dense content.
- Put figure captions below the view with breathing room. Do not let enlarged callouts overlap or sit
  directly on the `FIG.` label.
- Avoid page titles inside the drawing unless they clarify the view. Formal sheets usually rely on
  `FIG. N` and the brief description, not decorative chart titles.
- Use fixed physical dimensions for sheet output; avoid responsive layout that changes figure scale.

## HTML, SVG, and PDF guidance
- Prefer **SVG as the canonical figure source** for utility drawings: deterministic vector geometry,
  stable text positions, precise strokes, and easy numeral reconciliation.
- HTML is useful as a **sheet compositor and review surface**: page layout, print CSS, multiple SVGs on
  sheets, and browser screenshots. It is not the best canonical source for individual drawings because
  fonts, wrapping, scaling, and page breaks can vary.
- For filing packages, export/print to **PDF** from the locked HTML/SVG layout and visually QA the
  resulting PDF. Use fixed `@page` size/margins, fixed font families, fixed SVG sizes, and no
  viewport-dependent CSS.
- If HTML is used, inline or embed the SVG drawings, do not recreate the drawings with flexible DOM
  layout. Treat HTML as packaging, not as the drawing language.

## Report format
Return:
1. `overall_verdict`: one of `professional-looking`, `draft-quality`, `not professional-looking`, or
   `cannot judge without rendered sheets`.
2. `filing_polish_verdict`: `ready for human final check`, `polish before filing`, or `redraw`.
3. `blocking_findings`: bullets with figure/sheet references.
4. `fix_before_filing`: prioritized polish and formal-risk issues.
5. `acceptable_as_is`: what is already good.
6. `html_svg_pdf_recommendation`: whether to keep SVG canonical, use HTML as compositor, or change
   export flow.

Also emit machine-readable findings when writing a report file:
```yaml
findings:
  - sheet: "SHEET 1"
    figure: "FIG. 1"
    bbox: null                 # or [x, y, width, height] when measured
    issue_type: "lead-line|margin|text-size|crowding|coverage|numeral|rendering|new-matter"
    severity: "blocking|fix-before-filing|acceptable"
    rule_reference: "37-cfr-1.84|37-cfr-1.83|mpep-608.02|apa-protocol"
    measured_or_visual: "measured|visual"
    message: "short finding"
    suggested_fix: "specific next action"
```
If text or numeral size is judged visually rather than measured on a rendered sheet, set
`measured_or_visual: visual` and say so in the message.

## Do NOT
- Certify formal USPTO compliance or legal sufficiency.
- Infer that clean line art means every claimed feature is shown.
- Shrink text to fit a crowded figure; split or enlarge instead.
- Add visual detail not grounded in the disclosure.
- Use color, photographs, gradients, shadows, or decorative styling without flagging petition/new-matter
  and publication risks. Rules as of 2026-06-15; verify currency.

