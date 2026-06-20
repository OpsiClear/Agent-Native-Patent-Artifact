# apa-redact

Confidentiality / PII / patent-secret **redaction guard** for the
Agent-Native-Patent-Artifact (APA) project. It is the core safety primitive that
scans the **exact bytes about to leave at any external sink** — a prior-art
search query, a cloud-LLM payload carrying unfiled disclosure text, a filing
submission — and blocks or flags secrets before they go out.

This is a plain-ESM, **zero-dependency** Node.js (>=18) port of
[gstack](https://github.com/garrytan/gstack)'s redaction engine
(`lib/redact-patterns.ts`, `lib/redact-engine.ts`, `bin/gstack-redact`),
extended with patent-specific categories. Everything runs under plain `node` —
no build step, no npm install, only Node built-ins.

```bash
# scan a file you are about to send (scan-at-sink)
node cli.mjs --from-file payload.txt --repo-visibility public

# scan a payload on stdin, machine-readable
echo "$body" | node cli.mjs --json

# run the tests
node --test
```

---

## What it is (and isn't)

apa-redact is a **guardrail, not airtight enforcement.** It catches accidents and
carelessness — the 99% case where a secret, an unfiled serial number, or a
"DO NOT FILE" draft is about to be sent to an external service by mistake. A
determined operator can always bypass it (send the payload by another route,
disable the check, paste into a browser). It does **not** stop a hostile leaker,
and the README, the CLI, and the engine all say so. Treat a clean scan as
"no obvious accident found," not as "provably safe to release."

The discipline it enforces is **scan-at-sink**: scan the literal bytes that will
be transmitted, not a string you re-render afterward (see below).

---

## The three tiers (single source of truth)

The taxonomy lives in **`redact-patterns.mjs`** as one exported array
(`PATTERNS`). Every other file — the engine, the CLI, the tests — reads from it,
so nothing drifts. Each pattern carries `{ name, tier, category, description,
regex, action }` (plus optional validators / proximity rules).

| Tier | `action` | Exit code | What it is | Disposition |
|------|----------|-----------|------------|-------------|
| **HIGH** | `block` | **3** | Genuinely-secret credentials and genuine confidentiality breaches | BLOCK the sink |
| **MEDIUM** | `confirm` | **2** | PII, legal/damaging, internal-leak, **plus** credential shapes with high false-positive rates | CONFIRM each finding before sending |
| **LOW** | `fyi` | 0 | Surface-only hygiene (user paths, `TODO(owner)`) | FYI; does not gate |

**Calibration matters: a gate that cries wolf gets ignored.** Context-variable
credential shapes — Stripe `pk_live_` publishable keys, Google `AIza` keys, JWTs,
and env-style `*_KEY=` assignments — sit at **MEDIUM**, not HIGH, because they are
frequently public-by-design or high-FP. Only genuinely-secret credentials block.

**No visibility-based tier promotion.** `--repo-visibility public` does **not**
auto-promote MEDIUM to HIGH. Public visibility makes the MEDIUM confirmation
*sterner* (confirm each finding individually, no batch-acknowledge), but the
engine never mutates a finding's tier based on visibility.

### Representative categories

HIGH (credentials): `aws.access_key`, `aws.secret_key` (needs
`aws_secret_access_key` nearby), `github.pat` / `.oauth` / `.server` /
`.fine_grained`, `anthropic.key`, `openai.key`, `sendgrid.key`,
`stripe.secret` (`sk_live_`), `slack.token` / `.webhook`, `discord.webhook`,
`twilio.auth_token` (needs an Account SID nearby), `pem.private_key`,
`db.url_with_password`, `creds.basic_auth_url`.

MEDIUM (demoted credential shapes): `stripe.publishable`, `google.api_key`,
`jwt`, `env.kv` (only fires on high-entropy values — kills `FOO_KEY=changeme`).

MEDIUM (PII): `pii.email`, `pii.phone.e164`, `pii.ssn`, `pii.cc` (Luhn-valid),
`pii.ip_public` (RFC1918-excluded), `pii.wallet`.

MEDIUM (internal / legal): `internal.hostname`, `internal.url_private`,
`legal.nda_marker`, `legal.named_criticism`.

LOW: `internal.user_path`, `hygiene.todo`.

---

## Patent extensions

Calibrated to the same philosophy (genuine breach = HIGH; context-variable / risk
signal = MEDIUM):

**HIGH**

- `patent.unpublished_serial` — an unpublished US application / serial number
  (`18/123,456`) **in a confidential context**. A confidentiality breach only
  when it sits near `CONFIDENTIAL` / `unpublished` / `do not file` /
  `serial no` / `unfiled` (proximity-gated). A *published* application number on
  a public page is not a leak and does not fire.
- `patent.inventor_ssn` — an inventor's US Social Security Number (genuine PII
  secret; validated against placeholder shapes like `000-…`, `666-…`, `9xx-…`).

