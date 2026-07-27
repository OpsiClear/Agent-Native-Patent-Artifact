/**
 * Source-span metadata rules for adopted patent facts.
 *
 * These checks are provenance guardrails. They do not decide inventorship, written-description
 * sufficiency, or legal adequacy; they surface weak provenance so a human can review it. The caller
 * decides whether findings are warnings or strict validation errors.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const SOURCE_SPAN_FIELDS = ["source", "source_span", "source_sha256"];
export const STRICT_SOURCE_ROOTS = ["staging", "evidence", "src", "logic", "source"];

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

export const SOURCE_SPAN_POLICIES = new Set(["warning", "relaxed", "strict"]);

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

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function normalizedPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function strictRecords(obj) {
  if (Array.isArray(obj.source_spans)) return obj.source_spans;
  if (obj.source_span && typeof obj.source_span === "object" && !Array.isArray(obj.source_span)) {
    return [obj.source_span];
  }
  return [];
}

function recordLocator(record) {
  if (record?.locator !== undefined) return record.locator;
  if (Array.isArray(record?.lines) && record.lines.length === 2) return `lines:${record.lines[0]}-${record.lines[1]}`;
  return "";
}

function verifyStrictRecord(record, label, index, matterDir, allowedRoots) {
  const findings = [];
  const prefix = `${label} source_spans[${index}]`;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return [{ code: "SOURCE_SPAN_INVALID", msg: `${prefix} must be a {path, locator, sha256} object.` }];
  }
  const path = normalizedPath(record.path || record.file);
  const locator = recordLocator(record);
  const digest = String(record.sha256 || "");
  if (!path) findings.push({ code: "SOURCE_SPAN_INVALID", msg: `${prefix}.path is required.` });
  if (!String(locator).trim()) findings.push({ code: "SOURCE_SPAN_INVALID", msg: `${prefix}.locator is required.` });
  if (!SHA256_RE.test(digest)) findings.push({ code: "SOURCE_SPAN_INVALID", msg: `${prefix}.sha256 must be a 64-character SHA-256 hex digest.` });
  if (!path || !matterDir) return findings;

  const segments = path.split("/").filter(Boolean);
  const rootAllowed = segments.length > 1 && allowedRoots.includes(segments[0]);
  if (isAbsolute(path) || segments.includes("..") || !rootAllowed) {
    findings.push({
      code: "SOURCE_SPAN_PATH_UNSAFE",
      msg: `${prefix}.path '${path}' must stay under an allowed matter root (${allowedRoots.join(", ")}).`,
    });
    return findings;
  }
  const root = resolve(matterDir);
  const candidate = resolve(root, ...segments);
  if (!isWithin(root, candidate)) {
    findings.push({ code: "SOURCE_SPAN_PATH_UNSAFE", msg: `${prefix}.path '${path}' escapes the matter root.` });
    return findings;
  }
  if (!existsSync(candidate)) {
    findings.push({ code: "SOURCE_SPAN_FILE_MISSING", msg: `${prefix}.path '${path}' does not exist.` });
    return findings;
  }
  try {
    if (!statSync(candidate).isFile()) {
      findings.push({ code: "SOURCE_SPAN_FILE_MISSING", msg: `${prefix}.path '${path}' is not a file.` });
      return findings;
    }
    if (!isWithin(realpathSync(root), realpathSync(candidate))) {
      findings.push({ code: "SOURCE_SPAN_PATH_UNSAFE", msg: `${prefix}.path '${path}' resolves outside the matter root.` });
      return findings;
    }
    const actual = createHash("sha256").update(readFileSync(candidate)).digest("hex");
    if (SHA256_RE.test(digest) && actual !== digest.toLowerCase()) {
      findings.push({ code: "SOURCE_SPAN_HASH_MISMATCH", msg: `${prefix}.sha256 does not match '${path}'.` });
    }
  } catch (error) {
    findings.push({ code: "SOURCE_SPAN_FILE_UNREADABLE", msg: `${prefix}.path '${path}' could not be verified: ${error.message}` });
  }
  return findings;
}

export function sourceSpanFindings(obj = {}, label = "entity", {
  requireComplete = true,
  strict = false,
  matterDir = "",
  allowedRoots = STRICT_SOURCE_ROOTS,
} = {}) {
  const findings = [];
  const source = obj.source;
  if (source !== undefined && !SOURCE_SPAN_SOURCES.has(source)) {
    findings.push({
      code: "SOURCE_SPAN_INVALID",
      msg: `${label} has unknown source '${source}' (supported: ${[...SOURCE_SPAN_SOURCES].join(", ")}).`,
    });
  }
  if (source === "not-recoverable") return findings;

  if (strict) {
    const records = strictRecords(obj);
    if (records.length === 0) {
      if (requireComplete) {
        findings.push({
          code: "SOURCE_SPAN_MISSING",
          msg: `${label} is adopted but has no strict source-span record.`,
        });
      }
      findings.push({
        code: "SOURCE_SPAN_CONTRACT_REQUIRED",
        msg: `${label} strict provenance requires source_spans: [{ path, locator, sha256 }].`,
      });
      return findings;
    }
    records.forEach((record, index) => {
      findings.push(...verifyStrictRecord(record, label, index, matterDir, allowedRoots));
    });
    return findings;
  }

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
