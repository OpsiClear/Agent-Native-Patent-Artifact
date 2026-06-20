# Prior-Art Source Registry

This registry standardizes source names and access modes used by `/apa-priorart` and
`packages/apa-search`. It is not a representation that any search is complete.

| source_id | Provider / name | Official | Access mode | Enabled by default | Query payload class | Returns full text? | Human verification required | Notes |
|---|---|---:|---|---:|---|---:|---:|---|
| `patentsview` | PatentsView PatentSearch API (`search.patentsview.org`) | USPTO-supported | API | yes | claim-derived keyword/CPC query | partial metadata/abstracts | yes | Requires `PATENTSVIEW_API_KEY`; watch USPTO ODP/PatentsView transition notices for endpoint changes. |
| `mock` | Offline deterministic fixture source | no | API-like fixture | no | synthetic demo query | fixture only | no | Tests and demos only; not prior art evidence. |
| `pqai` | PQAI semantic patent/NPL search | no | API | no | claim-derived semantic query | source-dependent | yes | Planned follow-on source; not enabled in USPTO-only v1. |
| `epo-ops` | EPO Open Patent Services | yes | API | no | patent bibliographic/query payload | source-dependent | yes | Planned international source; requires credentials. |
| `google-bigquery` | Google patents-public-data BigQuery dataset | no | dataset | no | SQL/dataset query | dataset fields | yes | Sanctioned Google path; do not use Google Patents UI scraping as a substitute. |
| `uspto-pps` | USPTO Patent Public Search (PPS / PPUBS) | yes | UI-only | no | human-entered search | UI/export dependent | yes | Examiner-grade but no automated API path in APA; route to human snapshot/export workflow. |
| `google-patents-ui` | Google Patents web UI | no | UI-restricted | no | UI interaction | UI dependent | yes | Disabled for automation; ToS-restricted. |

Rules:
- Skills must use `source_id` values above, not ad hoc names like "USPTO PatentSearch" alone.
- API/dataset sources may be automated only through `packages/apa-search` and must pass scan-at-sink on the exact outbound bytes.
- UI-only or UI-restricted sources are human-handoff unless a future sanctioned API/dataset path is added here.
- Every real reference remains `verification: false` until a human verifies title, venue, canonical link, and relied-on disclosures/lacks.
