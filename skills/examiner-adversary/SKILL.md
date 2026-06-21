---
name: examiner-adversary
description: "Role-play a USPTO examiner against a matter: enumerate the strongest likely 101/102/103/112 rejections, and for each pair the critique with a concrete fix, recording the critique->fix rationale. Hardens the application before the real examiner. Invoke as /apa-examiner."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/examiner-adversary/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# examiner-adversary (`/apa-examiner`)

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
An adversarial loop: you take the examiner's side, enumerate the strongest rejections the matter would
likely draw, and pair each critique with a candidate fix - hardening the application *before* a real
examiner sees it and leaving a documented record. This complements the read-only `/apa-rigor` audit.
Output is `trace/prosecution_rationale.md`. Findings are flags for a human, never conclusions. In
`pro_se` mode, output issues and optional discussion points only; do not edit claims or select a fix.
Treat this critique as sensitive: it may contain admissions, claim-scope concessions, or damaging
characterizations. When privilege/work-product matters, route the run through counsel-controlled
systems and record only the human-approved drafting decisions in the shareable artifact. If
`confidential_workflow_mode: shareable_redacted`, `trace/examiner_adversary_report.json` and
`trace/prosecution_rationale.md` are excluded from shareable exports by default until redaction guard
and human approval.

## Procedure
1. **Read** the claims, spec, prior-art landscape (`logic/prior_art.md` + `reference_matrix.md`), and
   `patent_rigor_report.json` if present. Identify the closest art and the weakest claim language.
2. **Enumerate the strongest likely rejections**, numbered, across the statutes:
   - **101:** abstract-idea / Alice-Mayo attacks on any claim lacking concrete structure.
   - **102:** any single reference that arguably teaches every limitation of a claim (anticipation),
     including interview-derived statutory bars (on-sale / public use / the inventor's own disclosure).
   - **103:** the **strongest combination** of references + a KSR rationale (name it: combination of
     known elements, simple substitution, obvious-to-try, ...); address the Graham factors.
   - **112:** written-description / enablement gaps, indefinite terms of degree, 112(f) nonce limitations
     lacking corresponding structure.
3. **For each critique, write the candidate fix** (narrow a limitation to the defensible kernel, add
   structure, define a term, push breadth to a dependent/continuation) and the **key distinction** that
   would survive it. In `registered_practitioner` mode, wait for explicit approval before editing any
   claim/spec file. In `pro_se` mode, do not apply the fix; output questions/options to take to counsel.
4. **Record** each as a `### Critique N` block in `trace/prosecution_rationale.md`:
   `Likely critique -> Why it matters -> Fix made -> Key distinction`. Log a corresponding `decision` or
   `dead_end` node in `trace/prosecution.yaml` (a refused-and-foreclosed position becomes a `dead_end`
   so it is never re-argued).
5. **Machine report.** Emit `trace/examiner_adversary_report.json` using the shared report envelope
   (`schema: apa-examiner-adversary-report-v1`, `legal_posture: flags-not-conclusions`). Include each
   critique as a report finding or `critiques` entry, `loop_count`, `max_examiner_loops`, `edit_mode`,
   `dead_end_arguments`, `proposed_amendments`, and any required practitioner-approval checkpoint.
   `loop_count` must not exceed `max_examiner_loops` unless the report includes a satisfied
   `examiner-loop-override` checkpoint. Each `dead_end_arguments[]` entry must include the argument,
   reason, affected claims, evidence span, and `do_not_reuse: true`. Each `proposed_amendments[]`
   entry must be `status: "proposal-only"`, `requires_practitioner_approval: true`, and
   `human_adopted: false`. In `pro_se_summary` mode, leave `proposed_amendments` empty and provide
   neutral issues/questions only. Validate it with
   `node packages/apa-reports/cli.mjs check <matter>/trace/examiner_adversary_report.json --kind examiner_adversary`.
   In `shareable_redacted` mode, do not copy this report into any external share package.
6. **Re-check** only after human-approved edits: `node packages/apa-draft/claim-lint.mjs <matter>` and
   `node packages/apa-validate/validate.mjs <matter>`; then re-run `/apa-rigor`. Stop after the caller's
   `max_examiner_loops` cap (default 2) and surface residual risks rather than looping indefinitely.

### 101/102/103/112 — analysis as FLAGS + QUESTIONS for a human (never conclusions)
- **101 (eligibility):** Alice/Mayo two-step. Flag abstract-idea risk; check the claim recites a
  practical application / concrete structure. Do not opine on eligibility.
- **102 (novelty):** element-by-element — anticipation = every limitation in ONE reference. Each
  prior-art chart cell must be quote-backed with page/paragraph/location and human-verification state.
  ALSO run a statutory-bar screen from the INTERVIEW (on-sale, public use, the inventor's own disclosure, with
  dates vs the effective filing date and the one-year grace window) — these are not found by search.
- **103 (obviousness):** apply the Graham factors and name the relevant KSR rationale (MPEP 2143 A-G):
  (A) combine prior-art elements by known methods for predictable results; (B) simple substitution of one
  known element for another; (C) use a known technique to improve a similar device the same way; (D) apply
  a known technique to a known device ready for improvement; (E) obvious-to-try among a finite set of
  predictable solutions; (F) design incentives / market forces prompting a known variation; (G) teaching,
  suggestion, or motivation (TSM). Capture secondary considerations (commercial success, long-felt need,
  unexpected results) from the inventor as rebuttal.
- **112:** (a) written description / enablement — each limitation traced to spec support; (b)
  definiteness — terms of degree need an objective bound; (f) means-plus-function structure.
- Output is flags and `questions_for_attorney` / `questions_for_inventor`, never an opinion or FTO/
  validity/infringement conclusion.

### Claim format (37 CFR 1.75; MPEP 608.01) — drafting rules the agent enforces
- One sentence per claim, ending in a period; preamble + transitional phrase (`comprising` open;
  `consisting of` closed) + body of limitations.
- **Antecedent basis:** introduce an element with `a`/`an` on first mention, refer back with
  `the`/`said`. Every `the X` needs an earlier `a X` in the same claim (or an ancestor claim).
- Independent vs dependent: MVP supports single-dependent claims only. Multiple-dependent claims
  are legally possible but unsupported here; fail loud / route to practitioner tooling rather than
  drafting one silently.
- Mirror the inventive kernel across statutory categories where applicable (apparatus / method /
  system / computer-readable medium).
- 112(f): a `means for` / nonce-word (`module/mechanism/unit for`) limitation invokes
  means-plus-function and REQUIRES corresponding structure in the spec, or it is indefinite (112(b)).

## Do NOT
- Present a rejection or a fix as a legal conclusion - these are anticipated arguments and drafting
  recommendations for a registered practitioner.
- Apply claim/spec edits without explicit registered-practitioner approval, or apply any strategic
  amendment in pro-se mode.
- Over-narrow silently: when you narrow a claim, record the broader scope as continuation-reserved.
- Invent prior art or claim limitations (new matter). Rules as of 2026-06-15.
