---
name: apa-review-form
description: Generate minimal local HTML review forms and public-date verification reports for Agent-Native Patent Artifact matters. Use when creating human-review checklists, correspondence or missing-parts review cards, filing-receipt audits, IDS/citation/date verification forms, claim review forms, drawing/PDF review forms, or filing-readiness forms for APA patent folders. Do not use for legal opinions, Patent Center filing, generic frontend apps, or non-APA documents. Invoke as /apa-review-form.
compatibility: Requires Node.js 21+; APA CLI enrichment and safe metadata fetches require an Agent-Native-Patent-Artifact checkout.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

# APA Review Form

Generate a standalone, local-only HTML form for human review of an Agent-Native Patent Artifact
(APA) matter. The form helps a human reviewer mark claim, citation, drawing, statutory-bar, and
filing-readiness checks and export the answers as JSON. The skill can also generate numbered
question packets for Codex, Claude CLI, or a normal terminal when human facts are needed.

Use the date verifier when review questions ask whether reference publication, filing, priority,
submission, repository, or public metadata dates can be checked automatically.

## Quick Start

From the Agent-Native Patent Artifact repo root, run the bundled generator with a matter directory:

```bash
node skills/apa-review-form/scripts/generate_review_form.mjs --matter C:/path/to/matter
```

Default output:

```text
<matter>/assembled/human_review_form.html
```

For any APA matter directory, use:

```bash
node skills/apa-review-form/scripts/verify_dates.mjs --matter C:/path/to/matter --no-network
node skills/apa-review-form/scripts/generate_review_form.mjs --matter C:/path/to/matter --run-apa
```

The date verifier performs optional, read-only public metadata requests. It permits HTTPS only,
uses an explicit Crossref/arXiv/OpenReview/GitHub/patent/standards host allowlist, follows at most
three allowlisted redirects, caps each decoded response at 2 MB, and times out each request. All
requests pass through `apa-safe-review-metadata-fetch.mjs`, and the JSON report records its policy identifier,
allowlist, bounds, exact request-URL hash, and redaction-scan counts. HIGH findings block. MEDIUM
findings require `--approve-egress`; if the APA redaction engine is unavailable, network mode fails
closed before fetch.
Offline extraction is the default; use `--network` only for an explicit public-metadata check.

When human-only facts are missing, generate a numbered CLI/chat questionnaire:

```bash
node skills/apa-review-form/scripts/ask_review_questions.mjs --matter C:/path/to/matter --topic disclosures --mode markdown
```

When the user wants clickable choices in a browser, launch the dynamic local form:

```bash
node skills/apa-review-form/scripts/serve_review_app.mjs --matter C:/path/to/matter --port 8765
```

To process queued `Ask Agent` requests locally with a deterministic test adapter:

```bash
node skills/apa-review-form/scripts/agent_worker.mjs --matter C:/path/to/matter --adapter mock --once
```

To validate the local request API, SSE live updates, and worker loop end to end:

```bash
node skills/apa-review-form/scripts/test_agent_bridge_e2e.mjs --matter C:/path/to/matter
```

## Workflow

1. Confirm the matter folder contains `PATENT.md`, `logic/claims.md`, and preferably `assembled/`.
2. Run `verify_dates.mjs` when public-source date evidence should be gathered for IDS/prior-art refs.
3. Run the generator. Use `--run-apa` when a fresh APA validate/claim-lint/assemble snapshot should
   be embedded in the form.
4. Open the generated HTML file in a browser, or run `serve_review_app.mjs` for dynamic browser
   review with JSON state persistence.
5. When a human fact is needed, use the Dynamic Questionnaire in the form or run
   `ask_review_questions.mjs` in interactive/markdown/agent mode.
6. Have the reviewer complete checks and notes.
7. Use the form's `Export JSON` button to save the review record next to the matter or attach it to
   a filing/practitioner handoff.

## Freshness Contract

The generator embeds `apa-human-review-target-fingerprint-v1` under target contract
`apa-human-review-target-contract-v2`. It hashes the current claims, assembly review files,
IDS/evidence index, drawing artifacts, every assembled PDF/DOCX, and every supported JSON/Markdown/
PDF file under `correspondence/`. It records claim, IDS-reference, figure, PDF/DOCX, correspondence,
and missing-parts-response counts. The served app persists that binding in
`apa-human-review-state-v2`. Questionnaire queues and answers use
`apa-agent-question-queue-v2` and `apa-agent-question-answers-v2`.

Regenerate the form and questionnaire whenever a bound target changes. Do not carry answers forward
silently: answered legacy v1 files and v2 answers for a different fingerprint are rejected so they
can be archived and reviewed deliberately. Assembly preflight blocks stale state/queues/answers,
unanswered or unresolved readiness-required disclosure/date questions, affirmative factual answers
without supporting notes, and a final-PDF approval bound to zero PDF/DOCX files. These checks prove
review-target identity and question completion only; they do not decide legal sufficiency or filing
readiness.

## Options

| Option | Purpose |
|---|---|
| `--matter <dir>` | Required APA matter directory. |
| `--out <file>` | Optional output HTML path. |
| `--apa-kit <dir>` | Optional APA toolkit path. Defaults to the Agent-Native Patent Artifact repo root when run from this source tree. |
| `--run-apa` | Run APA validate, claim-lint, and assemble status commands and embed results. |
| `--template <file>` | Optional replacement HTML template. |

Date verifier:

