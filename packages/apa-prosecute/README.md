# apa-prosecute - post-filing office-action assistant (optional)

`apa-prosecute` is the **optional post-filing extension** of the Agent-Native-Patent-Artifact (APA)
protocol (see `docs/protocol.md` §9). The **core** APA protocol stops at filing; this package goes
**beyond that core scope** to model the examination round-trip: capturing an Office Action,
estimating the response period, and scaffolding a response.

This is **deeper UPL territory** than the pre-filing tools. Accordingly:

- Everything it emits is a **flag or question for a registered practitioner**, never a legal
  conclusion or opinion.
- Deadlines are **estimates to verify** - not authoritative, not a docketing system of record.
- **APA never signs and never files.** A registered practitioner authors the response, decides
  every argument and amendment, and files it.

Plain Node.js ESM, **zero dependencies**, Node >= 21, Node built-ins only. It reuses the shared
parser at `lib/apa-parse.mjs` (no second YAML parser).

## The `prosecution/` format

The extension adds an optional area inside a matter:

```
<matter>/prosecution/
  oa-NN.md         # an Office Action: file-level ```oa header + ### REJ## rejection sections
  response-NN.md   # the scaffolded response to oa-NN (flags & questions, not opinions)
  office_action_report.json # machine report: flags/checkpoints, not legal conclusions
```

`PATENT.md` `status` gains post-filing values: `filed | under-examination | office-action | responded`.

### `oa-NN.md` - Office Action

A **file-level** fenced ` ```oa ` block carries the header:

```oa
mailing_date: 2026-03-02
examiner: "Pat Examiner (Art Unit 3754)"
application_no: "17/000,000"
action_type: non-final        # non-final | final | restriction
```

Then one `### REJ## - <gist>` section per rejection, each with a ` ```binding ` block:

```binding
ground: "102"                 # 101 | 102 | 103 | 112a | 112b | 112f | double-patenting
claims: [CLM01]               # rejected claims (CLM##)
references: [PA01]            # art the examiner cited (PA##; 102/103)
examiner_reasoning: >
  <verbatim or summarized examiner reasoning>
```

### `response-NN.md` - Response (scaffold)

For each `REJ##`, the scaffold emits the affected claims, a **flags-and-questions** argument block
(NOT conclusions), and a proposed-amendment block written under the **new-matter guard**: where the
specification as filed does not support an amendment, it says
**"Not supported by the spec as filed - route to counsel"** rather than inventing support. The
response header marks it a draft a human practitioner completes, argues, and files.

## Deadlines (37 CFR 1.136(a)) - an estimate, always

From the OA `mailing_date` (a **string input**, never `Date.now`), the tool computes:

- a **3-month shortened statutory period**,
- the **6-month statutory maximum** (35 USC 133), and
- the per-month **extension-of-time** rows in between (extension months 1-3, i.e. response in
  month 4/5/6) with escalating **37 CFR 1.17(a)** fees.

Calendar-month arithmetic clamps overflow sanely (e.g. mailed `2024-11-30` + 3 months ->
`2025-02-28`). Extension fees come from a dated fee schedule (`docs/fee-schedule.*.json`, under a
`prosecution.extensions` or `extensions` key) if present; otherwise **clearly-labeled placeholder**
amounts are used and the result is flagged `_unverified: true`.

> **Caveat (do not override):** every date and fee is an **ESTIMATE - verify against PAIR/Patent
> Center; not a docketing system of record.** Weekends/holidays (37 CFR 1.7), final-action periods,
> and restriction/RCE timing can shift the actual due date. APA computes no authoritative deadline.

## CLI

```sh
# Parse an Office Action and print its header + rejections
node packages/apa-prosecute/cli.mjs parse --oa <matter>/prosecution/oa-01.md [--json]

# Estimate the response period from a mailing date...
node packages/apa-prosecute/cli.mjs deadlines --mailed 2026-03-02 [--json]
# ...or read the mailing date from the OA header
node packages/apa-prosecute/cli.mjs deadlines --oa <matter>/prosecution/oa-01.md [--json]

# Scaffold a response (writes response-NN.md plus office_action_report.json when --write is given)
node packages/apa-prosecute/cli.mjs respond --matter <matter> --oa <matter>/prosecution/oa-01.md --write
```

Exit codes: `0` ok · `2` usage error. Every run prints the persistent disclaimer:
*"Post-filing assistance: flags and estimates for a registered practitioner. APA does not file or
compute authoritative deadlines."*

## Programmatic API

```js
import { parseOfficeAction, parseOfficeActionFile } from "apa-prosecute/parse";
import { computeDeadlines } from "apa-prosecute/deadlines";
import { scaffoldResponse } from "apa-prosecute/respond";

const { header, rejections } = parseOfficeActionFile("prosecution/oa-01.md");
const d = computeDeadlines(header.mailing_date);          // { statutory3Month, statutory6Month, extensions, ... }
const { markdown } = scaffoldResponse("<matter>", "prosecution/oa-01.md");
```

## Scope

Office-action response is the only post-filing capability. Further prosecution (appeals, RCEs,
continuations as new matters) remains out of scope. No network access; everything is local and
deterministic from the string mailing date.

## Tests

```sh
cd packages/apa-prosecute && node --test
```
