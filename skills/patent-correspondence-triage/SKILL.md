---
name: patent-correspondence-triage
description: "Triage USPTO post-filing correspondence into privacy-minimized records, notice-specific date estimates, and filing-receipt discrepancy audits. Use when reviewing a missing-parts notice, corrected-paper notice, omitted-item notice, Office Action routing question, or filing receipt. Invoke as /apa-correspondence. Do not use to choose a legal response, calculate an authoritative deadline, sign, pay, or file."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/patent-correspondence-triage/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# Patent correspondence triage (`/apa-correspondence`)

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

Keep the source correspondence outside Git. Render and inspect every PDF page locally, extract text
or OCR locally when needed, then run:

```bash
node packages/apa-correspondence/cli.mjs triage --input <private-local-notice.txt> --json
```

Review the generated facts against the original notice. Set verification flags only after that
comparison. Write the privacy-minimized record into a private matter only when requested:

```bash
node packages/apa-correspondence/cli.mjs triage \
  --input <private-local-notice.txt> --matter <private-matter> --write --json
```

The command stores a basename, byte count, and SHA-256, but never source text. It writes only under
`<matter>/correspondence/` because correspondence and receipt evidence must remain matter-local.

## Route

| Observed paper or task | Route |
|---|---|
| Notice to File Missing Parts of Provisional Application | Triage here, verify every fact, then invoke `/apa-missing-parts` |
| Notice to File Missing Parts of Nonprovisional Application | Triage here, verify every fact, then invoke `/apa-missing-parts` |
| Notice to File Corrected Application Papers | Produce a summary only; require human/practitioner routing |
| Notice of Omitted Item(s) | Produce a summary only; require human/practitioner routing |
| Office Action | Stop correspondence response generation and route to `/apa-office-action` |
| Unknown, ambiguous, conflicting, or low-confidence paper | Stop after the record; do not calculate or prepare a response |
| Filing receipt | Human-transcribe the defined fields, then run `receipt-audit` |

## Workflow

1. Treat the original PDF as private evidence. Inspect every page, including barcodes, continuation
   pages, enclosures, and the mailing-date header. This prevents silent loss from image-only pages.
2. Run `triage` on local extracted text. If the input is still a PDF, accept the fail-closed
   extraction/OCR handoff; do not rename a PDF to text.
3. Compare classification, mailing date, stated response period, each issue, each stated fee,
   extension language, response channel, and stated consequence against the source.
4. Resolve conflicts by correcting the privacy-minimized JSON from the source. Never paste source
   text, application numbers, people, addresses, or customer data into the record.
5. Set the corresponding `human_verified` flags only after source comparison.
6. Estimate a notice date only from the verified record:

   ```bash
   node packages/apa-correspondence/cli.mjs deadlines \
     --record <verified-record.json> --entity <large|small|micro> --as-of <YYYY-MM-DD> --json
   ```

7. Treat every date and amount as an estimate. Verify the original notice, Patent Center record,
   current fee page, entity status, 37 CFR 1.7, and any USPTO closure before relying.
8. For a filing receipt, transcribe only the fields defined by
   `docs/schemas/apa-filing-receipt-input-v1.schema.json`, mark the transcription human-verified,
   and run:

   ```bash
   node packages/apa-correspondence/cli.mjs receipt-audit \
     --matter <private-matter> --receipt <private-receipt-record.json> --write --json
   ```

9. Review every discrepancy. Treat corrected-ADS and priority-chain flags as questions for a human
   or registered practitioner, never as proof of an error or a selected correction.

## Example

Input excerpt after local extraction:

```text
NOTICE TO FILE MISSING PARTS OF PROVISIONAL APPLICATION
DATE MAILED: 02/03/2031
Applicant is given a period of TWO months ...
```

Expected output shape:

```json
{
  "schema": "apa-correspondence-record-v1",
  "classification": {
    "notice_type": "provisional-missing-parts",
    "human_verified": false
  },
  "mailing_date": {
    "value": "2031-02-03",
    "human_verified": false
  },
  "authoritative_deadline": false,
  "human_filing_required": true
}
```

The unverified flags are the correct initial output. Do not convert an extraction result into a
verified fact without looking at the source page.

## Validation Loop

1. Run `triage --json`.
2. Compare every extracted field to every source page.
3. Run `deadlines --json`; expect `blocked-unverified` until required verification flags are true.
4. Check that the fee family matches the notice: provisional `1.17(u)`, ordinary nonprovisional
   `1.17(a)`. A null amount is safer than a stale or unverified quote.
5. Generate or refresh the local `/apa-review-form`; changed correspondence hashes must invalidate
   prior review state.
6. Fix discrepancies and repeat until the record is source-verified and the human filing boundary
   remains intact.

## Gotchas

- A granted filing date does not mean all application papers are complete.
- A filename, OCR result, or first page alone is not enough to classify a notice.
- Calendar-month periods are not fixed day counts. Weekend/holiday adjustment remains tentative.
- Provisional extension fees use a different fee family from ordinary prosecution extensions.
- A filing receipt can differ because of formatting or because the matter manifest is stale. Surface
  both values; do not silently pick one.
- Patent Center submission, fee payment, signatures, certifications, and legal-response selection
  are irreversible human acts outside this skill.

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
