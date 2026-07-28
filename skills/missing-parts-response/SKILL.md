---
name: missing-parts-response
description: "Prepare blocked documentation checklists for USPTO Notices to File Missing Parts in provisional and utility nonprovisional applications. Use when a human-verified correspondence record exists and response papers, deadline and fee verification, signer authority, PDF review, or Patent Center checkpoints must be organized. Invoke as /apa-missing-parts. Do not use for Office Actions, legal-response selection, signatures, payments, or filing."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/missing-parts-response/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# Missing-parts response (`/apa-missing-parts`)

## Operating Posture
- APA is supervised drafting software, not a registered practitioner and not legal advice.
- A competent human must independently review every output; flags are not patentability, FTO, validity, infringement, or 112 conclusions.
- Only natural persons may be named as inventors; AI systems are tools and are never inventor names.
- APA never signs, certifies, asserts micro-entity status, or files; Patent Center submission remains a human act.
- For pro-se users, provide neutral education, options, and questions only; do not choose claim scope, filing timing, art to cite, or amendments.

### Safety References
| Reference | Load when |
|---|---|
| [Legal guardrails](references/legal-guardrails.md) | Need detailed no-legal-advice, inventorship, pro-se, candor, or submit-boundary rules. |
| [USPTO rule pack](references/uspto-rule-pack.md) | Need claim form, 101/102/103/112, IDS, or dated USPTO rule anchors. |
| [Confidentiality sinks](references/confidentiality-sinks.md) | Any content may leave the local machine, including prior-art queries, cloud LLMs, fetches, npx, or filing exports. |
| [Drawing standards](references/drawing-standards.md) | Creating, upgrading, reviewing, exporting, or assembling patent drawings. |
| [Source registry](references/source-registry.md) | Prior-art search needs canonical source IDs, access modes, or human-verification requirements. |

## Quick Start

Start only from an `apa-correspondence-record-v1` that a human compared against every page of a
supported Notice to File Missing Parts. Then run:

```bash
node packages/apa-correspondence/cli.mjs prepare-missing-parts \
  --matter <private-matter> \
  --record <human-verified-record.json> \
  --entity <large|small|micro> \
  --as-of <YYYY-MM-DD> \
  --write --json
```

The outputs are `correspondence/response-NN.json` and `correspondence/response-NN.md`. They must
remain `BLOCKED-HUMAN-ACTIONS`; the skill organizes work but never selects, signs, pays, or submits.

## Route

| Verified notice type | Document options surfaced without selection |
|---|---|
| `provisional-missing-parts` | SB/16 cover sheet, corrected AIA/14 when applicable, conditional AIA/22P |
| `nonprovisional-missing-parts` | AIA/14, conditional AIA/01, conditional AIA/15 |
| Office Action | Stop and route to `/apa-office-action` |
| Corrected-paper, omitted-item, unknown, ambiguous, or unverified notice | Stop; return to `/apa-correspondence` and human/practitioner routing |

Use `node packages/apa-correspondence/cli.mjs forms --json` to see the pinned official-form registry.
Release copies are convenience artifacts; verify the current official USPTO forms page before use.

## Workflow

1. Validate the source record. Refuse preparation if classification, mailing date, stated period,
   issues, stated fees, extension language, response channel, or stated consequences are unverified.
2. Generate the machine manifest and Markdown checklist. Preserve every issue as unresolved.
3. Compare the issue list with the notice page by page. Add matter-local evidence paths; do not copy
   private notice content into Git or a public release.
4. Require a human or registered practitioner to choose the document route. SB/16 versus AIA/14,
   corrected-ADS markings, priority/benefit corrections, omitted papers, and signer authority can
   change legal effect.
5. Verify the tentative base date against the notice and Patent Center. Verify any extension
   availability before using an extension row.
6. Verify the fee family and live amount:
   - provisional extension: 37 CFR 1.17(u);
   - ordinary nonprovisional extension: 37 CFR 1.17(a);
   - late provisional filing fee or cover sheet: 37 CFR 1.16(g).
7. Open official forms in the required viewer. Patent Center auto-load SB/16, AIA/14, and SB/08 are
   XFA forms and may show only a `Please wait` placeholder in browsers or generic PDF previews.
8. A human completes fields, determines signer authority, signs, verifies entity status, inspects
   every final PDF page, uploads, certifies, pays, and submits through Patent Center.
9. Save the confirmation and updated filing receipt privately, run `/apa-correspondence`
   `receipt-audit`, and resolve each discrepancy with human review.

## Example

Input:

```json
{
  "schema": "apa-correspondence-record-v1",
  "classification": {
    "notice_type": "provisional-missing-parts",
    "human_verified": true
  },
  "mailing_date": {
    "value": "2031-02-03",
    "human_verified": true
  },
  "response_period": {
    "months": 2,
    "human_verified": true
  }
}
```

Expected response state:

```json
{
  "schema": "apa-missing-parts-response-v1",
  "status": "BLOCKED-HUMAN-ACTIONS",
  "authoritative_deadline": false,
  "completion": {
    "submitted_by_human": false,
    "confirmation_receipt_saved": false
  },
  "boundaries": {
    "signed_or_certified_by_apa": false,
    "fee_paid_by_apa": false,
    "patent_center_submission_by_apa": false
  }
}
```

## Validation Loop

1. Run `prepare-missing-parts --json`.
2. Validate against `docs/schemas/apa-missing-parts-response-v1.schema.json`.
3. Confirm each issue in the source notice appears exactly once and remains unresolved until a human
   records evidence.
4. Confirm every document option has `selected: false` and every deferred human action has
   `completed: false`.
5. Confirm provisional output contains no declaration or IDS requirement, and utility output
   contains no provisional extension form or cover-sheet requirement unless the notice itself
   justifies a separately reviewed paper.
6. Render and inspect final human-produced PDFs, refresh `/apa-review-form`, then repeat after any
   notice, response, or form hash changes.

## Gotchas

- Do not use the notice-stated fee as a live payable amount without current schedule and entity review.
- Do not infer extension availability from a familiar notice type; require verified notice language.
- Do not mark a corrected ADS, declaration, petition, or cover sheet as signed or filed.
- Do not treat a Patent Center upload list as proof of submission.
- Do not merge this workflow with Office Action timing or response arguments.

### Scan-at-sink before sending (sink: filing)
Confidentiality of an unfiled invention is load-bearing. Before this content leaves the machine:
1. Write the EXACT bytes to be sent to a temp file.
2. Run the redaction guard on THAT file: `node packages/apa-redact/cli.mjs --from-file <tmp>`.
3. Branch on the exit code: **0** = clean, send the SAME file; **2** = MEDIUM findings — confirm
   each with the human (sterner if the destination is public) before sending; **3** = HIGH findings
   — **block**; do not send. Never scan a string then re-render a different payload.
4. For a cloud-LLM or foreign destination, confirm a zero-retention/no-training backend and obtain
   logged human acknowledgment first (35 USC 102 secrecy / 184 export).
The guard catches accidents and carelessness, not a determined leaker — it is a guardrail, not
airtight enforcement.
