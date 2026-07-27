---
name: patent-svg-upgrader
description: "Upgrade rough generated SVG patent figures into professional utility-patent drawing candidates. Use when APA-generated, AI-generated, Graphviz/Mermaid, draw.io, CAD-exported, or hand-authored SVGs look amateur, crowded, noncompliant, or not filing-polished. Do not use for final legal compliance certification or design-patent ornamental views. Invoke as /apa-svg-upgrader."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/patent-svg-upgrader/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# patent-svg-upgrader (`/apa-svg-upgrader`)

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
Turns rough vector figures into professional utility-patent drawing candidates. It is the generation
and normalization companion to `/apa-drawing-quality`, which is the review gate. Use this skill when
the current SVGs are black-and-white but still look like ordinary software diagrams rather than
patent draftsperson drawings.

This skill does not certify 37 CFR 1.84 compliance. It produces improved source figures, rendered
sheets, and a QA report for human/draftsperson review.

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

## Source selection
Choose one canonical source and preserve it:
- **APA figure JSON** (`src/drawing_src/figNN.json`) for figures already in an APA matter.
- **PatentDSL / `.pdg`** for new block diagrams, flowcharts, sequence diagrams, and state diagrams
  where automatic patent-style layout is useful. The public `@shibayama/pdgkit` package can validate
  and render `.pdg` to SVG/PDF; use it as an optional external generator, not as an unreviewed black box.
  If installed through `npx`, use `apa-safe-npx` / `node packages/apa-safe/cli.mjs npx` with a pinned
  exact version and record the package/version in the report. Unpinned network execution requires
  `--allow-unpinned --yes` and must appear in the runlog.
- **Manual SVG** only when starting from an existing high-value drawing that must be normalized.
- **CAD/DXF-derived source** only for mechanical/device embodiments where geometry matters.

Avoid Mermaid, raw Graphviz, or draw.io exports as final canonical source. They are acceptable as
draft or layout-oracle inputs, but final SVG must be normalized and reviewed.

## Professional SVG target
Produce SVGs and sheets with these properties:
- Physical page model: Letter or A4, fixed drawing margins, no responsive layout.
- Black/white only: no color, gradients, shadows, filters, screenshots, or decorative fills.
- Stroke hierarchy: about `0.4mm` primary strokes and about `0.2mm` lead/hatching strokes.
- Reproduction target: line work, numerals, labels, arrowheads, and essential relationships remain
  legible at full sheet, contact-sheet/reduced scale, and zoomed crop review.
- Professional exemplar calibration: use professional patent-illustration galleries as visual style
  references only, not copied assets. Target their sparse composition, perimeter numerals, clean leader
  paths, and consistent line hierarchy.
- Reference numerals: plain, upright, at least `0.32cm`, outside dense geometry, not circled or
  bracketed, with short clear controlled shallow curved lead lines that end at the feature; use
  straight leaders only when curvature creates ambiguity or crowding.
- Figure labels: `FIG. N` labels have clear space below the view; sheet numbers are top centered.
- Text discipline: use short catchwords in blocks/flowcharts; move explanation into the specification.
- Multi-view sheet discipline: when two or more SVG figures share one sheet, use a common physical
  SVG-unit-to-inch scale or normalize source font sizes so labels and reference numerals have the same
  apparent size across views. Do not combine views when one view needs enlargement to avoid cramped
  labels, border contact, caption crowding, or ambiguous connector routing. One figure per sheet is
  preferable to a compact sheet that looks mixed-scale or cramped.
- Drawing-set typography discipline: normalize source typography/style scale so rendered text and
  line weight stay consistent from page to page and text remains above the physical-size target after
  PDF export. Also compare rendered page content envelopes; a page with materially different margins
  or drawing scale should be re-laid out before filing-polish review.
- Connector discipline: arrows, leader lines, route bends, and box borders do not cross, touch, or
  run underneath text, arrow labels, reference numerals, or captions. Use explicit orthogonal routes
  and label coordinates when automatic routing produces overlaps.
- Layout: one concept per figure, balanced white space, no clipped content, no overlapping labels, no
  crowding between callouts and captions. Avoid a small island of drawing content on an otherwise
  blank sheet; use compact multi-figure sheets, a taller layout, or split/detail views to improve
  professional composition. When compacting would place unrelated figures together at visibly
  different scale, use a taller source layout or separate sheets instead.
- View discipline: use the view type that explains the feature with the least ambiguity, and arrange
  the set logically from overview/context to process, container, decoding, or detail views. Keep
  repeated parts visually consistent across figures.
- Source parity: every shown numeral is transcribed in `evidence/drawings/*.md` and grounded to SPEC.

## Workflow
1. **Inventory the current state.** Read `assembled/drawings.html`/`.pdf`, `evidence/drawings/*.svg`,
   `src/drawing_src/*`, and drawing numeral markdown. Note which figures are merely rough.
