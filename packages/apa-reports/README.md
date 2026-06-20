# apa-reports

Zero-dependency schema helpers for semantic APA reports. These reports record flags, questions,
evidence spans, recommendations, and human checkpoints. They are not legal opinions and do not
certify patentability, novelty, validity, FTO, filing readiness, search completeness, or USPTO
compliance.

## Report files

| Type | Skill | Default file |
|---|---|---|
| `claims` | `/apa-claims` | `logic/claims_report.json` |
| `patentability` | `/apa-analyze` | `logic/patentability_report.json` |
| `examiner_adversary` | `/apa-examiner` | `trace/examiner_adversary_report.json` |
| `office_action` | `/apa-office-action` | `prosecution/office_action_report.json` |

## CLI

```sh
node packages/apa-reports/cli.mjs list
node packages/apa-reports/cli.mjs scaffold claims --matter examples/minimal-patent-artifact
node packages/apa-reports/cli.mjs check examples/minimal-patent-artifact/logic/claims_report.json
```

Validation is structural. A valid report must use the shared envelope:

- `schema`, `report_type`, `skill`, `matter`, `legal_posture`
- `inputs`, `outputs`
- `human_checkpoints`
- `findings`
- `questions_for_attorney`, `questions_for_inventor`
- `next_allowed_steps`

Every finding must include `finding_type`, `severity`, `rule_anchor`, `evidence_span`, and
`recommendation`.

