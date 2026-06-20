---
name: compiler
description: "Lift an existing patent, published application, or invention-disclosure document into a complete, validated Patent Artifact. Extracts claims verbatim, defined terms, reference numerals, embodiments, and prior-art citations, then runs a bounded coverage/validate/fix loop. Invoke as /apa-compile <path>."
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/compiler/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# compiler (`/apa-compile <path-or-url>`)

## Operating posture (human-in-the-loop)

APA is supervised drafting/assistive software, **not** a registered practitioner and **not** legal
advice. Every AI output is an unverified draft a competent human must independently review; merely
relying on AI does not satisfy the 37 CFR 11.18 reasonable-inquiry duty (USPTO AI guidance, Apr 11,
2024). The registered practitioner (or pro-se inventor) decides, signs, and files. APA assists.

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
scope to pursue, which art to cite, whether/when to file). Reframe every analytical output as neutral
self-education, lead with a prominent "This is not legal advice and is not a substitute for a registered
patent attorney or agent," and recommend they consult one. If the user's role is unknown, ask once and
persist it (matter config).

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
   shows them).

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
- Independent vs dependent: a dependent claim incorporates and narrows exactly one base claim.
- Mirror the inventive kernel across statutory categories where applicable (apparatus / method /
  system / computer-readable medium).
- 112(f): a `means for` / nonce-word (`module/mechanism/unit for`) limitation invokes
  means-plus-function and REQUIRES corresponding structure in the spec, or it is indefinite (112(b)).

### 101/102/103/112 — analysis as FLAGS + QUESTIONS for a human (never conclusions)
- **101 (eligibility):** Alice/Mayo two-step. Flag abstract-idea risk; check the claim recites a
  practical application / concrete structure. Do not opine on eligibility.
- **102 (novelty):** element-by-element — anticipation = every limitation in ONE reference. ALSO run
  a statutory-bar screen from the INTERVIEW (on-sale, public use, the inventor's own disclosure, with
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

