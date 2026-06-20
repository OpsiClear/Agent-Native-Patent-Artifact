/**
 * External sink guard helpers.
 *
 * These wrappers compose existing APA primitives:
 * - apa-redact scans the exact egress bytes;
 * - apa-trace records the sink byte hash and approval state;
 * - apa-search/envelope wraps fetched content as untrusted data.
 *
 * They do not certify that egress is legally safe. They provide deterministic, auditable guardrails
 * before bytes leave the local artifact workflow.
 */

import { readFileSync, statSync } from "node:fs";
import { Buffer } from "node:buffer";
import {
  countsFor,
  exitCodeFor,
  scan,
  scanFile,
} from "../apa-redact/redact-engine.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  externalSinkRecord,
} from "../apa-trace/runlog.mjs";
import { wrapUntrustedContent } from "../apa-search/envelope.mjs";

export const MAX_SAFE_INPUT_BYTES = 16 * 1024 * 1024;
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

export function verdictFromFindings(findings, scannedText = "") {
  const high = findings.filter((f) => f.tier === "HIGH");
  const medium = findings.filter((f) => f.tier === "MEDIUM");
  return {
    ok: high.length === 0 && medium.length === 0,
    blocked: high.length > 0,
    needsConfirm: high.length === 0 && medium.length > 0,
    high,
    medium,
    counts: countsFor(findings),
    exitCode: exitCodeFor(findings),
    text: scannedText,
  };
}

export function scanBytesAtSink(bytes, opts = {}) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes ?? "");
  return verdictFromFindings(scan(text, opts), text);
}

export function scanFileAtSink(path, opts = {}) {
  const size = statSync(path).size;
  const findings = scanFile(path, opts);
  const text = size <= MAX_SAFE_INPUT_BYTES && !findings.some((f) => f.patternName === "engine.input_too_large")
    ? readFileSync(path).toString("utf8")
    : "";
  return verdictFromFindings(findings, text);
}

export function exitCodeForApproval(verdict, approved = false) {
  if (verdict.blocked) return 3;
  if (verdict.needsConfirm && !approved) return 2;
  return 0;
}

export function assertPinnedPackageSpec(spec) {
  if (!spec || typeof spec !== "string") return { ok: false, reason: "missing package spec" };
  const at = spec.startsWith("@") ? spec.lastIndexOf("@") : spec.indexOf("@");
  if (at <= 0) return { ok: false, reason: "package spec must include an explicit version" };
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  if (!name || !version) return { ok: false, reason: "package spec must include both name and version" };
  if (/^(latest|\*|x)$/i.test(version)) return { ok: false, reason: "package version must be pinned, not latest/*/x" };
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    return { ok: false, reason: "package version must be an exact semver version" };
  }
  return { ok: true, name, version };
}

export function buildNpxPayload(packageSpec, args = []) {
  return JSON.stringify({
    tool: "npx",
    package_spec: packageSpec,
    args: args.map(String),
  });
}

export function wrapFetchedText(text, sourceLabel = "apa-safe-fetch") {
  return wrapUntrustedContent(text, { sourceLabel });
}

export async function fetchTextWithBounds(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable in this Node runtime");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    const len = Number(res.headers && res.headers.get ? res.headers.get("content-length") : 0);
    if (Number.isFinite(len) && len > maxResponseBytes) {
      throw new Error(`response too large (${len} > ${maxResponseBytes} bytes)`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > maxResponseBytes) {
      throw new Error(`response too large (${bytes.length} > ${maxResponseBytes} bytes)`);
    }
    return {
      url: res.url || url,
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers ? res.headers.entries() : []),
      text: bytes.toString("utf8"),
      bytes: bytes.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function appendSinkRunlog({
  matterDir,
  skill = "apa-safe",
  kind,
  bytes,
  verdict,
  humanApproved = false,
  argv = [],
  cwd = process.cwd(),
  exitCode = 0,
  startedAt,
  endedAt = new Date().toISOString(),
  notes = [],
} = {}) {
  if (!matterDir) return null;
  return appendRunlog(matterDir, buildRunlogEntry({
    timestamp: endedAt,
    skill,
    commands: [commandRecord({ argv, cwd, exitCode, startedAt, endedAt })],
    externalSinks: [externalSinkRecord({
      kind,
      bytes,
      scanVerdict: verdict,
      humanApproved,
    })],
    notes,
  }));
}
