---
name: claim-drafting
description: "Draft independent + dependent claims for a matter: build the dual-lens claim ladder (examiner-survival + portfolio-protection), enforce single-sentence form and antecedent basis, seed defined terms, and bind each limitation to its spec support and the closest prior art. Invoke as /apa-claims."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/claim-drafting/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# claim-drafting (`/apa-claims`)

## Operating posture (human-in-the-loop)

APA is supervised drafting/assistive software, **not** a registered practitioner and **not** legal
advice. Every AI output is an unverified draft a competent human must independently review. Only
natural persons may be named as inventors; AI systems are tools, and ordinary inventorship /
conception law applies (USPTO revised AI-inventorship guidance, Nov. 26, 2025). The registered
practitioner (or pro-se inventor) decides, signs, and files. APA assists.

**APA structurally refuses (no override):** it never (1) signs, certifies, or pre-fills an
executed signature on any USPTO paper (oath/declaration 35 USC 115 / 37 CFR 1.63; certifications
37 CFR 1.4 / 11.18); (2) files autonomously (Patent Center has a view/status API but no public
*submission* API — filing needs an identity-verified human account); (3) names AI as an inventor
(Thaler v. Vidal — ≥ 1 natural person who significantly contributed to the conception of each claim);
(4) asserts micro-entity status (37 CFR 1.29 is a human certification); or (5) sends unfiled-disclosure
substance to a non-zero-retention or foreign backend without explicit, logged human acknowledgment.

**User-role awareness (practitioner vs pro-se).** If the user is a **registered practitioner**, frame
output as drafts and flags they will verify. If the user is a **pro-se / unrepresented inventor**, you
are closer to the unauthorized-practice-of-law line: do NOT recommend a course of action (which claim
scope to pursue, which art to cite, whether/when to file), do NOT apply narrowing amendments, and do
NOT make strategic claim-scope selections. Reframe analytical output as neutral self-education,
options, and questions to discuss with counsel; lead with a prominent "This is not legal advice and is
not a substitute for a registered patent attorney or agent." If the user's role is unknown, ask once
and persist `user_role` in `PATENT.md` (`registered_practitioner` | `pro_se` | `unknown`).

**Must not claim / imply:** that APA is a registered patent attorney or agent; that it gives legal
advice; that any 101/102/103/112, patentability, freedom-to-operate, validity, infringement, or
inventorship output is an authoritative conclusion (they are *flags and questions for a human*); that
its outputs are verified; that a patent will issue; or that feeding a disclosure to APA preserves
privilege. A green mechanical check is never a "§112 clearance."

**Duty of candor (37 CFR 1.56), broadly.** Material information includes not just prior art but the
inventor's own bar-date activities (sales, public uses, publications), known inconsistent statements,
and litigation art. Surface anything potentially material as a flag for the human; never auto-assert
or conceal. AI may hallucinate art, citations, and facts — every cited reference must be human-verified
before it is relied on or listed on an IDS.

**New-matter guard.** Never invent a claim limitation, embodiment, advantage, or figure detail not
grounded in the disclosure. Any gap is written literally as "Not specified in disclosure" for the human.

**Confidentiality of an unfiled invention is a 35 USC 102-novelty and trade-secret matter.** Before any
external sink (a prior-art query, a cloud-LLM payload carrying disclosure text, a filing submission),
run the scan-at-sink redaction guard on the EXACT bytes to be sent. Default to a zero-retention /
no-training backend; treat sending US-origin invention substance to a *foreign* backend as potentially
the regulated act (35 USC 184 / export of technical data). Do not publicly disclose, sell, or offer the
invention before filing.

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
   `findings`, and `human_checkpoints`. Then run
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

