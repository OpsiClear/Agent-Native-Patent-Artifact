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
- Reference characters must not cross, touch, or mingle with drawing lines. Lead lines should be
  short, clear, and non-crossing; use straight or a single shallow curved leader where practical,
  not decorative wave/squiggle leaders. Arrows and flow connectors should not run through text,
  labels, or reference numerals.
- Drawings should remain suitable for reproduction: at whole-sheet and reduced scale, lines, labels,
  numerals, and claimed features must still be clear enough to understand without blur or ambiguity.
- Arrange views in a logical order, generally from high-level context to detail. Multiple views on a
  sheet should not overlap and should share a consistent orientation unless a rotated view is needed
  and clearly labeled.
- Maintain proportionality and consistency across figures: the same feature should keep the same
  reference character, visual identity, and relative relationship wherever it appears.
- Choose the view type that best explains the invention: perspective/overview, plan/elevation,
  section, exploded/detail, graph, schematic, or flowchart. Use consistent flowchart symbols and
  line conventions, and use hidden, projection, center, cutting-plane, or shading lines only when
  they clarify supported subject matter.
- Professional exemplar benchmark: use established patent-illustration samples only as style
  references, never copied art. Look for perimeter reference numerals, single-purpose straight or
  gently curved leaders, consistent line-weight hierarchy, generous white space, and FIG captions
  that do not compete with the view.
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
zoomed views. Also inspect a reduced/contact-sheet view because drawings that look acceptable at full
zoom may fail reproduction or examiner-readability expectations when reduced.

If the matter uses APA figure JSON, run the deterministic SVG preflight first:
`node packages/apa-figure/cli.mjs review-dir <matter>/src/drawing_src --svg-dir <matter>/evidence/drawings --out <matter>/evidence/drawings/quality-review.json --min-score 88`.
When the task is filing polish, a user reports overlap, or drawings will be exported publicly, raise
the threshold to `--min-score 95` and require zero `blocking` and zero `fix-before-filing` findings
before moving to visual review.
Treat a clean preflight as a useful screen, not as final professional judgment. The deterministic
report contains a flattened `findings` list, per-figure `reviews[*].findings`, and a
`measurement_summary`; preserve those fields if you add human visual findings.

Also run the sheet-composition preflight on the actual sheet mode being reviewed:
`node packages/apa-figure/cli.mjs sheet-review <matter>/evidence/drawings --compact --out <matter>/evidence/drawings/sheet-review.json --min-utilization 0.55 --max-font-ratio 1.12 --max-global-font-ratio 1.12 --min-text-pt 9.1`.
If the report flags `PAGE_COUNT_INFLATED_BY_SHORT_VIEWS`, `COMPACT_SHEET_RECOMMENDED`, or
`UNDERUSED_SHEET_AFTER_COMPACT`, treat it as a filing-polish issue even when the SVG preflight is
otherwise clean. If it flags `COMPACT_TEXT_SIZE_MISMATCH`, do not accept the combined sheet: use a
common physical scale for stacked figures, normalize source font sizes, or split the views.
If it flags `GLOBAL_TEXT_SIZE_MISMATCH` or `TEXT_BELOW_MINIMUM_PHYSICAL_SIZE`, normalize source
typography/style scale or re-layout the affected figures before PDF export.

When exporting sheet HTML with headless Chrome, suppress browser print furniture. Prefer
`--no-pdf-header-footer` and reject any rendered PDF that shows a date/time, document title, file URL,
or browser-generated page counter in the margins. Those artifacts are not drawing content and can make
otherwise consistent sheets look mis-scaled or unprofessional.

## Review workflow
1. **Render and measure risk.** Check page size, margins, `FIG.` labels, sheet numbering, and whether
   text/reference numerals look at least 0.32 cm high on the final sheet. If not measured, say
   "visually small; not measured." Confirm that the final PDF is regenerated from the latest SVG/HTML
   sources and has no browser headers or footers.
2. **Check reproduction readability.** Inspect the full page, contact sheet, and a zoomed crop. At
   reduced scale, the invention path, reference numerals, `FIG.` labels, leaders, arrowheads, and
   essential features should still be readable without relying on color or verbal explanation.