2. **Pick the upgrade route.**
   - For APA JSON figures, revise the JSON coordinates/labels and re-render with `apa-figure`.
   - For new diagrammatic figures, consider `.pdg` via `pdgkit`: run pinned commands through
     `node packages/apa-safe/cli.mjs npx @shibayama/pdgkit@<version> -- ...`, write a `.pdg`, validate, render, then
     import the resulting SVG and numeral table into APA.
   - For existing SVGs, normalize the SVG directly only when source JSON/PDG is unavailable.
3. **Normalize style.** Remove color, gradients, shadows, filters, images, foreignObject, frames,
   title blocks, and non-patent styling. Use fixed fonts, fixed physical sizes, and consistent strokes.
4. **Re-layout rather than shrink.** If text or numerals are too small, split the figure, enlarge the
   drawing, shorten labels, or move detail into a separate figure. Do not solve crowding by reducing
   font size below the physical target. If a sparse wide diagram wastes vertical sheet area, re-lay it
   into a taller flow or schematic before adding explanatory text. If the lowest drawing element is
   close to the `FIG.` caption, add source-height/caption clearance or move the element upward while
   preserving the rendered physical text size.
5. **Place numerals deliberately.** Prefer periphery placement following the object/profile. Route
   lead lines after the geometry is stable. Use a controlled shallow curved leader for ordinary
   reference-numeral callouts; use a straight leader only when curvature creates ambiguity, crowding,
   or a formal-looking defect. Avoid decorative wave/squiggle leaders. In APA JSON, keep `leadStyle`
   unset/`auto` by default; set `straight` or `curved` only after visual review shows the default is
   not clear. Avoid crossed lead lines; if a lead would cross, move the numeral or create an
   enlarged/detail view.
6. **Route connectors after text is placed.** For flowcharts and software block diagrams, prefer
   short unlabeled arrows and orthogonal paths that stay outside label and numeral boxes. If an arrow
   label is necessary, place it off the stroke with a manual coordinate or perpendicular offset, then
   rerun preflight.
7. **Reassemble sheets.** Inline SVG into fixed HTML sheets or export from the chosen renderer to PDF.
   Use fixed `@page` size/margins and visually inspect the final sheet view. For APA-generated SVG
   sets, use `sheet-html --compact` for filing-polish drafts when it lets short figures share a sheet
   without crowding, then run `sheet-review --compact` to catch one-small-view-per-page and
   underused-sheet layouts before PDF export. Include `--max-global-font-ratio 1.12 --min-text-pt 9.1`
   for filing-polish work. If compacted figures have visibly different text size, force a common
   physical scale or split them; do not keep a mixed-scale compact sheet. If different pages have
   visibly different text size, normalize `styleScale`/source typography or re-layout the small-text
   figure. When printing HTML to PDF with headless Chrome, use `--no-pdf-header-footer` and reject
   outputs that show browser-generated dates, titles, file URLs, or page counters in the margins.
   If compacting exposes narrow internal label padding, numerals sitting on container borders, or
   connectors that visually merge with a boundary, split the figures or re-layout the crowded source.
8. **Check parity before quality.** Compare pre/post SVGs and numeral tables. The upgrade may move,
   split, relabel, or clean geometry, but it must not add unsupported structures, remove claimed
   features, or change the meaning of a reference numeral without a human-approved trace note.
9. **Write the upgrade report.** Preserve the pre-upgrade SVGs in a separate directory and run:
   `node packages/apa-figure/cli.mjs upgrade-report --before-dir <matter>/evidence/drawings-before-upgrade --after-dir <matter>/evidence/drawings --source-dir <matter>/src/drawing_src --source-route <APA JSON|PDG|manual-svg|CAD/DXF|mixed> --out <matter>/evidence/drawings/svg_upgrade_report.json`.
   The report schema is `apa-svg-upgrade-report-v1`. It must list every changed SVG, preflight
   before/after, numeral additions/removals/remaps, unsupported visual changes, human-review flags,
   and external tool notes. A nonzero exit means the upgrade is not ready for drawing-quality review.
10. **Run deterministic SVG preflight.** For APA figure JSON, run
   `node packages/apa-figure/cli.mjs review-dir <matter>/src/drawing_src --svg-dir <matter>/evidence/drawings --out <matter>/evidence/drawings/quality-review.json --min-score 88`.
   Use `--min-score 95` for filing-polish work and continue until the report shows zero
   `fix-before-filing` findings.
11. **Run quality review.** Use `/apa-drawing-quality` on the final sheets. Iterate until no blocking
   or fix-before-filing issues remain other than human/legal sign-off.

## Visual iteration checklist
After each source edit, inspect the rendered full page, contact sheet, and one zoomed crop per changed
figure. Continue iterating when any answer is "no":
- Is the purpose of the figure clear without relying on color, screenshots, or prose-heavy labels?
- Are every necessary arrow, leader, and connection visible, non-crossing where practical, and clear
  about whether it is a flow connector or a reference leader?
- Are labels, numerals, and arrowheads still readable in the reduced/contact-sheet view?
- Are similar process blocks, rows, or features drawn with consistent proportions and symbols across
  figures?
- Does the figure use enough of the usable sheet area without crowding the caption or margins?
- If a figure is short or wide, would compact sheet assembly or a taller source layout make the sheet
  look more like a professional drawing set?
