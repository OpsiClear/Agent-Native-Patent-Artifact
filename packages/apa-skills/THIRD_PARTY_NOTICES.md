# Third-Party Notices

This package is released under [LICENSE](LICENSE). Its bundled `apa-form-fill`
skill also contains the following third-party software.

## pdf-lib

- Source: <https://github.com/Hopding/pdf-lib>
- Version: 1.17.1
- License: MIT License, copyright Andrew Dillon.
- Original distribution path: `dist/pdf-lib.min.js`.
- Bundled paths:
  - `skills/<host>/apa-form-fill/scripts/vendor/pdf-lib-1.17.1.cjs`
  - `skills/<host>/apa-form-fill/scripts/vendor/PDF-LIB-LICENSE.md`
- Use: local inspection, population, saving, and reopening of ordinary
  AcroForm PDF drafts. The APA wrapper refuses XFA before invoking pdf-lib.
- Integrity: the vendored runtime bytes are pinned and checked by SHA-256.

The complete upstream pdf-lib license travels beside every bundled copy of
the runtime.
