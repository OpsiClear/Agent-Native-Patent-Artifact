/**
 * apa-eval store - a versioned, git-aware-ish eval store with budget-regression gating (DESIGN.md §7.1:
 * "eval results persist to a versioned store with budget-regression gating: fail on a claim-quality
 * score drop or >2x cost growth").
 *
 *   recordRun(dir, run, timestamp)  - write a timestamped JSON run record (timestamp is PASSED IN; this
 *                                     stays a pure function - the CLI passes new Date().toISOString()).
 *   latestRun(dir)                  - read back the most recent run record (by filename timestamp).
 *   compare(prev, cur)              - { regressions, deltas } per dimension.
 *   budgetGate(prev, cur)           - { ok, reasons } : FAIL on a claim-quality score drop or >2x cost growth.
 *
 * A "run" is `{ dimensions: { claim:{score,...}, spec:{...}, ... }, cost?, usage?, ... }`.
 * Cost = sum of judge usage (input+output tokens) if present, else the count of judge calls.
 *
 * Node >=21, ESM, zero dependencies.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RUN_PREFIX = "run-";
const RUN_SUFFIX = ".json";

/** Filesystem-safe form of an ISO timestamp (colons -> dashes). */
function safeStamp(ts) {
  return String(ts).replace(/[:.]/g, "-");
}

/**
 * Persist a run record. The timestamp is an ARGUMENT (pure function - no Date.now inside); the CLI is
 * responsible for passing `new Date().toISOString()`. Returns the absolute file path written.
 */
export function recordRun(dir, run, timestamp) {
  if (!timestamp) throw new Error("recordRun: timestamp is required (pass new Date().toISOString())");
  mkdirSync(dir, { recursive: true });
  const record = { timestamp, ...run, cost: costOf(run), costUnit: costUnitOf(run) };
  const file = join(dir, `${RUN_PREFIX}${safeStamp(timestamp)}${RUN_SUFFIX}`);
  writeFileSync(file, JSON.stringify(record, null, 2));
  return file;
}

/** List recorded run files (newest last), sorted by their embedded timestamp lexicographically. */
function listRunFiles(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => n.startsWith(RUN_PREFIX) && n.endsWith(RUN_SUFFIX))
    .sort();
}

/** Read the most recent run record, or null if none exists. */
export function latestRun(dir) {
  const files = listRunFiles(dir);
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[files.length - 1]), "utf8"));
  } catch {
    return null;
  }
}

/** Read all run records oldest-first (handy for trend inspection / tests). */
export function allRuns(dir) {
  const out = [];
  for (const f of listRunFiles(dir)) {
    try { out.push(JSON.parse(readFileSync(join(dir, f), "utf8"))); } catch { /* skip corrupt */ }
  }
  return out;
}

/**
 * Cost of a run. Prefer summed judge usage (input+output tokens) when present; otherwise count the
 * judge calls (each scored dimension = one paid call unless skipped by the pre-pass).
 */
export function costOf(run) {
  if (!run) return 0;
  if (typeof run.cost === "number") return run.cost;
  const { cost } = costDetail(run);
  return cost;
}

/**
 * The UNIT a run's cost is measured in: "tokens" when any judge usage is present, else "calls"
 * (the count of non-skipped judge calls). A token-costed run and a call-costed run are NOT
 * comparable - budgetGate must not compare their magnitudes (see below).
 */
export function costUnitOf(run) {
  if (!run) return "calls";
  if (typeof run.costUnit === "string") return run.costUnit;
  return costDetail(run).unit;
}

/** Shared cost computation: returns both the magnitude and the unit it was measured in. */
function costDetail(run) {
  const dims = (run && run.dimensions) || {};
  let tokenSum = 0;
  let sawUsage = false;
  let calls = 0;
  for (const d of Object.values(dims)) {
    if (!d || typeof d !== "object") continue;
    if (!d.skipped) calls += 1;
    const u = d.usage;
    if (u && typeof u === "object") {
      sawUsage = true;
      tokenSum += (Number(u.input_tokens) || 0) + (Number(u.output_tokens) || 0);
    }
  }
  if (run && run.usage && typeof run.usage === "object") {
    sawUsage = true;
    tokenSum += (Number(run.usage.input_tokens) || 0) + (Number(run.usage.output_tokens) || 0);
  }
  return sawUsage ? { cost: tokenSum, unit: "tokens" } : { cost: calls, unit: "calls" };
}

function scoreOf(run, dimension) {
  const d = run && run.dimensions && run.dimensions[dimension];
  return d && typeof d.score === "number" ? d.score : null;
}

/**
 * Per-dimension comparison of two runs.
 * @returns {{ regressions: Array<{dimension,prev,cur,delta}>, deltas: Array<{dimension,prev,cur,delta}> }}
 */
export function compare(prev, cur) {
  const regressions = [];
  const deltas = [];
  if (!prev || !cur) return { regressions, deltas };
  const dims = new Set([
    ...Object.keys((prev.dimensions) || {}),
    ...Object.keys((cur.dimensions) || {}),
  ]);
  for (const dim of dims) {
    const p = scoreOf(prev, dim);
    const c = scoreOf(cur, dim);
    if (p === null || c === null) continue;
    const delta = c - p;
    const entry = { dimension: dim, prev: p, cur: c, delta };
    deltas.push(entry);
    if (delta < 0) regressions.push(entry);
  }
  return { regressions, deltas };
}

/**
 * The budget gate. FAILS (ok:false) on:
 *   - a CLAIM-QUALITY score drop (the `claim` dimension regressed vs the previous run), or
 *   - >2x cost growth (current cost more than double the previous), ONLY when both runs were costed
 *     in the SAME unit (see `notes` for a skipped cost check on a unit mismatch).
 * With no previous run it passes (nothing to regress against).
 * @returns {{ ok:boolean, reasons:string[], notes:string[], prevCost:number, curCost:number }}
 */
export function budgetGate(prev, cur) {
  const reasons = [];
  const notes = [];
  const curCost = costOf(cur);
  const prevCost = prev ? costOf(prev) : 0;
  if (!prev) return { ok: true, reasons, notes, prevCost, curCost };

  const prevClaim = scoreOf(prev, "claim");
  const curClaim = scoreOf(cur, "claim");
  if (prevClaim !== null && curClaim !== null && curClaim < prevClaim) {
    reasons.push(`claim-quality score dropped ${prevClaim} -> ${curClaim}`);
  }
  // The >2x cost check is only meaningful when both runs were costed in the SAME unit. Comparing a
  // call-count-costed mock run against a token-costed live run (or vice versa) is meaningless and
  // would produce a spurious or masked regression - so skip the magnitude check on a unit mismatch.
  // This is NOT a failure (it must not flip the gate); it is surfaced as an informational note.
  const prevUnit = costUnitOf(prev);
  const curUnit = costUnitOf(cur);
  if (prevUnit !== curUnit) {
    notes.push(`cost unit changed (${prevUnit} -> ${curUnit}) - not comparable, >2x cost check skipped`);
  } else if (prevCost > 0 && curCost > prevCost * 2) {
    reasons.push(`cost grew >2x (${prevCost} -> ${curCost})`);
  }
  return { ok: reasons.length === 0, reasons, notes, prevCost, curCost };
}