| Option | Purpose |
|---|---|
| `--matter <dir>` | Required APA matter directory. |
| `--out <json>` | Optional JSON report path. Defaults to `assembled/date_verification.json`. |
| `--markdown <md>` | Optional Markdown report path. Defaults to `assembled/date_verification.md`. |
| `--network` | Opt in to bounded HTTPS metadata fetches from the declared public-host allowlist. |
| `--no-network` | Extract candidate dates locally (the default). |
| `--approve-egress` | Approve a MEDIUM exact-URL redaction finding for this explicit network run; HIGH findings always block. |
| `--limit N` | Verify only the first N IDS references for a quick smoke test. |

Agent questionnaire:

| Option | Purpose |
|---|---|
| `--matter <dir>` | Required APA matter directory. |
| `--topic disclosures\|ids\|dates\|figures\|correspondence\|missing-parts\|all` | Question category. Defaults to `disclosures`. Correspondence and missing-parts questions are readiness-required when those records exist. |
| `--mode interactive\|markdown\|json\|agent` | `interactive` asks in terminal; `markdown` prints a Codex/Claude-friendly prompt; `json` emits a queue; `agent` emits the next unanswered question and records prior answers. |
| `--limit N` | Ask or print only the first N questions. |
| `--queue <json>` | Optional queue path. Defaults to `assembled/agent_question_queue.json`. |
| `--answers <json>` | Optional answer path for interactive mode. Defaults to `assembled/agent_question_answers.json`. |
| `--prompt <md>` | Optional markdown prompt path. Defaults to `assembled/agent_question_prompt.md`. |
| `--record <answer_text>` | In `agent` mode, record chat-style answers such as `Q1=2; notes` or `DISC-001=2; notes`. |

Use `markdown` mode when the agent should ask in chat with numbered choices. Use `interactive`
mode when the user is working directly in a terminal. Codex-specific native choice UI may be used
when available, but the fallback must be simple numbered choices that Claude CLI and terminals can
also handle.

Use `agent` mode when an agent should actively ask the next question in Codex or Claude Code:

```bash
node skills/apa-review-form/scripts/ask_review_questions.mjs --matter C:/path/to/matter --topic disclosures --mode agent
```

After the user replies in chat, record the answer and fetch the next question:

```bash
node skills/apa-review-form/scripts/ask_review_questions.mjs --matter C:/path/to/matter --topic disclosures --mode agent --record "Q1=2; first public repo was ..."
```

The agent should map `agent` mode output to native question UI when the host exposes one. Otherwise,
ask the numbered choices in chat and pass the reply back with `--record`.

Dynamic local review app:

| Option | Purpose |
|---|---|
| `--matter <dir>` | Required APA matter directory. |
| `--port N` | Localhost port. Defaults to `8765`. |
| `--host <host>` | Bind host. Defaults to `127.0.0.1`. |

The app serves `assembled/human_review_form.html`, injects `serverMode`, persists answers to
`assembled/human_review_state.json` using the form's target fingerprint, and stores agent requests
in `assembled/agent_requests.json`.
It exposes `GET /api/agent-events` for Server-Sent Events, so the browser can update request status
when a local worker changes the queue file. `Ask Agent` requests are human-review aids: responses are
draft notes until the reviewer explicitly applies them to a card.
The app should expose guided pages for Start, Disclosures, Claims, IDS & Dates, Figures,
Correspondence, Filing, Agent, and Full Checklist. Prefer those guided pages for human review
because claim, IDS, figure, privacy-minimized notice, missing-parts response, and filing-receipt
cards display the exact review record being checked. The server permits loopback binding only; it
serves only the generated form and its API, not arbitrary files from `assembled/`. A stale tab gets
an explicit revision conflict and rebases its pending answers before retrying.

## Review Boundaries

- Keep the form as a human-review aid, not a legal opinion.
- Preserve unverified citation warnings. The form should make IDS verification easier, not imply that
  references are verified.
- Keep outputs local by default because unfiled patent matter may be confidential.
- Keep original notices, filing receipts, confirmations, application identifiers, and applicant data
  private. Review cards may read privacy-minimized matter-local records but must never copy those
  records into public fixtures, releases, or external requests.
- Treat correspondence dates and fee rows as estimates and source facts to verify, not authoritative
  docketing instructions or payable balances. Keep every response document route, signature, fee,
  and Patent Center action human-owned.
- Keep date verification offline unless the reviewer explicitly opts into `--network` after confirming
  that the public citation identifiers and URLs are safe to disclose to the allowlisted metadata hosts.
- Do not embed absolute matter, toolkit, script, or template paths in portable HTML/JSON reports.
- Persist state and request queues with atomic replacement; coordinate agent-worker and server
  updates with the shared lock helper so a crash or concurrent append cannot truncate the queue.
- Avoid adding external scripts, fonts, or network resources. The template is intentionally standalone
  so it can be opened from `file://`.
- Treat automated public metadata as evidence gathering only. It does not verify inventor-only public
  disclosures, confidentiality, offers for sale, foreign statutory-bar impact, IDS materiality, or
  legal conclusions.
- Treat questionnaire answers as inventor/reviewer-supplied facts. The script may flag follow-up
  items, but must not decide statutory bars, patentability, infringement, or IDS materiality.

## Example

Input:

```bash
node skills/apa-review-form/scripts/generate_review_form.mjs --matter C:/path/to/matter --out C:/path/to/matter/assembled/human_review_form.html --run-apa
```

Output:

```text
wrote C:/path/to/matter/assembled/human_review_form.html
```

The generated page includes local save state, print support, import/export JSON, guided workflow
pages, exact-text review cards for claims/IDS/figures/correspondence, and review sections for claims,
prior art, IDS, drawings, notices, missing-parts responses, filing receipts, statutory-bar questions,
filing readiness, and code consistency.
