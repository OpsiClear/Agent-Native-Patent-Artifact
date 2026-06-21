---
name: software-patent-review
description: "Review, draft, and harden software or computer-implemented patent matter with emphasis on 101 eligibility, technical improvement framing, algorithm/support disclosure, non-transitory CRM claims, data-structure claims, and 112 risks. Use for software patents, SaaS/AI/data-processing inventions, and computer-implemented claim strategy. Invoke as /apa-software-patent."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/software-patent-review/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# software-patent-review (`/apa-software-patent`)

## Operating Posture
- APA is supervised drafting software, not a registered practitioner and not legal advice.
- A competent human must independently review every output; flags are not patentability, FTO, validity, infringement, or 112 conclusions.
- Only natural persons may be named as inventors; AI systems are tools and are never inventor names.
- APA never signs, certifies, asserts micro-entity status, or files; Patent Center submission remains a human act.
- For pro-se users, provide neutral education, options, and questions only; do not choose claim scope, filing timing, art to cite, or amendments.
- Do not add new matter: unsupported limitations, embodiments, advantages, or figure details stay marked as gaps.
- Before any external egress, use scan-at-sink on the exact bytes and block HIGH findings.

### Safety References
| Reference | Load when |
|---|---|
| [Legal guardrails](references/legal-guardrails.md) | Need detailed no-legal-advice, inventorship, pro-se, candor, or submit-boundary rules. |
| [USPTO rule pack](references/uspto-rule-pack.md) | Need claim form, 101/102/103/112, IDS, or dated USPTO rule anchors. |
| [Confidentiality sinks](references/confidentiality-sinks.md) | Any content may leave the local machine, including prior-art queries, cloud LLMs, fetches, npx, or filing exports. |
| [Drawing standards](references/drawing-standards.md) | Creating, upgrading, reviewing, exporting, or assembling patent drawings. |
| [Source registry](references/source-registry.md) | Prior-art search needs canonical source IDs, access modes, or human-verification requirements. |

## What this does

Reviews or drafts software/computer-implemented patent material as flags, checklists, and proposed
drafting moves for a competent human. It focuses on the recurring software-patent failure modes:
abstract-idea framing, generic-computer implementation, missing technical-improvement story, purely
result-oriented functional claims, weak algorithm disclosure, unsupported data structures, and
computer-readable-medium wording that accidentally reaches transitory signals.

Load [software patent review guide](references/software-patent-review.md) before doing the review.
Load [USPTO rule pack](references/uspto-rule-pack.md) for current rule-pack anchors and verify
current USPTO/MPEP sources before relying on any eligibility position.

## Procedure

1. **Scope the invention.** Identify the concrete software domain, system boundary, users/devices,
   data inputs/outputs, runtime environment, deployment mode, and whether claims are method, system,
   non-transitory computer-readable medium, data-structure, AI/ML, UI, networking, security, database,
   codec/compression, or control-system oriented.
2. **Extract the technical improvement.** Ask what is improved in computer functionality or another
   technical field: latency, memory, bandwidth, error rate, security, synchronization, rendering,
   compression, training/inference quality, resource allocation, device control, or another measurable
   technical effect. Record baseline problem, old technical limitation, new mechanism, and measured or
   expected technical effect. If the record lacks a concrete technical mechanism, stop at inventor
   questions and risk flags; do not draft claim scope around a business result or generic automation.
3. **Run the software 101 screen.** Apply the Alice/Mayo-style posture in the reference guide:
   statutory category, abstract-idea risk, integration into a practical application, and whether
   additional limitations are more than generic computer use or insignificant extra-solution activity.
   Output risk flags and claim/spec revisions, not a conclusion.
4. **Run the software 112 screen.** For every functional limitation, verify source-backed support for
   concrete acts, data transforms, state transitions, algorithms, data structures, interfaces,
   hardware/software cooperation, and clear linkage between claimed function and disclosed structure.
   Flag 112(f) nonce terms and missing algorithms.
5. **Draft or harden the claim family.** Prefer a coordinated set of method, system, and
   non-transitory CRM claims when supported. Use implementation nouns, data-flow steps, structural
   cooperation, and technical-effect limitations. Keep pro-se output neutral; registered-practitioner
   mode may receive redline proposals for approval.
6. **Propose artifact changes without writing canonical files.** Domain work writes under
   `domain/software/`. Propose source-backed `SPEC####`, claim limitations, figures, flowcharts, and
   report findings as patch candidates for `/apa-claims` or `/apa-spec`; do not directly rewrite
   `logic/`, `src/`, `assembled/`, or filing outputs from this domain skill. Do not introduce
   unsupported implementation details. Use `source_span_policy: "strict"` when the user wants the
   software support review to block unsupported adopted limitations after human adoption.
7. **Emit a review artifact.** Write or propose `domain/software/software_patent_report.json` and a
   concise Markdown summary using the report shape in the guide. Include `legal_posture:
   flags-not-conclusions`, eligibility/support findings, human checkpoints, support-state tags
   (`supported-now`, `needs-inventor-confirmation`, `unsupported-new-matter-risk`), and exact open
   questions for the inventor or practitioner.

## Do NOT

- State that software is patentable, eligible, novel, non-obvious, valid, infringed, cleared, or
  guaranteed to survive Alice/Mayo.
- Claim a business rule, mental process, mathematical result, or generic automation as an invention
  unless the record supports a concrete technical mechanism and practical application.
- Add "non-transitory," "processor," "module," "AI," "machine learning," "blockchain," or "cloud" as
  magic words without source support and a real technical role.
- Draft purely result-oriented functional software claims without algorithmic/specification support.
