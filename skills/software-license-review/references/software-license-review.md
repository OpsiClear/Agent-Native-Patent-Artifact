# Software License Review Guide

Use this reference for `/apa-license` reviews. It is a triage and documentation workflow, not a
substitute for counsel review.

## Evidence To Inspect

Local first:
- `LICENSE*`, `COPYING*`, `NOTICE*`, `THIRD_PARTY_NOTICES*`, `README*`, `CONTRIBUTING*`.
- `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`,
  `pyproject.toml`, `requirements*.txt`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`,
  `pom.xml`, `build.gradle*`, `Gemfile.lock`, `vcpkg.json`, `.gitmodules`.
- Source headers, vendored directories, examples, test fixtures, generated files, docs assets,
  fonts, icons, images, model weights, datasets, and copied algorithms.
- CI/release scripts that package source, binaries, containers, browser bundles, wheels, npm
  packages, Docker images, firmware, or SDKs.

External only when needed:
- Official upstream repository license file, release tarball, package registry page, or official
  project site.
- Use a guarded fetch and store the fetched text under a review evidence folder with URL, timestamp,
  SHA-256, and untrusted-content envelope intact.

## Classification Heuristics

Record uncertainty explicitly. Do not collapse flags into legal conclusions.

- **Permissive notice licenses**: MIT, BSD, ISC, Zlib. Typical risk is missing copyright/license
  notices in redistributed source/binaries.
- **Apache-2.0 style**: notice obligations plus explicit patent-license and patent-termination terms;
  check `NOTICE` propagation and compatibility with inbound/outbound license choices.
- **Weak/copyleft library licenses**: LGPL/MPL/EPL/CDDL. Check linking mode, modifications, file-level
  copyleft, replacement/relink ability, and source-offer obligations.
- **Strong/copyleft licenses**: GPL-family. Check whether distribution of a combined work may require
  corresponding source and compatible outbound licensing.
- **Network/copyleft/source-available**: AGPL, SSPL, BSL, PolyForm, Elastic, Commons Clause, custom
  source-available terms. Check SaaS/network use, field-of-use, delayed-open terms, and commercial
  restrictions.
- **Non-code licenses**: Creative Commons, Open Font License, data/model licenses. Check whether the
  license is appropriate for code, docs, UI assets, fonts, datasets, or model weights.
- **Public domain/government works**: verify the jurisdiction and actual dedication/status; some
  databases mix public-domain content with copyrighted annotations or compiled data.
- **No license / unknown**: treat as all-rights-reserved until the rights holder or authoritative
  source says otherwise.

## Inventory Fields

Use this shape in `license_review.json` when a machine-readable report is useful:

```json
{
  "schema": "apa-software-license-review-v1",
  "legal_posture": "flags-not-conclusions",
  "review_scope": {
    "repository": "<path-or-url>",
    "distribution_modes": ["source", "binary", "SaaS"],
    "reviewed_at": "<ISO-8601 timestamp>",
    "reviewer": "<name-or-agent>"
  },
  "project_license": {
    "declared_expression": "MIT",
    "evidence": [{"path": "LICENSE", "line": 1, "quote": "MIT License"}],
    "confidence": "high"
  },
  "components": [
    {
      "name": "<component-or-dependency>",
      "path_or_package": "<path-or-package-id>",
      "relationship": "runtime|dev-tool|vendored|copied-code|submodule|asset|dataset|generated",
      "license_expression": "<SPDX-or-observed>",
      "evidence": [{"path": "<file>", "line": 1, "quote": "<short quote>"}],
      "shipped": true,
      "modified": false,
      "confidence": "high|medium|low|unknown"
    }
  ],
  "findings": [
    {
      "severity": "blocking|fix-before-release|counsel-review|warning|info",
      "issue_type": "missing-license|metadata-mismatch|notice-gap|copyleft-trigger|patent-clause|provenance-gap|custom-terms|other",
      "evidence": [{"path": "<file>", "line": 1, "quote": "<short quote>"}],
      "risk": "<plain-language risk flag>",
      "recommended_next_step": "<specific action for owner/counsel>"
    }
  ],
  "human_checkpoints": [
    {"id": "counsel-review", "required": true, "satisfied": false}
  ],
  "search_completeness": "not_asserted"
}
```

## Review Output

Lead with blocking or release-relevant findings. Then summarize:
- Project license and any mismatch between root license, package metadata, and README claims.
- Dependency/vendored-code license families and obligations that may travel into distribution.
- Required notice/attribution updates.
- Patent-license posture, especially MIT/no-explicit-patent-grant vs Apache-2.0-style explicit grants.
- Unknowns requiring upstream verification, rights-holder confirmation, or counsel review.

Keep recommendations concrete: add a missing notice, remove/replace a dependency, verify upstream
license text, split GPL code from distributed artifacts, add a third-party notice entry, pin a tool
version, or ask counsel to approve a specific outbound license decision.
