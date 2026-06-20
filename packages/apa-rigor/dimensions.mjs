/**
 * The six patent rigor dimensions (ARA Seal Level 2 re-roled; DESIGN.md §7.3). Level 2 reasons
 * SEMANTICALLY and assumes Level 1 (mechanical, apa-validate) has passed. Each dimension is scored 1-5
 * against anchors by the /apa-rigor skill; the verdict is computed deterministically (verdict.mjs).
 * P3/P4 have a mechanical component apa-validate can pre-signal; P1/P2(sufficiency)/P5/P6 are judgment.
 */

export const DIMENSIONS = [
  { id: "P1", name: "101 Eligibility", araFrom: "Evidence Relevance", mechanical: false,
    anchors: { 1: "the claim is an abstract idea with no practical application / inventive concept (Alice/Mayo step 2 fails)",
               3: "eligibility is plausible but the practical application / concrete structure is thin",
               5: "the claim recites concrete structure or a clear practical application; low Alice/Mayo risk" } },
  { id: "P2", name: "112 Written-Description / Enablement / Definiteness", araFrom: "Scope Calibration", mechanical: false,
    anchors: { 1: "claims subject matter the spec neither describes nor enables; indefinite terms of degree; 112(f) limitation with no structure",
               3: "most limitations are supported, but some enablement or definiteness gaps remain",
               5: "every limitation is taught and enabled; terms of degree are objectively bounded; any 112(f) limitation has disclosed structure" } },
  { id: "P3", name: "Antecedent Basis", araFrom: "Methodological Rigor", mechanical: true,
    anchors: { 1: "broken antecedent basis (a 'the X' with no earlier 'a/an X')",
               3: "antecedent basis resolves but some references are undeclared",
               5: "every element has clean antecedent basis" } },
  { id: "P4", name: "Claim-Spec-Drawing Support", araFrom: "Argument Coherence", mechanical: true,
    anchors: { 1: "claim terms undefined, figure numerals unresolved, or dangling §112 support edges",
               3: "mostly consistent, with a few unresolved links",
               5: "every claim term defined, structurally illustrated, and consistently numbered across claims/spec/drawings" } },
  { id: "P5", name: "Prior-art Distinction", araFrom: "Falsifiability Quality", mechanical: false,
    anchors: { 1: "a 'distinguished_over' reference appears to anticipate the claim (102) and is not addressed",
               3: "a distinction is stated but thin, or not addressed for all of the closest art",
               5: "every closest reference is substantively distinguished" } },
  { id: "P6", name: "Prosecution Integrity", araFrom: "Exploration Integrity", mechanical: false,
    anchors: { 1: "a claim advocates a recorded dead_end position (estoppel risk), or the record is dishonest/contradictory",
               3: "the decision record is mostly honest, with some gaps",
               5: "honest, complete decision record; no claim re-argues a foreclosed position" } },
];

export const DIM_IDS = DIMENSIONS.map((d) => d.id);

export const SEVERITIES = ["critical", "major", "minor", "suggestion"];

/** Map a finding severity to its statutory fatality (DESIGN.md §7.3). */
export function statutoryFatality(severity) {
  return ({
    critical: "anticipation (102) / ineligibility (101) / missing antecedent basis - potentially fatal",
    major: "103 obviousness combination or an enablement (112a) gap",
    minor: "definiteness (112b) nit or a formal defect",
    suggestion: "claim-scope optimization or a quality improvement",
  })[severity] || "unknown";
}