3. **Check composition, not just collisions.** Flag drawings that have a small island of content on a
   mostly blank sheet, excessive unused vertical space caused by a wide aspect ratio, or a page count
   inflated by one small view per sheet. Use `sheet-review` to measure this, then prefer compact
   multi-figure sheets, a taller re-layout, or a split overview/detail pair over simply accepting a
   sparse page. If compacting two views creates different apparent font size, cramped labels, or
   connector ambiguity, treat the sparse source aspect ratio as the problem and re-layout it instead
   of keeping both figures on one sheet.
4. **Check compact-sheet consistency.** Multiple figures may share a drawing sheet when they are
   separated, upright, and readable, but compacting must not create mixed-scale drawings. When
   multiple figures share one sheet, verify that their
   effective physical text size and line scale match. A compact sheet with one figure visibly larger
   or smaller than its neighbor is a polish defect even if both figures are individually readable.
   Prefer uniform SVG-unit-to-inch scaling; split the sheet if uniform scaling makes one view too
   small, visually cramped, or dependent on narrow label padding.
5. **Check cross-sheet typography.** Compare pages as a set. FIG labels, reference numerals, block
   labels, line weights, and arrowheads should stay within a narrow physical-size range across all
   sheets, not just within each sheet. Treat inconsistent page-to-page font scale as
   fix-before-filing, especially when a wide overview is scaled down much more than process/detail
   figures.
   In the rendered PDF/contact sheet, compare non-white drawing envelopes and margins across pages;
   a page whose drawing margins or content scale visibly differ from the rest of the set is a
   composition defect even when individual font sizes measure consistently.
6. **Scan for professional appearance.** Look for black-and-white line art, consistent stroke weight,
   conventional fonts, aligned boxes, even spacing, no decorative color/gradients/shadows, no clipped
   elements, no labels touching borders, and no captions crowded into drawings.
7. **Check all line/text clearances.** At whole-sheet and zoomed scale, verify that arrows, box
   borders, leader lines, and route bends do not cross, touch, or run underneath block labels,
   reference numerals, arrow labels, captions, or other text. Prefer orthogonal rerouting, moving
   callouts, or splitting a crowded figure over shrinking text.
   Also check internal text padding: block labels should not touch or nearly touch their containing
   borders. If a label fits only because the renderer barely avoids clipping, enlarge the part,
   shorten/re-wrap the text, or give the figure its own sheet. Watch hyphenated or compound labels in
   narrow boxes because deterministic wrapping may keep a long token on one line; prefer spaced
   catchwords or a wider box when that preserves meaning.
8. **Check reference numerals.** Numerals should be plain, legible, consistently oriented, outside
   hatching/shading, not encircled or bracketed, not crossing/mingling with lines, and not reused for
   different parts. Lead lines should be short, clear, and non-crossing where practical. A controlled
   shallow curved leader is preferred for ordinary reference-numeral callouts because it reads more
   like conventional draftsperson work than a rigid software-diagram line. Decorative wave/squiggle
   leaders are not. For APA JSON sources, leave `leadStyle` unset/`auto` unless visual review requires
   an explicit `straight` override or a `curved` override.
9. **Check view selection and sequencing.** Confirm the drawing set proceeds logically from overview
   to detail where possible, uses the right kind of view for the feature being explained, and does not
   leave a crucial relationship to inference when a schematic/detail/section-style view would clarify
   it. For flowcharts and schematics, confirm similar blocks use a consistent visual language.
10. **Check substantive coverage.** Spot-check claimed features against the drawings. Flag any claimed
   element that is absent, merely implied when it should be shown, or shown with a numeral not defined
   in the specification. Conventional features may be shown as labeled boxes when detail is not needed.
11. **Check figure discipline.** Each figure should have a `FIG. N` label, the brief description should
   match the figure content, only old/prior-art-only views should be marked "Prior Art", and no figure
   should include unsupported new matter.
12. **Classify issues.** Use:
   - `blocking`: likely to prevent examination/publication or create a serious 1.83/1.84 objection.
   - `fix-before-filing`: professional polish or legibility issue that should be corrected now.
   - `acceptable`: stylistic preference or low-risk issue.

## Iterative visual improvement loop
When asked to improve drawings, use this loop rather than a one-pass impression:
1. Render final PDF/HTML sheets and a contact sheet.
2. Mark concrete visual defects by figure and feature: reduced-scale unreadability, ambiguity,
   omitted essential detail, inconsistent symbols, wasted sheet area, one-small-view-per-sheet layout,
   crossed leaders, text collisions, or unsupported visual matter.
