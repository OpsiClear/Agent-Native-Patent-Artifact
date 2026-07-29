# Fill Plan and Provenance

`init` creates `apa-pdf-fill-plan-v2`. Keep these top-level bindings unchanged:

- `source_pdf`: matter-relative path to the verified blank PDF;
- `source_sha256`: exact source hash;
- `profile_id` and `profile_digest`: verified field-policy binding;
- `output_directory`: fixed at `assembled/forms`;
- `workflow_approval.confidential_workflow_mode`: current explicit `PATENT.md` mode;
- `workflow_approval.form_route_human_selected`: remains boolean `true`;
- `workflow_approval.data_handling`: `local-only` or `remote-host-acknowledged`;
- `workflow_approval.interaction_host`: the active `claude-code`, `codex`, `cursor`, `chatgpt`, or
  `other` interface named when approval was recorded;
- `workflow_approval.approved_at`: immutable plan-creation timestamp bound into confirmation;
- `human_confirmation.status`: remains `pending`;
- `filing_ready`: remains `false`.

Edit only entries under `fields`.
The engine rejects changed draft/filing status, confirmation state, field inventory, field labels,
blocked-field bindings, or a mismatch with the current `PATENT.md` confidentiality mode. For every
`include: false` entry, keep both `value` and `provenance` `null` so unconfirmed data cannot remain
hidden in the plan.

## Human-confirmed Value

Use after the user supplies or confirms the exact value in the active chat:

```json
{
  "name": "Title",
  "label": "Title of invention",
  "type": "text",
  "include": true,
  "value": "Example invention",
  "provenance": {
    "kind": "human-confirmed",
    "source": "chat"
  }
}
```

## Human-confirmed Checkbox

Use a real JSON boolean after the human confirms the exact state. `true` checks the box and `false`
clears a prechecked box:

```json
{
  "name": "Drawings",
  "label": "Drawings enclosed",
  "type": "checkbox",
  "include": true,
  "value": true,
  "provenance": {
    "kind": "human-confirmed",
    "source": "chat"
  }
}
```

Do not use `"true"`, `"false"`, `1`, `0`, or an inferred default. Leave the field unselected in the
plan to preserve its source state.

## Verified Matter JSON

Use only when the source JSON contains the exact value and an explicit `true` verification flag:

```json
{
  "name": "Application Number",
  "label": "Application number",
  "type": "text",
  "include": true,
  "value": "12/345,678",
  "provenance": {
    "kind": "verified-matter-json",
    "path": "correspondence/filing-receipt.json",
    "pointer": "/application_number/value",
    "verification_pointer": "/application_number/human_verified",
    "sha256": "<source-json-sha256>"
  }
}
```

The program resolves both JSON pointers and rehashes the source. A hash mismatch, value mismatch, or
verification value other than boolean `true` blocks review and filling.
The text review prints the path, pointers, and hash as JSON so the human can see every provenance
element included in the confirmation digest.

## Excluding a Field

Leave unresolved or human-owned fields unchanged:

```json
{
  "name": "Optional Field",
  "label": "Optional field",
  "type": "text",
  "include": false,
  "value": null,
  "provenance": null
}
```

Do not add fields omitted by `init` or change a field's `type`. The engine uses its verified profile,
not labels copied into the plan, as the authorization boundary. Signature fields never appear in the
editable field list.

Treat the plan, confirmation record, draft PDF, and review manifest as private matter artifacts.
The manifest omits plaintext field values but contains a value-derived confirmation digest, so it is
not safe to publish.
