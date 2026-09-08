# Gap closure — 2026-09-08

This follow-up closes the six selected gaps from the September 7 project and skill
reviews. Historical findings remain unchanged as the baseline.

| Gap | Change | Evidence |
| --- | --- | --- |
| Stale review approvals | Versioned answers bind matter and target fingerprints; stale local answers are quarantined, imports rejected, and server writes checked against live files. | VM regression, real-browser claim-change/regeneration regression, review bridge E2E. |
| Interrupted adoption and orphan records | Validate before writing; journal exact record and ledger bytes; recover interrupted commits and confirmed dead local locks; reconcile records with ledger events. | Fault injection at all four adoption write boundaries, invalid-input retries, tampering/orphan detection, conflict preservation and live-lock tests. |
| Installed review runtime | Generate a self-contained fingerprint module from the canonical implementation. | Freshness tests and isolated installed-host generation of a fictional matter review form. |
| Contradictory skill instructions | Correct dependent-claim narrowing, candidate/proposal boundaries, bounded scoring loops, form checkbox transcription, prosecution status, validator exits, tool declarations, and output names. | Generated documentation, skillgraph, syntax and all 23 skill checks pass. |
| Partial dates | Preserve year/month/day precision and separate creation from publication metadata. | Crossref date regression includes partial and invalid dates. |
| Behavioral discovery | Add blind packet generation, hash-bound predictions and fixed scoring across 78 cases. | Fresh Astra/max evaluation: 78/78, zero false activations; scorer regressions pass. |

Validation completed:

- `npm run build`: passed, including isolated distribution probes and smoke checks.
- `npm run coverage`: passed; 634 tests passed, zero failed, one skipped. File load
  coverage 137/140 (97.9%); function coverage 2389/2639 (90.5%).
- The symlink regression was skipped because this Windows environment lacks symlink
  privilege. Recovery rejects symbolic-link targets and journals, including dangling links.
- `git diff --check`: passed.
- Recorded discovery predictions still bind the current catalog and prompts.

The browser helper now uses isolated temporary profiles and a rendering budget after a
coverage run exposed asynchronous viewer rendering before DOM capture.

Recovery is tested for process interruption, not power loss. Discovery scores measure
description-based selection, not host integration or drafting quality. Optional broader
audit suggestions such as worker leases and reference-document restructuring remain
outside this six-gap change. See [operational guidance](../gap-validation.md).
