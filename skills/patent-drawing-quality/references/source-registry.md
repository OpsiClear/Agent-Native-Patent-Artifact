<!-- AUTO-GENERATED for host 'claude' from skills/patent-drawing-quality/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->

# Prior-Art Source Registry

Generated routing reference. The canonical registry is `docs/source-registry.md`; keep source IDs synchronized there.

| source_id | Access mode | Enabled by default | Human verification required | Notes |
|---|---|---:|---:|---|
| `patentsview` | API | yes | yes | PatentsView PatentSearch API; requires `PATENTSVIEW_API_KEY`. |
| `mock` | API-like fixture | no | no | Offline deterministic tests and demos only. |
| `pqai` | API | no | yes | Planned follow-on source. |
| `epo-ops` | API | no | yes | Planned international source; requires credentials. |
| `google-bigquery` | dataset | no | yes | Sanctioned Google patents-public-data path. |
| `uspto-pps` | UI-only | no | yes | Human handoff for USPTO Patent Public Search snapshots/exports. |
| `google-patents-ui` | UI-restricted | no | yes | Disabled for automation; do not scrape as a substitute. |

Rules:
- Use canonical `source_id` values, not ad hoc source names.
- API/dataset sources must pass scan-at-sink on exact outbound query bytes.
- UI-only or UI-restricted sources are human handoff unless a sanctioned API/dataset path is added.
- Every real reference remains unverified until a human verifies title, venue, canonical link, and relied-on passages.
