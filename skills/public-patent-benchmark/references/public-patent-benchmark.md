# Public Patent Benchmark Guide

Use this guide when `/apa-public-patent-benchmark` creates, scores, or tunes against a real public
patent/publication fixture.

## Contents

- [Selection Criteria](#selection-criteria)
- [Plain-Text Fixture Shape](#plain-text-fixture-shape)
- [Expected Oracle Shape](#expected-oracle-shape)
- [Reproduction Report Shape](#reproduction-report-shape)
- [Tuning Loop](#tuning-loop)

## Selection Criteria

- The source must already be public: issued patent, published application, public file wrapper, public
  repository, or public standard/sample.
- Prefer patents with clear claim families, a concrete technical problem, and enough specification
  support to evaluate the target skill.
- For `/apa-software-patent`, prefer computer-implemented patents with identifiable data flow,
  algorithmic steps, technical effect, and method/system/non-transitory CRM claim variants.
- Avoid fixtures whose oracle would require private prosecution strategy, inventor interviews, or
  confidential implementation details.

## Plain-Text Fixture Shape

`source.md` should include:

```markdown
---
schema: apa-public-patent-source-v1
case_id: <case-id>
source_class: public_patent
public_source_url: <canonical URL or "local-public-export">
patent_or_publication_number: <number>
title: <title>
retrieved_at: <ISO date or unknown>
source_sha256: <sha256 of exact input bytes or source.md if manually normalized>
extraction_confidence: high|medium|low
---

# Bibliographic Data
# Abstract
# Representative Claims
# Specification Excerpts
# Figures And Captions
# Public Domain Notes
```

Preserve claims verbatim when available. If OCR, PDF extraction, or manual normalization is used,
record uncertainty in the affected section and do not silently repair ambiguous claim language.

## Expected Oracle Shape

`expected.json` should use source-backed expectations:

```json
{
  "schema": "apa-public-patent-benchmark-expected-v1",
  "case_id": "public-software-example",
  "targeted_skills": ["apa-software-patent"],
  "source_class": "public_patent",
  "oracle_status": "human-reviewed",
  "expected": {
    "technical_improvements": [
      {
        "id": "TI01",
        "summary": "Concrete technical effect stated in the public record.",
        "source_span": {"file": "source.md", "lines": [10, 18], "sha256": "..."},
        "confidence": "high"
      }
    ],
    "claim_families": ["method", "system", "non-transitory-computer-readable-medium"],
    "support_expectations": [],
    "risk_flags": []
  }
}
```

Do not include legal conclusions. Use `risk_flags` such as `abstract-idea-risk`,
`generic-computer-risk`, `functional-claim-support-gap`, `crm-transitory-signal-risk`, or
`new-matter-risk` only as benchmark expectations.

## Reproduction Report Shape

`benchmark_report.json` should include:

```json
{
  "schema": "apa-public-patent-benchmark-report-v1",
  "case_id": "public-software-example",
  "target_skill": "apa-software-patent",
  "run_id": "2026-06-21T120000Z",
  "mode": "offline|safe-fetch|advisory-llm",
  "source_hash": "...",
  "scores": {
    "technical_improvement_coverage": 0.0,
    "claim_family_coverage": 0.0,
    "support_span_coverage": 0.0,
    "unsupported_addition_count": 0,
    "legal_overclaim_count": 0
  },
  "findings": [
    {
      "severity": "blocking|fix-before-tuning|warning|info",
      "path": "domain/software/software_patent_report.json",
      "message": "Expected TI01 was not recovered.",
      "source_span": {"file": "source.md", "lines": [10, 18], "sha256": "..."}
    }
  ],
  "proposed_skill_changes": []
}
```

## Tuning Loop

1. Freeze the fixture source and expected oracle before editing a target skill.
2. Run the target skill and generate a report.
3. Convert one gap into one small target-skill change.
4. Rerun the same fixture plus existing simulations.
5. Keep the change only if it improves the report and introduces no blockers.

Store failed hypotheses in the run notes when useful; do not rewrite the public source or expected
oracle to make the target skill look better.
