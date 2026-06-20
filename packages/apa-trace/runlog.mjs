/**
 * Append-only APA runlog helpers.
 *
 * The runlog is an audit ledger, not a legal conclusion. Helpers here only append JSONL records,
 * compute hashes, and validate existing JSONL on demand. They never rewrite previous entries.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";

export const RUNLOG_SCHEMA = "apa-runlog-v1";

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

function relPath(baseDir, path) {
  return relative(baseDir, path).replace(/\\/g, "/");
}

export function fileRecord(matterDir, path) {
  const abs = resolve(path);
  const s = statSync(abs);
  return {
    path: relPath(resolve(matterDir), abs),
    sha256: sha256File(abs),
    bytes: s.size,
  };
}

export function existingFileRecords(matterDir, paths) {
  return paths.filter((p) => p && existsSync(p) && statSync(p).isFile()).map((p) => fileRecord(matterDir, p));
}

export function commandRecord({ argv, cwd = process.cwd(), exitCode = 0, startedAt, endedAt } = {}) {
  return {
    argv: (argv || []).map(String),
    cwd: String(cwd),
    exit_code: exitCode,
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(endedAt ? { ended_at: endedAt } : {}),
  };
}

export function externalSinkRecord({ kind, bytes, scanVerdict, humanApproved = false } = {}) {
  const text = typeof bytes === "string" || Buffer.isBuffer(bytes) ? bytes : JSON.stringify(bytes ?? "");
  return {
    kind: kind || "unknown",
    bytes_sha256: sha256(text),
    scan_verdict: normalizeScanVerdict(scanVerdict),
    approval_required: Boolean(scanVerdict?.needsConfirm ?? scanVerdict?.needs_confirm),
    human_approved: Boolean(humanApproved),
  };
}

export function humanCheckpoint({ id, required = true, satisfied = false, reviewer = "", timestamp = "" } = {}) {
  return {
    id: id || "unnamed-checkpoint",
    required: Boolean(required),
    satisfied: Boolean(satisfied),
    ...(reviewer ? { reviewer } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

export function buildRunlogEntry({
  timestamp = new Date().toISOString(),
  skill,
  ruleVersion,
  inputs = [],
  outputs = [],
  commands = [],
  externalSinks = [],
  humanCheckpoints = [],
  adoptedChanges = [],
  rejectedChanges = [],
  notes = [],
} = {}) {
  return {
    schema: RUNLOG_SCHEMA,
    timestamp,
    skill: skill || "unknown",
    ...(ruleVersion ? { rule_version: ruleVersion } : {}),
    inputs,
    outputs,
    commands,
    external_sinks: externalSinks,
    human_checkpoints: humanCheckpoints,
    adopted_changes: adoptedChanges,
    rejected_changes: rejectedChanges,
    ...(notes.length ? { notes } : {}),
  };
}

export function runlogPath(matterDir) {
  return join(matterDir, "trace", "runlog.jsonl");
}

export function appendRunlog(matterDir, entry) {
  const path = runlogPath(matterDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + "\n");
  return path;
}

export function validateRunlog(pathOrMatterDir) {
  const path = pathOrMatterDir.endsWith(".jsonl") ? pathOrMatterDir : runlogPath(pathOrMatterDir);
  if (!existsSync(path)) return { ok: true, entries: [], errors: [] };
  const text = readFileSync(path, "utf8");
  const entries = [];
  const errors = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line);
      if (parsed.schema !== RUNLOG_SCHEMA) {
        errors.push({ line: lineNo, message: `schema must be ${RUNLOG_SCHEMA}` });
      }
      entries.push(parsed);
    } catch (e) {
      errors.push({ line: lineNo, message: e.message });
    }
  });
  return { ok: errors.length === 0, entries, errors };
}

function normalizeScanVerdict(v) {
  if (!v || typeof v !== "object") return { blocked: false, needs_confirm: false, high_count: 0, medium_count: 0 };
  return {
    blocked: Boolean(v.blocked),
    needs_confirm: Boolean(v.needsConfirm ?? v.needs_confirm),
    high_count: Array.isArray(v.high) ? v.high.length : Number(v.high_count || 0),
    medium_count: Array.isArray(v.medium) ? v.medium.length : Number(v.medium_count || 0),
  };
}
