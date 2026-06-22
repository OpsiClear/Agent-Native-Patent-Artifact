# apa-domain-device

Deterministic mechanical/device-domain hook artifacts for APA. The package reads local component
tables, text disclosures, and drawing JSON/notes, then writes only under `domain/device/` when
attached to a matter.

It does not write canonical APA files and does not render legal, patentability, FTO, or drawing
compliance conclusions.

```bash
node packages/apa-domain-device/cli.mjs run-all --matter <matter> --source <device-source-dir>
node packages/apa-domain-device/cli.mjs inventory --source <device-source-dir> --out component_inventory.json
```

Outputs:

- `domain/device/component_inventory.json`
- `domain/device/mechanical_claim_seeds.json`
- `domain/device/figure_plan.json`
- `domain/device/reference_numeral_review.json`

When `--matter` is supplied, the CLI appends an APA runlog entry with source sample hashes, output
hashes, the command record, and human-review checkpoints for component adoption and reference numerals.
