---
name: specification-drafting
description: "Draft the 37 CFR 1.77 specification sections for a matter from its embodiments and claims, keeping reference numerals and defined terms consistent, grounding every statement in the disclosure, and scoring against the writing rubric. Invoke as /apa-spec."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/specification-drafting/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# specification-drafting (`/apa-spec`)

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
Generates the specification text from `src/embodiments.md` (`SPEC####` support paragraphs) and the
claims, in 37 CFR 1.77 order, with numeral and lexicographic consistency. Every limitation in a claim
must trace to a `SPEC####` paragraph (the `supported_by` binding) - that is the §112 spine.

## Sections (37 CFR 1.77 order; include conditionally-present ones only when warranted)
1. Title of the invention (matches `PATENT.md`, <=500 chars)
2. Cross-reference to related applications (if any benefit/priority claim)
3. Statement re: federally sponsored research (if any)
4. Field of the invention
5. Background (neutral - state the problem; do NOT disparage prior art or over-admit)
6. Brief summary
7. Brief description of the drawings (one line per figure; must list EVERY figure)
8. Detailed description (definitions -> system overview -> worked examples -> additional embodiments;
   every reference numeral introduced here and shown in a figure)
9. Abstract (<=150 words)

## Procedure
1. For each claim limitation, ensure a `SPEC####` paragraph teaches and enables it; add/extend paragraphs
   in `src/embodiments.md` with `grounding: transcribed` (inventor-sourced) or `reconstructed`
   (drafted from figures), and `defines_numerals` for any numbered element.
2. **Grounding discipline / new-matter guard:** never state a limitation, advantage, or figure detail
   not grounded in the disclosure. Write any gap literally as **"Not specified in disclosure"** for the
   human - do not fill it.
3. Keep numerals and defined terms consistent with `evidence/drawings/*` and `logic/concepts.md`.
4. Validate: `node packages/apa-validate/validate.mjs <matter>` (numeral definedness, support edges,
   term bounds). Resolve or flag warnings; do not assert §112 sufficiency - that is the human's call.

### Specification quality rubric (100 points; optimize to a MIN-score floor, not just the mean)
Score the drafted spec on five dimensions; a single weak dimension caps quality (a low floor is a
rework signal, mirroring the rigor reviewer's per-dimension floor).

| Pts | Dimension | What it rewards |
|---|---|---|
| 30 | Form & filing style (37 CFR 1.77/1.52) | correct section order; numbered `[0001]` paragraphs; neutral, non-argumentative voice; consistent terminology |
| 25 | Written description & enablement (112(a); MPEP 2163/2164) | every claim limitation taught and enabled; concrete worked examples; structures named, not just functions |
| 20 | Definiteness (112(b); MPEP 2173.05) | terms of degree given objective bounds; lexicography for coined terms; no purely functional limitations without structure |
| 15 | Figure integration & reference numerals | every numeral introduced in the spec and shown in a figure; consistent numbering; Brief Description lists every figure |
| 10 | Neutral background | states the problem without disparaging prior art or admitting more than necessary |

Iterate draft -> score -> revise the lowest dimension until the floor clears the target (e.g. 95).
Log iterations if you autotune (iteration / min_score / avg_score / kept|discarded / change).

## Do NOT
- Invent subject matter (new matter is fatal). Disparage prior art. Claim the spec "enables" anything -
  the validator proves the support EDGE resolves; enablement sufficiency is a human/LLM-judge flag.
- Rules as of 2026-06-15; verify currency.