**MEDIUM**

- `legal.nda_marker` (extended) — `CONFIDENTIAL`, `UNDER NDA`, `DO NOT FILE`,
  `DO NOT DISTRIBUTE`, `EYES ONLY`, `ATTORNEY-CLIENT`, `PRIVILEGED`,
  `DRAFT CLAIMS`.
- `patent.trade_secret_codename` — employer program codenames
  (`Project Foo`, `Codename: Bar`).
- `patent.public_disclosure_phrase` — 35 U.S.C. §102 bar-date risk phrases
  ("shipped to customer", "offered for sale", "demoed publicly",
  "published on", "publicly disclosed", "presented at the conference").
  Surfacing these in an outbound payload can admit a statutory bar; flag for
  human review.
- `patent.inventor_pii` — an inventor's name + street address near the word
  "inventor" (the common ADS / declaration home-address leak).

---

## Exit codes

The CLI exit code gates the caller (a prior-art search, a cloud-LLM dispatch, a
filing submission):

| Code | Meaning | Caller behavior |
|------|---------|-----------------|
| `0` | clean (no HIGH, no MEDIUM) | proceed |
| `2` | MEDIUM present (no HIGH) | run per-finding confirmation, then proceed if approved |
| `3` | HIGH present | **block** |

LOW findings never change the exit code. An oversize input fails **closed**:
it returns a single synthetic HIGH finding (`engine.input_too_large`) so the
caller blocks rather than silently passing an unscanned payload (exit 3).

---

## Scan-at-sink discipline

**Always scan the exact bytes that will be sent.** The failure mode this defends
against: scan a string, then re-render it into the payload — now the scanned
bytes and the sent bytes can differ (a template re-expansion, a re-encode), and
the gap is exactly where a secret slips through.

The correct pattern:

1. Write the payload you are about to send to a temp file.
2. Call `scanFile(path)` (or `apa-redact --from-file path`) on **that** file.
3. Send the **same** file (never scan-a-string-then-rerender).

```js
import { writeFileSync } from "node:fs";
import { scanFile, exitCodeFor } from "apa-redact/engine";

writeFileSync(tmp, payloadBytes);          // exact bytes
const findings = scanFile(tmp);            // scan THOSE bytes
if (exitCodeFor(findings) === 3) throw new Error("HIGH finding — blocked");
sendFile(tmp);                             // send the SAME file
```

`scanFile` also applies the size cap at the file boundary, so a giant file fails
closed without being fully read into memory first.

---

## Normalization (evasion defeat)

Before any matching, input is normalized so Unicode-confusable / zero-width
evasion fails:

- **NFKC** (`String.prototype.normalize('NFKC')`) — folds fullwidth and
  compatibility characters to their ASCII forms (`ＣＯＮＦＩＤＥＮＴＩＡＬ` →
  `CONFIDENTIAL`).
- **Zero-width strip** — removes zero-width space / non-joiner / joiner / word
  joiner / BOM, so a secret split by an invisible character is rejoined before
  matching.
- **Lone-surrogate strip** — drops unpaired UTF-16 surrogate halves that would
  otherwise corrupt downstream API payloads and evade naive matching.

Findings always report offsets in the **original** (un-normalized) text via an
index map, so `applyRedactions` edits the real bytes.

---

## API

