# Patent filing and correspondence readiness review

Review date: 2026-07-28

Decision: **RELEASE-CANDIDATE** as a supervised documentation aid. This is not a filing-readiness
decision for any particular application. Dates, legal response choices, form fields, signatures,
entity status, fees, PDF presentation, Patent Center actions, and confirmation evidence remain
human-owned.

## Independent readiness lanes

| Lane | Evidence reviewed | Result | Residual boundary |
|---|---|---|---|
| Rules and forms | `docs/rule-packs/uspto.json`; the six-core-form plus three-fallback registry in `docs/uspto-forms.json`; official-host, media, PDF-signature, size, redirect, and pinned-hash tests; deterministic bundle verification; all 17 included PDF pages covered by `docs/uspto-forms-visual-qa.md` | PASS | Verify the live notice and current official source before use. Open XFA forms in Adobe Acrobat Reader and inspect every completed page. |
| Deadlines and fees | Strict calendar-month, leap-year, weekend, observed-holiday, conflicting-date, no-period, extension-language, stale-source, entity-status, and wrong-fee-family tests; separately pinned 37 CFR 1.17(a), 1.17(u), and 1.16(g) evidence | PASS | Every date and amount is an estimate. A human verifies the notice-stated period, closure days, extension availability, current fee, and entity status. |
| Privacy and review UX | Privacy-minimized schemas; write-confinement and symlink tests; fingerprint invalidation for correspondence and response changes; local review cards/questionnaires; aggregate-only external-matter verification; source-and-bundle privacy scan against the actual private-notice sentinel | PASS | Original notices, receipts, confirmations, identifiers, and applicant data stay private and matter-local. A human adopts every review answer and performs any filing act. |

## Reproducible gates

The release candidate passed:

```text
npm run build
  563 tests passed; package isolation passed for Claude, Codex, and Cursor; smoke checks passed

npm run forms:verify
  ok: true; errors: []

node scripts/audit-patent-release-privacy.mjs <public source and bundle paths>
  480 files scanned; findings: []

APA_EXTERNAL_MATTER=<private matter> npm run verify:external-matter -- --require --json
  aggregate-only verification passed; unsafe linked input paths: 0
```

The private matter path, notice basename, notice contents, source hash, application data, and
aggregate input digest are intentionally absent from this public evidence.

## Release gate

Publish only after the implementation commit is pushed. Then download every GitHub release asset
into a fresh temporary directory, compare individual PDF and metadata hashes, verify the ZIP entry
set, rerun the privacy audit, and confirm each asset exposes a successful direct browser-download
URL. Until that post-release audit passes, the implementation checklist remains incomplete.

## Post-release audit

Release [`v0.2.0`](https://github.com/OpsiClear/Agent-Native-Patent-Artifact/releases/tag/v0.2.0)
passed the independent download audit on 2026-07-28:

- tag target matched pushed implementation commit `a163a9e`;
- all 13 expected assets downloaded from the public release;
- every downloaded asset matched the locally verified release-candidate SHA-256;
- the deterministic ZIP SHA-256 was
  `944c732d67830f1d0ec8db5dc3c8ed13a40cc430aa357f828c328fed61c0060e`;
- bundle verification found no missing, altered, or unexpected ZIP entries;
- all 13 browser-download URLs returned successfully;
- the downloaded assets and public workflow log produced zero privacy findings; and
- release notes contained the official source, retrieval date, XFA viewer warning, and human filing
  boundary.
