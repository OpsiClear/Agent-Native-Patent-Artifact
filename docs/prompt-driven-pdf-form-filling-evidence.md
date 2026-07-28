# Prompt-driven PDF form filling: implementation evidence

Review date: 2026-07-28

Decision: **SUPPORTED FOR SUPERVISED DRAFTING** on the six hash-pinned ordinary AcroForm PDFs below.
The three Patent Center XFA PDFs remain deliberately unsupported. This is a software capability
decision, not a legal decision that a form is required, correct, complete, or ready to file.

## Verified form matrix

The official bundle was rebuilt from the allowlisted USPTO URLs in `docs/uspto-forms.json`. Each
download matched its pinned byte count and SHA-256 before inspection.

| Form profile | Pages | AcroForm fields | Automated text fields | Result |
|---|---:|---:|---:|---|
| AIA/01 inventor declaration | 2 | 8 | 3 | Allowlisted text draft created, reopened, and verified |
| AIA/15 utility transmittal | 2 | 55 | 24 | Allowlisted text draft created, reopened, and verified |
| AIA/22P provisional extension | 2 | 33 | 4 | Application-identifying text draft created, reopened, and verified |
| SB/16 manual cover sheet | 3 | 58 | 31 | Allowlisted text draft created, reopened, and verified |
| SB/08A manual IDS sheet | 2 | 139 | 133 | Text-cell draft created, reopened, and verified |
| SB/08B manual IDS sheet | 2 | 38 | 28 | Text-cell draft created, reopened, and verified |
| AIA/14 Patent Center ADS | 1 | XFA | 0 | Refused before PDF parsing; source hash unchanged |
| SB/08 Patent Center IDS | 1 | XFA | 0 | Refused before PDF parsing; source hash unchanged |
| SB/16 Patent Center cover sheet | 1 | XFA | 0 | Refused before PDF parsing; source hash unchanged |

The program never treats structural fillability as permission to populate every field. Exact
source hashes select a form policy. All buttons and choices are human-owned. Signatures,
certifications, signer identity/authority, entity status, fees, payment, government-interest
assertions, and filing confirmations are explicitly excluded.

All 223 automated text fields across the six supported forms were populated with synthetic values,
saved, reopened, and compared with the plan. Every prohibited and unselected field value remained
unchanged.

## Prompt and confirmation evidence

The cross-host skill uses the agent's normal chat interface as the intake layer:

1. infer values from hash-pinned, human-verified matter JSON;
2. ask a compact batch only for unresolved factual values;
3. store private values in a matter-local plan, not command arguments;
4. print every selected field, value, provenance, source hash, and confirmation digest;
5. pause for explicit human confirmation;
6. bind the confirmation to the exact canonical plan digest;
7. create a new `*_DRAFT.pdf` without overwriting the source;
8. reopen both PDFs and compare every field value;
9. emit a manifest that omits plaintext field values but remains a private matter artifact because
   it contains a value-derived confirmation digest.

A changed value, source PDF, form profile, confidentiality mode, form-route approval, data-handling
approval, named interaction host, approval time, or confirmation digest blocks filling. Unexpected
plan, field, confirmation, or manifest properties are rejected so contradictory status or
plaintext-value properties cannot be smuggled into a mechanically verified artifact.

## Mechanical and privacy tests

The synthetic test suite covers:

- engine and profile integrity;
- AcroForm inspection and field policy;
- unknown-form and unknown-field refusal;
- XFA refusal;
- explicit human-selected form-route and data-handling approvals bound to the current
  `PATENT.md` confidentiality mode;
- human-confirmed and verified-matter JSON provenance;
- missing and stale confirmation;
- tampered plan status, field inventory, and confirmation-boundary refusal;
- prohibited signature and checkbox fields;
- source preservation and output non-overwrite;
- matter path confinement, symlink/junction escape refusal, Windows alternate-data-stream and
  reserved-device-name rejection, and exclusive non-overwriting writes;
- a 64 MiB PDF input cap, 5 MiB JSON cap, and 1 MiB aggregate selected-value review cap;
- the printed 500-character SB/16 invention-title limit and a legible text-fitting floor;
- selected-value verification;
- unchanged prohibited and unselected values;
- manifests that omit plaintext values, remain explicitly private, and preserve required
  visual-review state;
- unsupported glyph refusal before output; and
- portable CLI behavior.

A private external validation matter was checked with `apa-form-fill` selected as a support skill.
The check was read-only and aggregate-only, reported no unsafe linked input paths, and emitted no
matter path, title, inventor data, citations, source hash, or application identifiers.

## Visual evidence

All 13 pages across synthetic-data drafts for the six supported AcroForms were rendered and visually
inspected. An initial SB/16 render exposed an oversized invention-title appearance that mechanical
value comparison could not detect. The text appearance algorithm was revised to fit each widget's
actual width and height with a legibility floor, and a deterministic refusal test now covers text
that cannot fit at that floor. The matrix also exposed SB/08 text widgets without a default
appearance (`/DA`); the engine now supplies a black Helvetica default appearance only when one is
absent before regenerating appearances.

The final 13-page matrix showed no clipped text, overlap, missing glyph, or unexpected mark. Text
appeared in the intended fields within their bounds. Signer, signature, certification, choice,
government-interest, entity, fee, and payment controls remained blank. Poppler emitted a
missing-display-font warning for an original form font, but both original form text and inserted
Helvetica text rendered legibly.

## Cross-host packaging evidence

The real npm prepack lifecycle generates complete Claude Code, Codex, and Cursor variants, including
the offline PDF runtime, form profiles, references, licenses, and trigger fixtures. A packed-tarball
consumer smoke installs the Codex variant into its standard `.agents/skills` root and checks that the
installed directory, `SKILL.md` name, `skill.yaml` id, and documented `apa-*` invocation agree.
ChatGPT has no standard local installer root; after import, the same skill can conduct prompt-based
intake, but it claims PDF creation only when the active environment exposes local files and Node
command execution.

## Residual boundaries

- Verify the live official form and instructions before use; a revised hash is inspect-only.
- Use Adobe Acrobat Reader for XFA and for final human review.
- Review every output page, not only populated pages.
- Manually enter all human-owned choices and signature-block data.
- Determine form route, legal response, dates, entity status, and fees independently.
- Stop at the draft boundary: the skill cannot upload, certify, pay, submit, or mark a filing complete.
