---
apa_version: "0.1"
title: "Self-Watering Planter Insert with a Float-Actuated Valve"
application_type: "utility"
jurisdiction: "USPTO"
user_role: "unknown"
confidential_workflow_mode: "ordinary_local"
inventors:
  - id: "AINVENTOR"
    name: "Alex Example"
assignee: "unassigned"
matter_docket: "DEMO-0001"
entity_status: "unknown"
application_no: "unfiled"
priority_date: "none"
filing_date: "unfiled"
related_applications: []
status: "drafting"
provenance_summary: { inventor: 7, attorney: 5, ai-suggested: 0, ai-executed: 1, human-revised: 0 }
inventorship_matrix:
  CLM01: ["AINVENTOR"]
  CLM02: ["AINVENTOR"]
claims_summary:
  - "A planter insert with a float-actuated valve that closes when a reservoir reaches a selected level."
abstract: >
  A self-watering planter insert holds a water reservoir, a float disposed in the reservoir, and a
  valve coupled to the float. As stored water raises the float to a selected level, the valve closes,
  metering refill water without overfilling the reservoir. A wick draws water from the reservoir to
  surrounding soil. The float-actuated valve provides automatic, power-free level control.
rules_effective_date: "2026-06-15"
confidentiality: "UNFILED - CONFIDENTIAL. Do not externally disclose. This is a fictional demonstration matter."
---

# Self-Watering Planter Insert with a Float-Actuated Valve

> **Fictional demonstration matter.** Not a real invention, not legal advice. It exists to exercise
> the APA protocol, validator, and viewer end-to-end. See `../../docs/protocol.md`.

## Layer Index

### Cognitive (`logic/`)
| File | Holds | Key IDs |
|---|---|---|
| `logic/problem.md` | Field, problem, gap in prior art | O01, G01 |
| `logic/claims.md` | Claims + limitations | CLM01, CLM02 / LIM01-LIM04 |
| `logic/concepts.md` | Defined claim terms | TERM01 |
| `logic/patentability.md` | 101/102/103/112 flags + questions | — |
| `logic/prior_art.md` | Prior-art references | PA01 |

### Physical (`src/`)
| File | Holds | Supports claims |
|---|---|---|
| `src/embodiments.md` | Specification support paragraphs | SPEC0001-SPEC0005 -> CLM01, CLM02 |

### Trace (`trace/`)
| File | Holds | Key IDs |
|---|---|---|
| `trace/prosecution.yaml` | Decision DAG | PH01, PH02 |

### Evidence (`evidence/`)
| File | Holds | Key IDs |
|---|---|---|
| `evidence/README.md` | Reference & drawing index (IDS seed) | — |
| `evidence/prior_art/pa01.md` | Raw record of PA01 | PA01 |
| `evidence/drawings/fig01.md` | Figure 1 numerals | FIG01 |
