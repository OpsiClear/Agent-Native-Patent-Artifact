<!-- AUTO-GENERATED for host 'claude' from skills/autoprep/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->

# Drawing Standards

Generated formal-risk reference. Final 37 CFR 1.83/1.84 compliance remains a human/draftsperson responsibility.

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

## Drawing QA Expectations

- Keep reference numerals, lead lines, figure captions, and text legible after PDF export.
- Preserve numeral parity when upgrading SVGs; visual cleanup must not add unsupported matter.
- Run `node packages/apa-figure/cli.mjs review-dir <matter>/src/drawing_src --svg-dir <matter>/evidence/drawings --out <matter>/evidence/drawings/quality-review.json --min-score 88` before assembly review.
- For generated SVG sets, compose drawing-sheet HTML with `sheet-html --compact` when short views can share a page without crowding, then run `sheet-review --compact` to check page utilization, compact-sheet scale consistency, global text-size consistency, and minimum rendered text size.
- Do not accept compact sheets that create mixed-scale views, cramped labels, narrow label padding, numerals touching borders, or arrows/lead lines crossing text.
- When printing HTML sheets to PDF with headless Chrome, suppress browser print furniture. Reject PDF exports that include browser print headers or footers such as dates, document titles,
  file URLs, or browser-generated page counters; re-export with header/footer suppression before judging final scale.
- Route rough, imported, or AI-generated SVGs through `/apa-svg-upgrader` before final drawing-quality review, and preserve numeral parity and supported visual structure in the upgrade report.
- Treat tldraw snapshots as editable sketch/import artifacts only. Export vector SVG, normalize it, run SVG upgrade/parity checks, then run drawing-quality and sheet-review before filing-polish review.
