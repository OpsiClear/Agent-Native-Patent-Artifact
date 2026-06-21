# Software Patent Review Guide

Use this reference for `/apa-software-patent`. It is a drafting/review workflow for
computer-implemented inventions, not a legal opinion.

## Current USPTO Anchors To Verify

Before relying on a legal posture, verify the current USPTO subject-matter-eligibility page and MPEP:
- USPTO SME page: `https://www.uspto.gov/patents/laws/examination-policy/subject-matter-eligibility`
- MPEP 2106: `https://www.uspto.gov/web/offices/pac/mpep/s2106.html`
- MPEP 2161: `https://www.uspto.gov/web/offices/pac/mpep/s2161.html`
- MPEP 2181: `https://www.uspto.gov/web/offices/pac/mpep/s2181.html`

Working anchors:
- Current USPTO eligibility guidance is in MPEP sections 2103 through 2106.07.
- MPEP 2106 distinguishes eligibility from 102/103/112 patentability.
- Step 2A Prong Two asks whether the claim integrates a judicial exception into a practical
  application. Useful software anchors include improvements to computer functionality or another
  technical field, particular-machine integration, transformation, and meaningful limits beyond
  generally linking an idea to a technological environment.
- Generic instructions to apply an abstract idea on a computer, insignificant extra-solution
  activity, and field-of-use limits are software-patent risk flags.
- For computer-implemented functional claiming, 112(a) support and 112(f) algorithm disclosure remain
  separate checks from 101 eligibility.

## Software Invention Intake

Ask for facts, not slogans:
- What specific computer, network, data, UI, codec, security, ML, storage, robotics, graphics, or
  control-system problem existed?
- What prior implementation failed or was inefficient?
- What is the new mechanism: data structure, scheduling rule, model architecture, inference pipeline,
  encoding transform, cache invalidation, protocol exchange, UI event handling, cryptographic flow,
  hardware/software cooperation, or device-control loop?
- What technical effect is observed or expected: lower latency, lower memory, higher compression,
  fewer artifacts, improved synchronization, better accuracy, lower power, higher throughput, fewer
  false positives, safer control, or improved user-interface operation?
- Which facts are measured, simulated, inventor-observed, or merely hypothesized?

## Simulation-Hardened Response Patterns

Use these patterns when the request resembles one of the common software-patent traps. They are
designed to keep the agent from overclaiming when the factual record is thin.

| Scenario | Agent response pattern |
|---|---|
| Business/SaaS automation with no disclosed technical mechanism | Do not draft a claim ladder yet. Flag abstract-idea/generic-computer risk, identify the missing technical mechanism, and ask for implementation facts: data structures, event sequence, latency/resource/security effect, or non-generic component arrangement. |
| Codec, compression, rendering, graphics, networking, security, or control-system software | Preserve the technical mechanism as the claim spine. Ask for source-backed transforms, state transitions, protocol messages, data layouts, thresholds, and measurable effects. Draft only supported method/system/CRM options. |
| AI/ML invention | Do not claim "using AI" as the contribution. Ask for model architecture, training data features, loss/objective, preprocessing, inference-time constraints, deployment environment, and the technical effect. Separate model-output business value from technical operation. |
| UI or information-display invention | Do not treat displaying information as enough. Ask for event handling, state synchronization, device behavior, interaction timing, reduced input burden, error prevention, or another technical UI operation. |
| Non-transitory CRM request | Verify support for stored instructions and non-transitory storage before proposing CRM language. Flag wording that could read on signals or carrier waves. |
| Pure algorithm/math/data-analysis request | Identify whether the math is applied in a practical technical process. If only the result is described, ask for concrete application, inputs tied to a machine/process, transformations, and technical effect. |

When any scenario is under-supported, output `needs-inventor-confirmation` or
`unsupported-new-matter-risk` instead of silently inventing implementation details.

## 101 Eligibility Screen

Create flags, not conclusions:

1. **Statutory category.** Method, machine/system, manufacture/non-transitory CRM, or composition.
   For CRM claims, avoid language that reads on transitory signals unless source support and counsel
   justify another route.
2. **Abstract-idea risk.** Flag mental processes, methods of organizing human activity, math-only
   results, business rules, presentation of information, generic data collection/analyzing/displaying,
   and result-only automation.
3. **Practical application.** Identify claim limitations that apply the idea in a concrete technical
   process. Tie each to specification support and, if possible, a measurable technical effect.
