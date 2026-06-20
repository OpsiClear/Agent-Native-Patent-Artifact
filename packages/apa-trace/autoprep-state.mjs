/**
 * Deterministic state helpers for /apa-autoprep.
 *
 * This file does not run the patent-prep workflow. It records resumable stage state, computes input
 * and output hashes, appends human checkpoints to the runlog, and enforces the examiner-loop cap so
 * the cap is not prompt-only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  appendRunlog,
  buildRunlogEntry,
  existingFileRecords,
  humanCheckpoint,
} from "./runlog.mjs";

export const AUTOPREP_STATE_SCHEMA = "apa-autoprep-state-v1";

export const AUTOPREP_STAGES = [
  "matter-config",
  "capture-or-compile",
  "prior-art-search",
  "patentability-analysis",
  "claims",
  "specification",
  "figures",
  "drawing-quality",
  "rigor-review",
  "examiner-adversary",
  "provenance-adoption",
  "assembly-package-draft",
  "complete",
];

const DEFAULT_EXAMINER_LOOP_MAX = 2;

export function autoprepStatePath(matterDir) {
  return join(matterDir, "trace", "autoprep_state.json");
}

export function emptyAutoprepState({ timestamp = new Date().toISOString(), maxExaminerLoops = DEFAULT_EXAMINER_LOOP_MAX } = {}) {
  return {
    schema: AUTOPREP_STATE_SCHEMA,
    status: "in-progress",
    current_stage: "matter-config",
    next_recommended_stage: "matter-config",
    last_completed_stage: "",
    updated_at: timestamp,
    stages: {},
    examiner_loops: {
      count: 0,
      max: maxExaminerLoops,
      history: [],
    },
    recovery_options: ["resume-current-stage", "restart-current-stage", "emit-blocked-state-report"],
  };
}

export function loadAutoprepState(matterDir) {
  const path = autoprepStatePath(matterDir);
  if (!existsSync(path)) return emptyAutoprepState();
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed.schema !== AUTOPREP_STATE_SCHEMA) {
    throw new Error(`autoprep_state.json schema must be ${AUTOPREP_STATE_SCHEMA}`);
  }
  return {
    ...emptyAutoprepState(),
    ...parsed,
    stages: parsed.stages || {},
    examiner_loops: {
      ...emptyAutoprepState().examiner_loops,
      ...(parsed.examiner_loops || {}),
      history: Array.isArray(parsed.examiner_loops?.history) ? parsed.examiner_loops.history : [],
    },
    recovery_options: Array.isArray(parsed.recovery_options)
      ? parsed.recovery_options
      : emptyAutoprepState().recovery_options,
  };
}

export function saveAutoprepState(matterDir, state) {
  const path = autoprepStatePath(matterDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...state, schema: AUTOPREP_STATE_SCHEMA }, null, 2) + "\n", "utf8");
  return path;
}

export function completeAutoprepStage(matterDir, {
  stage,
  inputPaths = [],
  outputPaths = [],
  nextStage = "",
  humanCheckpoints = [],
  timestamp = new Date().toISOString(),
  appendLog = true,
} = {}) {
  assertStage(stage);
  if (nextStage) assertStage(nextStage);
  const state = loadAutoprepState(matterDir);
  const inputs = existingFileRecords(matterDir, inputPaths);
  const outputs = existingFileRecords(matterDir, outputPaths);
  const checkpoints = humanCheckpoints.map((c) => humanCheckpoint(c));
  state.stages[stage] = {
    status: "completed",
    completed_at: timestamp,
    inputs,
    outputs,
    human_checkpoints: checkpoints,
  };
  state.last_completed_stage = stage;
  state.current_stage = nextStage || stage;
  state.next_recommended_stage = nextStage || nextStageAfter(stage);
  state.status = state.next_recommended_stage === "complete" ? "complete" : "in-progress";
  state.updated_at = timestamp;
  saveAutoprepState(matterDir, state);

  if (appendLog && checkpoints.length) {
    appendRunlog(matterDir, buildRunlogEntry({
      timestamp,
      skill: "apa-autoprep",
      inputs,
      outputs,
      humanCheckpoints: checkpoints,
      notes: [`completed autoprep stage ${stage}`],
    }));
  }
  return state;
}

export function shouldSkipAutoprepStage(matterDir, { stage, inputPaths = [], outputPaths = [] } = {}) {
  assertStage(stage);
  const state = loadAutoprepState(matterDir);
  const prior = state.stages[stage];
  if (!prior || prior.status !== "completed") return false;
  const inputs = existingFileRecords(matterDir, inputPaths);
  const outputs = existingFileRecords(matterDir, outputPaths);
  if (outputs.length !== outputPaths.length) return false;
  return sameRecords(prior.inputs || [], inputs) && sameRecords(prior.outputs || [], outputs);
}

export function recordExaminerLoop(matterDir, {
  maxExaminerLoops = DEFAULT_EXAMINER_LOOP_MAX,
  humanOverride = false,
  timestamp = new Date().toISOString(),
  note = "",
} = {}) {
  const state = loadAutoprepState(matterDir);
  const history = Array.isArray(state.examiner_loops.history) ? state.examiner_loops.history : [];
  const count = Number(state.examiner_loops.count || history.length || 0);
  const max = Number(maxExaminerLoops || state.examiner_loops.max || DEFAULT_EXAMINER_LOOP_MAX);
  state.examiner_loops.max = max;
  if (count >= max && !humanOverride) {
    state.status = "blocked";
    state.blocked_reason = `max_examiner_loops reached (${count}/${max})`;
    state.current_stage = "examiner-adversary";
    state.next_recommended_stage = "emit-residual-risk-report";
    state.recovery_options = ["emit-residual-risk-report", "request-human-override"];
    state.updated_at = timestamp;
    saveAutoprepState(matterDir, state);
    return { allowed: false, state, blocked_report: blockedStateReport(state) };
  }
  const loop = {
    index: count + 1,
    max,
    timestamp,
    human_override: Boolean(humanOverride),
    ...(note ? { note } : {}),
  };
  history.push(loop);
  state.examiner_loops = { count: count + 1, max, history };
  state.status = "in-progress";
  state.current_stage = "examiner-adversary";
  state.next_recommended_stage = "rigor-review";
  state.updated_at = timestamp;
  delete state.blocked_reason;
  saveAutoprepState(matterDir, state);
  return { allowed: true, state, loop };
}

export function restartAutoprepStage(matterDir, stage, { timestamp = new Date().toISOString() } = {}) {
  assertStage(stage);
  const state = loadAutoprepState(matterDir);
  delete state.stages[stage];
  state.status = "in-progress";
  state.current_stage = stage;
  state.next_recommended_stage = stage;
  state.updated_at = timestamp;
  delete state.blocked_reason;
  saveAutoprepState(matterDir, state);
  return state;
}

export function blockedStateReport(state) {
  return {
    schema: "apa-autoprep-blocked-report-v1",
    status: state.status,
    current_stage: state.current_stage,
    blocked_reason: state.blocked_reason || "",
    next_recommended_stage: state.next_recommended_stage,
    recovery_options: state.recovery_options || [],
    examiner_loops: state.examiner_loops || {},
  };
}

function assertStage(stage) {
  if (!AUTOPREP_STAGES.includes(stage)) {
    throw new Error(`unknown autoprep stage '${stage}' (supported: ${AUTOPREP_STAGES.join(", ")})`);
  }
}

function nextStageAfter(stage) {
  const idx = AUTOPREP_STAGES.indexOf(stage);
  if (idx < 0 || idx + 1 >= AUTOPREP_STAGES.length) return "complete";
  return AUTOPREP_STAGES[idx + 1];
}

function sameRecords(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].sha256 !== b[i].sha256 || a[i].bytes !== b[i].bytes) {
      return false;
    }
  }
  return true;
}
