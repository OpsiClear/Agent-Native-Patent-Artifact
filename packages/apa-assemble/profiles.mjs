export const ASSEMBLY_PROFILES = Object.freeze({
  utility: Object.freeze({
    id: "us-utility-v1",
    application_type: "utility",
    implementation_status: "implemented",
    review_status: "repository-reviewed",
    claims_required: true,
    document_profile: [
      "utility-specification",
      "claims",
      "abstract",
      "drawings-if-needed",
      "ads",
      "ids-if-used",
      "inventor-declaration",
      "fee-worksheet",
    ],
    filing_authority: false,
  }),
  provisional: Object.freeze({
    id: "us-provisional-candidate-v1",
    application_type: "provisional",
    implementation_status: "candidate",
    review_status: "human-legal-and-visual-review-required",
    claims_required: false,
    document_profile: [
      "provisional-description",
      "drawings-if-needed",
      "human-completed-provisional-cover-sheet",
      "human-verified-fee-route",
    ],
    filing_authority: false,
  }),
  design: Object.freeze({
    id: "us-design-candidate-v1",
    application_type: "design",
    implementation_status: "candidate",
    review_status: "human-legal-and-visual-review-required",
    claims_required: true,
    exact_claim_count: 1,
    document_profile: [
      "design-description",
      "single-design-claim",
      "drawing-set",
      "ads",
      "inventor-declaration",
      "human-verified-fee-route",
    ],
    filing_authority: false,
  }),
});

export function assemblyProfile(applicationType) {
  const profile = ASSEMBLY_PROFILES[String(applicationType || "")];
  if (!profile) {
    throw new Error(`no assembly profile for application_type '${applicationType || "missing"}'`);
  }
  return profile;
}

export function profileMayAssemble(applicationType) {
  return assemblyProfile(applicationType).review_status === "repository-reviewed";
}
