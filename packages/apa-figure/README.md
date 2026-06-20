# apa-figure

Zero-dependency **SVG patent-figure generator** + **reference-numeral legend builder** for the
Agent-Native-Patent-Artifact (APA) project. Plain ESM, Node `>=18`, **no npm dependencies** (SVG is
just text — no graphics library is needed).

This is a Node/SVG reimplementation of the g2tree ReportLab figure primitives referenced in
`DESIGN.md` §11.3 (box with a numbered part + lead line, flow arrow with a computed arrowhead,
self/loop feedback arrow, FIG caption). The machine running this has **no Python and no Bun**, so the
ReportLab path is reimplemented in plain Node.

> **SVG is a review / drafting format.** It is ideal for reviewing layout, numeral placement, and
> arrows during drafting. **Filing-ready 37 CFR 1.84 black-and-white raster/PDF conversion is a later
> phase** (a draftsperson typically finalizes formal drawings). The SVG output is already
> black-stroke / white-fill with no color, so it is a faithful preview of the eventual B&W line-art.

---

## What it does

1. **`render.mjs`** — `renderFigure(figDef) -> string` turns a figure DSL (JSON) into a self-contained
   SVG document.
2. **`numerals.mjs`** — `buildLegend(matterDir) -> { entries, briefDescription, flags }` reads every
   `evidence/drawings/*.md` in a matter (via the **shared** parser `../../lib/apa-parse.mjs`) and
   builds a consolidated numeral legend, a Brief Description of the Drawings list, and drafting-time
   flags that mirror the validator's numeral checks.
3. **`quality.mjs`** — deterministic SVG/spec quality preflight for black/white styling, forbidden
   SVG constructs, numerals, lead lines, crowding, caption clearance, and long labels.
4. **`cli.mjs`** — `render`, `render-dir`, `review-dir`, and `legend` subcommands.

---

## The figure DSL

```jsonc
{
  "fig": "FIG01",                 // figure id; the caption ordinal is derived: FIG01 -> "FIG. 1"
  "title": "Sectional view",      // optional small title at the top
  "representative": true,         // marks the front-page representative view (annotates the caption)
  "width": 800,                   // viewBox width  (default 800)
  "height": 600,                  // viewBox height (default 600; letter-ish aspect via the viewBox)

  "parts": [
    {
      "numeral": "10",            // the reference numeral (rendered as text + a lead line)
      "label": "reservoir",       // part label, drawn inside the shape
      "shape": "box",             // "box" (default) | "ellipse"
      "x": 60, "y": 80,           // top-left of the part's bounding box
      "w": 200, "h": 140          // width / height
    }
  ],

  "arrows": [
    { "from": "12", "to": "14", "kind": "flow", "label": "rises" },  // flow arrow between part centers
    { "self": "14",             "kind": "loop", "label": "closes" }  // self/loop feedback arrow
  ]
}
```

- **Flow arrow**: `{ from, to, kind: "flow", label? }` — drawn between the two parts' centers, clipped
  to each part's edge, ending in a triangular arrowhead.
- **Loop / self arrow**: `{ self, kind: "loop", label? }` (or `kind: "loop"` with `from`) — a curved
  feedback path that leaves and returns to the same part.

Arrows reference parts by their `numeral`. Unknown numerals are skipped.

### Render rules (37 CFR 1.84-flavored)

- **Black strokes, white fills, NO color** — the only `stroke`/`fill` values emitted are `black`,
  `white`, `none`, and `url(#…)` (the arrowhead marker). No hex, no `rgb()`, no named colors.
- Each part is drawn as its **shape** (`<rect>` for a box, `<ellipse>` for an ellipse).
- Each **reference numeral** is rendered as text placed outside the shape (pushed away from the figure
  center) with a thin **lead line** running from the numeral to the part edge.
- **Flow arrows** run between part centers with a triangular **arrowhead** via a shared SVG
  `<marker>`/`<polygon>`.
- A **self/loop arrow** is a curved cubic `<path>` returning to the same part (a feedback loop).
- A **`FIG. N` caption** is centered at the bottom; `N` is derived from the fig id (`FIG01` -> `FIG. 1`).
- An optional small **title** is centered at the top.
- **Deterministic**: all ids are derived from the fig id + numeral (no random ids, no timestamps); the
  same input produces byte-identical output.

---

## Usage

### Render a figure to SVG

```sh
# print SVG to stdout
node cli.mjs render fixture.json

# write to a file (progress goes to stderr; stdout stays clean)
node cli.mjs render fixture.json --out fig01.svg

# render a directory of JSON figure definitions
node cli.mjs render-dir src/drawing_src --out-dir evidence/drawings

# run the deterministic drawing-quality preflight on rendered SVGs
node cli.mjs review-dir src/drawing_src --svg-dir evidence/drawings --out drawing-review.json --min-score 88
```

As a library:

```js
import { renderFigure } from "apa-figure";        // or "./render.mjs"
const svg = renderFigure({ fig: "FIG01", parts: [/* ... */], arrows: [/* ... */] });
```

### Build the numeral legend for a matter

```sh
node cli.mjs legend --matter ../../examples/minimal-patent-artifact
node cli.mjs legend --matter <dir> --json
```

Example (human) output for the bundled minimal matter:

```
Brief Description of the Drawings
  FIG. 1 - Sectional view

Numeral legend
  FIG. 1  10  reservoir  [SPEC0002]
  FIG. 1  12  float      [SPEC0003]
  FIG. 1  14  valve      [SPEC0004]
  FIG. 1  16  wick       [SPEC0005]

Flags: none
```

As a library:

```js
import { buildLegend } from "apa-figure/numerals";
const { entries, briefDescription, flags } = buildLegend(matterDir);
```

#### Flags (drafting-time mirror of the validator)

- **`NUMERAL_UNDEFINED`** — a numeral whose `defined_in` (the defining SPEC paragraph) is empty or
  missing. Mirrors the validator's "numeral defined in a `FIG##` whose `defined_in` SPEC does not
  exist" check at drafting time.
- **`NUMERAL_INCONSISTENT`** — the same numeral appears in more than one figure mapping to a
  *different* element (inconsistent numbering across drawings).

These are **drafting aids**. The authoritative numeral check is `packages/apa-validate`.

### Exit codes (CLI)

| Code | Meaning |
|---|---|
| `0` | ok (render succeeded; or legend with no flags) |
| `1` | legend flags exist, or a usage / IO / parse error |

---

## Protocol binding

A figure's numeral transcription lives in `evidence/drawings/<figN>.md` as a `FIG##` section whose
`binding` block carries `representative` and `numerals: [{ numeral, element, defined_in }]` (see
`docs/protocol.md` §3). `buildLegend` reads exactly those blocks via the shared parser
`../../lib/apa-parse.mjs` (`extractBindingBlocks`, `iterEntitySections`) — it does **not** ship its own
parser, so it never diverges from the validator and viewer.

---

## Tests

```sh
node --test
```

Covers: `renderFigure` output (FIG caption, every numeral, an arrowhead `<marker>`/`<polygon>`,
`stroke="black"`/`fill="white"` with no color, determinism); `buildLegend` on the example matter (the
four numerals, a FIG. 1 brief line, no flags); and synthesized drawings producing
`NUMERAL_UNDEFINED` and `NUMERAL_INCONSISTENT` flags. The `examples/drawing-quality-gallery/`
fixture exercises eight drawing classes and must pass the deterministic quality review.
