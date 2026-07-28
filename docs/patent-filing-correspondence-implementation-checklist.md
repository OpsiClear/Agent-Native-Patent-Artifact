# Patent Filing and Correspondence Implementation Checklist

This checklist is the implementation and release contract for provisional and nonprovisional
filing-document navigation, USPTO pre-examination correspondence, filing-receipt review, and the
downloadable official-form bundle.

The software remains a supervised documentation aid. It does not give legal advice, determine an
authoritative deadline, select a legal response, sign or certify a form, establish entity status,
pay a fee, or submit through Patent Center.

## 0. Completion evidence

- [x] Every checked item below points to committed source, a deterministic test, or release evidence.
- [x] The private notice and private patent matter are never copied into Git, a fixture, a release,
  a log, or a generated documentation page.
- [x] Synthetic fixtures contain no real application number, confirmation number, person, business,
  address, docket, title, barcode, or source-document hash.
- [x] The full `npm run build` gate passes from a clean generated state.
- [x] `git diff --check` passes and the worktree is clean after commit.
- [x] The branch commit is pushed before a release tag is created.
- [x] A GitHub release exposes the verified form bundle and each core form as a direct-download asset.

## 1. Correspondence protocol and taxonomy

- [x] Add a canonical `correspondence/` matter area to `docs/protocol.md`.
- [x] Define a machine-readable correspondence record with:
  - [x] source filename and SHA-256 without embedded private source text;
  - [x] notice type, application type, mailing date, stated response period, and confidence;
  - [x] one record per issue, required item, stated fee, extension statement, and consequence;
  - [x] human-verification flags for classification, dates, issues, fees, and signer choice;
  - [x] explicit `estimate-not-authoritative` and `human-files` boundaries.
- [x] Define fail-closed notice taxonomy entries for:
  - [x] provisional Notice to File Missing Parts;
  - [x] nonprovisional Notice to File Missing Parts;
  - [x] Notice to File Corrected Application Papers;
  - [x] Notice of Omitted Item(s);
  - [x] Office Action routing to the existing prosecution workflow;
  - [x] unknown/unsupported correspondence.
- [x] Unknown, conflicting, or low-confidence notice classifications generate no response package.
- [x] Add correspondence report validation and stable finding codes.

## 2. `/apa-correspondence` skill and CLI

- [x] Add `skills/patent-correspondence-triage/` with:
  - [x] `SKILL.md.tmpl` and generated `SKILL.md`;
  - [x] `skill.yaml`;
  - [x] at least three positive and three negative trigger fixtures;
  - [x] a Quick Start, routing table, input/output example, validation loop, and gotchas;
  - [x] an explicit boundary against legal advice, filing, signatures, and authoritative deadlines.
- [x] Add `packages/apa-correspondence/cli.mjs` commands:
  - [x] `triage --input <txt|json> [--matter <dir>] [--write] [--json]`;
  - [x] `deadlines --record <json> [--schedule <json>] [--json]`;
  - [x] `receipt-audit --matter <dir> --receipt <json> [--write] [--json]`;
  - [x] `forms [--json]`.
- [x] Detect PDF input and fail with an actionable local extraction/OCR handoff rather than silently
  treating image-only content as empty.
- [x] Keep read-only triage read-only unless `--write` and a matter directory are both explicit.
- [x] Confine writes to the selected matter's `correspondence/` directory.

## 3. Missing-parts response workflow

- [x] Add `skills/missing-parts-response/` with complete metadata, triggers, examples, and boundaries.
- [x] Add `prepare-missing-parts` CLI behavior that accepts only a human-verified supported record.
- [x] Generate a response checklist and machine manifest containing:
  - [x] every notice issue and its unresolved/resolved state;
  - [x] required response document choices without selecting a legal choice;
  - [x] signer-authority verification checkpoint;
  - [x] current-form verification checkpoint;
  - [x] fee and entity-status verification checkpoint;
  - [x] deadline verification checkpoint;
  - [x] PDF visual-review checkpoint;
  - [x] Patent Center upload/payment/confirmation checkpoints owned by a human.
- [x] Provisional missing-parts profile supports cover-sheet/ADS, late provisional surcharge, and
  provisional-specific extension-fee routing.
- [x] Nonprovisional missing-parts profile supports ADS/inventorship, oath/declaration, filing/search/
  examination fees, claim/abstract/formality issues, and unsupported-item escalation.
- [x] No output contains or simulates an executed signature, entity-status certification, payment,
  transmittal certification, or filing confirmation.

## 4. Deadline and fee safety

- [x] Implement strict `YYYY-MM-DD` parsing and calendar-month arithmetic.
- [x] Preserve both the unadjusted date and any tentative weekend/federal-holiday adjustment.
- [x] Require the notice-stated response period; do not infer one for an unknown notice.
- [x] Require explicit extension language before generating extension rows.
- [x] Distinguish:
  - [x] 37 CFR 1.17(a) nonprovisional/general extension fees;
  - [x] 37 CFR 1.17(u) provisional extension fees;
  - [x] 37 CFR 1.16(g) late provisional filing-fee/cover-sheet surcharge.
- [x] Record fee code, entity-specific amount, effective date, retrieved date, official URL, and
  source snapshot hash.
- [x] Reject stale, missing, mismatched, or unverified fee tables for payable-amount output.
- [x] Test month-end, leap-year, weekend, observed federal holiday, no-response-period, conflicting
  date, wrong fee-family, and extension-disabled cases.

