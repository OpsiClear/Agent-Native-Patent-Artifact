/**
 * USPTO rule-reference resolvers. Encoded as DATED data (see rulesEffectiveDate) so a single
 * source of truth propagates on regen and the effective date is surfaced in skill output. These are
 * condensed practitioner-facing references, NOT legal advice and NOT a substitute for the MPEP.
 * Update the date and content together; CI freshness-checks the generated SKILL.md.
 */

export const rulesEffectiveDate = "2026-06-15";

export function claimFormatGuide() {
  return [
    "### Claim format (37 CFR 1.75; MPEP 608.01) — drafting rules the agent enforces",
    "- One sentence per claim, ending in a period; preamble + transitional phrase (`comprising` open;",
    "  `consisting of` closed) + body of limitations.",
    "- **Antecedent basis:** introduce an element with `a`/`an` on first mention, refer back with",
    "  `the`/`said`. Every `the X` needs an earlier `a X` in the same claim (or an ancestor claim).",
    "- Independent vs dependent: a dependent claim incorporates and narrows exactly one base claim.",
    "- Mirror the inventive kernel across statutory categories where applicable (apparatus / method /",
    "  system / computer-readable medium).",
    "- 112(f): a `means for` / nonce-word (`module/mechanism/unit for`) limitation invokes",
    "  means-plus-function and REQUIRES corresponding structure in the spec, or it is indefinite (112(b)).",
  ].join("\n");
}

export function analysis101102103112() {
  return [
    "### 101/102/103/112 — analysis as FLAGS + QUESTIONS for a human (never conclusions)",
    "- **101 (eligibility):** Alice/Mayo two-step. Flag abstract-idea risk; check the claim recites a",
    "  practical application / concrete structure. Do not opine on eligibility.",
    "- **102 (novelty):** element-by-element — anticipation = every limitation in ONE reference. ALSO run",
    "  a statutory-bar screen from the INTERVIEW (on-sale, public use, the inventor's own disclosure, with",
    "  dates vs the effective filing date and the one-year grace window) — these are not found by search.",
    "- **103 (obviousness):** apply the Graham factors and name the relevant KSR rationale (MPEP 2143 A-G):",
    "  (A) combine prior-art elements by known methods for predictable results; (B) simple substitution of one",
    "  known element for another; (C) use a known technique to improve a similar device the same way; (D) apply",
    "  a known technique to a known device ready for improvement; (E) obvious-to-try among a finite set of",
    "  predictable solutions; (F) design incentives / market forces prompting a known variation; (G) teaching,",
    "  suggestion, or motivation (TSM). Capture secondary considerations (commercial success, long-felt need,",
    "  unexpected results) from the inventor as rebuttal.",
    "- **112:** (a) written description / enablement — each limitation traced to spec support; (b)",
    "  definiteness — terms of degree need an objective bound; (f) means-plus-function structure.",
    "- Output is flags and `questions_for_attorney` / `questions_for_inventor`, never an opinion or FTO/",
    "  validity/infringement conclusion.",
  ].join("\n");
}

export function idsRequirements() {
  return [
    "### Information Disclosure Statement (37 CFR 1.97/1.98; SB/08)",
    "- Seed the IDS from the `evidence/` index. Each reference must be HUMAN-VERIFIED (real title/venue/",
    "  link) before listing — the hardened prior-art verification stage records discloses-vs-lacks.",
    "- The duty is CONTINUING: newly-found material references must be disclosed within the 1.97 windows.",
    "- As of Jan 2025 there is a size-based IDS fee; surface it from the dated fee schedule, do not hardcode.",
  ].join("\n");
}

export function drawingStandards() {
  return [
    "### Drawings (37 CFR 1.84 / 1.83) — formal pre-check (final compliance stays human/draftsperson)",
    "- Black solid lines; numbered parts with lead lines; `FIG. N` labels; one representative figure.",
    "- Reference characters >= 0.32 cm (1/8 in) high; **drawing-sheet** margins (top 2.5cm, left 2.5cm,",
    "  right 1.5cm, bottom 1.0cm) — distinct from the 1.52 SPECIFICATION margins.",
    "- Every claimed/spec numeral appears in >= 1 figure (1.83(a)) and vice versa; the Brief Description",
    "  of the Drawings lists every figure. Color/photo drawings require a petition.",
  ].join("\n");
}
