# apa-search — prior-art search (Phase 2)

API-first prior-art search for a Patent Artifact. Builds a query from a matter's claims, **scans it at
the sink** (confidentiality) before egress, queries sanctioned sources, dedupes + ranks, and files the
landscape as `PA##` blocks + raw evidence records + a reference-matrix scaffold. Node >= 21, ESM, zero
dependencies. Fetched text is wrapped in an untrusted-content envelope before any LLM sees it.

> **Not a clearance.** Candidates are UNVERIFIED and structurally incomplete (examiner-grade USPTO PPS
> is UI-only; NPL is paywalled). A human verifies each reference and selects the closest art. The tool
> never asserts "no anticipating art found." See `../../docs/legal-guardrails.md`.

## Why API-first (and not a browser daemon)

`DESIGN.md` §4.1 calls for an `apa-browse` Playwright daemon, but it also says **API-backed sources are
preferred and UI scraping is off by default**. This phase implements the API path (zero-deps Node
`fetch`); the Playwright daemon is deferred — it is only needed for UI-only sources, which are
**human-handoff** anyway.

## Sources & access modes

`node cli.mjs --list-sources`. Each source declares an access mode:
- **api** — `patentsview` (PatentsView PatentSearch API; free key) ✅, `mock` (offline, tests) ✅; `pqai`, `epo-ops` (planned).
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
```

Exit codes: `0` ok · `2` the query hit MEDIUM-tier sensitive content (re-run with `--yes`) · `3` the
query hit HIGH-tier secret content (**blocked, not sent**).

## What `--write` produces in the matter
- Appends `PA##` blocks to `logic/prior_art.md` (role-typed, `verification: false`).
- Writes a raw record per reference under `evidence/prior_art/<paN>.md`.
- Writes `logic/reference_matrix.md` — the "Blocks / Does-NOT-block" scaffold for analysis + a human.

The written matter still passes `apa-validate` (Level-1 mechanical). The hardened-verification and
patentability-analysis steps (and a human) fill in `discloses`/`lacks` and the matrix.

## Files
`cli.mjs` · `search.mjs` (orchestrator + scan-at-sink) · `writers.mjs` · `envelope.mjs`
(untrusted-content + canary) · `sources/` (`index.mjs` registry, `patentsview.mjs`, `mock.mjs`) ·
`lib/refs.mjs` (record contract + dedupe/rank) · `test/`. Source policy lives in
`../../docs/source-registry.md`.
