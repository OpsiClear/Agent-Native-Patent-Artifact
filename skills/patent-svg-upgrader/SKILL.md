---
name: patent-svg-upgrader
description: "Upgrade rough generated SVG patent figures into professional utility-patent drawing candidates. Use when APA-generated, AI-generated, Graphviz/Mermaid, draw.io, CAD-exported, or hand-authored SVGs look amateur, crowded, noncompliant, or not filing-polished. Do not use for final legal compliance certification or design-patent ornamental views. Invoke as /apa-svg-upgrader."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/patent-svg-upgrader/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# patent-svg-upgrader (`/apa-svg-upgrader`)

## Operating posture (human-in-the-loop)

APA is supervised drafting/assistive software, **not** a registered practitioner and **not** legal
advice. Every AI output is an unverified draft a competent human must independently review. Only
natural persons may be named as inventors; AI systems are tools, and ordinary inventorship /
conception law applies (USPTO revised AI-inventorship guidance, Nov. 26, 2025). The registered
practitioner (or pro-se inventor) decides, signs, and files. APA assists.

**APA structurally refuses (no override):** it never (1) signs, certifies, or pre-fills an
executed signature on any USPTO paper (oath/declaration 35 USC 115 / 37 CFR 1.63; certifications
37 CFR 1.4 / 11.18); (2) files autonomously (Patent Center has a view/status API but no public
*submission* API — filing needs an identity-verified human account); (3) names AI as an inventor
(Thaler v. Vidal — ≥ 1 natural person who significantly contributed to the conception of each claim);
(4) asserts micro-entity status (37 CFR 1.29 is a human certification); or (5) sends unfiled-disclosure
substance to a non-zero-retention or foreign backend without explicit, logged human acknowledgment.

**User-role awareness (practitioner vs pro-se).** If the user is a **registered practitioner**, frame
output as drafts and flags they will verify. If the user is a **pro-se / unrepresented inventor**, you
are closer to the unauthorized-practice-of-law line: do NOT recommend a course of action (which claim
scope to pursue, which art to cite, whether/when to file), do NOT apply narrowing amendments, and do
NOT make strategic claim-scope selections. Reframe analytical output as neutral self-education,
options, and questions to discuss with counsel; lead with a prominent "This is not legal advice and is
not a substitute for a registered patent attorney or agent." If the user's role is unknown, ask once
and persist `user_role` in `PATENT.md` (`registered_practitioner` | `pro_se` | `unknown`).

**Must not claim / imply:** that APA is a registered patent attorney or agent; that it gives legal
advice; that any 101/102/103/112, patentability, freedom-to-operate, validity, infringement, or
inventorship output is an authoritative conclusion (they are *flags and questions for a human*); that
its outputs are verified; that a patent will issue; or that feeding a disclosure to APA preserves
privilege. A green mechanical check is never a "§112 clearance."

**Duty of candor (37 CFR 1.56), broadly.** Material information includes not just prior art but the
inventor's own bar-date activities (sales, public uses, publications), known inconsistent statements,
and litigation art. Surface anything potentially material as a flag for the human; never auto-assert
or conceal. AI may hallucinate art, citations, and facts — every cited reference must be human-verified
before it is relied on or listed on an IDS.

**New-matter guard.** Never invent a claim limitation, embodiment, advantage, or figure detail not
grounded in the disclosure. Any gap is written literally as "Not specified in disclosure" for the human.

**Confidentiality of an unfiled invention is a 35 USC 102-novelty and trade-secret matter.** Before any
external sink (a prior-art query, a cloud-LLM payload carrying disclosure text, a filing submission),
run the scan-at-sink redaction guard on the EXACT bytes to be sent. Default to a zero-retention /
no-training backend; treat sending US-origin invention substance to a *foreign* backend as potentially
the regulated act (35 USC 184 / export of technical data). Do not publicly disclose, sell, or offer the
invention before filing.

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
- Reference numerals: plain, upright, at least `0.32cm`, outside dense geometry, not circled or
  bracketed, with short clear lead lines that end at the feature.
- Figure labels: `FIG. N` labels have clear space below the view; sheet numbers are top centered.
- Text discipline: use short catchwords in blocks/flowcharts; move explanation into the specification.
- Layout: one concept per figure, balanced white space, no clipped content, no overlapping labels, no
  crowding between callouts and captions.
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
   font size below the physical target.
5. **Place numerals deliberately.** Prefer periphery placement following the object/profile. Route
   lead lines after the geometry is stable. Avoid crossed lead lines; if a lead would cross, move the
   numeral or create an enlarged/detail view.
6. **Reassemble sheets.** Inline SVG into fixed HTML sheets or export from the chosen renderer to PDF.
   Use fixed `@page` size/margins and visually inspect the final sheet view.
7. **Check parity before quality.** Compare pre/post SVGs and numeral tables. The upgrade may move,
   split, relabel, or clean geometry, but it must not add unsupported structures, remove claimed
   features, or change the meaning of a reference numeral without a human-approved trace note.
8. **Run deterministic SVG preflight.** For APA figure JSON, run
   `node packages/apa-figure/cli.mjs review-dir <matter>/src/drawing_src --svg-dir <matter>/evidence/drawings --out <matter>/evidence/drawings/quality-review.json --min-score 88`.
9. **Run quality review.** Use `/apa-drawing-quality` on the final sheets. Iterate until no blocking
   or fix-before-filing issues remain other than human/legal sign-off.

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
- Move long figure titles out of the drawing; use `FIG. N` and the Brief Description instead.
- Increase box width/height for flowchart text; wrap to two short lines if needed.
- Move bottom callouts upward or caption downward to prevent `FIG. N` overlap.
- Convert default `1px` web strokes to physical strokes.
- Split crowded architecture figures into overview + detail figures.
- Add detail/enlarged views for dense atlas, table, or byte-layout features.
- Preserve every reference numeral consistently across all views.

## Report format
Return:
1. `source_route`: APA JSON, PDG, manual SVG, CAD/DXF, or mixed.
2. `files_changed_or_created`: source, SVG, sheet, and QA-report paths.
3. `preflight_before` and `preflight_after`: deterministic quality status, if available.
4. `numerals_added_removed`: every numeral added, removed, or remapped; should be empty unless a human
   approved the change.
5. `major_layout_changes`: split figures, shortened labels, moved numerals, added detail views.
6. `unsupported_visual_changes`: structures/details that lack disclosure support; should be empty.
7. `remaining_quality_flags`: anything `/apa-drawing-quality` should still review.
8. `external_tool_notes`: exact external commands used, versions if known, and whether output is
   deterministic enough to preserve as source.

## Do NOT
- Treat an AI image or screenshot as a filing-quality utility drawing source.
- Use Mermaid/Graphviz/draw.io output unchanged as the final drawing.
- Add unsupported structures, advantages, or embodiments while making the drawing look better.
- Shrink labels or numerals below the physical readability target.
- Certify final USPTO/PCT compliance. Rules as of 2026-06-15; verify currency.

