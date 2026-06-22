# Prior-Art Source Registry

This registry standardizes source names and access modes used by `/apa-priorart` and
`packages/apa-search`. It is not a representation that any search is complete.

| source_id | Provider / name | Official | Access mode | Enabled by default | Query payload class | Returns full text? | Human verification required | Rate-limit / quota notes | Notes |
|---|---|---:|---|---:|---|---:|---:|---|---|
| `patentsview` | PatentsView PatentSearch API (`search.patentsview.org`) | USPTO-supported | API | yes | claim-derived keyword/CPC query | partial metadata/abstracts | yes | 45 requests/minute; back off on 429; live runs record endpoint/auth/schema health. | Requires `PATENTSVIEW_API_KEY`; USPTO announced PatentsView migration to the Open Data Portal on 2026-03-20, so verify endpoint currency for live use. |
| `crossref` | Crossref Works API | no | API | yes | claim-derived NPL metadata query | abstracts rarely; metadata/snippets | yes | Public pool is conservative 5 requests/second; polite pool when `CROSSREF_MAILTO` is set. | Non-patent literature metadata. Use for candidate discovery only; full-text passages remain human/publisher verification. |
| `arxiv` | arXiv API | no | API | yes | claim-derived NPL/preprint query | abstracts | yes | Legacy API policy: one request every three seconds and one connection. | Preprint/NPL discovery for software, ML, compression, and related fields. Verify versions, dates, and publication status. |
| `openalex` | OpenAlex Works API | no | API | yes | claim-derived scholarly metadata query | abstracts when indexed; metadata/links | yes | Use `OPENALEX_API_KEY` when available; unauthenticated/keyed daily budgets are recorded in source health. | Broad scholarly/NPL metadata across articles, proceedings, repositories, books, datasets, and theses; verify venue, version, dates, links, and relied-on passages. Optional `OPENALEX_MAILTO` may be set for polite API identification. |
| `mock` | Offline deterministic fixture source | no | API-like fixture | no | synthetic demo query | fixture only | no | No external calls. | Tests and demos only; not prior art evidence. |
| `fixture` | Offline benchmark fixture corpus | no | API-like fixture | no | public benchmark query | fixture snippets only | no | No external calls. | Tests fixed recall/rank behavior with public benchmark records; not prior-art evidence. |
| `pqai` | PQAI semantic patent/NPL search | no | API | no | claim-derived semantic query | source-dependent | yes | Planned; no executable rate policy yet. | Planned follow-on semantic source; not enabled in v1. |
| `epo-ops` | EPO Open Patent Services | yes | API | no | patent bibliographic/family/full-text query | source-dependent | yes | Planned OAuth/fair-use controlled source; no automated adapter yet. | Planned international source; requires credentials. |
| `google-bigquery` | Google patents-public-data BigQuery dataset | no | dataset | no | SQL/dataset query | dataset fields | yes | Planned; governed by Google Cloud quota/billing controls. | Sanctioned Google path; do not use Google Patents UI scraping as a substitute. |
| `uspto-pps` | USPTO Patent Public Search (PPS / PPUBS) | yes | UI-only | no | human-entered search | UI/export dependent | yes | Human handoff only; no APA automated rate policy. | Examiner-grade but no automated API path in APA; route to human snapshot/export workflow. |
| `google-patents-ui` | Google Patents web UI | no | UI-restricted | no | UI interaction | UI dependent | yes | Automation disabled. | Disabled for automation; ToS-restricted. |

Rules:
- Skills must use `source_id` values above, not ad hoc names like "USPTO PatentSearch" alone.
- API/dataset sources may be automated only through `packages/apa-search` and must pass scan-at-sink on the exact outbound bytes.
- UI-only or UI-restricted sources are human-handoff unless a future sanctioned API/dataset path is added here.
- Every real reference remains `verification: false` until a human verifies title, venue, canonical link, and relied-on disclosures/lacks.
