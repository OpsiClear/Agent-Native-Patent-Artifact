# Prompt-driven PDF form filling: implementation evidence

Review date: 2026-07-28

Decision: **SUPPORTED FOR SUPERVISED DRAFTING** on the six hash-pinned ordinary AcroForm PDFs below.
The three Patent Center XFA PDFs remain deliberately unsupported. This is a software capability
decision, not a legal decision that a form is required, correct, complete, or ready to file.

## Verified form matrix

The official bundle was rebuilt from the allowlisted USPTO URLs in `docs/uspto-forms.json`. Each
download matched its pinned byte count and SHA-256 before inspection.

| Form profile | Pages | AcroForm fields | Automated text | Automated checkboxes | Signature excluded | Result |
|---|---:|---:|---:|---:|---:|---|
| AIA/01 inventor declaration | 2 | 8 | 5 | 2 | 1 | All checkboxes checked, reopened, and verified |
| AIA/15 utility transmittal | 2 | 55 | 27 | 27 | 1 | All checkboxes checked, reopened, and verified |
| AIA/22P provisional extension | 2 | 33 | 16 | 16 | 1 | All checkboxes checked, reopened, and verified |
| SB/16 manual cover sheet | 3 | 58 | 42 | 15 | 1 | All checkboxes checked, reopened, and verified |
| SB/08A manual IDS sheet | 2 | 139 | 133 | 6 | 0 | All checkboxes checked, reopened, and verified |
| SB/08B manual IDS sheet | 2 | 38 | 28 | 10 | 0 | All checkboxes checked, reopened, and verified |
| AIA/14 Patent Center ADS | 1 | XFA | 0 | 0 | n/a | Refused before PDF parsing; source hash unchanged |
| SB/08 Patent Center IDS | 1 | XFA | 0 | 0 | n/a | Refused before PDF parsing; source hash unchanged |
| SB/16 Patent Center cover sheet | 1 | XFA | 0 | 0 | n/a | Refused before PDF parsing; source hash unchanged |

The program never treats structural fillability as authority to choose a response. Exact source
hashes select a form policy, and every current checkbox has a verified printed label. The agent may
transcribe only an exact human-confirmed JSON boolean and may not infer or recommend a declaration,
certification, signer role, entity status, fee, payment instruction, government-interest response,
or other legal or financial choice. Actual signature fields remain excluded.

Across the six supported forms, the profiles authorize 251 non-signature text fields and 76
checkboxes. A synthetic real-form matrix checked all 76 boxes, saved each draft, reopened it, and
verified every checked state. All four actual signature fields and every unselected value remained
unchanged. Separate synthetic tests also cleared a prechecked checkbox and rejected string values
such as `"true"`.

## Prompt and confirmation evidence

The cross-host skill uses the agent's normal chat interface as the intake layer:

1. infer values from hash-pinned, human-verified matter JSON;
2. ask a compact batch for unresolved text and exact checked/unchecked/unchanged states without
   choosing any response;
3. store private values in a matter-local plan, not command arguments;
4. print every selected field name, label, type, value, provenance, source hash, and confirmation
   digest;
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
- signature-field refusal, exact checkbox booleans, checked and unchecked state changes, and
  checkbox-state digest invalidation;
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

The checkbox-enabled 13-page matrix showed all 76 selected controls in their intended widgets with
no clipping, overlap, missing glyph, or stray mark. All four signature lines remained blank, and
privacy-statement pages were unchanged. The official SB/16 ADS control uses its own filled-square
on-state while the other selected controls render as checkmarks; both reopen as boolean `true`.

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
- Supply and confirm every legal or financial checkbox choice independently; the model must not
  select or recommend one.
- Keep the actual signature manual. Adjacent name, date, authority, and contact fields may be
  transcribed only from exact confirmed values and never imply execution.
- Determine the form route, legal response, dates, entity status, fees, and payment instructions
  independently.
- Stop at the draft boundary: the skill cannot upload, sign, execute payment, submit, or mark a
  filing complete.