4. **More than generic computer use.** Flag "processor configured to," "module," "server," "database,"
   "AI model," or "cloud" limitations that perform only generic receiving, storing, analyzing, and
   displaying without a specific implementation.
5. **Claim-as-a-whole check.** Preserve the combination story. A non-generic arrangement of generic
   components may matter if the record supports why the arrangement performs a technical function.

## 112 And Claim-Support Screen

For every software limitation, require enough support for a skilled implementer to understand the
claimed scope:
- Concrete acts, state transitions, data transformations, and inputs/outputs.
- Algorithms expressed as flowcharts, pseudocode, formulas, rules, data-flow diagrams, state machines,
  protocol sequences, model-training/inference steps, or equivalent understandable terms.
- Data-structure fields, relationships, invariants, and how they cooperate with software/hardware.
- Linkage between each claimed function and disclosed structure/acts, especially for nonce terms such
  as module, unit, engine, component, processor, logic, system, means, or mechanism.
- Alternative implementations and bounds, so the claim is not broader than the disclosed contribution.

Flag:
- Functional result with no disclosed algorithm.
- Claim terms broader than all disclosed implementations.
- No objective boundary for terms like real time, optimized, efficient, high confidence, secure,
  anomalous, similar, or close.
- CRM support that lacks stored instructions or reads on a signal/carrier wave.
- AI/ML claims that recite "a trained model" without training data features, architecture, loss,
  inference flow, or deployment constraints when those are material to the contribution.

## Claim Family Patterns

Use only when supported:
- **Method claim:** recite ordered technical acts, data transformations, and technical result.
- **System claim:** recite cooperating components configured by specific instructions or structures,
  not a generic server plus desired result.
- **Non-transitory CRM claim:** recite stored instructions that cause processors to perform the same
  supported operations; verify support for non-transitory storage language.
- **Data-structure claim:** tie the structure to a computer-readable storage medium or system use and
  explain functional interrelationships.
- **UI claim:** identify a technical UI interaction, event sequence, state update, or device behavior,
  not only displaying information.
- **AI/ML claim:** claim the technical pipeline, architecture, training/inference mechanism, data
  representation, model constraint, or deployment effect; do not claim "use AI" as a result.

## Report Shape

Use this shape when emitting `logic/software_patent_report.json`:

```json
{
  "schema": "apa-software-patent-report-v1",
  "legal_posture": "flags-not-conclusions",
  "review_scope": {
    "matter": "<matter>",
    "reviewed_at": "<ISO-8601 timestamp>",
    "claim_types_reviewed": ["method", "system", "non-transitory-crm"]
  },
  "technical_improvement": {
    "baseline_problem": "<source-backed problem>",
    "mechanism": "<source-backed mechanism>",
    "technical_effect": "<measured-or-expected effect>",
    "evidence_span": "<path:line-or-source-span>"
  },
  "eligibility_flags": [
    {
      "claim": "CLM01",
      "risk": "abstract-idea|generic-computer|extra-solution-activity|field-of-use|math-only|other",
      "evidence_span": "<path:line-or-source-span>",
      "recommended_next_step": "<drafting/support action>"
    }
  ],
  "support_flags": [
    {
      "limitation": "CLM01.LIM03",
      "risk": "missing-algorithm|nonce-term|overbroad-function|unclear-bound|crm-transitory-risk|other",
      "evidence_span": "<path:line-or-source-span>",
      "recommended_next_step": "<inventor/practitioner question or support fix>"
    }
  ],
  "claim_family": {
    "method": "present|proposed|unsupported",
    "system": "present|proposed|unsupported",
    "non_transitory_crm": "present|proposed|unsupported"
  },
  "support_state": {
    "overall": "supported-now|needs-inventor-confirmation|unsupported-new-matter-risk",
    "notes": ["<specific gap or support basis>"]
  },
  "human_checkpoints": [
    {"id": "practitioner-eligibility-review", "required": true, "satisfied": false}
  ]
}
```

## Output Order

Lead with:
1. Blocking support gaps or new-matter risks.
2. Highest 101 eligibility risks and the technical-improvement story that could address them.
3. Claim-family recommendations, separated into supported now vs. needs inventor facts.
4. Inventor questions that would materially improve the specification.
5. Practitioner questions for eligibility, 112(f), CRM wording, and claim-scope decisions.
