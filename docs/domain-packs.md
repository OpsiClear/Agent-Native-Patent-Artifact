# APA Domain Packs

Generated from `skills/domains/*/domain.yaml`.

## device

Status: `scaffold`

Mechanical/device invention support for components, drawings, reference numerals, and structural claim patterns.

Writes only under: `domain/device/`

| Hook | Outputs | Blocking |
|---|---|---|
| `disclosure.enrich` | `domain/device/component_inventory.json` | false |
| `claims.seed` | `domain/device/mechanical_claim_seeds.json` | false |
| `figures.plan` | `domain/device/figure_plan.json` | false |
| `figures.review` | `domain/device/reference_numeral_review.json` | false |

| Skill | Command | Status | Hook | Runner |
|---|---|---|---|---|
| `apa-device-disclosure-extractor` | `/apa-device-disclosure-extractor` | planned | `disclosure.enrich` | - |
| `apa-mechanical-claim-patterns` | `/apa-mechanical-claim-patterns` | planned | `claims.seed` | - |
| `apa-device-figure-patterns` | `/apa-device-figure-patterns` | planned | `figures.plan` | - |
| `apa-reference-numeral-review` | `/apa-reference-numeral-review` | planned | `figures.review` | - |

## formulation

Status: `scaffold`

Composition/formulation invention support for protocols, examples, ranges, enablement, and composition claim patterns.

Writes only under: `domain/formulation/`

| Hook | Outputs | Blocking |
|---|---|---|
| `disclosure.enrich` | `domain/formulation/formulation_summary.json` | false |
| `claims.seed` | `domain/formulation/formulation_claim_seeds.json` | false |
| `analysis.domain` | `domain/formulation/composition_enablement_review.json` | false |
| `spec.review` | `domain/formulation/ranges_and_examples_review.json` | false |

| Skill | Command | Status | Hook | Runner |
|---|---|---|---|---|
| `apa-formulation-disclosure-extractor` | `/apa-formulation-disclosure-extractor` | planned | `disclosure.enrich` | - |
| `apa-formulation-claim-patterns` | `/apa-formulation-claim-patterns` | planned | `claims.seed` | - |
| `apa-composition-enablement-review` | `/apa-composition-enablement-review` | planned | `analysis.domain` | - |
| `apa-ranges-and-examples-review` | `/apa-ranges-and-examples-review` | planned | `spec.review` | - |

## software

Status: `active`

Software, SaaS, AI/ML, data-processing, networking, UI, codec, database, security, and computer-implemented invention support.

Writes only under: `domain/software/`

| Hook | Outputs | Blocking |
|---|---|---|
| `disclosure.enrich` | `domain/software/codebase_inventory.json`, `domain/software/software_disclosure_summary.md` | false |
| `claims.seed` | `domain/software/software_claim_seeds.json` | false |
| `analysis.domain` | `domain/software/software_101_review.json` | false |
| `figures.plan` | `domain/software/software_architecture_figures.json` | false |
| `rigor.domain` | `domain/software/software_patent_report.json` | false |

| Skill | Command | Status | Hook | Runner |
|---|---|---|---|---|
| `apa-codebase-to-patent` | `/apa-codebase-to-patent` | active | `disclosure.enrich` | `node packages/apa-domain-software/cli.mjs inventory` |
| `apa-software-disclosure-extractor` | `/apa-software-disclosure-extractor` | active | `disclosure.enrich` | `node packages/apa-domain-software/cli.mjs disclosure` |
| `apa-software-claim-patterns` | `/apa-software-claim-patterns` | active | `claims.seed` | `node packages/apa-domain-software/cli.mjs claim-seeds` |
| `apa-software-101-review` | `/apa-software-101-review` | active | `analysis.domain` | `node packages/apa-domain-software/cli.mjs 101-review` |
| `apa-software-architecture-figures` | `/apa-software-architecture-figures` | active | `figures.plan` | `node packages/apa-domain-software/cli.mjs figures` |
| `apa-software-patent` | `/apa-software-patent` | active | `rigor.domain` | - |
