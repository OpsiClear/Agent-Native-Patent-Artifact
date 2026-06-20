# APA artifact schema (compiler reference)

The compiler writes the on-disk format defined canonically in **`docs/protocol.md`** (the single
source of truth). This file is a quick compiler-facing index; when the two disagree, `docs/protocol.md`
wins.

## Layers and mandatory core
- `PATENT.md` - manifest (frontmatter + Layer Index). Set `application_type`
  (provisional | utility | design); the mandatory core is type-aware.
- `logic/` - `problem.md`, `claims.md` (CLM##/LIM##), `concepts.md` (TERM##), `patentability.md`
  (flags/questions), `prior_art.md` (PA##).
- `src/embodiments.md` - SPEC#### support paragraphs (grounding: transcribed | reconstructed).
- `trace/prosecution.yaml` - PH## decision DAG (dead_end leaves preserved).
- `evidence/` - `README.md` index, `prior_art/<paN>.md` raw records, `drawings/<figN>.md` numeral maps.
- `staging/observations.yaml` - append-only buffer (compiler usually writes little here; capture does).

## binding blocks
Every entity is a `### <ID> ...` section with a ` ```binding ` YAML block. See `docs/protocol.md` §2-3
for the exact per-layer fields and the typed edges (`supported_by`, `illustrated_by`, `antecedent_of`,
`depends_on`, `distinguished_over`, `scope_set_at`, `contributed_to`).

## What "done" means
The artifact validates at Level 1 (`node packages/apa-validate/validate.mjs <matter>` -> no errors;
warnings triaged) and builds a manifest (`node packages/apa-viewer/build_manifest.mjs <matter>`).
