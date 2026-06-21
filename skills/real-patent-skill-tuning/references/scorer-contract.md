# Scorer Contract

Use a deterministic scorer for tuning. Do not use semantic similarity or live LLM judgment as a
commit gate.

## Required Metrics

Expose stable JSON fields:

```json
{
  "metrics": {
    "average_score": 0,
    "blocking_failures": 0,
    "warning_count": 0,
    "candidate_source": ".apa/tune/<skill>/<run-id>/"
  },
  "cases": [
    {
      "id": "<case-id>",
      "score": 0,
      "dimensions": {}
    }
  ]
}
```

## Dimension Floors

- `source_integrity = 1.0`
- `legal_overclaim_avoidance = 1.0`
- `source_span_discipline >= 0.9`
- `technical_mechanism_coverage >= 0.85`
- `blocking_failures = 0`
- `candidate_source` must point outside `benchmarks/fixtures/**/runs`

If implementation cannot emit these fields or enforce these floors, the real-public-patent score is
advisory and must not drive auto-tune keep/discard decisions.

## Anti-Gaming Rules

- Field-scoped checks: required mechanism terms must appear in the intended report field.
- Repetition penalty: repeating keywords must not increase score.
- Length penalty: excessive report length should lower or cap score.
- Generic-summary penalty: phrases such as `uses AI`, `distributed processing`, `ranking data`, or
  `configured to` should be penalized unless paired with concrete source-backed mechanism groups.

## Legal Conclusion Classes

Block content that resolves legal status instead of flagging risk:

- eligibility conclusions;
- validity or invalidity conclusions;
- infringement or non-infringement conclusions;
- freedom-to-operate or clearance conclusions;
- filing, signing, IDS-certification, or payment conclusions;
- allowance or prosecution outcome predictions.

Reports may use `risk_flag`, `issue_to_review`, or `counsel_checkpoint`; they must not state that a
legal status is resolved.
