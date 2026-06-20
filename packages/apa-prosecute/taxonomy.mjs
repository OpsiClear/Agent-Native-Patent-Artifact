/**
 * Office Action event / ground taxonomy for deterministic post-filing scaffolds.
 *
 * This is a support matrix for APA tooling, not a legal classification. Unsupported means APA will
 * not generate a response scaffold or date estimate for that event type without practitioner review.
 */

const EVENT_ROWS = [
  {
    id: "non-final",
    aliases: ["non-final", "nonfinal", "non final", "non-final office action"],
    label: "Non-final Office Action",
    response_scaffold_supported: true,
    deadline_estimator_supported: true,
    deadline_basis: "standard 3-month shortened statutory period with 37 CFR 1.136(a) extension estimate",
  },
  {
    id: "final",
    aliases: ["final", "final office action"],
    label: "Final Office Action",
    response_scaffold_supported: true,
    deadline_estimator_supported: true,
    deadline_basis: "standard 3-month shortened statutory period with 37 CFR 1.136(a) extension estimate; after-final practice must be separately reviewed",
  },
  {
    id: "restriction-election",
    aliases: ["restriction", "restriction requirement", "election", "election of species", "restriction/election"],
    label: "Restriction / Election Requirement",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; practitioner must verify the response period and election strategy",
  },
  {
    id: "advisory-action",
    aliases: ["advisory", "advisory action", "aa"],
    label: "Advisory Action",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; after-final/advisory timing depends on prosecution context",
  },
  {
    id: "after-final",
    aliases: ["after-final", "after final", "after-final response", "after final response"],
    label: "After-Final Practice",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; practitioner must evaluate after-final options and timing",
  },
  {
    id: "rce",
    aliases: ["rce", "request for continued examination"],
    label: "Request for Continued Examination",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; RCE filing/timing is a practitioner action",
  },
  {
    id: "appeal",
    aliases: ["appeal", "notice of appeal", "appeal brief", "pre-appeal"],
    label: "Appeal / Pre-Appeal",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; appeal timing and briefing are separate workflows",
  },
  {
    id: "odp-terminal-disclaimer",
    aliases: ["odp", "obviousness-type double patenting", "terminal disclaimer", "double-patenting"],
    label: "ODP / Terminal Disclaimer Issue",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; terminal-disclaimer decisions require practitioner review",
  },
  {
    id: "drawing-objection",
    aliases: ["drawing objection", "drawing objections", "drawing requirement"],
    label: "Drawing Objection / Requirement",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; drawing objections require drawing/practitioner review",
  },
];

const EVENT_BY_ALIAS = new Map();
for (const row of EVENT_ROWS) {
  EVENT_BY_ALIAS.set(row.id, row);
  for (const alias of row.aliases) EVENT_BY_ALIAS.set(norm(alias), row);
}

const GROUND_ROWS = [
  { id: "101", aliases: ["101", "35 usc 101", "eligibility"], rule_anchor: "35-usc-101", supported: true },
  { id: "102", aliases: ["102", "35 usc 102", "anticipation"], rule_anchor: "35-usc-102", supported: true },
  { id: "103", aliases: ["103", "35 usc 103", "obviousness"], rule_anchor: "35-usc-103", supported: true },
  { id: "112a", aliases: ["112a", "112(a)", "112 a", "written description", "enablement"], rule_anchor: "35-usc-112a", supported: true },
  { id: "112b", aliases: ["112b", "112(b)", "112 b", "indefiniteness"], rule_anchor: "35-usc-112b", supported: true },
  { id: "112f", aliases: ["112f", "112(f)", "112 f", "means-plus-function"], rule_anchor: "35-usc-112f", supported: true },
  { id: "double-patenting", aliases: ["double-patenting", "double patenting"], rule_anchor: "double-patenting", supported: true },
  { id: "odp", aliases: ["odp", "obviousness-type double patenting"], rule_anchor: "double-patenting", supported: true },
  { id: "drawing-objection", aliases: ["drawing objection", "drawing objections"], rule_anchor: "37-cfr-1.84", supported: false },
  { id: "restriction-election", aliases: ["restriction", "election", "restriction/election"], rule_anchor: "office-action", supported: false },
];

const GROUND_BY_ALIAS = new Map();
for (const row of GROUND_ROWS) {
  GROUND_BY_ALIAS.set(row.id, row);
  for (const alias of row.aliases) GROUND_BY_ALIAS.set(norm(alias), row);
}

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function unknownEvent(raw) {
  return {
    id: "unknown",
    raw: String(raw || "").trim(),
    label: raw ? `Unsupported/unknown OA event: ${raw}` : "Unsupported/unknown OA event",
    response_scaffold_supported: false,
    deadline_estimator_supported: false,
    deadline_basis: "unsupported by APA v0.1; verify event type and deadlines with a registered practitioner",
  };
}

export function classifyOfficeActionEvent(raw) {
  const key = norm(raw);
  const row = EVENT_BY_ALIAS.get(key);
  return row ? { ...row, raw: String(raw || "").trim() } : unknownEvent(raw);
}

export function deadlineSupportMatrix() {
  return EVENT_ROWS.map((row) => ({
    action_type: row.id,
    label: row.label,
    deadline_estimator_supported: row.deadline_estimator_supported,
    response_scaffold_supported: row.response_scaffold_supported,
    deadline_basis: row.deadline_basis,
  }));
}

export function classifyRejectionGround(raw) {
  const key = norm(raw);
  const row = GROUND_BY_ALIAS.get(key);
  return row
    ? { ...row, raw: String(raw || "").trim() }
    : { id: key || "unspecified", raw: String(raw || "").trim(), rule_anchor: "office-action", supported: false };
}
