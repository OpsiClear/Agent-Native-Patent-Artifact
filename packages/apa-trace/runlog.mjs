/**
 * Append-only APA runlog helpers.
 *
 * The runlog is an audit ledger, not a legal conclusion. Helpers here only append JSONL records,
 * compute hashes, and validate existing JSONL on demand. They never rewrite previous entries.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";

import { withMatterWriteLock } from "../apa-core/matter-lock.mjs";

export const RUNLOG_SCHEMA = "apa-runlog-v2";
export const LEGACY_RUNLOG_SCHEMA = "apa-runlog-v1";
export const RUNLOG_HEAD_SCHEMA = "apa-runlog-head-v1";
export const RUNLOG_GENESIS_HASH = "0".repeat(64);

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
  workflowEvent = null,
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
    ...(workflowEvent ? { workflow_event: workflowEvent } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

export function runlogPath(matterDir) {
  return join(matterDir, "trace", "runlog.jsonl");
}

export function runlogHeadPath(matterDir) {
  return join(matterDir, "trace", "runlog.head.json");
}

function entryHash(entry) {
  const copy = structuredClone(entry);
  if (copy.chain && typeof copy.chain === "object") delete copy.chain.entry_sha256;
  return sha256(JSON.stringify(copy));
}

function writeHead(matterDir, entries, digest) {
  const path = runlogHeadPath(matterDir);
  const temp = `${path}.${process.pid}.tmp`;
  const value = {
    schema: RUNLOG_HEAD_SCHEMA,
    entries,
    sha256: digest,
  };
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export function currentRunlogHead(matterDir) {
  const current = validateRunlog(matterDir);
  if (!current.ok) {
    throw new Error(`runlog is invalid: ${current.errors.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`);
  }
  const previous = current.entries.at(-1);
  return {
    entries: current.entries.length,
    sha256: previous
      ? (previous.chain?.entry_sha256 || previous._legacy_line_sha256)
      : RUNLOG_GENESIS_HASH,
  };
}

export function appendRunlog(matterDir, entry, {
  expectedHead = "",
  lockHeld = false,
  owner = entry?.skill || "apa-runlog",
} = {}) {
  if (!lockHeld) {
    return withMatterWriteLock(
      matterDir,
      () => appendRunlog(matterDir, entry, { expectedHead, lockHeld: true, owner }),
      { owner },
    );
  }
  const path = runlogPath(matterDir);
  mkdirSync(dirname(path), { recursive: true });
  const current = validateRunlog(matterDir);
  if (!current.ok) {
    throw new Error(`refusing to append to an invalid runlog: ${current.errors.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`);
  }
  const previous = current.entries.at(-1);
  const previousDigest = previous
    ? (previous.chain?.entry_sha256 || previous._legacy_line_sha256)
      : RUNLOG_GENESIS_HASH;
  if (expectedHead && previousDigest !== expectedHead) {
    throw new Error(`stale matter head: expected ${expectedHead}, current ${previousDigest}`);
  }
  const chained = {
    ...entry,
    schema: RUNLOG_SCHEMA,
    chain: {
      sequence: current.entries.length + 1,
      previous_sha256: previousDigest,
    },
  };
  chained.chain.entry_sha256 = entryHash(chained);
  appendFileSync(path, `${JSON.stringify(chained)}\n`);
  writeHead(matterDir, chained.chain.sequence, chained.chain.entry_sha256);
  return path;
}

export function validateRunlog(pathOrMatterDir) {
  const directPath = pathOrMatterDir.endsWith(".jsonl");
  const path = directPath ? pathOrMatterDir : runlogPath(pathOrMatterDir);
  const matterDir = directPath ? resolve(dirname(path), "..") : resolve(pathOrMatterDir);
  const headPath = runlogHeadPath(matterDir);
  if (!existsSync(path)) {
    return existsSync(headPath)
      ? {
          ok: false,
          entries: [],
          errors: [{ line: 0, message: "runlog ledger is missing while its head still exists" }],
        }
      : { ok: true, entries: [], errors: [] };
  }
  const text = readFileSync(path, "utf8");
  const entries = [];
  const errors = [];
  let previousDigest = RUNLOG_GENESIS_HASH;
  let chainedEntries = 0;
  let sawChainedEntry = false;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line);
      if (parsed.schema !== RUNLOG_SCHEMA && parsed.schema !== LEGACY_RUNLOG_SCHEMA) {
        errors.push({ line: lineNo, message: `schema must be ${RUNLOG_SCHEMA} or legacy ${LEGACY_RUNLOG_SCHEMA}` });
      }
      if (parsed.schema === RUNLOG_SCHEMA) {
        sawChainedEntry = true;
        chainedEntries += 1;
        const chain = parsed.chain;
        if (!chain || typeof chain !== "object") {
          errors.push({ line: lineNo, message: "v2 entry requires a chain record" });
        } else {
          if (chain.sequence !== entries.length + 1) {
            errors.push({ line: lineNo, message: `chain sequence must be ${entries.length + 1}` });
          }
          if (chain.previous_sha256 !== previousDigest) {
            errors.push({ line: lineNo, message: "chain previous_sha256 does not match the preceding entry" });
          }
          const computed = entryHash(parsed);
          if (chain.entry_sha256 !== computed) {
            errors.push({ line: lineNo, message: "chain entry_sha256 does not match the entry payload" });
          }
          previousDigest = chain.entry_sha256 || computed;
        }
      } else {
        if (parsed.schema === LEGACY_RUNLOG_SCHEMA && sawChainedEntry) {
          errors.push({ line: lineNo, message: "legacy v1 entries may not follow a chained v2 entry" });
        }
        previousDigest = sha256(line);
        Object.defineProperty(parsed, "_legacy_line_sha256", {
          value: previousDigest,
          enumerable: false,
        });
      }
      entries.push(parsed);
    } catch (e) {
      errors.push({ line: lineNo, message: e.message });
    }
  });

  if (chainedEntries > 0 && !existsSync(headPath)) {
    errors.push({ line: 0, message: "runlog head is missing; suffix truncation cannot be ruled out" });
  } else if (existsSync(headPath)) {
    try {
      const head = JSON.parse(readFileSync(headPath, "utf8"));
      if (head.schema !== RUNLOG_HEAD_SCHEMA) errors.push({ line: 0, message: `runlog head schema must be ${RUNLOG_HEAD_SCHEMA}` });
      if (head.entries !== entries.length) errors.push({ line: 0, message: `runlog head expects ${head.entries} entries but ledger has ${entries.length}` });
      if (head.sha256 !== previousDigest) errors.push({ line: 0, message: "runlog head digest does not match the ledger tail" });
    } catch (e) {
      errors.push({ line: 0, message: `invalid runlog head: ${e.message}` });
    }
  }
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
