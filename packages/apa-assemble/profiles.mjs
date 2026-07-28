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
    filing_date_material: [
      "specification-with-description",
      "at-least-one-claim",
      "drawings-when-necessary-for-understanding",
    ],
    completeness_material: [
      "title",
      "all-inventors",
      "specification",
      "claims",
      "abstract",
      "drawings-if-needed",
      "application-data-sheet",
      "inventor-oath-or-declaration",
      "filing-search-examination-fees",
      "excess-claim-fees-if-applicable",
      "application-size-fees-if-applicable",
      "docx-surcharge-review",
      "sequence-listing-if-applicable",
      "large-table-or-computer-listing-if-applicable",
    ],
    optional_papers: ["information-disclosure-statement-if-used"],
    excluded_ordinary_requirements: [],
    deferred_human_acts: [
      "form-route-selection",
      "signatures-and-certifications",
      "entity-status-and-fee-verification",
      "final-pdf-or-docx-visual-review",
      "patent-center-upload-payment-and-submission",
      "confirmation-and-filing-receipt-audit",
    ],
    upload_set: [
      "specification.pdf or DOCX  (export/review from specification.html; DOCX preferred where applicable)",
      "drawings.pdf  (export/review from evidence/drawings/*.svg)",
      "ADS.pdf  (from ADS.md, human-completed)",
      "declaration.pdf  (executed/signed by the inventor - NOT generated signed)",
      "IDS_SB08.pdf  (human-verified references; include only when used)",
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
    filing_date_material: [
      "description-that-enables-the-invention",
      "drawings-necessary-for-understanding",
    ],
    completeness_material: [
      "title",
      "all-inventors",
      "inventor-residences",
      "correspondence-data",
      "government-interest-statement",
      "cover-sheet-or-qualifying-ads-route",
      "filing-fee",
      "application-size-fee-if-applicable",
      "late-filing-fee-or-cover-sheet-surcharge-if-applicable",
    ],
    optional_papers: ["drawings-not-necessary-for-understanding"],
    excluded_ordinary_requirements: ["claims", "inventor-oath-or-declaration", "information-disclosure-statement"],
    deferred_human_acts: [
      "cover-sheet-or-ads-route-selection",
      "signatures-and-certifications",
      "entity-status-and-fee-verification",
      "final-pdf-visual-review",
      "patent-center-upload-payment-and-submission",
      "confirmation-and-filing-receipt-audit",
    ],
    upload_set: [
      "provisional-specification.pdf  (export/review from specification.html)",
      "drawings.pdf  (include only when needed; export/review from evidence/drawings/*.svg)",
      "SB16-or-ADS.pdf  (human-selected current provisional cover-sheet or qualifying ADS route)",
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
    filing_date_material: ["design-description", "single-design-claim", "drawing-set"],
    completeness_material: ["title", "all-inventors", "ads", "inventor-declaration", "filing-fees"],
    optional_papers: [],
    excluded_ordinary_requirements: ["information-disclosure-statement-unless-separately-required"],
    deferred_human_acts: [
      "signatures-and-certifications",
      "entity-status-and-fee-verification",
      "final-pdf-visual-review",
      "patent-center-upload-payment-and-submission",
    ],
    upload_set: [
      "design-application.pdf  (export/review from specification.html)",
      "drawings.pdf  (export/review from evidence/drawings/*.svg)",
      "ADS.pdf  (from ADS.md, human-completed)",
      "declaration.pdf  (executed/signed by the inventor - NOT generated signed)",
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
