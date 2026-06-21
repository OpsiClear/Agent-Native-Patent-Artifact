# APA Skill Graph

Generated from `skills/registry.yaml`, `skills/*/skill.yaml`, and `skills/domains/*/domain.yaml`.
The current repository keeps the original flat core skill layout for installer compatibility while exposing machine-readable graph contracts.

## Core Pipeline

| Skill | Command | Phase | Description |
|---|---|---|---|
| `apa-autoprep` | `/apa-autoprep` | orchestration | Plan and run the full APA lifecycle with gates and checkpoints. |
| `apa-claims` | `/apa-claims` | drafting | Draft and lint source-backed claims and limitations. |
| `apa-compile` | `/apa-compile` | capture | Lift public patent or disclosure documents into an APA artifact. |
| `apa-disclose` | `/apa-disclose` | capture | Capture inventor disclosure facts into the APA artifact. |
| `apa-examiner` | `/apa-examiner` | review | Run adversarial examiner-style 101/102/103/112 critique loops. |
| `apa-figures` | `/apa-figures` | drafting | Generate numbered figure definitions, SVGs, and numeral legends. |
| `apa-assemble` | `/apa-assemble` | assembly | Assemble package drafts and upload manifests while stopping at the submit boundary. |
| `apa-office-action` | `/apa-office-action` | prosecution | Parse Office Actions, estimate response dates, and scaffold practitioner-reviewed responses. |
| `apa-drawing-quality` | `/apa-drawing-quality` | drafting | Review patent drawings for professional quality and formal-risk flags. |
| `apa-analyze` | `/apa-analyze` | analysis | Build claim charts and 101/102/103/112 flags as questions. |
| `apa-priorart` | `/apa-priorart` | search | Search prior-art sources and write PA blocks plus a search dossier. |
| `apa-rigor` | `/apa-rigor` | review | Run six-dimension rigor review and deterministic artifact-quality verdict. |
| `apa-spec` | `/apa-spec` | drafting | Draft specification sections from source-backed embodiments and claims. |

## Domain And Support Skills

| Skill | Command | Phase | Description |
|---|---|---|---|
| `apa-software-patent` | `/apa-software-patent` | domain-review | Review software patent matter for technical-improvement, 101, CRM, and software 112 risks. |
| `apa-svg-upgrader` | `/apa-svg-upgrader` | drafting | Normalize rough SVG figures into patent drawing candidates without adding visual new matter. |
| `apa-public-patent-benchmark` | `/apa-public-patent-benchmark` | benchmarking | Create and score real public patent reproduction benchmarks for APA skills. |
| `apa-real-patent-skill-tune` | `/apa-real-patent-skill-tune` | benchmarking | Tune APA skills against real public patent fixtures using fresh generated reports, oracle isolation, scorer floors, and auto-tune guardrails. |
| `apa-license` | `/apa-license` | governance | Review software license posture, third-party notices, provenance, and patent-license clauses. |

## Hook Points

| Hook | Placement | Blocking default |
|---|---|---|
| `disclosure.enrich` | after: apa-disclose, apa-compile; before: - | false |
| `claims.seed` | after: -; before: apa-claims | false |
| `analysis.domain` | after: apa-analyze; before: - | false |
| `figures.plan` | after: -; before: apa-figures | false |
| `figures.review` | after: apa-figures; before: apa-drawing-quality | false |
| `spec.review` | after: apa-spec; before: - | false |
| `rigor.domain` | after: -; before: apa-rigor | false |
| `assembly.preflight` | after: -; before: apa-assemble | true |

## Mermaid

```mermaid
flowchart TD
  apa_autoprep["/apa-autoprep<br/>orchestration"]
  apa_claims["/apa-claims<br/>drafting"]
  apa_compile["/apa-compile<br/>capture"]
  apa_disclose["/apa-disclose<br/>capture"]
  apa_examiner["/apa-examiner<br/>review"]
  apa_figures["/apa-figures<br/>drafting"]
  apa_assemble["/apa-assemble<br/>assembly"]
  apa_office_action["/apa-office-action<br/>prosecution"]
  apa_drawing_quality["/apa-drawing-quality<br/>drafting"]
  apa_svg_upgrader["/apa-svg-upgrader<br/>drafting"]
  apa_analyze["/apa-analyze<br/>analysis"]
  apa_priorart["/apa-priorart<br/>search"]
  apa_public_patent_benchmark["/apa-public-patent-benchmark<br/>benchmarking"]
  apa_real_patent_skill_tune["/apa-real-patent-skill-tune<br/>benchmarking"]
  apa_rigor["/apa-rigor<br/>review"]
  apa_license["/apa-license<br/>governance"]
  apa_software_patent["/apa-software-patent<br/>domain-review"]
  apa_spec["/apa-spec<br/>drafting"]
  apa_autoprep --> apa_disclose
  apa_autoprep --> apa_compile
  apa_autoprep --> apa_priorart
  apa_autoprep --> apa_analyze
  apa_autoprep --> apa_claims
  apa_autoprep --> apa_spec
  apa_autoprep --> apa_figures
  apa_autoprep --> apa_drawing_quality
  apa_autoprep --> apa_examiner
  apa_autoprep --> apa_rigor
  apa_autoprep --> apa_assemble
  apa_claims --> apa_spec
  apa_claims --> apa_figures
  apa_claims --> apa_examiner
  apa_compile --> apa_priorart
  apa_compile --> apa_analyze
  apa_compile --> apa_claims
  apa_disclose --> apa_priorart
  apa_disclose --> apa_claims
  apa_disclose --> apa_spec
  apa_examiner --> apa_claims
  apa_examiner --> apa_spec
  apa_examiner --> apa_rigor
  apa_figures --> apa_drawing_quality
  apa_figures --> apa_assemble
  apa_drawing_quality --> apa_assemble
  apa_svg_upgrader --> apa_drawing_quality
  apa_analyze --> apa_claims
  apa_analyze --> apa_examiner
  apa_priorart --> apa_analyze
  apa_priorart --> apa_rigor
  apa_rigor --> apa_assemble
  apa_software_patent --> apa_rigor
  apa_spec --> apa_figures
  apa_spec --> apa_rigor
  domain_device["domain:device<br/>scaffold"]
  domain_device -. disclosure.enrich .-> disclosure_enrich
  domain_device -. claims.seed .-> claims_seed
  domain_device -. figures.plan .-> figures_plan
  domain_device -. figures.review .-> figures_review
  domain_formulation["domain:formulation<br/>scaffold"]
  domain_formulation -. disclosure.enrich .-> disclosure_enrich
  domain_formulation -. claims.seed .-> claims_seed
  domain_formulation -. analysis.domain .-> analysis_domain
  domain_formulation -. spec.review .-> spec_review
  domain_software["domain:software<br/>active"]
  domain_software -. disclosure.enrich .-> disclosure_enrich
  domain_software -. claims.seed .-> claims_seed
  domain_software -. analysis.domain .-> analysis_domain
  domain_software -. figures.plan .-> figures_plan
  domain_software -. rigor.domain .-> rigor_domain
  disclosure_enrich(("hook:disclosure.enrich"))
  claims_seed(("hook:claims.seed"))
  analysis_domain(("hook:analysis.domain"))
  figures_plan(("hook:figures.plan"))
  figures_review(("hook:figures.review"))
  spec_review(("hook:spec.review"))
  rigor_domain(("hook:rigor.domain"))
  assembly_preflight(("hook:assembly.preflight"))
```
