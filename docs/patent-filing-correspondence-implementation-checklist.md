# Patent Filing and Correspondence Implementation Checklist

This checklist is the implementation and release contract for provisional and nonprovisional
filing-document navigation, USPTO pre-examination correspondence, filing-receipt review, and the
downloadable official-form bundle.

The software remains a supervised documentation aid. It does not give legal advice, determine an
authoritative deadline, select a legal response, sign or certify a form, establish entity status,
pay a fee, or submit through Patent Center.

## 0. Completion evidence

- [ ] Every checked item below points to committed source, a deterministic test, or release evidence.
- [ ] The private notice and private patent matter are never copied into Git, a fixture, a release,
  a log, or a generated documentation page.
- [ ] Synthetic fixtures contain no real application number, confirmation number, person, business,
  address, docket, title, barcode, or source-document hash.
- [ ] The full `npm run build` gate passes from a clean generated state.
- [ ] `git diff --check` passes and the worktree is clean after commit.
- [ ] The branch commit is pushed before a release tag is created.
- [ ] A GitHub release exposes the verified form bundle and each core form as a direct-download asset.

## 1. Correspondence protocol and taxonomy

- [ ] Add a canonical `correspondence/` matter area to `docs/protocol.md`.
- [ ] Define a machine-readable correspondence record with:
  - [ ] source filename and SHA-256 without embedded private source text;
  - [ ] notice type, application type, mailing date, stated response period, and confidence;
  - [ ] one record per issue, required item, stated fee, extension statement, and consequence;
  - [ ] human-verification flags for classification, dates, issues, fees, and signer choice;
  - [ ] explicit `estimate-not-authoritative` and `human-files` boundaries.
- [ ] Define fail-closed notice taxonomy entries for:
  - [ ] provisional Notice to File Missing Parts;
  - [ ] nonprovisional Notice to File Missing Parts;
  - [ ] Notice to File Corrected Application Papers;
  - [ ] Notice of Omitted Item(s);
  - [ ] Office Action routing to the existing prosecution workflow;
  - [ ] unknown/unsupported correspondence.
- [ ] Unknown, conflicting, or low-confidence notice classifications generate no response package.
- [ ] Add correspondence report validation and stable finding codes.

## 2. `/apa-correspondence` skill and CLI

- [ ] Add `skills/patent-correspondence-triage/` with:
  - [ ] `SKILL.md.tmpl` and generated `SKILL.md`;
  - [ ] `skill.yaml`;
  - [ ] at least three positive and three negative trigger fixtures;
  - [ ] a Quick Start, routing table, input/output example, validation loop, and gotchas;
  - [ ] an explicit boundary against legal advice, filing, signatures, and authoritative deadlines.
- [ ] Add `packages/apa-correspondence/cli.mjs` commands:
  - [ ] `triage --input <txt|json> [--matter <dir>] [--write] [--json]`;
  - [ ] `deadlines --record <json> [--schedule <json>] [--json]`;
  - [ ] `receipt-audit --matter <dir> --receipt <json> [--write] [--json]`;
  - [ ] `forms [--json]`.
- [ ] Detect PDF input and fail with an actionable local extraction/OCR handoff rather than silently
  treating image-only content as empty.
- [ ] Keep read-only triage read-only unless `--write` and a matter directory are both explicit.
- [ ] Confine writes to the selected matter's `correspondence/` directory.

## 3. Missing-parts response workflow

- [ ] Add `skills/missing-parts-response/` with complete metadata, triggers, examples, and boundaries.
- [ ] Add `prepare-missing-parts` CLI behavior that accepts only a human-verified supported record.
- [ ] Generate a response checklist and machine manifest containing:
  - [ ] every notice issue and its unresolved/resolved state;
  - [ ] required response document choices without selecting a legal choice;
  - [ ] signer-authority verification checkpoint;
  - [ ] current-form verification checkpoint;
  - [ ] fee and entity-status verification checkpoint;
  - [ ] deadline verification checkpoint;
  - [ ] PDF visual-review checkpoint;
  - [ ] Patent Center upload/payment/confirmation checkpoints owned by a human.
- [ ] Provisional missing-parts profile supports cover-sheet/ADS, late provisional surcharge, and
  provisional-specific extension-fee routing.
- [ ] Nonprovisional missing-parts profile supports ADS/inventorship, oath/declaration, filing/search/
  examination fees, claim/abstract/formality issues, and unsupported-item escalation.
- [ ] No output contains or simulates an executed signature, entity-status certification, payment,
  transmittal certification, or filing confirmation.

## 4. Deadline and fee safety

- [ ] Implement strict `YYYY-MM-DD` parsing and calendar-month arithmetic.
- [ ] Preserve both the unadjusted date and any tentative weekend/federal-holiday adjustment.
- [ ] Require the notice-stated response period; do not infer one for an unknown notice.
- [ ] Require explicit extension language before generating extension rows.
- [ ] Distinguish:
  - [ ] 37 CFR 1.17(a) nonprovisional/general extension fees;
  - [ ] 37 CFR 1.17(u) provisional extension fees;
  - [ ] 37 CFR 1.16(g) late provisional filing-fee/cover-sheet surcharge.
- [ ] Record fee code, entity-specific amount, effective date, retrieved date, official URL, and
  source snapshot hash.
- [ ] Reject stale, missing, mismatched, or unverified fee tables for payable-amount output.
- [ ] Test month-end, leap-year, weekend, observed federal holiday, no-response-period, conflicting
  date, wrong fee-family, and extension-disabled cases.

