---
apa_version: "0.1"
title: "Self-Closing Door Hinge with an Integrated Hydraulic Damper and a Hold-Open Detent"
application_type: "utility"
jurisdiction: "USPTO"
user_role: "unknown"
confidential_workflow_mode: "ordinary_local"
inventors:
  - id: "RMORALES"
    name: "Rosa Morales"
  - id: "DPARK"
    name: "Devin Park"
assignee: "unassigned"
matter_docket: "DEMO-0002"
entity_status: "unknown"
application_no: "unfiled"
priority_date: "none"
filing_date: "unfiled"
related_applications: []
status: "drafting"
provenance_summary: { inventor: 27, attorney: 7, ai-suggested: 0, ai-executed: 2, human-revised: 0 }
inventorship_matrix:
  CLM01: ["RMORALES", "DPARK"]
  CLM02: ["RMORALES"]
  CLM03: ["RMORALES"]
  CLM04: ["RMORALES", "DPARK"]
  CLM05: ["RMORALES", "DPARK"]
  CLM06: ["DPARK"]
claims_summary:
  - "CLM01 (apparatus): a door hinge integrating a closing spring and a hydraulic damper on a shared pivot spindle within one hinge body, the damper limiting the closing speed."
  - "CLM05 (method): storing energy in a closing spring by opening a door, releasing it, and displacing fluid through a hydraulic damper to limit the closing speed."
abstract: >
  A self-closing door hinge integrates, within a single hinge body, a closing spring and a hydraulic
  damper coupled to a shared pivot spindle. Opening the door winds the closing spring; on release the
  spring returns the door while the hydraulic damper displaces a working fluid through an adjustable
  metering valve to limit the closing speed, the full-close interval being settable between 3 and 12
  seconds for a 90-degree swing. A cam-and-follower hold-open detent retains the door at a hold-open
  angle until a user-applied release torque is exceeded, whereupon damped closing resumes. The hinge is
  power-free. A corresponding method claim recites storing energy in the spring, releasing the door, and
  damping its closing speed.
rules_effective_date: "2026-06-15"
confidentiality: "UNFILED - CONFIDENTIAL. Do not externally disclose. This is a fictional demonstration matter."
---

# Self-Closing Door Hinge with an Integrated Hydraulic Damper and a Hold-Open Detent

> **FICTIONAL DEMONSTRATION MATTER - NOT A REAL INVENTION AND NOT LEGAL OUTPUT.** This matter does not
> describe a real product and is not legal advice. It exists to exercise the APA protocol, validator,
> claim-lint, and figure tooling end-to-end with a richer, two-independent-claim utility example (an
> apparatus claim *and* a method claim, dependents, a `dead_end` decision node, two figures, and a
> figure-definition DSL). See `../../docs/protocol.md`. It is distinct from the `minimal-patent-artifact`
> self-watering-planter example and is unrelated to any real matter.

## Layer Index

### Cognitive (`logic/`)
| File | Holds | Key IDs |
|---|---|---|
| `logic/problem.md` | Field, problem, gap in prior art | O01, G01 |
| `logic/claims.md` | Claims + limitations (2 independent: apparatus + method) | CLM01-CLM06 / LIM01-LIM17 |
| `logic/concepts.md` | Defined claim terms (all objectively bounded) | TERM01-TERM03 |
| `logic/patentability.md` | 101/102/103/112 flags + questions | — |
| `logic/prior_art.md` | Prior-art references | PA01, PA02 |

### Physical (`src/`)
| File | Holds | Supports claims |
|---|---|---|
| `src/embodiments.md` | Specification support paragraphs | SPEC0001-SPEC0009 -> CLM01-CLM06 |
| `src/drawing_src/fig01.json` | Figure-definition DSL for FIG01 (apparatus view) | renders `evidence/drawings/fig01.svg` |
| `src/drawing_src/fig02.json` | Figure-definition DSL for FIG02 (method flowchart) | renders `evidence/drawings/fig02.svg` |

### Trace (`trace/`)
| File | Holds | Key IDs |
|---|---|---|
| `trace/prosecution.yaml` | Decision DAG (incl. a `dead_end` foreclosing 'means for' breadth) | PH01-PH04 |

### Evidence (`evidence/`)
| File | Holds | Key IDs |
|---|---|---|
| `evidence/README.md` | Reference & drawing index (IDS seed) | — |
| `evidence/prior_art/pa01.md` | Raw record of PA01 | PA01 |
| `evidence/prior_art/pa02.md` | Raw record of PA02 | PA02 |
| `evidence/drawings/fig01.md` | Figure 1 numerals (10-28) | FIG01 |
| `evidence/drawings/fig02.md` | Figure 2 numerals (30-36) | FIG02 |

### Staging (`staging/`)
| File | Holds | Key IDs |
|---|---|---|
| `staging/observations.yaml` | Append-only unconfirmed observations (not yet promoted) | OBS01, OBS02 |
