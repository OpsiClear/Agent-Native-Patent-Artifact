---
name: compiler
description: "Lift an existing patent, published application, or invention-disclosure document into a complete, validated Patent Artifact. Extracts claims verbatim, defined terms, reference numerals, embodiments, and prior-art citations, then runs a bounded coverage/validate/fix loop. Invoke as /apa-compile <path>."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/compiler/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# compiler (`/apa-compile <path-or-url>`)

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

Reverse-engineers a patent / published application / disclosure document into a Patent Artifact
(`<matter>/`, the canonical protocol spec at `docs/protocol.md`) through a 4-stage epistemic chain, then a bounded fix loop. It accepts
a PDF/text patent, a publication, or a pile of notes.

### Scan-at-sink before sending (sink: cloud-llm)
Confidentiality of an unfiled invention is load-bearing. Before this content leaves the machine:
1. Write the EXACT bytes to be sent to a temp file.
2. Run the redaction guard on THAT file: `node packages/apa-redact/cli.mjs --from-file <tmp>`.
3. Branch on the exit code: **0** = clean, send the SAME file; **2** = MEDIUM findings — confirm
   each with the human (sterner if the destination is public) before sending; **3** = HIGH findings
   — **block**; do not send. Never scan a string then re-render a different payload.
4. For a cloud-LLM or foreign destination, confirm a zero-retention/no-training backend and obtain
   logged human acknowledgment first (35 USC 102 secrecy / 184 export).
The guard catches accidents and carelessness, not a determined leaker — it is a guardrail, not
airtight enforcement.

For URL inputs, do not call raw `WebFetch`. Fetch through the guarded wrapper so the outbound URL is
scanned and the response is wrapped as untrusted data:
`node packages/apa-safe/cli.mjs fetch <url> --matter <matter> --out <matter>/staging/source-fetch.md`.
If the matter directory does not exist yet, create it first or fetch into a temporary local file and
record the command in the compile notes.

## Stages (run in order)

1. **Semantic Deconstruction.** Extract raw atoms from the source: the **claims VERBATIM** (paraphrase
   changes legal scope - copy exactly), every defined term, every reference numeral + its element,
   every embodiment, every prior-art citation and the role it plays.
2. **Cognitive Mapping.** Map atoms into `logic/claims.md` (CLM##/LIM##, antecedent basis),
   `logic/concepts.md` (TERM##), `logic/prior_art.md` (PA## typed by role), and `logic/problem.md`.
3. **Physical & Evidence grounding.** Write `src/embodiments.md` (SPEC#### paragraphs, each grounded:
   `transcribed` if sourced from the document, `reconstructed` if drafted from figures), and
   `evidence/` (one raw record per reference, the drawings transcription with numeral->element->SPEC).
4. **Exploration graph.** Reconstruct the conception / claim-derivation decisions into
   `trace/prosecution.yaml` (PH## nodes; abandoned positions as `dead_end` leaves where the source
   shows them). Do not reconstruct conception decisions from a public patent/application unless the
   source itself provides direct conception evidence; otherwise label that provenance
   `not-recoverable`.

5. **Compile report.** Emit `staging/compile_report.json` using the shared report schema
   (`schema: apa-compile-report-v1`, `legal_posture: flags-not-conclusions`). Record each imported
   document's `text_quality` / OCR status, each verbatim claim extraction's original number and
   page/line/paragraph `source_span`, the `provenance_labels` used (`source-extracted`,
   `inferred-from-document`, `not-recoverable`), any `ocr_text_quality_flags`, and all
   `unrecoverable_provenance`. Then run
   `node packages/apa-reports/cli.mjs check <matter>/staging/compile_report.json --kind compile`.

## Bounded fix loop (<= 3 rounds)

After a draft, run `node packages/apa-validate/validate.mjs <matter>` and `node
packages/apa-viewer/build_manifest.mjs <matter>`. Fix coverage and resolution gaps (dangling
`supported_by`, missing antecedents, undefined numerals) and re-run. Stop at clean, or after 3 rounds
surface the residual findings for the human.

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

## Critical rules (zero-hallucination, hardened for legal use)
- Claims are copied **verbatim**. Never paraphrase claim language.
- A gap is written literally as **"Not present in source"** - never invent a limitation (new matter).
- Every prior-art reference is flagged for human verification before it is relied on or listed on an
  IDS (see ### Information Disclosure Statement (37 CFR 1.97/1.98; SB/08)
- Seed the IDS from the `evidence/` index. Each reference must be HUMAN-VERIFIED (real title/venue/
  link) before listing — the hardened prior-art verification stage records discloses-vs-lacks.
- The duty is CONTINUING: newly-found material references must be disclosed within the 1.97 windows.
- As of Jan 2025 there is a size-based IDS fee; surface it from the dated fee schedule, do not hardcode. via the assembly stage). Do not assert what a reference discloses
  beyond its actual text.
- Output is a navigable artifact + flags/questions, never a patentability or validity conclusion.

See `references/apa-schema.md` (the on-disk schema) and `references/validation-checklist.md`.
Rules encoded as of 2026-06-15; verify currency.

