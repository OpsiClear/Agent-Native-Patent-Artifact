# apa-search — prior-art search (Phase 2)

API-first prior-art search for a Patent Artifact. Builds a query from a matter's claims, **scans it at
the sink** (confidentiality) before egress, queries sanctioned patent and non-patent metadata sources,
dedupes + ranks, and files the landscape as `PA##` blocks + raw evidence records + a reproducible
search dossier + a reference-matrix scaffold. Node >= 21, ESM, zero dependencies. Fetched text is
wrapped in an untrusted-content envelope before any LLM sees it.

> **Not a clearance.** Candidates are UNVERIFIED and structurally incomplete (examiner-grade USPTO PPS
> is UI-only; NPL is paywalled). A human verifies each reference and selects the closest art. The tool
> never asserts "no anticipating art found." See `../../docs/legal-guardrails.md`.

## Why API-first (and not a browser daemon)

`DESIGN.md` §4.1 calls for an `apa-browse` Playwright daemon, but it also says **API-backed sources are
preferred and UI scraping is off by default**. This phase implements the API path (zero-deps Node
`fetch`); source calls use timeout and response-size guards. The Playwright daemon is deferred — it is
only needed for UI-only sources, which are **human-handoff** anyway.

## Sources & access modes

`node cli.mjs --list-sources`. Each source declares an access mode:
- **api** - `patentsview` (PatentsView PatentSearch API; free key), `crossref` (NPL metadata), `arxiv` (preprint metadata), `openalex` (broad scholarly/NPL metadata), `mock` (offline demos/tests), `fixture` (offline benchmark corpus); `pqai`, `epo-ops` (planned).
- **dataset** — `google-bigquery` (the sanctioned, free Google path; planned).
- **ui-restricted** — `uspto-pps` (examiner-grade, UI-only → human-handoff), `google-patents-ui` (disabled; UI scraping violates Google ToS). Never auto-scraped.

## Usage

```bash
# offline dry run (no network, no key):
node cli.mjs --query "self-watering planter float valve" --source mock

# real USPTO search from a matter's claims (needs a free key):
export PATENTSVIEW_API_KEY=...        # see ../../docs/source-registry.md
node cli.mjs --matter <matter> --source patentsview            # preview ranked candidates
node cli.mjs --matter <matter> --source patentsview --write    # also file PA## + evidence + reference_matrix

# broad serious-search mode: fan out claim-derived query variants across patent + NPL metadata sources
node cli.mjs --matter <matter> --source patentsview,crossref,arxiv,openalex --broad --write

# include citation/family candidates when a source or imported fixture provides them
node cli.mjs --matter <matter> --source patentsview --broad --citation-expand --write

# mark the human closest-art selection after review
node cli.mjs verify-closest-art --dossier <matter>/evidence/prior_art/search-dossier-....json \
  --pa PA02 --rationale "closest art after human review" --reviewer "<name>" \
  --title-verified --venue-verified --canonical-link-verified --relied-on-passage-verified

# mark a citation as independently verified for IDS/readiness without selecting it as closest art
node cli.mjs verify-reference --dossier <matter>/evidence/prior_art/search-dossier-....json \
  --pa PA02 --notes "title, venue, canonical link, and relied-on passage checked" --reviewer "<name>" \
  --title-verified --venue-verified --canonical-link-verified --relied-on-passage-verified

# validate a dossier contract directly
node cli.mjs check-dossier <matter>/evidence/prior_art/search-dossier-....json --json
```

Exit codes: `0` ok · `2` the query hit MEDIUM-tier sensitive content (re-run with `--yes`) · `3` the
query hit HIGH-tier secret content (**blocked, not sent**).

## What `--write` produces in the matter
- Appends `PA##` blocks to `logic/prior_art.md` (role-typed, `verification: false`).
- Writes a raw record per reference under `evidence/prior_art/<paN>.md`.
- Writes `evidence/prior_art/search-dossier-*.json` with query hash, exact source parameters,
  search plan/query variants, top-N candidates before dedupe, after dedupe, and after ranking, duplicate/excluded results,
  assigned `PA##` IDs, coverage limits, citation expansion, quote handoff fields, rank explanations,
  analysis handoff candidate cells, and the closest-art human-verification state.
- Writes `logic/reference_matrix.md` — the "Blocks / Does-NOT-block" scaffold for analysis + a human.

The written matter still passes `apa-validate` (Level-1 mechanical). The hardened-verification and
patentability-analysis steps (and a human) fill in `discloses`/`lacks` and the matrix.

`verify-reference` updates assigned-reference verification and IDS-readiness state without selecting
closest art. `verify-closest-art` marks the human-selected closest-art `PA##` IDs and rationale.
Both commands append a `trace/runlog.jsonl` entry when the dossier path is under
`<matter>/evidence/prior_art/`, hashing the pre-update dossier as an input and the updated dossier as
an output. `verification.ids_ready` remains false until title, venue, canonical link, and relied-on
passage have all been independently verified.

Quality targets and benchmark expectations live in `../../docs/prior-art-search-quality.md`. The
dossier contract is documented in `../../schemas/search-dossier.schema.json` and enforced by
`check-dossier` plus the writer's built-in validator.

## Files
`dossier-schema.mjs` contains the zero-dependency validator for `schemas/search-dossier.schema.json`.

`cli.mjs` · `search.mjs` (orchestrator + scan-at-sink) · `writers.mjs` · `envelope.mjs`
(untrusted-content + canary) · `sources/` (`http.mjs` guards, `index.mjs` registry, `patentsview.mjs`, `crossref.mjs`, `arxiv.mjs`, `openalex.mjs`, `mock.mjs`, `fixture.mjs`) ·
`lib/refs.mjs` (record contract + dedupe/rank) · `test/`. Source policy lives in
`../../docs/source-registry.md`.
