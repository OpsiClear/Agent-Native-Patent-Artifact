# Patentability analysis - flags & questions (NOT legal opinions)

> Everything here is a **flag or a question for a registered practitioner**. APA renders no
> patentability, novelty, non-obviousness, FTO, or validity *conclusion*. The mechanical validator
> checks structure only; the merits below are for human judgment.

## 35 USC 101 (eligibility)
- Flag: subject matter is a physical apparatus (reservoir/float/valve). Low abstract-idea risk. No
  action flagged beyond confirming the claims recite the physical structure (they do).

## 35 USC 102 (anticipation) - search-derived
- PA01 discloses a reservoir and a wick but **lacks** a float-actuated valve (see PA01 `lacks`).
  CLM01's `distinguished_over: [PA01]` records the distinction. Question for attorney: is PA01 the
  closest art, or should a broader search (Phase 2) run before relying on this?

## 35 USC 102 (statutory bars) - interview-derived
- Question for inventor (bar-date screen): has the insert been **offered for sale, sold, publicly
  used, or described in a printed publication**? None captured in the disclosure. If any occurred,
  flag the date vs. the effective filing date and the one-year grace window. (Not found by search.)

## 35 USC 103 (obviousness)
- Question: would the float-actuated valve be an obvious combination over PA01 + a generic float
  valve? Capture any **secondary considerations** (unexpected results, long-felt need) the inventor
  can supply. KSR rationale to address: "combination of known elements." Human judgment required.

## 35 USC 112
- 112(a) support: each CLM01/CLM02 limitation has a `supported_by` edge to a SPEC paragraph (the
  validator confirms the edge *resolves*; whether the paragraph *enables/describes* the limitation is
  for the attorney).
- 112(b) definiteness: "selected level" (TERM01) carries an objective bound. No `means for` / nonce
  words present, so no 112(f) invocation flagged.
