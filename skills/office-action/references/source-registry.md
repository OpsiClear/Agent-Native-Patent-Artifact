<!-- AUTO-GENERATED for host 'claude' from skills/office-action/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->

# Prior-Art Source Registry

Generated routing reference. The canonical registry is `docs/source-registry.md`; keep source IDs synchronized there.

| source_id | Access mode | Enabled by default | Human verification required | Notes |
|---|---|---:|---:|---|
| `patentsview` | API | yes | yes | PatentsView PatentSearch API; requires `PATENTSVIEW_API_KEY`. |
| `crossref` | API | yes | yes | Crossref Works API for NPL metadata; full text and relied-on passages require human verification. |
| `arxiv` | API | yes | yes | arXiv API for preprint metadata; versions, dates, and publication status require human verification. |
| `openalex` | API | yes | yes | OpenAlex Works API for broad scholarly metadata; venue, version, dates, links, and relied-on passages require human verification. |
| `mock` | API-like fixture | no | no | Offline deterministic tests and demos only. |
| `fixture` | API-like fixture | no | no | Offline benchmark corpus only; not prior-art evidence. |
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