## 5. Official USPTO form registry and release bundle

- [ ] Add a checked-in official-form manifest containing only official `uspto.gov` HTTPS URLs.
- [ ] Include the core documentation forms:
  - [ ] SB/16 Patent Center provisional cover sheet;
  - [ ] AIA/14 Application Data Sheet;
  - [ ] AIA/15 utility application transmittal;
  - [ ] AIA/01 inventor declaration using an ADS;
  - [ ] SB/08 Patent Center IDS;
  - [ ] AIA/22P provisional extension petition.
- [ ] For each form record code, title, applicability, source page, direct URL, published/updated
  label, retrieved date, SHA-256, and expected PDF media type.
- [ ] Add a deterministic form fetcher that:
  - [ ] permits HTTPS and official USPTO hosts only;
  - [ ] bounds redirects, timeout, and bytes;
  - [ ] validates the `%PDF-` signature and final official host;
  - [ ] verifies the pinned SHA-256;
  - [ ] writes stable release filenames;
  - [ ] generates `SHA256SUMS.txt` and a bundle manifest.
- [ ] Add a bundle builder that creates:
  - [ ] individual verified PDFs;
  - [ ] `README.md` with applicability and human-review warnings;
  - [ ] `uspto-forms-manifest.json`;
  - [ ] `SHA256SUMS.txt`;
  - [ ] one deterministic ZIP archive.
- [ ] Render every fetched PDF page and visually inspect for clipping, corruption, or unreadable text.
- [ ] Add offline fixture tests for redirect, host, size, media type, PDF signature, and hash failures.
- [ ] Add a release workflow that rebuilds/verifies the bundle and uploads the ZIP, manifest,
  checksums, README, and individual PDFs.
- [ ] Attach assets to a GitHub release and verify each asset has a direct browser download URL.

## 6. Filing profiles

- [ ] Keep the provisional assembly profile fail-closed until legal-rule and rendered-document
  approval evidence exists.
- [ ] Extend the provisional profile with explicit completeness fields:
  description, necessary drawings, title, all inventors, residences, correspondence, government
  interest, cover-sheet/ADS route, filing fee, size fee, and late-item surcharge.
- [ ] Encode provisional exclusions: claims, oath/declaration, and IDS are not ordinary requirements.
- [ ] Extend the utility profile with explicit specification, claims, abstract, drawings-if-needed,
  ADS, declaration, filing/search/examination fees, excess claims, size, DOCX, IDS-if-used, sequence,
  large-table, and unsupported-domain checks.
- [ ] Distinguish filing-date material, completeness material, optional papers, and deferred human acts.
- [ ] Make upload manifests application-type-specific rather than always listing utility forms.
- [ ] Add profile snapshots and negative tests for cross-profile form leakage.

## 7. Filing-receipt and priority-chain audit

- [ ] Define a filing-receipt input schema with human-transcribed fields and source hash.
- [ ] Compare receipt data with `PATENT.md` for application type, title, filing date, application
  number, inventors, applicant, entity status, correspondence data, and related applications.
- [ ] Normalize formatting without silently equating substantive differences.
- [ ] Generate stable discrepancy codes and a human-reviewed correction checklist.
- [ ] Verify domestic-benefit/priority ordering and completeness as flags, not legal conclusions.
- [ ] Require a corrected-ADS review when receipt and matter data differ in ADS-controlled fields.
- [ ] Keep filing receipt and confirmation evidence private and matter-local.

## 8. Human review and orchestration

- [ ] Extend `apa-review-form` with correspondence, deadline, missing-parts, forms, fee, signer,
  filing-receipt, and response-confirmation review cards.
- [ ] Bind correspondence and response files into the review target fingerprint.
- [ ] Make changed notice/response/form hashes invalidate prior review state.
- [ ] Add correspondence and missing-parts topics to chat/CLI questionnaires.
- [ ] Add the new skills to `skills/registry.yaml`, the generated skill graph, installer bundles,
  README, and orchestration support selection.
- [ ] Keep Office Action behavior separate and route it explicitly from triage.

## 9. Privacy and regression evidence

- [ ] Add a wholly synthetic three-page-equivalent missing-parts fixture representing:
  filing date granted, a two-month stated period, defective cover-sheet/ADS handling, a late
  provisional surcharge, and electronic-response metadata.
- [ ] Use fictional names, addresses, numbers, dates, amounts, and hashes.
- [ ] Add a privacy sentinel test that fails if known private-notice identifiers or local download
  paths appear anywhere tracked or in release assets.
- [ ] Run the confidential external-matter verifier read-only and aggregate-only when the private
  matter is available; do not make its success a public fixture dependency.
- [ ] Add targeted package, skill-trigger, skillgraph, release-bundle, and review-form tests.
- [ ] Run three independent readiness review lanes before enabling a filing profile:
  rules/forms, deadlines/fees, and privacy/UX.

## 10. Release and completion audit

- [ ] Confirm every release form hash matches the checked-in registry.
- [ ] Confirm release ZIP contents match the manifest and contain no unexpected files.
- [ ] Confirm direct-download release assets return successfully and preserve expected hashes.
- [ ] Confirm the GitHub release notes identify source URLs, retrieval date, human-review boundary,
  and unsupported filing actions.
- [ ] Confirm no private notice data, private matter data, or absolute local path exists in the
  commit, tag, release notes, release assets, or workflow logs.
- [ ] Mark this checklist complete only after the commit, push, release, and post-release download
  verification all succeed.
