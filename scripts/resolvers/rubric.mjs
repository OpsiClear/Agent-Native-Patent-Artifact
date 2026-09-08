/**
 * Drafting-quality resolvers: the 100-point specification rubric (adapted from the g2tree worked
 * package, DESIGN.md §11.3) and the dual-lens claim-ladder guidance. Injected into the drafting
 * skills so guidance is single-sourced. These are drafting heuristics, NOT legal advice.
 */

export function writingRubric() {
  return [
    "### Specification quality rubric (100 points; optimize to a MIN-score floor, not just the mean)",
    "Score the drafted spec on five dimensions; a single weak dimension caps quality (a low floor is a",
    "rework signal, mirroring the rigor reviewer's per-dimension floor).",
    "",
    "| Pts | Dimension | What it rewards |",
    "|---|---|---|",
    "| 30 | Form & filing style (37 CFR 1.77/1.52) | correct section order; numbered `[0001]` paragraphs; neutral, non-argumentative voice; consistent terminology |",
    "| 25 | Written description & enablement (112(a); MPEP 2163/2164) | every claim limitation taught and enabled; concrete worked examples; structures named, not just functions |",
    "| 20 | Definiteness (112(b); MPEP 2173.05) | terms of degree given objective bounds; lexicography for coined terms; no purely functional limitations without structure |",
    "| 15 | Figure integration & reference numerals | every numeral introduced in the spec and shown in a figure; consistent numbering; Brief Description lists every figure |",
    "| 10 | Neutral background | states the problem without disparaging prior art or admitting more than necessary |",
    "",
    "Normalize each dimension to a percentage: earned points / its maximum points * 100.",
    "Compare the minimum normalized percentage with the target (e.g. 95), not the raw point counts.",
    "Revise the weakest dimension for at most three passes; stop sooner on no improvement and report unresolved gaps.",
    "Log iterations if you autotune (iteration / min_score / avg_score / kept|discarded / change).",
  ].join("\n");
}

export function claimLadderGuide() {
  return [
    "### Claim architecture - the dual lens (build BOTH, surface the tradeoff for the human)",
    "1. **Examiner-survival ladder.** Present a supported independent-claim candidate and narrower",
    "   dependent fallback positions for human review. Each dependent inherits every limitation of its",
    "   parent; it cannot recover breadth removed from the independent claim. Mirror supported categories",
    "   (apparatus / method / system / computer-readable medium) only where the disclosure warrants them.",
    "   Example: independent A+B; dependent A+B+C. The dependent adds C and retains both A and B.",
    "2. **Portfolio-protection ladder.** Separately identify supported broader independent-claim or",
    "   continuation options for practitioner review. Do not automatically narrow the lead claim or decide",
    "   which scope to file or reserve; record the human's choice and its disclosure support.",
    "**Statement vs. Interpretation split.** Keep each claim at the strongest level the disclosure directly",
    "supports (the Statement); quarantine any broader reading as a separate Interpretation note - this is a",
    "built-in over-claiming / 112 guard, not a license to claim beyond support.",
    "Claim scope/breadth is the human's decision; you recommend a ladder and flag the tradeoffs.",
  ].join("\n");
}
