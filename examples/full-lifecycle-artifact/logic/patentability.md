# Patentability analysis - flags & questions (NOT legal opinions)

> Everything here is a **flag or a question for a registered practitioner**. APA renders no
> patentability, novelty, non-obviousness, FTO, or validity *conclusion*. The mechanical validator
> checks structure only; the merits below are for human judgment.

## 35 USC 101 (eligibility)
- Flag: CLM01 is a physical apparatus (hinge body / leaves / spindle / spring / damper) and CLM05 is a
  method tied to that apparatus (storing energy in a spring, releasing, displacing fluid through a
  damper). Low abstract-idea risk; no mental-process or mathematical-formula limitations are recited.
  No action flagged beyond confirming the claims recite physical structure/acts (they do).

## 35 USC 102 (anticipation) - search-derived
- PA01 (plain spring hinge) discloses the hinge structure and a closing spring but **lacks** any
  hydraulic damper limiting the closing speed (see PA01 `lacks`). CLM01 and CLM05 list PA01 in
  `distinguished_over`.
- PA02 (overhead closer) discloses a spring plus an adjustable-valve hydraulic damper but **lacks**
  integration within a hinge body sharing the pivot spindle and the in-hinge hold-open detent.
- Question for attorney: are PA01 and PA02 the closest art, or should a broader Phase-2 search run
  (e.g. CPC E05F 1/12, E05F 3/00) before relying on this split?

## 35 USC 102 (statutory bars) - interview-derived
- Question for inventor (bar-date screen): has the hinge been **offered for sale, sold, publicly used,
  or described in a printed publication**? None captured in the disclosure. If any occurred, flag the
  date vs. the effective filing date and the one-year grace window. (Not found by search.)

## 35 USC 103 (obviousness)
- Question: would it have been obvious to combine PA01 (spring hinge) with PA02 (hydraulic speed
  valve) to arrive at CLM01? KSR rationale to address: "combination of known elements by known
  methods." The applicant's position (see PH02) is that integrating the damper and spring on a SHARED
  pivot spindle within ONE hinge body, plus the cam-and-follower hold-open detent, is more than a
  predictable aggregation - capture any **secondary considerations** (unexpected compactness, long-felt
  need for a hold-open door closer without a separate arm) the inventor can supply. Human judgment
  required; PH03 records a foreclosed broad-functional position to avoid re-arguing.

## 35 USC 112
- 112(a) support: every CLM01-CLM06 limitation carries a `supported_by` edge to a SPEC paragraph
  (the validator confirms the edge *resolves*; whether the paragraph *enables/describes* the limitation
  is for the attorney).
- 112(b) definiteness: the three terms of degree - "closing speed" (TERM01), "hold-open angle"
  (TERM02), and "release torque" (TERM03) - each carry an objective bound (a measurable time interval,
  a structurally-fixed angle range, and a torque threshold). No `means for` / nonce wording is present,
  so no 112(f) invocation is flagged.
- Question: confirm CLM03's numeric range (3-12 s for a 90-degree swing) is fully supported by the
  specification as filed (it is recited in SPEC0007) and is not a new-matter addition.
```
