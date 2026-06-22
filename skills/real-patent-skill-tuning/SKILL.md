---
name: real-patent-skill-tuning
description: "Tune APA skills against real public patent simulations with fresh generated reports, oracle isolation, fixed scoring, holdout fixtures, and auto-tune guardrails. Use when improving /apa-software-patent or another APA skill from existing real-patent benchmark gaps or running skill auto-tune. Do not use for creating public patent fixtures/oracles, drafting patent matter, reviewing a patent matter, or giving patentability advice. Invoke as /apa-real-patent-skill-tune."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/real-patent-skill-tuning/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# real-patent-skill-tuning (`/apa-real-patent-skill-tune`)

## Operating Posture
- APA is supervised drafting software, not a registered practitioner and not legal advice.
- A competent human must independently review every output; flags are not patentability, FTO, validity, infringement, or 112 conclusions.
- Only natural persons may be named as inventors; AI systems are tools and are never inventor names.
- APA never signs, certifies, asserts micro-entity status, or files; Patent Center submission remains a human act.
- For pro-se users, provide neutral education, options, and questions only; do not choose claim scope, filing timing, art to cite, or amendments.
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

Orchestrates safe tuning of APA skills against real public patent fixtures. It turns a fixed
benchmark checklist into an executable tuning protocol: generate fresh candidate reports from the
current skill, score those reports with oracle-isolated checks, keep only improvements that preserve
legal guardrails, and verify generated skill docs stay fresh.

Use this skill for tuning an existing APA skill. Use `/apa-public-patent-benchmark` instead when the
task is to create a new public patent fixture or expected oracle.

## Reference Routing

Load only the references needed for the current step:

| File | Load when |
|---|---|
| [tuning checklist](references/tuning-checklist.md) | Planning or executing the full tuning workflow. |
| [oracle isolation](references/oracle-isolation.md) | Building fresh-report generation or checking for benchmark leakage. |
| [scorer contract](references/scorer-contract.md) | Modifying scorer checks, thresholds, fixtures, or candidate-report paths. |
| [auto-tune loop](references/auto-tune-loop.md) | Running autonomous experiments or deciding keep/discard rules. |
| [legal guardrails](references/legal-guardrails.md) | Evaluating legal-overclaim failures, pro-se boundaries, inventorship language, or submit-boundary safety floors. |
| [confidentiality sinks](references/confidentiality-sinks.md) | Any network fetch, cloud model call, package-manager command, or external tool. |

## Required Startup Contract

Before editing any skill, state the startup contract:

1. **Target skill.** Default to `/apa-software-patent` only when the request concerns software patent
   review or public software-patent simulations.
2. **Metric command.** Auto-tune needs a stable JSON command that generates fresh candidate reports
   under `.apa/tune/`, proves it is not scoring committed fixture `runs/advisory-*` reports, and
   passes the `candidate_provenance` floor for staged source hashes, current skill-source hashes, and
   no oracle/scorer references.
3. **Regression guards.** Use the relevant synthetic simulation, `npm run skills:check`, generated
   skill freshness, and final `npm run build` / `npm run coverage`.
4. **Mutable surface.** Freeze scorer and fixture oracle files before tuning. For `/apa-software-patent`,
   edit only `SKILL.md.tmpl`, `references/software-patent-review.md`, and trigger fixtures.
5. **Release status.** Treat real-public-patent scoring as advisory until deterministic extraction,
   enforceable fresh generation, and holdout fixtures exist.

## Procedure

1. **Check readiness before auto-tune.** Auto-tune may begin only when skill changes can affect the
   real-patent score through freshly generated candidate reports outside
   `benchmarks/fixtures/**/runs`. If the available score reads committed `runs/advisory-*` reports,
   stop and implement an isolated fresh-report generator and candidate-report scorer first.
2. **Protect the oracle.** Candidate report generation may read public `source.md` and current skill
   instructions. It must not read `expected.json`, fixture `checks`, scorer source, benchmark reports,
   or prior expected answers. For auto-tune, stage generation from a sanitized directory containing
   only public source input plus target skill instructions. Only the scorer reads oracle files.
3. **Score with floors, not only an average.** Require source integrity and legal-overclaim avoidance
   to be perfect, require candidate provenance to be perfect, and require minimum source-span and
   mechanism coverage before considering a skill change successful.
4. **Avoid prompt bloat.** Keep `SKILL.md.tmpl` concise. Put subtype detail in references. Do not copy
   full public patents or fixture oracles into skill instructions.
5. **Run small experiments.** Make one skill-source edit at a time, regenerate skills, run the tuning
   metric plus regression guards, and keep only net-positive changes.
6. **Use holdout fixtures.** Tune on train/dev fixtures, then require held-out public patents and
   negative controls to remain stable before accepting a change.
7. **Record the evidence.** Save before/after JSON score artifacts and an untracked `.autotune/` TSV
   log. Summaries should cite command outputs and changed files, not legal conclusions.

## Output Contract

When tuning is complete or paused, produce:

- the target skill and mutable files used;
- baseline and final metric JSON paths or command summaries;
- kept and discarded experiment notes;
- generated-doc freshness status;
- synthetic/regression/holdout results;
- any legal-posture or claim-family changes requiring human review.

## Do NOT

- Start auto-tune when the score grades only committed advisory reports.
- Let the report generator read benchmark oracles, expected checks, or scorer code.
- Edit generated `skills/*/SKILL.md` directly.
- Promote advisory real-public-patent scoring into `npm run build` before fresh generation and holdout
  coverage exist.
- State patentability, eligibility, validity, infringement, freedom to operate, allowance, filing
  readiness, or legal clearance as a conclusion.
