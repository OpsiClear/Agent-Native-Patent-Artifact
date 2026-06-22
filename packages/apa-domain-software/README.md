# apa-domain-software

Deterministic software-domain hook artifacts for APA. The package reads a local source tree, extracts
static code signals, and writes only under `domain/software/` when attached to a matter.

It does not write canonical APA files and does not render legal conclusions.

```bash
node packages/apa-domain-software/cli.mjs run-all --matter <matter> --source <repo>
node packages/apa-domain-software/cli.mjs inventory --source <repo> --out codebase_inventory.json
```

Outputs:

- `domain/software/codebase_inventory.json`
- `domain/software/software_disclosure_summary.md`
- `domain/software/software_claim_seeds.json`
- `domain/software/software_101_review.json`
- `domain/software/software_architecture_figures.json`

When `--matter` is supplied, the CLI appends an APA runlog entry with source sample hashes, output
hashes, the command record, and a human-adoption checkpoint.