3. Apply the smallest source-level fix that preserves numeral/source parity, such as rerouting a line,
   moving a numeral, shortening a label, enlarging/rebalancing a sparse view, or splitting a crowded
   view.
4. Re-render the exact filing artifact and compare before/after at full page, reduced/contact-sheet,
   and zoomed crop scales.
5. Repeat until deterministic preflight is clean and visual review has no `blocking` or
   `fix-before-filing` issues other than human/legal sign-off.

## Professional-quality heuristics
- Use more white space than ordinary engineering diagrams; patent drawings should scan cleanly on a
  printed page.
- Use enough of the usable sheet area for each view that labels, numerals, and essential structures
  remain clear after reduction. If a wide diagram wastes vertical space, consider a taller arrangement
  before increasing font size or adding explanatory text.
- For generated SVG sets, prefer compact sheet assembly when two or more short views can share a sheet
  without crowding. In APA tooling, use `sheet-html --compact` and then `sheet-review --compact` for
  filing-polish review before falling back to one figure per sheet.
- Compact sheets must use a common physical scale for stacked views unless a human deliberately
  approves different scales. Different apparent font sizes between views on the same sheet are a
  fix-before-filing defect.
- Do not compact merely to reduce page count. If one of the views contains dense labels, reference
  numerals near borders, ambiguous connectors, or boxes with less than comfortable internal padding,
  split the views or re-layout the crowded view before compacting.
- One figure per sheet is professionally acceptable when the view needs that scale for clear labels,
  leaders, or connector routing. Do not force FIG. 1 and FIG. 2 onto the same sheet merely because
  formal rules permit multiple figures per page.
- Across the full drawing set, rendered text should meet the physical-size target and should not jump
  materially from page to page. Prefer source-level typography scaling or re-layout over accepting a
  wide figure with tiny text.
- During PDF QA, inspect or compute non-white content bounds for each page. Flag page-scale outliers
  where the left/right margins or content envelope differ materially from neighboring sheets,
  especially when the outlier page also contains cramped text boxes.
- Calibrate against professional patent-illustration galleries only as visual references; do not copy,
  trace, embed, or reproduce third-party drawings. Extract conventions such as peripheral numerals,
  gently curved leaders, clean line-weight hierarchy, and sparse page composition.
- Prefer one clear concept per figure. Split a crowded system diagram instead of shrinking labels.
- Arrange the drawing set to tell a visual story: overview/context first, then process, container,
  decoding, and detail views. Avoid duplicate figures unless each view resolves a distinct ambiguity.
- Make flowchart steps wide enough for text without tiny type. Break long labels into two lines.
- Keep reference numerals near the indicated feature but not inside dense content.
- Use one shallow curved leader line for ordinary reference numerals. In APA JSON, rely on the default
  `leadStyle: "auto"` behavior first; set `leadStyle: "straight"` only when a curve causes ambiguity,
  crowding, or a formal-looking defect. Avoid ornamental wavy leaders; if curvature makes a leader
  look decorative, reduce the curvature, make it straight, or move the numeral.
- Prefer one leader per numeral that visually terminates at the indicated edge or surface. If a leader
  could be mistaken for a flow arrow, move the numeral or reroute the flow connector.
- Prefer short, unlabeled flow arrows. If an arrow label is needed, place it with clear perpendicular
  spacing or an explicit label coordinate; never leave the label sitting on the arrow stroke.
- Route connectors horizontally/vertically around boxes and callouts. Avoid diagonal arrows in crowded
  software/block diagrams unless they remain visibly clear of every label and numeral.
- Put figure captions below the view with breathing room. Do not let enlarged callouts overlap or sit
  directly on the `FIG.` label.
- Reserve a caption clearance zone in the source figure. If the lowest box, numeral, leader, or arrow
  sits close to the caption, move the view upward, increase source height while preserving physical
  text size, or split the view before PDF export.
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
  viewport-dependent CSS. When using headless Chrome, use `--no-pdf-header-footer`; if the rendered
  PDF contains a date, title, file path/URL, or browser page count in the margins, re-export before
  judging drawing scale or filing polish.
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
measurement_summary:
  measured: 0
  visual: 0
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
