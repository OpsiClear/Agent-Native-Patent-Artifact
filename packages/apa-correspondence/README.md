# apa-correspondence

Deterministic, privacy-minimized helpers for USPTO correspondence after a filing.

The package classifies supported notice text, records only procedural facts plus a source hash,
estimates notice-stated response dates after human verification, generates blocked missing-parts
checklists, and compares a human-transcribed filing receipt with `PATENT.md`.

It never gives legal advice, calculates an authoritative deadline, chooses a response, signs or
certifies a paper, establishes entity status, pays a fee, or submits through Patent Center.

```bash
node packages/apa-correspondence/cli.mjs triage --input notice.txt --json
node packages/apa-correspondence/cli.mjs deadlines --record correspondence-record.json --json
node packages/apa-correspondence/cli.mjs prepare-missing-parts \
  --matter C:/path/to/private-matter --record verified-record.json --write --json
node packages/apa-correspondence/cli.mjs receipt-audit \
  --matter C:/path/to/private-matter --receipt filing-receipt.json --write --json
node packages/apa-correspondence/cli.mjs forms --json
```

PDF input is detected and rejected with an extraction/OCR handoff. Keep private PDFs local, inspect
every page, and produce a human-verified record before generating a response checklist.

Machine contracts live under `docs/schemas/`. Official USPTO form metadata is hash-pinned in
`docs/uspto-forms.json`; build the directly downloadable release assets with:

```bash
node scripts/build-uspto-form-bundle.mjs --output dist/uspto-forms
node scripts/build-uspto-form-bundle.mjs --verify dist/uspto-forms
```

Patent Center auto-load SB/16, AIA/14, and SB/08 are XFA PDFs. Open downloaded copies in Adobe
Acrobat Reader because generic renderers may show a blank page or only a `Please wait` placeholder.
