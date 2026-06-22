<!-- AUTO-GENERATED for host 'claude' from skills/patent-drawing-quality/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->

# Prior-Art Source Registry

Generated routing reference. The canonical registry is `docs/source-registry.md`; keep source IDs synchronized there.

| source_id | Access mode | Enabled by default | Human verification required | Rate / quota posture | Notes |
|---|---|---:|---:|---|---|
| `patentsview` | API | yes | yes | 45 requests/minute; record source-health in each live run. | PatentsView PatentSearch API; requires `PATENTSVIEW_API_KEY`; verify USPTO ODP endpoint currency. |
| `crossref` | API | yes | yes | Public pool conservative 5 requests/second; polite pool when `CROSSREF_MAILTO` is set. | Crossref Works API for NPL metadata; full text and relied-on passages require human verification. |
| `arxiv` | API | yes | yes | One request every three seconds and one connection. | arXiv API for preprint metadata; versions, dates, and publication status require human verification. |
| `openalex` | API | yes | yes | Use `OPENALEX_API_KEY` when available; daily budget state is recorded in source health. | OpenAlex Works API for broad scholarly metadata; venue, version, dates, links, and relied-on passages require human verification. |
| `mock` | API-like fixture | no | no | No external calls. | Offline deterministic tests and demos only. |
| `fixture` | API-like fixture | no | no | No external calls. | Offline benchmark corpus only; not prior-art evidence. |
| `pqai` | API | no | yes | Planned; no executable rate policy yet. | Planned follow-on source. |
| `epo-ops` | API | no | yes | Planned OAuth/fair-use controlled source. | Planned international source; requires credentials. |
| `google-bigquery` | dataset | no | yes | Planned; governed by Google Cloud quota/billing controls. | Sanctioned Google patents-public-data path. |
| `uspto-pps` | UI-only | no | yes | Human handoff only. | Human handoff for USPTO Patent Public Search snapshots/exports. |
| `google-patents-ui` | UI-restricted | no | yes | Automation disabled. | Disabled for automation; do not scrape as a substitute. |

Rules:
- Use canonical `source_id` values, not ad hoc source names.
- API/dataset sources must pass scan-at-sink on exact outbound query bytes.
- UI-only or UI-restricted sources are human handoff unless a sanctioned API/dataset path is added.
- Every real reference remains unverified until a human verifies title, venue, canonical link, and relied-on passages.
