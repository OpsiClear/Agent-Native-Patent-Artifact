# Public USPTO Sample Office Action Fixture

Source class: `public_office_action`

Public source:
- USPTO MPEP 2262, "Form and Content of Office Action," which includes a sample first Office Action
  in an ex parte reexamination proceeding.
- `https://www.uspto.gov/web/offices/pac/mpep/s2262.html`

Use in this repo:
- This benchmark file is a compact, parser-friendly transcription modeled on the public USPTO sample
  category.
- It is not a private prosecution document and is not a docketing record.

```oa
mailing_date: 2026-01-15
examiner: "Public Sample Examiner"
application_no: "90/000,000"
action_type: non-final
source_class: public_office_action
```

## Detailed Action

This public benchmark contains two representative rejection records.

### REJ01 - 102 rejection over the public source reference

```binding
ground: "102"
claims: [CLM01]
references: [PA01]
examiner_reasoning: >
  The public sample asserts that the cited reference discloses each element of claim 1.
```

### REJ02 - 103 rejection over a combination

```binding
ground: "103"
claims: [CLM02]
references: [PA01, PA02]
examiner_reasoning: >
  The public sample asserts that the combination would have suggested the dependent feature with a
  reasonable expectation of success.
```
