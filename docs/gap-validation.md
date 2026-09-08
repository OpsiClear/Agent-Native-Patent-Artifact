# Reliability and discovery checks

## Interrupted writes

`apa recover --matter <matter>` acquires the matter writer lock, completes a pending
`trace/pending-transaction.json`, and verifies the result. Ingest, propose, and decision
commands validate and prepare their records and ledger update before creating that journal.
Recovery replays exact bytes, retaining human decisions, timestamps, and idempotency keys.
It completes an interrupted write; it does not roll it back. Regular writers also recover a
pending journal after acquiring the lock.

Only a lock with the local hostname and a confirmed dead process can be reclaimed by
recovery. Live processes, unknown owners, and unexpected target bytes remain blocked.
Preserve the journal and conflicting files for inspection instead of deleting them to
force a retry. `apa verify` reports pending transactions and records without matching
ledger events. Recovery tests cover process interruption, not power-loss durability.

## Review answers and date precision

Review exports and browser storage use `apa-review-answers-v1`, with `matterId`,
`targetFingerprint`, and `answers`. The fingerprint binds answers to the reviewed files.
Old or unversioned local answers are quarantined under a timestamped stale storage key;
imports with a different matter or fingerprint are rejected. Regenerate and review again
after changing source files. The server rejects changed targets with HTTP 409 and
`REVIEW_TARGET_CHANGED` instead of relabeling prior approvals.

Crossref date evidence preserves `value`, `precision`, and `dateParts`: a year remains
`2020`, a month remains `2020-07`, and a full date remains `2020-07-14`. Metadata creation
is distinguished from publication metadata. Exact-day comparisons require day precision.

## Installed skills

Run `node scripts/gen-skill-docs.mjs --all-hosts` after editing templates or the canonical
review fingerprint runtime. The generator copies that runtime into the review skill as a
self-contained module and checks it for freshness. `npm run build` probes installed host
bundles outside the source tree, including generation of a fictional matter review form.

## Blind discovery evaluation

Generate a description-only packet:

```sh
node scripts/evaluate-skill-discovery.mjs packet packet.json
```

Give only that packet to a fresh evaluator, without repository access, expected labels,
or prior evaluation results. Request JSON with `packet_sha256`, an `evaluator` provenance
string, and `predictions` containing one `{ "id": "...", "skill": "..." }` per prompt;
use JSON null for out-of-scope prompts. Score the saved response:

```sh
node scripts/evaluate-skill-discovery.mjs score predictions.json
```

The scorer binds predictions to current descriptions and prompts, rejects incomplete or
duplicate results, and requires at least 90% positive accuracy with zero false activations.
The 2026-09-08 Astra/max run scored 78/78 across 23 skills and nine out-of-scope requests.
Scoring recorded predictions is reproducible; generating new predictions requires a fresh
model evaluation. This measures selection from descriptions, not host routing integration
or drafting quality. The build tests the evaluation machinery without making live model calls.
