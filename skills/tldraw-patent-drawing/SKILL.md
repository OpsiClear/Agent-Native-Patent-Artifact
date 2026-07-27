---
name: tldraw-patent-drawing
description: "Prepare tldraw-based utility-patent drawing candidates for controlled review and SVG normalization. Use when comparing tldraw with APA JSON/SVG, importing hand-drawn layouts, or using tldraw as a manual patent figure sketch surface. Do not use for final legal compliance certification, unchecked raster screenshots, or canonical filing output without SVG/PDF preflight. Invoke as /apa-tldraw-drawings."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/tldraw-patent-drawing/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# tldraw-patent-drawing (`/apa-tldraw-drawings`)

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
Uses tldraw as an editable sketch and layout surface for utility-patent drawing candidates, then
routes the output through APA's deterministic SVG/PDF drawing review. This skill is for comparison,
manual drafting, collaboration, and rough-to-polished figure work. It is not the final filing renderer.

Use this decision rule:
- Use **APA JSON/SVG first** when coordinates, repeatability, automated regeneration, and audit trails
  matter most.
- Use **tldraw first** when a human needs to drag, sketch, annotate, or quickly compare alternate
  arrangements before converting to normalized SVG or APA JSON.
- Do not use tldraw screenshots as filing drawings. Export vector data, normalize it, and run
  `/apa-svg-upgrader` plus `/apa-drawing-quality`.

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

## tldraw constraints for patent work
- Treat the `.tldr`/snapshot JSON as an editable working artifact, not the filing source of record.
  Store snapshots under `evidence/drawings/tldraw/` with hashes and a short change note.
- Export only black-and-white vector drawings. Reject color, hand-style effects, rough strokes,
  shadows, embedded screenshots, and decorative fills before filing review.
- Require SVG export for every custom shape. In tldraw, shape export uses `toSvg` /
  `toBackgroundSvg`; unsupported custom shapes can fall back to `foreignObject`, which is risky for
  deterministic patent PDFs. Normalize or replace those shapes before assembly.
- Preserve fonts and text deterministically. If tldraw text export depends on font definitions, embed
  or convert text in the normalization step and verify the rendered PDF.
- Preserve reference numerals as explicit text objects and keep a numeral map. Do not rely on group
  names, layer names, or informal annotations as reference characters.
- Keep tldraw collaboration/local persistence out of confidential external sinks unless scan-at-sink
  and human approval are satisfied. Prefer local snapshots over hosted/shared boards for unfiled
  invention material.

## Workflow
1. **Decide whether tldraw is appropriate.** Use it for manual layout exploration, alternative
   figure composition, inventor markups, or diagrams that are difficult to position directly in APA
   JSON. Stay with APA JSON when the desired drawing is already deterministic and simple.
2. **Create or import the working board.** Use a local tldraw project or snapshot. Save the snapshot
   JSON under `evidence/drawings/tldraw/figNN.tldr.json` or an equivalent matter-local path.
3. **Apply patent drawing discipline inside tldraw.** Use black lines, plain text, no freehand
   decoration, no colors, no screenshots, consistent symbols, and reference numerals with leader
   lines. Keep one concept per figure.
4. **Export vector output.** Export to SVG, not PNG. If the SVG contains `foreignObject`, raster
   images, filters, color, or unsupported fonts, treat it as rough input only.
5. **Normalize the output.** Convert the tldraw SVG into APA JSON or cleaned SVG. Remove
   non-patent styling, reroute leaders/connectors, fix text placement, and preserve every numeral.
6. **Run the normal drawing gates.** Run `/apa-svg-upgrader`, deterministic `review-dir` preflight,
   drawing-sheet HTML/PDF render, `sheet-review`, and `/apa-drawing-quality`. Iterate until there are
   no blocking or fix-before-filing visual issues.
7. **Write a comparison note.** Record whether tldraw improved speed, clarity, or collaboration, and
   whether it introduced export cleanup costs. Keep this note beside the drawing evidence.

## Comparison rubric
Use this rubric when deciding whether to keep tldraw in the workflow:

