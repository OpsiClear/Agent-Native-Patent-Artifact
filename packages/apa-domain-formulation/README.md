# apa-domain-formulation

Deterministic formulation-domain hook runner for APA.

It reads local protocol, experimental-log, composition-table, and example files, then writes only under
`domain/formulation/`:

- `formulation_summary.json`
- `formulation_claim_seeds.json`
- `composition_enablement_review.json`
- `ranges_and_examples_review.json`

The package emits source-backed prompts, flags, and handoffs only. It does not write canonical APA
files and does not provide patentability, validity, infringement, FTO, regulatory, safety, or efficacy
conclusions.

```bash
node packages/apa-domain-formulation/cli.mjs run-all --matter <matter> --source <source-dir>
```
