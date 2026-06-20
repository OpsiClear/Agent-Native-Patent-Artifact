---
name: claim-drafting
description: "Draft independent + dependent claims for a matter: build the dual-lens claim ladder (examiner-survival + portfolio-protection), enforce single-sentence form and antecedent basis, seed defined terms, and bind each limitation to its spec support and the closest prior art. Invoke as /apa-claims."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/claim-drafting/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# claim-drafting (`/apa-claims`)

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
Drafts the `CLM##`/`LIM##` claim set in `logic/claims.md` from the inventive concept, embodiments, and
the prior-art landscape, in the protocol's binding format (the canonical protocol spec at `docs/protocol.md`). Claim **scope is a human
decision**. In `registered_practitioner` mode, produce candidate ladder/redline drafts for practitioner
approval. In `pro_se` mode, output neutral possible organizations and questions to discuss with counsel;
do not select scope or apply narrowing edits.

## Procedure
1. **Inputs:** read `logic/problem.md`, `src/embodiments.md`, `logic/prior_art.md` (+ `reference_matrix.md`
   if present), and `logic/patentability.md`. Identify the defensible kernel = the combination the
   closest art (`PA##`) lacks.
2. **Build the ladder** (see the dual-lens guide below). If `user_role: pro_se`, label it
   `possible_organization_options` and do not choose among alternatives. For each claim write a
   `### CLM## - <title>`
   section: prose claim text + a ```binding block with `type`, `category`, `depends_on` (dependents),
   `distinguished_over: [PA##]` (the closest art the independent claim reads past), `scope_set_at: [PH##]`
   (log the scope decision in `trace/prosecution.yaml`), and `limitations:` each with `id` (`LIM##`,
   globally unique), `text`, `introduces` (the `a/an` noun phrase), `references` + `antecedent_of` (the
   earlier limitation a `the/said` phrase points to), `supported_by: [SPEC####]`, and `provenance`.
3. **Provenance.** Default every drafted limitation to `ai-suggested` - it is an **assembly blocker**
   until a human (inventor verbatim -> `inventor:<id>`; attorney -> `attorney`; paraphrase accepted ->
   `human-revised`) adopts it. When a limitation is adopted, preserve source metadata where available:
   `source`, `source_span`, `speaker`, `timestamp`, and `source_sha256`. Never name AI as an inventor.
4. **Seed `concepts.md`** with a `TERM##` for every coined/term-of-art word; give terms of degree an
   objective bound.
5. **Report + check.** Emit `logic/claims_report.json` using the shared report envelope
   (`schema: apa-claims-report-v1`, `legal_posture: flags-not-conclusions`). If you changed claim text,
   scope choices, provenance, or dependencies, update the report's `claim_changes`, `scope_decisions`,
   `findings`, `unsupported_features`, and `human_checkpoints`. Multiple-dependent claims are
   unsupported in APA MVP unless deliberately implemented across claim lint, validation, fees,
   examples, and filing review; an apparent multiple-dependent form must be listed in
   `unsupported_features` and rewritten or explicitly routed to practitioner review. If
   `user_role: pro_se`, set `user_role: "pro_se"`, put alternatives in
   `possible_organization_options`, and leave `claim_changes` and `scope_decisions` empty. Then run
   `node packages/apa-draft/claim-lint.mjs <matter> --report-out <matter>/logic/claims_report.json`
   (legal form + report scaffold/update) and
   `node packages/apa-validate/validate.mjs <matter>` (antecedent basis, dependency, edge resolution).
   Finally run `node packages/apa-reports/cli.mjs check <matter>/logic/claims_report.json --kind claims`.
   Fix findings; an unresolved `supported_by` is a §112-support warning to resolve or flag, not hide.

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

### Claim architecture - the dual lens (build BOTH, surface the tradeoff for the human)
1. **Examiner-survival ladder.** A narrow lead independent claim on the defensible inventive kernel
   (the combination the closest art lacks); mirror it across statutory categories (apparatus / method /
   system / computer-readable medium) where applicable; push breadth into dependent claims so a single
   anticipated dependent does not sink the independent claim.
2. **Portfolio-protection ladder.** Separately note broader genus territory worth reserving for a
   continuation, so the matter is not silently over-narrowed for examination at the cost of commercial
   scope. Mark it as continuation-reserved, not filed now.
**Statement vs. Interpretation split.** Keep each claim at the strongest level the disclosure directly
supports (the Statement); quarantine any broader reading as a separate Interpretation note - this is a
built-in over-claiming / 112 guard, not a license to claim beyond support.
Claim scope/breadth is the human's decision; you recommend a ladder and flag the tradeoffs.

## Do NOT
- Invent a limitation the disclosure does not support (new matter). Write gaps as "Not specified in disclosure."
- Decide or assert claim scope/breadth as final, render a patentability conclusion, or apply strategic
  narrowing edits for a pro-se user. Practitioner-mode edits still require human approval.
- Leave a formal claim limitation `ai-suggested` at assembly - it blocks. Rules as of 2026-06-15.

