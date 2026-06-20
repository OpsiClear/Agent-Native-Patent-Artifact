/**
 * Confidential workflow mode policy for APA matters.
 *
 * This is not a privilege engine. It gives deterministic tooling a shared vocabulary for local,
 * counsel-controlled, and shareable-redacted workflows, and it marks sensitive critique artifacts so
 * export/package code can exclude them by default.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_CONFIDENTIAL_WORKFLOW_MODE = "ordinary_local";

export const CONFIDENTIAL_WORKFLOW_MODES = [
  "ordinary_local",
  "counsel_controlled",
  "shareable_redacted",
];

export const CONFIDENTIAL_WORKFLOW_LABELS = {
  ordinary_local: "ordinary local workflow",
  counsel_controlled: "counsel-controlled workflow",
  shareable_redacted: "shareable redacted workflow",
};

export const SENSITIVE_CRITIQUE_ARTIFACTS = [
  {
    path: "logic/patentability_report.json",
    kind: "patentability-analysis",
    reason: "May contain statutory-risk characterizations, prior-art mappings, and adverse admissions.",
  },
  {
    path: "trace/examiner_adversary_report.json",
    kind: "examiner-adversary",
    reason: "May contain anticipated rejection arguments, concessions, and claim-scope critique.",
  },
  {
    path: "trace/prosecution_rationale.md",
    kind: "examiner-adversary-rationale",
    reason: "May contain critique-to-fix rationale and dead-end prosecution positions.",
  },
  {
    path: "patent_rigor_report.json",
    kind: "rigor-review",
    reason: "May contain candid quality weaknesses and unresolved-risk scoring.",
  },
  {
    path: "prosecution/office_action_report.json",
    kind: "office-action",
    reason: "May contain response strategy, rejection characterization, and practitioner checkpoints.",
  },
];

export function isConfidentialWorkflowMode(value) {
  return CONFIDENTIAL_WORKFLOW_MODES.includes(String(value || ""));
}

export function confidentialWorkflowModeOf(frontmatter = {}) {
  const raw = frontmatter.confidential_workflow_mode;
  const mode = raw || DEFAULT_CONFIDENTIAL_WORKFLOW_MODE;
  return {
    mode,
    explicit: raw !== undefined,
    valid: isConfidentialWorkflowMode(mode),
    label: CONFIDENTIAL_WORKFLOW_LABELS[mode] || "",
  };
}

export function sensitiveCritiqueArtifactsPresent(matterDir, artifacts = SENSITIVE_CRITIQUE_ARTIFACTS) {
  return artifacts
    .filter((artifact) => existsSync(join(matterDir, ...artifact.path.split("/"))))
    .map((artifact) => ({
      ...artifact,
      shareable_default: "exclude",
      redaction_required_before_sharing: true,
      human_approval_required_before_sharing: true,
    }));
}

export function shareableExportPolicy(matterDir, { mode = DEFAULT_CONFIDENTIAL_WORKFLOW_MODE } = {}) {
  const sensitive = sensitiveCritiqueArtifactsPresent(matterDir);
  return {
    mode,
    privilege_disclaimer: "APA cannot create, preserve, or certify attorney-client privilege or work-product protection.",
    shareable_exports_must_use_redaction_guard: true,
    include_sensitive_critique_artifacts_by_default: false,
    sensitive_critique_artifacts_present: sensitive,
    excluded_from_shareable_exports: mode === "shareable_redacted" ? sensitive : [],
    human_review_required_before_external_sharing: true,
  };
}
