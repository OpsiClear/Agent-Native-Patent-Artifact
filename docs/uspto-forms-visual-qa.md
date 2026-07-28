# USPTO forms visual-QA evidence

Review date: 2026-07-28

Scope: every page of every PDF included by `docs/uspto-forms.json`. Source bytes were checked against
the registry byte count and SHA-256 before rendering. Poppler 26.02.0 rendered the PDFs at 120 DPI,
and each resulting page image was inspected for page completeness, clipping, overlapping content,
unreadable glyphs, and corruption.

| Release file | Pages | Generic-render result | Release decision |
|---|---:|---|---|
| `aia01-inventor-declaration.pdf` | 2 | Complete and legible, including Privacy Act page | Include |
| `aia14-application-data-sheet.pdf` | 1 | Expected XFA `Please wait` page | Include with Adobe Reader warning |
| `aia15-utility-transmittal.pdf` | 2 | Complete and legible, including Privacy Act page | Include |
| `aia22p-provisional-extension.pdf` | 2 | Complete and legible; provisional-only heading and 1.17(u) fee rows visible | Include |
| `sb08-patent-center-ids.pdf` | 1 | Expected XFA `Please wait` page | Include with Adobe Reader warning |
| `sb16-patent-center.pdf` | 1 | Blank generic render consistent with unsupported XFA presentation | Include with Adobe Reader warning and manual fallback |
| `sb16-manual.pdf` | 3 | Both cover-sheet pages and Privacy Act page complete and legible | Include as manual fallback |
| `sb08a-manual.pdf` | 2 | Citation table and Privacy Act page complete and legible | Include as manual fallback |
| `sb08b-manual.pdf` | 2 | Non-patent-literature table and Privacy Act page complete and legible | Include as manual fallback |

An additional official AIA/14 manual-link candidate rendered as a blank one-page XFA document and
offered no useful generic-viewer fallback, so it is not included. The Patent Center AIA/14 remains
the pinned core asset.

Poppler reported unavailable fallback fonts named `Symbol` and `ArialUnicode` while processing some
files. Page-by-page inspection found no missing visible content or unreadable glyphs in the ordinary
PDF pages. XFA content cannot be validated by a generic renderer; the release README therefore
requires Adobe Acrobat Reader and human inspection of the live form presentation before use.
