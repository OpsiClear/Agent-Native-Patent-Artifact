---
name: apa-form-fill
description: "Collect, verify, confirm, and locally populate draft USPTO PDF form fields through an agent chat interface. Use when filling supported provisional or utility nonprovisional cover sheets, transmittals, declarations, extension petitions, or IDS forms from an APA matter. Invoke as /apa-form-fill in Claude Code or Cursor, $apa-form-fill in Codex, or @apa-form-fill in ChatGPT after import. Do not use to choose legal responses, fill XFA forms, sign, certify, assert entity status, elect fees, pay, upload, or file."
compatibility: Requires Node.js 21+ plus local filesystem and command execution for PDF creation; chat-only hosts can prepare intake only.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Patent form fill

Invoke the installed skill by its canonical name, `apa-form-fill`:

| Host | Explicit invocation |
|---|---|
| Claude Code | `/apa-form-fill` |
| Cursor | `/apa-form-fill` |
| Codex | `$apa-form-fill` |
| ChatGPT | `@apa-form-fill` after the skill has been imported or enabled |

ChatGPT or another chat-only host may prepare the intake worksheet, but it must not claim PDF creation
or verification unless its active environment exposes this skill's local files and command execution.

Collect patent-form facts in chat, require field-by-field human confirmation, and create a new local
`*_DRAFT.pdf`. The bundled script never uses the network and never overwrites the official source.
It mechanically verifies the written text and proves that prohibited and unselected field values did
not change.

APA is drafting software, not a law firm or registered practitioner. Treat every output as an
unverified draft. A human owns form choice, legal responses, dates, signatures, certifications,
entity status, fees, visual review, Patent Center actions, and filing.

## Startup Contract

Resolve these inputs from the request and matter before asking questions:

- APA matter directory containing `PATENT.md`;
- matter-local copy of a hash-pinned official form;
- form route already selected by a human or registered practitioner;
- approved data-handling posture for the active chat host.

Ask at most one compact batch of missing factual questions. Ask a separate blocking question only
when the form route or remote-host data handling is unresolved, because guessing either can change
legal effect or expose confidential data.

`PATENT.md` must declare exactly one supported `confidential_workflow_mode`: `ordinary_local`,
`counsel_controlled`, or `shareable_redacted`. The `init` command requires explicit form-route,
data-handling, and active interaction-host acknowledgments and binds them, with their approval time
and the matter mode, into the plan, review, confirmation, and manifest. Use `local-only` only when
values remain in an approved local execution path; use `remote-host-acknowledged` only after the
human approves entering the values through the named active remote host.

Run scripts with Node 21 or later. Locate this skill's installed directory from the host's loaded
skill path and use `<skill-dir>/scripts/patent_form_fill.mjs`; do not assume the repository checkout
path.

## Route

| Form result | Action |
|---|---|
| Hash-pinned ordinary AcroForm | Continue with the prompt-confirm-fill workflow |
| Patent Center XFA form | Stop automated filling; use Adobe Acrobat Reader and human entry |
| Unknown or revised PDF hash | Inspect only; refuse filling until the profile is independently revalidated |
| Form route not human-selected | Explain neutral options and pause for the human/practitioner |
| Signature, certification, entity, fee, payment, or filing field | Leave untouched for the human |

Read [references/form-support.md](references/form-support.md) when selecting a supported form or
handling XFA. Read [references/plan-schema.md](references/plan-schema.md) when editing provenance or
debugging plan validation. Do not read the vendored PDF engine source; run the script as a black box.

## Phase 1 - Keep the Intake Local

1. Keep the original notice and any prefilled/private PDF outside public repositories.
2. Do not upload a private notice or unfiled invention PDF merely to make it visible to a remote chat
   host. Read local matter artifacts when the host has approved local access.
3. Honor `confidential_workflow_mode` in `PATENT.md`. Before asking the user to type confidential or
   personal data into a remote model, require the matter's explicit data-handling acknowledgment.
4. Copy the verified blank official form into the private matter. Preserve that copy unchanged.

## Phase 2 - Inspect and Scaffold

Run:

```text
node "<skill-dir>/scripts/patent_form_fill.mjs" inspect --matter "<private-matter>" --source "<matter-relative-form.pdf>" --json
```

Continue only when `supported` is `true`. Then create the intake plan:

```text
node "<skill-dir>/scripts/patent_form_fill.mjs" init --matter "<private-matter>" --source "<matter-relative-form.pdf>" --form-route-human-selected --data-handling "<local-only|remote-host-acknowledged>" --interaction-host "<claude-code|codex|cursor|chatgpt|other>" --json
```

The plan is written under `assembled/forms/`. Do not move it outside the matter.

