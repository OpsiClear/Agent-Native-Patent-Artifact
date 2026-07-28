/**
 * Deterministic USPTO correspondence routing.
 *
 * Classification is intentionally narrow. Unknown papers remain unsupported because applying a
 * familiar response period or response package to the wrong notice is more dangerous than asking a
 * human to classify it.
 */

const NOTICE_TYPES = Object.freeze([
  Object.freeze({
    id: "provisional-missing-parts",
    label: "Notice to File Missing Parts of Provisional Application",
    application_type: "provisional",
    aliases: [
      "notice to file missing parts of provisional application",
      "missing parts provisional",
      "ntc.miss.prt",
    ],
    response_workflow: "missing-parts",
    deadline_profile: "notice-stated",
    fee_family: "provisional",
    supported: true,
  }),
  Object.freeze({
    id: "nonprovisional-missing-parts",
    label: "Notice to File Missing Parts of Nonprovisional Application",
    application_type: "utility",
    aliases: [
      "notice to file missing parts of nonprovisional application",
      "notice to file missing parts",
      "missing parts nonprovisional",
    ],
    response_workflow: "missing-parts",
    deadline_profile: "notice-stated",
    fee_family: "prosecution",
    supported: true,
  }),
  Object.freeze({
    id: "corrected-application-papers",
    label: "Notice to File Corrected Application Papers",
    application_type: null,
    aliases: [
      "notice to file corrected application papers",
      "corrected application papers",
    ],
    response_workflow: "summary-only",
    deadline_profile: "notice-stated",
    fee_family: null,
    supported: false,
  }),
  Object.freeze({
    id: "omitted-items",
    label: "Notice of Omitted Item(s)",
    application_type: null,
    aliases: [
      "notice of omitted item",
      "notice of omitted items",
      "omitted item",
    ],
    response_workflow: "summary-only",
    deadline_profile: "notice-stated",
    fee_family: null,
    supported: false,
  }),
  Object.freeze({
    id: "office-action",
    label: "Office Action",
    application_type: "utility",
    aliases: [
      "office action",
      "non-final office action",
      "final office action",
    ],
    response_workflow: "apa-office-action",
    deadline_profile: "office-action",
    fee_family: "prosecution",
    supported: false,
  }),
]);

const normalize = (value) => String(value || "")
  .toLowerCase()
  .replace(/[._/\\-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export function noticeTypeRows() {
  return NOTICE_TYPES.map((row) => ({ ...row, aliases: [...row.aliases] }));
}
export function noticeTypeById(id) {
  return NOTICE_TYPES.find((row) => row.id === String(id || "").trim()) || unknownType(id);
}

export function classifyNoticeText(text) {
  const normalized = normalize(text);
  const matches = [];
  for (const row of NOTICE_TYPES) {
    if (row.aliases.some((alias) => normalized.includes(normalize(alias)))) matches.push(row);
  }

  // Prefer the provisional-specific phrase over the generic nonprovisional alias.
  const provisional = matches.find((row) => row.id === "provisional-missing-parts");
  if (provisional) return { ...provisional, confidence: "high", matched: true };

  const unique = [...new Map(matches.map((row) => [row.id, row])).values()];
  if (unique.length === 1) return { ...unique[0], confidence: "high", matched: true };
  if (unique.length > 1) {
    return {
      ...unknownType("ambiguous"),
      confidence: "low",
      matched: false,
      candidate_types: unique.map((row) => row.id),
    };
  }
  return { ...unknownType("unknown"), confidence: "low", matched: false };
}

function unknownType(raw) {
  return {
    id: "unknown",
    raw: String(raw || "").trim(),
    label: "Unsupported or unknown USPTO correspondence",
    application_type: null,
    aliases: [],
    response_workflow: "summary-only",
    deadline_profile: null,
    fee_family: null,
    supported: false,
    confidence: "low",
    matched: false,
  };
}