## 5. Official USPTO form registry and release bundle

- [x] Add a checked-in official-form manifest containing only official `uspto.gov` HTTPS URLs.
- [x] Include the core documentation forms:
  - [x] SB/16 Patent Center provisional cover sheet;
  - [x] AIA/14 Application Data Sheet;
  - [x] AIA/15 utility application transmittal;
  - [x] AIA/01 inventor declaration using an ADS;
  - [x] SB/08 Patent Center IDS;
  - [x] AIA/22P provisional extension petition.
- [x] For each form record code, title, applicability, source page, direct URL, published/updated
  label, retrieved date, SHA-256, and expected PDF media type.
- [x] Add a deterministic form fetcher that:
  - [x] permits HTTPS and official USPTO hosts only;
  - [x] bounds redirects, timeout, and bytes;
  - [x] validates the `%PDF-` signature and final official host;
  - [x] verifies the pinned SHA-256;
  - [x] writes stable release filenames;
  - [x] generates `SHA256SUMS.txt` and a bundle manifest.
- [x] Add a bundle builder that creates:
  - [x] individual verified PDFs;
  - [x] `README.md` with applicability and human-review warnings;
  - [x] `uspto-forms-manifest.json`;
  - [x] `SHA256SUMS.txt`;
  - [x] one deterministic ZIP archive.
- [x] Render every fetched PDF page and visually inspect for clipping, corruption, or unreadable text.
- [x] Add offline fixture tests for redirect, host, size, media type, PDF signature, and hash failures.
- [x] Add a release workflow that rebuilds/verifies the bundle and uploads the ZIP, manifest,
  checksums, README, and individual PDFs.
- [x] Attach assets to a GitHub release and verify each asset has a direct browser download URL.

## 6. Filing profiles

- [x] Keep the provisional assembly profile fail-closed until legal-rule and rendered-document
  approval evidence exists.
- [x] Extend the provisional profile with explicit completeness fields:
  description, necessary drawings, title, all inventors, residences, correspondence, government
  interest, cover-sheet/ADS route, filing fee, size fee, and late-item surcharge.
- [x] Encode provisional exclusions: claims, oath/declaration, and IDS are not ordinary requirements.
- [x] Extend the utility profile with explicit specification, claims, abstract, drawings-if-needed,
  ADS, declaration, filing/search/examination fees, excess claims, size, DOCX, IDS-if-used, sequence,
  large-table, and unsupported-domain checks.
- [x] Distinguish filing-date material, completeness material, optional papers, and deferred human acts.
- [x] Make upload manifests application-type-specific rather than always listing utility forms.
- [x] Add profile snapshots and negative tests for cross-profile form leakage.

## 7. Filing-receipt and priority-chain audit

- [x] Define a filing-receipt input schema with human-transcribed fields and source hash.
- [x] Compare receipt data with `PATENT.md` for application type, title, filing date, application
  number, inventors, applicant, entity status, correspondence data, and related applications.
- [x] Normalize formatting without silently equating substantive differences.
- [x] Generate stable discrepancy codes and a human-reviewed correction checklist.
- [x] Verify domestic-benefit/priority ordering and completeness as flags, not legal conclusions.
- [x] Require a corrected-ADS review when receipt and matter data differ in ADS-controlled fields.
- [x] Keep filing receipt and confirmation evidence private and matter-local.

## 8. Human review and orchestration

- [x] Extend `apa-review-form` with correspondence, deadline, missing-parts, forms, fee, signer,
  filing-receipt, and response-confirmation review cards.
- [x] Bind correspondence and response files into the review target fingerprint.
- [x] Make changed notice/response/form hashes invalidate prior review state.
- [x] Add correspondence and missing-parts topics to chat/CLI questionnaires.
- [x] Add the new skills to `skills/registry.yaml`, the generated skill graph, installer bundles,
  README, and orchestration support selection.
- [x] Keep Office Action behavior separate and route it explicitly from triage.

## 9. Privacy and regression evidence

- [x] Add a wholly synthetic three-page-equivalent missing-parts fixture representing:
  filing date granted, a two-month stated period, defective cover-sheet/ADS handling, a late
  provisional surcharge, and electronic-response metadata.
- [x] Use fictional names, addresses, numbers, dates, amounts, and hashes.
- [x] Add a privacy sentinel test that fails if known private-notice identifiers or local download
  paths appear anywhere tracked or in release assets.
- [x] Run the confidential external-matter verifier read-only and aggregate-only when the private
  matter is available; do not make its success a public fixture dependency.
- [x] Add targeted package, skill-trigger, skillgraph, release-bundle, and review-form tests.
- [x] Run three independent readiness review lanes before enabling a filing profile:
  rules/forms, deadlines/fees, and privacy/UX.

## 10. Release and completion audit

- [x] Confirm every release form hash matches the checked-in registry.
- [x] Confirm release ZIP contents match the manifest and contain no unexpected files.
- [x] Confirm direct-download release assets return successfully and preserve expected hashes.
- [x] Confirm the GitHub release notes identify source URLs, retrieval date, human-review boundary,
  and unsupported filing actions.
- [x] Confirm no private notice data, private matter data, or absolute local path exists in the
  commit, tag, release notes, release assets, or workflow logs.
- [x] Mark this checklist complete only after the commit, push, release, and post-release download
  verification all succeed.
