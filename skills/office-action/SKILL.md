---
name: office-action
description: "OPTIONAL post-filing extension: capture an examiner's Office Action into prosecution/oa-NN.md, parse it, ESTIMATE the 37 CFR 1.136(a) response period (estimate - verify), and scaffold a flags-and-questions response under the new-matter guard. Deeper UPL territory: a registered practitioner argues and files; APA never files. Invoke as /apa-office-action."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/office-action/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# office-action (`/apa-office-action`)

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
This is the **optional post-filing extension** (`docs/protocol.md` §9), beyond the core pre-filing
scope. It models one examination round-trip: capture an Office Action, estimate the response period,
and scaffold a response. It is **deeper UPL territory** - everything it emits is a **flag or question
for a registered practitioner**, deadlines are **estimates to verify**, and **APA never signs or
files**. In `pro_se` mode, summarize the OA, neutral concepts, missing information, and questions for a
registered practitioner; do not propose amendments or arguments. Implemented by `packages/apa-prosecute`.

## Workflow
1. **Capture the OA** into `<matter>/prosecution/oa-NN.md` in the protocol format:
   - a **file-level** ` ```oa ` header block: `mailing_date` (YYYY-MM-DD), `examiner`,
     `application_no`, `action_type`. The response scaffold currently supports only `non-final`
     and `final`; restriction/election, advisory actions, after-final papers, RCE/appeal events,
     ODP/terminal-disclaimer issues, and drawing-objection papers are parsed only as neutral
     summaries and unsupported-event findings.
   - one `### REJ## - <gist>` section per rejection, each with a ` ```binding ` block carrying
     `ground` (101 | 102 | 103 | 112a | 112b | 112f | double-patenting), `claims: [CLM##]`,
     `references: [PA##]`, and the `examiner_reasoning` (verbatim or summarized). Capture the
     reasoning faithfully; do not paraphrase it into a conclusion.
   If the paper is an unsupported event type, fail loud and route to practitioner review rather than
   forcing it into the response scaffold.
2. **Parse it** to confirm the capture is well-formed:
   `node packages/apa-prosecute/cli.mjs parse --oa <matter>/prosecution/oa-NN.md`
   (add `--json` for the machine view). Verify the rejection count, grounds, claims, and references.
3. **Compute deadlines (estimate - verify):**
   `node packages/apa-prosecute/cli.mjs deadlines --oa <matter>/prosecution/oa-NN.md`
   (or `--mailed <YYYY-MM-DD>`). This surfaces the 3-month shortened statutory period, the 6-month
   statutory maximum, and the per-month 37 CFR 1.136(a) extension rows + 1.17(a) fees. These are
   **ESTIMATES - verify against PAIR/Patent Center; APA is not a docketing system of record** and
   computes no authoritative deadline. Unsupported event types return a `deadline_support` matrix
   and no ordinary due-date rows.
4. **Scaffold the response (registered-practitioner mode only):**
   `node packages/apa-prosecute/cli.mjs respond --matter <m> --oa <f> --write`
   writes `<matter>/prosecution/response-NN.md` and `prosecution/office_action_report.json` (NN
   matching the OA). Per `REJ##` it emits the affected claims, a **flags-and-questions** argument block
   (NOT conclusions), and a proposed amendment under the **new-matter guard** - where the spec as filed
   does not support an amendment it says **"Not supported by the spec as filed - route to counsel"**
   rather than inventing support.
   If the captured `action_type` is unsupported, `respond --write --json` exits nonzero and writes an
   `office_action_report.json` with `response_mode: summary_only`, `deadline_support.supported:
   false`, and a blocking `UNSUPPORTED_OA_EVENT` finding instead of a response scaffold.
   If `user_role: pro_se`, do not run `respond --write`; instead write a neutral OA summary/checklist
   and recommend consultation with a registered practitioner. Any summary/checklist still gets an
   `office_action_report.json` with `response_mode: summary_only`.
5. **Validate the report.** Run
   `node packages/apa-reports/cli.mjs check <matter>/prosecution/office_action_report.json --kind office_action`.
6. **Hand off.** The scaffold is a **draft** a registered practitioner completes, argues, and files.
   Update `PATENT.md` `status` (`office-action` -> `responded`) to reflect the round-trip.

## Post-filing UPL guardrails (no override)
- **Flags, not conclusions.** APA does not assert traversal positions, decide patentability, or write
  the argument. The practitioner decides what to argue and how.
- **A registered practitioner argues and files.** APA never signs, certifies, or files a USPTO paper,
  and never asserts an authoritative deadline.
- **Pro-se mode is summary-only.** No proposed amendments, traversal arguments, or strategic response
  choices are generated for an unrepresented user.
- **Deadlines are estimates.** Always re-verify dates and fees against PAIR/Patent Center before
  relying on them; APA is not a docketing system of record.
- **No new matter.** A proposed amendment must be supported by the specification as filed
  (35 USC 132 / 37 CFR 1.121); APA never invents support.

See ### 101/102/103/112 — analysis as FLAGS + QUESTIONS for a human (never conclusions)
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
  validity/infringement conclusion. for the statutory-ground lens. Rules as of 2026-06-15.