## Phase 3 - Gather Facts Through Chat

1. Read the plan's allowed fields.
2. Infer values first from human-verified matter JSON. Do not promote OCR, extraction, filenames, or
   unverified matter values into verified facts.
3. Ask only for unresolved factual values. Use the host's native question UI when available;
   otherwise ask a numbered batch in ordinary chat. Keep wording neutral for pro-se or unknown-role
   users.
4. Never ask the model to decide a checkbox, petition response, government-interest response,
   declaration choice, signer authority, entity status, payment method, or fee election.
5. Edit the matter-local plan rather than passing private values in command-line arguments.

For a value supplied or confirmed in chat:

```json
{
  "name": "Application Number",
  "label": "Application number",
  "include": true,
  "value": "12/345,678",
  "provenance": {
    "kind": "human-confirmed",
    "source": "chat"
  }
}
```

Use `verified-matter-json` only when both the exact value and a `true` human-verification flag resolve
from the pinned JSON source. The script rechecks the JSON hash, value pointer, and verification
pointer before filling.

## Phase 4 - Present and Pause

Run:

```text
node "<skill-dir>/scripts/patent_form_fill.mjs" review --matter "<private-matter>" --plan "<matter-relative-plan.json>"
```

Present every displayed field name, label, value, provenance, source hash, and confirmation digest
to the user. Then **pause**. Do not create a confirmation record from implied approval, an earlier
form choice, or the initial request. Require explicit confirmation of the displayed values.

If any value changes, rerun `review` and present the new digest.

## Phase 5 - Confirm and Fill the Draft

Only after explicit human confirmation, run:

```text
node "<skill-dir>/scripts/patent_form_fill.mjs" confirm --matter "<private-matter>" --plan "<matter-relative-plan.json>" --digest "<displayed-sha256>" --human-confirmed --json

node "<skill-dir>/scripts/patent_form_fill.mjs" fill --matter "<private-matter>" --plan "<matter-relative-plan.json>" --confirmation "<matter-relative-confirmation.json>" --json
```

Never use `--human-confirmed` before the user confirms. The fill command refuses a stale digest,
changed source, changed plan, unknown field, prohibited field, path escape, overwrite, XFA document,
or unsupported font glyph.

## Phase 6 - Verify and Review Every Page

Run mechanical verification:

```text
node "<skill-dir>/scripts/patent_form_fill.mjs" verify --matter "<private-matter>" --plan "<matter-relative-plan.json>" --confirmation "<matter-relative-confirmation.json>" --manifest "<matter-relative-review.json>" --json
```

Render the new draft to page images with the host's PDF tooling or `pdftoppm`, inspect every page,
and compare it with the source. Check for clipped text, wrong rows, missing glyphs, stale appearances,
unexpected marks, changed page count, and any populated human-owned field. If local rendering is
unavailable, require the user to open the draft in Adobe Acrobat Reader and review every page.

The review manifest intentionally remains `DRAFT-REQUIRES-HUMAN-REVIEW` and `filing_ready: false`.
Do not change those states merely because mechanical verification passed.

## Example

Input:

```text
Invoke apa-form-fill with this host's native skill syntax and fill the verified SB/16 manual cover
sheet from this private matter.
Ask me only for missing facts and do not touch signatures, fees, or entity status.
```

Expected outcome:

```text
assembled/forms/sb16-manual_DRAFT.pdf
assembled/forms/sb16-manual_DRAFT.review.json
```

The source hash remains unchanged, the manifest contains hashes and field names but no field values,
and all signing, checking, payment, visual-review, and filing actions remain human-owned.

## Guardrails

- Preserve the blank official source because it is the rollback and hash-verification anchor.
- Keep plans, confirmations, review manifests, and draft PDFs private. They may contain personal data
  directly or contain value-derived digests and field inventories that must remain matter-local.
- Keep the matter directory's operating-system access controls private. New files use owner-only
  POSIX modes where supported; Windows confidentiality still depends on the directory's inherited
  ACL.
- Refuse a PDF larger than 64 MiB because bounded local parsing prevents accidental memory
  exhaustion and keeps the human-review workflow manageable.
- Leave all buttons and choice controls untouched because their meaning can depend on filing posture.
- Leave signature-block identity, date, and authority fields untouched with the signature itself;
  partial automation can falsely imply execution.
- If the bundled font cannot represent a confirmed glyph, leave that field for human entry in Adobe;
  never silently transliterate or substitute a legal name.
- Do not flatten the draft; the human may need to correct fields after visual review.
- Reinspect the live official source and form instructions before relying on a bundled profile.
- Stop at the draft boundary. Never upload, sign, certify, pay, submit, or mark the matter filed.
