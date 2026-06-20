# Third-Party Notices

This repository is released under the license in [LICENSE](LICENSE). The project also
uses public reference material and adapts ideas or code patterns from the sources below.
Keep this file current when adding copied, ported, or closely adapted material.

## ARA-Labs/Agent-Native-Research-Artifact

- Source: <https://github.com/ARA-Labs/Agent-Native-Research-Artifact>
- License: MIT License
- Repository role: vendored as a git submodule at
  `third_party/Agent-Native-Research-Artifact`.
- APA usage: artifact protocol concepts, progressive-disclosure patterns, viewer and
  skill-installation design influence.
- Notice handling: upstream license and copyright notices remain in the submodule.

## garrytan/gstack

- Source: <https://github.com/garrytan/gstack>
- License: MIT License
- Repository role: vendored as a git submodule at `third_party/gstack`.
- APA usage: skill-generation workflow patterns, CI/eval workflow patterns, and
  ported/adapted redaction taxonomy and redaction-engine concepts.
- Closely related APA files include:
  - `packages/apa-redact/redact-engine.mjs`
  - `packages/apa-redact/redact-patterns.mjs`
  - `packages/apa-redact/cli.mjs`
  - `scripts/gen-skill-docs.mjs`
  - `.github/workflows/gate.yml`
  - `.github/workflows/periodic-evals.yml`
- Notice handling: upstream license and copyright notices remain in the submodule.
  Files that are ports or close adaptations should also say so in their file header.

## USPTO And U.S. Government Reference Material

- Source role: public legal/rules reference material checked into
  `third_party/uspto-references`.
- License/status: U.S. government works are public domain under 17 U.S.C. 105.
- APA usage: validation rules, filing-prep guardrails, fee-schedule references, and
  legal-rule resolver source material.
- Currency note: statutory, regulatory, MPEP, and fee references can change. APA uses
  dated references and surfaces "verify currency" where appropriate.

## Maintainer Checklist

When adding or changing third-party material:

1. Preserve the upstream license and copyright notice.
2. Record the source repository, original path when known, license, and adaptation
   summary in this file.
3. Prefer submodules or clearly documented excerpts over silent vendoring.
4. Do not mix confidential patent matter into examples, tests, fixtures, or notices.
5. If the material has a license with patent, attribution, copyleft, or network-use
   obligations, review compatibility before merging.
