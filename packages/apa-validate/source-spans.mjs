/**
 * Source-span metadata rules for adopted patent facts.
 *
 * These checks are warning-mode guardrails. They do not decide inventorship, written-description
 * sufficiency, or legal adequacy; they surface weak provenance so a human can review it.
 */

export const SOURCE_SPAN_FIELDS = ["source", "source_span", "source_sha256"];

export const SOURCE_SPAN_SOURCES = new Set([
  "transcript",
  "upload",
  "inventor-confirmation",
  "attorney-note",
  "figure-reconstruction",
  "source-extracted",
  "inferred-from-document",
  "not-recoverable",
]);

export const SOURCE_SPAN_POLICIES = new Set(["warning", "relaxed"]);

const SHA256_RE = /^[0-9a-f]{64}$/i;

export function isSourceSpanPolicy(policy) {
  return SOURCE_SPAN_POLICIES.has(policy);
}

export function sourceSpanPolicyOf(frontmatter = {}) {
  return frontmatter.source_span_policy || "warning";
}

export function isAdoptedProvenance(provenance) {
  return (provenance || "ai-suggested") !== "ai-suggested";
}

export function sourceSpanFindings(obj = {}, label = "entity", { requireComplete = true } = {}) {
  const findings = [];
  const source = obj.source;
  if (source !== undefined && !SOURCE_SPAN_SOURCES.has(source)) {
    findings.push({
      code: "SOURCE_SPAN_INVALID",
      msg: `${label} has unknown source '${source}' (supported: ${[...SOURCE_SPAN_SOURCES].join(", ")}).`,
    });
  }
  if (source === "not-recoverable") return findings;

  if (obj.source_sha256 !== undefined && !SHA256_RE.test(String(obj.source_sha256))) {
    findings.push({ code: "SOURCE_SPAN_INVALID", msg: `${label} source_sha256 must be a 64-character SHA-256 hex digest.` });
  }
  if (obj.source_span !== undefined && !String(obj.source_span).trim()) {
    findings.push({ code: "SOURCE_SPAN_INVALID", msg: `${label} source_span is present but empty.` });
  }

  if (requireComplete) {
    const missing = SOURCE_SPAN_FIELDS.filter((f) => obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === "");
    if (missing.length) {
      findings.push({
        code: "SOURCE_SPAN_MISSING",
        msg: `${label} is adopted but missing source-span metadata: ${missing.join(", ")}.`,
      });
    }
  }
  return findings;
}
