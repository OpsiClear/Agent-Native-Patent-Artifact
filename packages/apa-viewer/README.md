# apa-viewer

A static, dependency-light viewer that renders an **Agent-Native Patent Artifact (APA)** matter as a
**claims-first, cross-linked document**. It has two halves:

1. **`build_manifest.mjs`** — a zero-dependency Node (ESM) builder that walks a matter directory and
   emits `manifest.json` exactly per [`docs/protocol.md` §4](../../docs/protocol.md).
2. **`index.html` + `viewer.js` + `style.css`** — a vanilla-browser reader (no framework, no bundler)
   that loads `manifest.json` and renders claims, their limitations, and the typed edges between
   claims, specification support, drawings, prior art, defined terms, the prosecution trace, and
   inventors.

The build step is the only thing that needs the repo (it reuses the shared parser at
[`lib/apa-parse.mjs`](../../lib/apa-parse.mjs)). Once `manifest.json` exists, **the viewer plus that
one JSON file are fully self-contained and embeddable** — drop the four static files and a
`manifest.json` anywhere served over `http://` and it renders.

## What it shows

- **Header band** — matter title, `application_type`, `status`, `rules_effective_date`, and a
  provenance summary (inventor / attorney / ai-suggested / ai-executed / human-revised counts).
- **Persistent disclaimer** — *“Draft artifact - not legal advice; for review by a registered
  practitioner.”*
- **Claims first, always visible** — each claim card headlines its id, short title, and a provenance
  chip. Click **limitations (n)** to lazily expand the claim's `LIM##` limitations inline.
- **Read-only review checklist** - panels summarize unadopted limitations, unverified prior-art/IDS
  references, unresolved support edges, and drawing-quality state from `manifest.review`.
- **Typed-edge chip groups** — each limitation/claim shows its edges grouped by kind (`supported by
  (§112)`, `illustrated by`, `antecedent basis`, `depends on`, `distinguished over`, `scope set at`,
  `conceived by`, …). Clicking a chip expands the linked node inline and flashes its canonical card.
- **Unresolved-edge warnings** (the headline feature — see below).
- **Search** (filter cards by id or text), a **TOC with scroll-spy** down the left, and
  **expand-all / collapse-all**.
- **Graceful fatal errors** — a missing or invalid `manifest.json` shows an inline error with the fix,
  never a blank page.

## The deliberate divergence from ARA: unresolved edges are never dropped

The sister tool `ara-viewer` **silently drops** any edge whose endpoint node does not exist. **apa
does the opposite — on purpose.** This is the §112-support / unsupported-edge warning surface and it
is the most important safety feature here, so it lives in **both** `build_manifest.mjs` *and*
`viewer.js`:

- **Builder:** every edge is emitted. The builder computes `"resolved": <bool>` by checking whether
  the target id exists among the manifest's nodes. An edge to a missing target is emitted with
  `"resolved": false` — it is **never** dropped.
- **Viewer:** a `resolved: false` edge renders as a **visible amber warning badge**, never hidden:
  - `supported_by` → `⚠ unsupported §112 support edge - target SPEC#### missing`
  - any other kind → `⚠ unresolved <kind> → <target>`
  - the hero band also shows a banner counting all unresolved edges, which scrolls to the first one.

A dropped edge is invisible; a missing written-description support link is exactly the kind of gap a
practitioner must see. So apa surfaces it loudly instead.

## Build a manifest

From this package directory:

```sh
node build_manifest.mjs <matter-dir>                 # prints manifest.json to stdout
node build_manifest.mjs <matter-dir> > manifest.json # redirect to a file
node build_manifest.mjs <matter-dir> --out manifest.json
```

Example (against the bundled worked example):

```sh
node build_manifest.mjs ../../examples/minimal-patent-artifact --out ../../examples/minimal-patent-artifact/manifest.json
```

The builder reads, per [`docs/protocol.md` §3](../../docs/protocol.md):

| Source | Node kind(s) | Edges emitted |
|---|---|---|
| `PATENT.md` frontmatter | `inventor`, plus `meta` | `contributed_to` (from `inventorship_matrix`) |
| `logic/claims.md` | `claim`, `claim-limitation` | `depends_on`, `distinguished_over`, `scope_set_at`, `supported_by`, `illustrated_by`, `practiced_by`, `antecedent_of` |
| `logic/concepts.md` | `defined-term` | — |
| `logic/prior_art.md` | `prior-art-reference` | — |
| `src/embodiments.md` | `spec-paragraph` | — |
| `evidence/drawings/*.md` | `drawing-figure`, `reference-numeral` | `practiced_by` (numeral → its defining SPEC) |
| `trace/prosecution.yaml` | `prosecution-node` | — |

Edge `from` endpoints that originate inside a claim are written in the qualified form `CLM01.LIM02`
for legibility; the limitation **node** id is the bare `LIM02`. Edge **targets** are always bare node
ids (`SPEC0004`, `FIG01#14`, `CLM01`, `PA01`, `PH01`, …).

## Open the viewer

Browsers block `fetch()` on `file://`, so serve the repo over `http://`, e.g.:

```sh
# any static server rooted at the repo works; e.g. a one-liner Node server, or:
npx --yes http-server -p 8000 .
```

Then open one of:

```
http://localhost:8000/packages/apa-viewer/                                   # loads sibling manifest.json
http://localhost:8000/packages/apa-viewer/?manifest=../../examples/minimal-patent-artifact/manifest.json
```

The `?manifest=` query param points at any `manifest.json` (path relative to `index.html`). With no
param, the viewer fetches a sibling `manifest.json`.

## Test

```sh
node --test
```

The suite (`test/build_manifest.test.mjs`) runs the builder on the bundled example and asserts the
canonical nodes/edges, then synthesizes a temp fixture with a dangling `supported_by: [SPEC9999]` and
asserts that edge is **emitted with `resolved: false`** (not dropped).

## Files

- `build_manifest.mjs` — manifest builder (Node ESM, zero deps, reuses `../../lib/apa-parse.mjs`)
- `index.html` — viewer shell
- `viewer.js` — claims-first reader (vanilla, zero deps)
- `style.css` — dark theme
- `test/build_manifest.test.mjs` — `node:test` suite