- Does `sheet-review --compact` report zero sheet-composition findings, or is there a deliberate
  reason to accept the remaining empty space?
- On any compact sheet, do FIG labels, block labels, reference numerals, line weights, and arrows look
  like the same drawing scale across all views?
- Across all sheets, do FIG labels, block labels, reference numerals, line weights, and arrowheads
  remain in the same apparent size band?
- Do rendered page content bounds/margins look consistent across the drawing set, or is one page a
  clear composition outlier?
- Did the edit preserve every existing reference numeral and avoid adding unsupported visual matter?

## When using pdgkit / PatentDSL
Use this route for block diagrams, flowcharts, sequence diagrams, and state diagrams when APA's current
box/ellipse renderer is too crude.

Recommended commands (pin the exact version used in real work):
```sh
node packages/apa-safe/cli.mjs npx @shibayama/pdgkit@<version> -- guide
node packages/apa-safe/cli.mjs npx @shibayama/pdgkit@<version> -- validate fig01.pdg
node packages/apa-safe/cli.mjs npx @shibayama/pdgkit@<version> -- render fig01.pdg -o fig01.svg
```

Keep the `.pdg` beside the APA source, for example `src/drawing_src/fig01.pdg`, and preserve any
rendered SVG under `evidence/drawings/`. Do not rely on the rendered SVG alone; the editable source is
what makes future amendments auditable.

## Common fixes
- Replace verbose block labels with short nouns/verbs and put detail in the spec.
- Replace hyphenated or compound labels in narrow boxes with spaced catchwords, wider boxes, or
  deliberate two-line labels so text has visible padding from borders.
- Move long figure titles out of the drawing; use `FIG. N` and the Brief Description instead.
- Increase box width/height for flowchart text; wrap to two short lines if needed.
- Move bottom callouts upward or caption downward to prevent `FIG. N` overlap.
- Reserve a clear source-level caption zone; do not let output boxes, numerals, leaders, or arrowheads
  sit near the bottom caption merely because deterministic collision checks pass.
- Replace rigid software-diagram leaders or decorative wavy leaders with controlled shallow curved
  patent-style leaders. In APA JSON, prefer the default `leadStyle: "auto"` policy and use explicit
  `straight`/`curved` overrides only for reviewed exceptions.
- Separate flow connectors from reference leaders; if a flow arrow can be read as a numeral leader,
  reroute one of them or move the numeral.
- Move arrow labels off the arrow stroke using perpendicular offsets or explicit `labelX`/`labelY`
  coordinates; for APA JSON figures, use routed `points` to keep connectors out of label and numeral
  boxes.
- Replace diagonal crossing connectors with orthogonal route points when software/block diagrams get
  crowded.
- Re-layout sparse wide flowcharts into taller arrangements when that improves reduced-scale
  readability and sheet balance without changing the disclosed relationships.
- Use compact sheet assembly for multiple short views and require a clean `sheet-review --compact`
  report before accepting a one-small-figure-per-page output.
- Do not combine views on one sheet if they render with different apparent font sizes. Normalize
  source font sizes, use the common compact-sheet scale, or separate the views.
- Do not combine views on one sheet if either view has labels squeezed against borders or reference
  numerals sitting on container outlines. Page reduction is secondary to clear drafting.
- Do not accept a drawing set where one page has visibly smaller text than the other pages. Use
  source-level typography/style scaling or a less-wide layout so the final PDF has consistent
  physical text size.
- Do not accept Chrome/HTML PDF exports that include browser headers or footers. Re-export with
  `--no-pdf-header-footer`, then rerender the contact sheet before judging scale.
- Convert default `1px` web strokes to physical strokes.
- Split crowded architecture figures into overview + detail figures.
- Add detail/enlarged views for dense atlas, table, or byte-layout features.
- Preserve every reference numeral consistently across all views.

## Report format
Write `evidence/drawings/svg_upgrade_report.json` with
`node packages/apa-figure/cli.mjs upgrade-report`. The report must include:
1. `source_route`: APA JSON, PDG, manual SVG, CAD/DXF, or mixed.
2. `files_changed_or_created`: source, SVG, hashes, and changed flags.
3. `preflight_before` and `preflight_after`: deterministic quality status, if source JSON exists.
4. `numerals_added_removed`: every numeral added, removed, or remapped; must be empty to proceed.
5. `unsupported_visual_changes`: semantic structures/details that lack drawing-spec support; must be
   empty to proceed.
6. `human_review_required` and `ready_for_drawing_quality`: machine gate for the next skill.
7. `external_tool_notes`: exact external commands used, versions if known, and whether output is
   deterministic enough to preserve as source.

## Do NOT
- Treat an AI image or screenshot as a filing-quality utility drawing source.
- Use Mermaid/Graphviz/draw.io output unchanged as the final drawing.
- Add unsupported structures, advantages, or embodiments while making the drawing look better.
- Shrink labels or numerals below the physical readability target.
- Certify final USPTO/PCT compliance. Rules as of 2026-06-15; verify currency.