| Criterion | APA JSON/SVG | tldraw |
|---|---|---|
| Deterministic regeneration | Strong; source coordinates render predictably | Weaker unless snapshots and export settings are controlled |
| Manual layout speed | Slower for free-form exploration | Strong for drag-and-drop sketching and inventor markups |
| Patent-style normalization | Strong after renderer rules and review gates | Requires cleanup after export |
| Collaboration | Repo-based review and diffs | Strong if using shared/local tldraw workflows, but confidentiality risk rises |
| Auditability | Strong JSON/SVG diffs | Good only when snapshot JSON and exported SVG are both preserved |
| Filing-output confidence | Preferred path | Accept only after SVG normalization and PDF visual QA |

Default recommendation: use tldraw as a **front-end sketch layer**, not as the canonical filing
renderer, unless the exported SVG passes the same preflight and visual review as APA-generated SVG.

## Quick Start
No package download is required to review an existing local snapshot and SVG export. From the APA
repository root, place both artifacts under the matter and run the deterministic gates:

```bash
export APA_MATTER=/absolute/path/to/matter
mkdir -p "$APA_MATTER/evidence/drawings/tldraw/export"
# Save the local snapshot as "$APA_MATTER/evidence/drawings/tldraw/fig01.snapshot.json"
# Export vector SVG as "$APA_MATTER/evidence/drawings/tldraw/export/fig01.svg"
node packages/apa-figure/cli.mjs sheet-review "$APA_MATTER/evidence/drawings/tldraw/export" --out "$APA_MATTER/evidence/drawings/tldraw/sheet-review.json"
node packages/apa-figure/cli.mjs sheet-html "$APA_MATTER/evidence/drawings/tldraw/export" --out "$APA_MATTER/evidence/drawings/tldraw/drawings.html"
node packages/apa-figure/cli.mjs legend --matter "$APA_MATTER"
```

The committed synthetic pair under `fixtures/` proves the acceptance boundary: the passive export
preserves its two reference numerals, while a `foreignObject` fallback is rejected. It is a gate
fixture, not a representation that every future native `.tldr` schema version is supported.

If creating or converting a board requires an npm package, select an exact reviewed version first.
Preview the command through the safe npx sink; do not pass matter contents as command arguments:

```bash
node packages/apa-safe/cli.mjs npx <tldraw-tool>@<exact-version> --dry-run --matter "$APA_MATTER" -- --help
```

Remove `--dry-run` only after reviewing the pinned package and command. `apa-safe-npx` scans and
hashes the exact package/argument payload and records the sink in the matter runlog; it does not make
hosted collaboration safe for confidential disclosure.

## Review checklist
- Does the tldraw snapshot have a matching exported SVG and hash?
- Does the SVG avoid `foreignObject`, bitmap images, color, shadows, filters, and responsive layout?
- Are reference numerals plain text, visible at reduced scale, and mapped to specification features?
- Are leaders and flow arrows visually distinct, non-crossing where practical, and clear at reduced
  drawing-sheet scale?
- Does the normalized output preserve every tldraw-intended feature without adding new matter?
- Does the final PDF render match the normalized SVG, not merely the tldraw editor view?

## Report format
Write a short comparison report under `evidence/drawings/tldraw/tldraw_comparison.md`:

```markdown
# tldraw Drawing Comparison

Source snapshot: `...`
Exported SVG: `...`
Normalized output: `...`

Verdict: keep tldraw as sketch layer | use APA JSON directly | redraw manually

Benefits observed:
- ...

Cleanup costs / risks:
- ...

Gate results:
- svg-upgrader: ...
- drawing-quality: ...
- PDF visual QA: ...
```

## Do NOT
- Treat tldraw collaboration, screenshots, or editor appearance as filing-ready evidence.
- Use hosted/shared boards for confidential unfiled matter without scan-at-sink and human approval.
- Preserve `foreignObject`, HTML-based shapes, color, rough freehand strokes, or bitmap screenshots in
  final drawing sheets.
- Replace source-parity review; tldraw can make a drawing look cleaner while accidentally changing
  what is shown.
- Certify formal USPTO/PCT compliance. Rules as of 2026-06-15; verify currency.
