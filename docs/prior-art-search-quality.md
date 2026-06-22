# Prior-Art Search Quality Targets

APA prior-art search is a candidate-discovery and audit workflow. It must never assert search
completion, patentability, validity, infringement, or freedom to operate.

## Quality Targets

| Metric | Target | Why it matters |
|---|---:|---|
| Known-reference recall@20 | >= 0.70 on benchmark fixtures | A useful search must surface references already known from public prosecution or cited-art records. |
| Closest-art rank | closest known reference in top 10 when source coverage permits | Keeps human review time bounded. |
| Source-class coverage | dossier names searched and unsearched source classes | Prevents single-source searches from reading as complete. |
| Bibliographic accuracy | 100% for human-verified references | IDS and claim charts require correct title, date, venue, and canonical link. |
| Quote-handoff coverage | every ranked candidate has a quote/snippet or explicit `not located` | Patentability analysis needs passage-level evidence, not title-only matches. |
| Rank explanation coverage | every ranked candidate includes field hits and score breakdown | Humans need to see why a candidate surfaced before spending review time. |
| Dossier reproducibility | query bytes hash, source params, counts, dedupe, exclusions, and runlog present | Search runs must be auditable and resumable. |

## Required Dossier Statements

Every search dossier must record:

- `coverage_limits.search_complete_asserted: false`
- source IDs searched
- source IDs skipped or unsearched, with reasons
- query plan / query variants used
- top-N before dedupe, after dedupe, and after ranking
- dedupe clusters and excluded results
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
`known_reference_recall@20`, closest known-reference rank, dossier completeness, quote-handoff
coverage, and rank-explanation coverage. These metrics are retrieval and audit metrics only. They are
not novelty, obviousness, patentability, validity, infringement, freedom-to-operate, IDS, or search
completeness conclusions.

## Benchmark Classes

Benchmarks should include:

- public patent applications with known cited art
- public office-action records with examiner references
- software patents with well-known non-patent literature
- cases with close obviousness combinations rather than clean anticipation

The benchmark harness should score recall and dossier completeness only. It must not score legal
correctness of novelty or obviousness conclusions, because APA does not render those conclusions.