```js
import {
  scan,                 // scan(text, opts?) -> Finding[]
  scanFile,             // scanFile(path, opts?) -> Finding[]   (scan-at-sink)
  applyRedactions,      // applyRedactions(text, findings, opts?) -> string
  applyRedactionsDetailed, // -> { body, diff, skipped }
  exitCodeFor,          // exitCodeFor(findings) -> 0 | 2 | 3
  countsFor,            // countsFor(findings) -> { HIGH, MEDIUM, LOW }
  isOversize,           // isOversize(findings) -> boolean
  normalizeWithMap,     // normalizeWithMap(text) -> { normalized, map }
  maskPreview,
  DEFAULT_MAX_BYTES,
} from "apa-redact/engine";

import { PATTERNS, PATTERNS_BY_NAME, actionForTier } from "apa-redact/patterns";
```

A **Finding** carries at minimum `{ patternName, tier, start, end, excerpt }`
(the `excerpt` is a masked preview — never the raw secret) plus the richer fields
`{ severity, category, description, line, col, autoRedactable, repoVisibility }`.

`applyRedactions` replaces auto-redactable spans (email / phone / SSN / CC) from
the **end backward**, so earlier offsets stay valid as it splices. Spans inside a
markdown link target or a JSON string value are refused (returned in `skipped`)
so the caller edits manually rather than mangling structure.

### `scan` / `scanFile` options

| Option | Default | Effect |
|--------|---------|--------|
| `repoVisibility` | `"unknown"` | `public` \| `private` \| `unknown`; recorded, never promotes a tier |
| `allowlist` | `[]` | exact spans to suppress |
| `selfEmail` | — | the invoking user's own email (allowlisted for `pii.email`) |
| `repoPublicEmails` | `[]` | repo-public emails to suppress |
| `maxBytes` | `1048576` | fail-closed size cap; non-finite / non-positive falls back to default |

---

## CLI

```
apa-redact [flags]   (reads stdin by default)

--json                     Emit JSON { findings, counts, repoVisibility, oversize }
--repo-visibility V        public | private | unknown (public/unknown = sterner MEDIUM confirm)
--from-file PATH           Read input from PATH instead of stdin (scan-at-sink)
--allowlist PATH           Newline-delimited exact spans to suppress
--self-email EMAIL         Suppress the invoking user's own email
--repo-public-emails PATH  Newline-delimited repo-public emails to suppress
--auto-redact IDS          Comma-separated pattern names to auto-redact;
                           prints the redacted body to stdout + diff to stderr, exit 0
--max-bytes N              Override the fail-closed size cap (default 1 MiB)
```

In **non-JSON** mode the CLI **never echoes a matched secret value** to stdout —
it shows the category (pattern name), the line:col offset, and a masked preview
(≤4 leading characters) only. The JSON output is masked the same way
(`excerpt`); the raw secret is never emitted.

Run via `node cli.mjs …`, or the `apa-redact` bin shim (`bin/apa-redact`,
`#!/usr/bin/env node`).

---

## Tests

```bash
node --test          # node:test + node:assert, zero dependencies
```

Fixtures cover the headline cases: a planted AWS key (HIGH → exit 3), a
`CONFIDENTIAL — DO NOT FILE` marker (MEDIUM → exit 2), an inventor SSN (HIGH), a
public-disclosure bar phrase (MEDIUM), clean text (exit 0), multi-finding
`applyRedactions` offset correctness, NFKC / zero-width evasion defeat, the
fail-closed oversize guard, and `scanFile` scan-at-sink behavior.

---

## Faithfulness to gstack

Ported closely from the gstack originals. The 3-tier taxonomy, the
per-matched-span placeholder suppression, the proximity/validator rules, the
fail-closed oversize guard, the no-promotion invariant, the end-backward
`applyRedactions`, and the 0/2/3 exit codes are all preserved.

Intentionally **not** ported: gstack's `install-prepush-hook` /
`uninstall-prepush-hook` git-hook subcommands (gstack-specific, depend on a git
working tree and a Bun wrapper) and the tool-attributed-fence WARN-degrade path
(a gstack-specific code-review-output convention with no analogue at an APA
sink). The APA build keeps the pure scan/redact core and the scan-at-sink CLI.
