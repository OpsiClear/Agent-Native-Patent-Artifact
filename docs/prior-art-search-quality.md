# Prior-Art Search Quality Targets

APA prior-art search is a candidate-discovery and audit workflow. It must never assert search
completion, patentability, validity, infringement, or freedom to operate.

## Quality Targets

| Metric | Target | Why it matters |
|---|---:|---|
| Known-reference recall@20 | >= 0.70 on benchmark fixtures | A useful search must surface references already known from public prosecution or cited-art records. |
| Known-reference recall@5 | >= 0.70 on benchmark fixtures | Relevant known references should appear early enough for human review, not merely somewhere in a long list. |
| Closest-art rank | closest known reference in top 10 when source coverage permits | Keeps human review time bounded. |
| Mean known reciprocal rank | >= 0.70 on benchmark fixtures | Penalizes burying the second or third known relevant reference behind distractors. |
| Top expected-slot precision | 1.00 on current fixed fixtures | The first N slots, where N is the number of known references, should not be displaced by obvious distractors. |
| Citation-expansion gain | scored when a fixture declares citation-neighborhood expectations | Proves backward/forward/family expansion can recover relevant neighbors that the base query misses. |
| Source-class coverage | dossier names searched and unsearched source classes | Prevents single-source searches from reading as complete. |
| Bibliographic accuracy | 100% for human-verified references | IDS and claim charts require correct title, date, venue, and canonical link. |
| Quote-handoff coverage | every ranked candidate has a quote/snippet or explicit `not located` | Patentability analysis needs passage-level evidence, not title-only matches. |
| Rank explanation coverage | every ranked candidate includes field hits and score breakdown | Humans need to see why a candidate surfaced before spending review time. |
| Dossier reproducibility | query bytes hash, source params, counts, dedupe, exclusions, and runlog present | Search runs must be auditable and resumable. |
| Source-call hardening | API calls use timeout and response-size caps | Slow or unexpectedly large source responses should fail visibly, not hang or exhaust memory. |

## Required Dossier Statements

Every search dossier must record:

- `coverage_limits.search_complete_asserted: false`
- source IDs searched
- source IDs skipped or unsearched, with reasons
- query plan / query variants used
- top-N before dedupe, after dedupe, and after ranking
- dedupe clusters and excluded results
- citation/family-neighborhood expansion summary when enabled
- candidate quote handoff fields
- candidate rank explanations (`matched_keywords`, `matched_cpc`, `score_breakdown`)
- closest-art human-verification state
- IDS readiness state separated from closest-art selection

## Fixed Scoring Harness

Run the offline retrieval-quality scorer with:

```bash
npm run score:prior-art-search
```

The scorer uses `benchmarks/fixtures/public-software-prior-art-recall/expected.json` and the
`fixture` source to replay public-software-patent scenarios with a fixed corpus. It reports
`known_reference_recall@20`, `known_reference_recall@5`, mean known reciprocal rank, top expected-slot
precision against distractors, citation-expansion gain where declared, candidate-type diversity,
dossier completeness, quote-handoff coverage, and rank-explanation coverage. These metrics are
retrieval and audit metrics only. They are not novelty, obviousness, patentability, validity,
infringement, freedom-to-operate, IDS, or search completeness conclusions.

## Benchmark Classes

Benchmarks should include:

- public patent applications with known cited art
- public office-action records with examiner references
- software patents with well-known non-patent literature
- cases with close obviousness combinations rather than clean anticipation

The benchmark harness should score recall and dossier completeness only. It must not score legal
correctness of novelty or obviousness conclusions, because APA does not render those conclusions.
