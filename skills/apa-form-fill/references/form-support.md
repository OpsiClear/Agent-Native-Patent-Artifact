# Supported USPTO PDF Forms

The fill engine recognizes the exact SHA-256 entries bundled in
[`form-profiles.json`](form-profiles.json). A matching hash is required because field names and legal
meaning can change when the USPTO revises a form. In the APA source repository, automated tests also
bind this bundled registry to `docs/uspto-forms.json`; an installed skill does not require that
repository-only file at runtime. The bundled registry itself records the official USPTO forms page,
each official download URL, retrieval date, byte count, and hash.

| Profile | Program support | Automated scope |
|---|---|---|
| AIA/01 inventor declaration | AcroForm draft | Allowlisted bibliographic text only; signature block and declaration choices untouched |
| AIA/15 utility transmittal | AcroForm draft | Allowlisted bibliographic and enclosure text only; all choices and signer fields untouched |
| AIA/22P provisional extension | AcroForm draft | Application-identifying text only; extension, entity, fee, payment, petition, and signer fields untouched |
| SB/16 manual cover sheet | AcroForm draft | Allowlisted inventor, title, address, and document-count text only |
| SB/08A manual IDS sheet | AcroForm draft | Text cells only; translation choices untouched |
| SB/08B manual IDS sheet | AcroForm draft | Text cells only; translation choices untouched |
| AIA/14 Patent Center ADS | Refuse | XFA |
| SB/08 Patent Center IDS | Refuse | XFA |
| SB/16 Patent Center cover sheet | Refuse | XFA |

## XFA Contract

Refuse XFA before loading the document into the PDF engine. Generic PDF libraries can remove XFA
datasets or save a visually blank document. Direct the human to Adobe Acrobat Reader and keep all
entry, review, and saving manual. Never convert an XFA failure into an ordinary AcroForm by deleting
XFA data.

## Revision Contract

Treat an unknown hash as inspect-only:

1. Download the form from the official USPTO form page.
2. Record source URL, retrieval evidence, byte count, and SHA-256.
3. Inspect every page and every field in a form-capable viewer.
4. Independently map safe text fields and prohibited controls.
5. Add or revise the profile with tests.
6. Re-run visual filling tests before enabling the new hash.

Never bypass the hash gate for convenience.
