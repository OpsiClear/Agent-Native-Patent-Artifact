import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
  sha256File,
  validateRunlog,
} from "../apa-trace/runlog.mjs";
import { loadSkillGraph } from "../apa-skillgraph/skillgraph.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function idMap(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function hookPlacements(registry) {
  const out = new Map();
  for (const hook of asArray(registry?.hooks)) out.set(hook.id, hook);
  return out;
}

function domainStepsForHook(graph, enabledDomains, hookId) {
  const out = [];
  for (const domain of graph.domains) {
    if (!enabledDomains.includes(domain.id)) continue;
    for (const skill of asArray(domain.skills)) {
      if (skill.hook !== hookId) continue;
      if (skill.status === "planned") continue;
      out.push({
        id: skill.id,
        command: skill.command,
        phase: "domain",
        kind: "domain",
        domain: domain.id,
        hook: hookId,
        status: skill.status || "scaffold",
        runner: skill.runner || "",
        outputs: asArray(skill.outputs),
        source: "domain.yaml",
      });
    }
  }
  return out;
}

function normalizeSkillId(id) {
  const value = String(id || "").trim().replace(/^\//, "");
  if (!value) return "";
  return value.startsWith("apa-") ? value : `apa-${value}`;
}

function skillDirAlias(skill) {
  const parts = String(skill?.relPath || "").split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function normalizeDomainId(id) {
  return String(id || "").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function availableDomainIds(graph) {
  return new Set(graph.domains.map((domain) => domain.id).filter(Boolean));
}

function availableSupportIds(graph) {
  const optional = new Set(asArray(graph.registry?.optional));
  return new Set(
    graph.skills
      .filter((skill) =>
        skill.kind === "support" &&
        optional.has(skill.id) &&
        asArray(skill.domain_hooks).length > 0
      )
      .map((skill) => skill.id)
  );
}

function availableSupportAliasMap(graph) {
  const optional = new Set(asArray(graph.registry?.optional));
  const out = new Map();
  for (const skill of graph.skills) {
    if (
      skill.kind !== "support" ||
      !optional.has(skill.id) ||
      asArray(skill.domain_hooks).length === 0
    ) {
      continue;
    }
    const command = String(skill.command || "").replace(/^\//, "");
    const dirAlias = skillDirAlias(skill);
    for (const alias of [
      skill.id,
      skill.id?.replace(/^apa-/, ""),
      command,
      command.replace(/^apa-/, ""),
      dirAlias,
      dirAlias ? `apa-${dirAlias}` : "",
    ]) {
      const key = String(alias || "").trim().replace(/^\//, "");
      if (key) out.set(key, skill.id);
    }
  }
  return out;
}

function normalizeSupportId(id, aliasMap) {
  const value = String(id || "").trim().replace(/^\//, "");
  if (!value) return "";
  if (aliasMap.has(value)) return aliasMap.get(value);
  return normalizeSkillId(value);
}

function formatAvailable(ids) {
  return [...ids].sort().join(", ") || "(none)";
}

export function validatePipelineOptions({ domains = [], supports = [], graph = loadSkillGraph() } = {}) {
  const supportAliases = availableSupportAliasMap(graph);
  const enabledDomains = unique(asArray(domains).map(normalizeDomainId).filter(Boolean));
  const enabledSupports = unique(asArray(supports).map((id) => normalizeSupportId(id, supportAliases)).filter(Boolean));
  const domainsAvailable = availableDomainIds(graph);
  const supportsAvailable = availableSupportIds(graph);
  const unknownDomains = enabledDomains.filter((id) => !domainsAvailable.has(id));
  const unknownSupports = enabledSupports.filter((id) => !supportsAvailable.has(id));

  if (unknownDomains.length) {
    throw new Error(
      `unknown domain(s): ${unknownDomains.join(", ")}. Available domains: ${formatAvailable(domainsAvailable)}`
    );
  }
  if (unknownSupports.length) {
    throw new Error(
      `unknown or non-hookable support skill(s): ${unknownSupports.join(", ")}. ` +
        `Available hookable support skills: ${formatAvailable(supportsAvailable)}`
    );
  }

  return { domains: enabledDomains, supports: enabledSupports };
}

function orderByDeclaredDependencies(skills) {
  const remaining = new Map(skills.map((skill) => [skill.id, skill]));
  const out = [];
  while (remaining.size) {
    const ready = [...remaining.values()]
      .filter((skill) => {
        const blockers = asArray(skill.upstream).filter((id) => remaining.has(id));
        const downstreamBlockers = [...remaining.values()].filter((other) => asArray(other.downstream).includes(skill.id));
        return blockers.length === 0 && downstreamBlockers.length === 0;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    const next = ready[0] || [...remaining.values()].sort((a, b) => a.id.localeCompare(b.id))[0];
    remaining.delete(next.id);
    out.push(next);
  }
  return out;
}

function supportStepsForHook(graph, enabledSupports, hookId) {
  const enabled = new Set(asArray(enabledSupports).map(normalizeSkillId).filter(Boolean));
  if (!enabled.size) return [];
  return orderByDeclaredDependencies(
    graph.skills.filter(
      (skill) =>
        skill.kind === "support" &&
        enabled.has(skill.id) &&
        asArray(skill.domain_hooks).includes(hookId)
    )
  ).map((skill) => ({
    ...coreStep(skill),
    hook: hookId,
    enabled_support: true,
  }));
}

function coreStep(skill) {
  return {
    id: skill.id,
    command: skill.command,
    phase: skill.phase,
    kind: skill.kind,
    inputs: asArray(skill.inputs),
    outputs: asArray(skill.outputs),
    gates_after: asArray(skill.gates_after),
    human_checkpoints: asArray(skill.human_checkpoints),
    runner: skill.runner || "",
    source: "skill.yaml",
  };
}

export function planPipeline({ matter = "", domains = [], supports = [], graph = loadSkillGraph() } = {}) {
  const options = validatePipelineOptions({ domains, supports, graph });
  const skills = idMap(graph.skills);
  const hooks = hookPlacements(graph.registry);
  const order = asArray(graph.registry?.pipeline?.order);
  const enabledDomains = options.domains;
  const enabledSupports = options.supports;
  const steps = [];
  const emittedHooks = new Set();

  const emitHook = (hook) => {
    if (emittedHooks.has(hook.id)) return;
    emittedHooks.add(hook.id);
    steps.push(...domainStepsForHook(graph, enabledDomains, hook.id));
    steps.push(...supportStepsForHook(graph, enabledSupports, hook.id));
  };

  for (const id of order) {
    const beforeHooks = [...hooks.values()].filter((h) => asArray(h.before).includes(id));
    for (const hook of beforeHooks) emitHook(hook);
    const skill = skills.get(id);
    if (skill) steps.push(coreStep(skill));
    const afterHooks = [...hooks.values()].filter((h) => asArray(h.after).includes(id));
    for (const hook of afterHooks) emitHook(hook);
  }

  return {
    schema: "apa-run-plan-v1",
    matter: matter || "",
    domains: enabledDomains,
    supports: enabledSupports,
    steps,
  };
}

function checkInput(matterDir, input) {
  if (!matterDir) return { input, status: "unknown", reason: "no matter supplied" };
  if (!input || /source-document|package-manifests|source-tree|prosecution\/oa-NN/.test(input)) {
    return { input, status: "external-or-placeholder" };
  }
  const abs = resolve(matterDir, input);
  return existsSync(abs)
    ? { input, status: "present" }
    : { input, status: "missing" };
}

function normalizedRecordPath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function safeRecordedFile(matterDir, recordPath) {
  const normalized = normalizedRecordPath(recordPath);
  if (!normalized || isAbsolute(normalized) || normalized.split("/").includes("..")) return null;
  const abs = resolve(matterDir, normalized);
  if (!isWithin(matterDir, abs)) return null;
  if (existsSync(abs)) {
    try {
      if (!isWithin(realpathSync(matterDir), realpathSync(abs))) return null;
    } catch {
      return null;
    }
  }
  return { normalized, abs };
}

function latestRecords(entries, key) {
  const records = new Map();
  for (const entry of entries) {
    for (const record of asArray(entry?.[key])) {
      const path = normalizedRecordPath(record?.path);
      if (path) records.set(path, record);
    }
  }
  return records;
}

function reason(code, message, extra = {}) {
  return { code, message, ...extra };
}

function verifyRecordedFiles(matterDir, records, kind) {
  const reasons = [];
  for (const [path, record] of records) {
    const target = safeRecordedFile(matterDir, path);
    if (!target) {
      reasons.push(reason(`${kind}_PATH_UNSAFE`, `${kind.toLowerCase()} evidence path is outside the matter`, { path }));
      continue;
    }
    if (!existsSync(target.abs)) {
      reasons.push(reason(`${kind}_MISSING`, `${kind.toLowerCase()} evidence file is missing`, { path }));
      continue;
    }
    let isFile = false;
    try {
      isFile = statSync(target.abs).isFile();
    } catch {
      // The stable machine reason below is more useful than surfacing a platform-specific fs error.
    }
    if (!isFile) {
      reasons.push(reason(`${kind}_NOT_FILE`, `${kind.toLowerCase()} evidence path is not a file`, { path }));
      continue;
    }
    if (!/^[0-9a-f]{64}$/i.test(String(record?.sha256 || ""))) {
      reasons.push(reason(`${kind}_HASH_MISSING`, `${kind.toLowerCase()} evidence has no valid SHA-256`, { path }));
      continue;
    }
    try {
      if (sha256File(target.abs) !== String(record.sha256).toLowerCase()) {
        reasons.push(reason(`${kind}_HASH_MISMATCH`, `${kind.toLowerCase()} evidence changed after the recorded run`, { path }));
      }
    } catch {
      reasons.push(reason(`${kind}_HASH_UNREADABLE`, `${kind.toLowerCase()} evidence could not be hashed`, { path }));
    }
  }
  return reasons;
}

function expectedOutputReasons(matterDir, step, outputRecords) {
  const reasons = [];
  const expected = asArray(step.outputs)
    .map((path) => ({ raw: String(path || ""), path: normalizedRecordPath(path) }))
    .filter(({ path }) => path && path !== "trace/runlog.jsonl");

  if (expected.length && outputRecords.size === 0) {
    reasons.push(reason("OUTPUT_EVIDENCE_MISSING", "no output hashes were recorded for this step"));
    return reasons;
  }

  for (const item of expected) {
    const target = safeRecordedFile(matterDir, item.path);
    if (!target) {
      reasons.push(reason("EXPECTED_OUTPUT_PATH_UNSAFE", "declared output path is outside the matter", { path: item.path }));
      continue;
    }
    const expectsDirectory = /[\\/]$/.test(item.raw)
      || (existsSync(target.abs) && statSync(target.abs).isDirectory());
    if (expectsDirectory) {
      if (!existsSync(target.abs)) {
        reasons.push(reason("EXPECTED_OUTPUT_MISSING", "declared output directory is missing", { path: item.path }));
      }
      const prefix = `${item.path}/`;
      if (![...outputRecords.keys()].some((path) => path.startsWith(prefix))) {
        reasons.push(reason("OUTPUT_EVIDENCE_MISSING", "declared output directory has no recorded file hashes", { path: item.path }));
      }
    } else {
      if (!existsSync(target.abs)) {
        reasons.push(reason("EXPECTED_OUTPUT_MISSING", "declared output file is missing", { path: item.path }));
      }
      if (!outputRecords.has(item.path)) {
        reasons.push(reason("OUTPUT_EVIDENCE_MISSING", "declared output file has no recorded hash", { path: item.path }));
      }
    }
  }
  return reasons;
}

function checkpointEvidence(step, entries) {
  const states = new Map();
  const required = new Set([
    ...asArray(step.human_checkpoints).map(String).filter(Boolean),
    ...asArray(step.gates_after).map((id) => `gate:${id}`).filter((id) => id !== "gate:"),
  ]);
  for (const entry of entries) {
    for (const checkpoint of asArray(entry?.human_checkpoints)) {
      const id = String(checkpoint?.id || "").trim();
      if (!id) continue;
      states.set(id, checkpoint);
      if (checkpoint.required) required.add(id);
    }
  }
  const pending = [...required]
    .sort()
    .filter((id) => !states.get(id)?.satisfied)
    .map((id) => ({ id, required: true }));
  return { pending, states };
}

function completionForStep(matterDir, step, allEntries) {
  const entries = allEntries.filter((entry) => entry?.skill === step.id);
  if (!entries.length) {
    return {
      status: "pending",
      completed: false,
      reasons: [reason("RUNLOG_ENTRY_MISSING", "no runlog evidence exists for this step")],
      pending_checkpoints: stepBoundaryIds(step).map((id) => ({ id, required: true })),
      evidence_entries: 0,
    };
  }

  const reasons = [];
  const commandEntry = [...entries].reverse().find((entry) => asArray(entry?.commands).length > 0);
  if (!commandEntry) {
    reasons.push(reason("COMMAND_EVIDENCE_MISSING", "no executed command was recorded for this step"));
  } else {
    const exitCodes = asArray(commandEntry.commands).map((command) => Number(command?.exit_code));
    if (exitCodes.some((code) => !Number.isFinite(code) || code !== 0)) {
      reasons.push(reason("COMMAND_FAILED", "the latest recorded command did not exit successfully", { exit_codes: exitCodes }));
    }
  }

  const inputRecords = latestRecords(entries, "inputs");
  const outputRecords = latestRecords(entries, "outputs");
  const recordableInputs = asArray(step.inputs)
    .map((input) => checkInput(matterDir, input))
    .filter((input) => input.status !== "external-or-placeholder");
  if (recordableInputs.length && inputRecords.size === 0) {
    reasons.push(reason("INPUT_EVIDENCE_MISSING", "no input hashes were recorded for this step"));
  }
  reasons.push(...verifyRecordedFiles(matterDir, inputRecords, "INPUT"));
  reasons.push(...verifyRecordedFiles(matterDir, outputRecords, "OUTPUT"));
  reasons.push(...expectedOutputReasons(matterDir, step, outputRecords));

  const checkpoints = checkpointEvidence(step, entries);
  for (const checkpoint of checkpoints.pending) {
    reasons.push(reason("CHECKPOINT_PENDING", "required human checkpoint is not satisfied", { checkpoint: checkpoint.id }));
  }

  const completed = reasons.length === 0;
  const failed = reasons.some((item) => item.code === "COMMAND_FAILED");
  const stale = reasons.some((item) =>
    /(?:_HASH_|_MISSING$|_PATH_UNSAFE$|_NOT_FILE$)/.test(item.code)
    && item.code !== "RUNLOG_ENTRY_MISSING"
    && item.code !== "COMMAND_EVIDENCE_MISSING"
  );
  return {
    status: completed ? "completed" : failed ? "failed" : stale ? "stale" : "pending",
    completed,
    reasons,
    pending_checkpoints: checkpoints.pending,
    evidence_entries: entries.length,
    latest_evidence_at: entries.at(-1)?.timestamp || null,
  };
}

export function statusForMatter({ matter, domains = [], supports = [], graph = loadSkillGraph() } = {}) {
  const plan = planPipeline({ matter, domains, supports, graph });
  const matterDir = resolve(matter || ".");
  const runlog = validateRunlog(matterDir);
  const steps = plan.steps.map((step) => {
    const completion = completionForStep(matterDir, step, runlog.entries);
    return {
      ...step,
      completed: completion.completed,
      completion,
      input_status: asArray(step.inputs).map((input) => checkInput(matterDir, input)),
    };
  });
  return {
    schema: "apa-run-status-v2",
    matter: matterDir,
    runlog_ok: runlog.ok,
    runlog_errors: runlog.errors,
    pending_checkpoints: steps.flatMap((step) =>
      step.completion.pending_checkpoints.map((checkpoint) => ({ skill: step.id, ...checkpoint }))
    ),
    steps,
  };
}

export function appendPlanRunlog({ matter, plan, domains = [], supports = [] } = {}) {
  const checkpoints = [
    humanCheckpoint({ id: "orchestrator-plan-human-review", required: true, satisfied: false }),
  ];
  const entry = buildRunlogEntry({
    skill: "apa-run",
    ruleVersion: "apa-run-v1",
    humanCheckpoints: checkpoints,
    notes: [
      `planned ${plan.steps.length} step(s)`,
      domains.length ? `domains: ${domains.join(", ")}` : "domains: none",
      supports.length ? `supports: ${supports.join(", ")}` : "supports: none",
    ],
  });
  return appendRunlog(resolve(matter), entry);
}

function splitRunnerCommand(command) {
  const input = String(command || "").trim();
  if (!input) throw new Error("step has no declared runner");
  const tokens = [];
  let token = "";
  let quote = "";
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      token += char;
      escaped = false;
    } else if (char === "\\" && quote) {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = "";
      else token += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else if (/[&|;<>`]/.test(char)) {
      throw new Error("declared runner contains a forbidden shell metacharacter");
    } else {
      token += char;
    }
  }
  if (quote || escaped) throw new Error("declared runner has an unterminated quoted token");
  if (token) tokens.push(token);
  if (!tokens.length) throw new Error("step has no declared runner");
  return tokens;
}

function resolveDeclaredRunner(step, runnerRoot) {
  const tokens = splitRunnerCommand(step.runner);
  if (tokens[0] !== "node" && resolve(tokens[0]) !== resolve(process.execPath)) {
    throw new Error(`declared runner executable '${tokens[0]}' is not allowed; only Node runners are supported`);
  }
  if (!tokens[1]) throw new Error("declared Node runner has no script path");
  if (tokens.slice(2).some((token) => token === "--matter" || token.startsWith("--matter="))) {
    throw new Error("declared runner must not override the orchestrator-controlled --matter path");
  }
  const script = resolve(runnerRoot, tokens[1]);
  if (!isWithin(runnerRoot, script) || !existsSync(script) || !statSync(script).isFile()) {
    throw new Error("declared runner script is missing or outside the runner root");
  }
  if (!isWithin(realpathSync(runnerRoot), realpathSync(script))) {
    throw new Error("declared runner script resolves outside the runner root");
  }
  return {
    executable: process.execPath,
    args: [script, ...tokens.slice(2)],
  };
}

function walkFiles(root, dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (!isWithin(realpathSync(root), realpathSync(path))) {
      throw new Error("declared evidence path resolves outside the matter");
    }
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!isWithin(realpathSync(root), realpathSync(path))) {
        throw new Error("declared evidence directory resolves outside the matter");
      }
      walkFiles(root, path, out);
    } else if (stat.isFile()) {
      out.push(path);
    }
  }
}

function declaredEvidenceFiles(matterDir, paths, { skipRunlog = false } = {}) {
  const files = [];
  for (const recordPath of asArray(paths)) {
    if (!recordPath || /source-document|package-manifests|source-tree|prosecution\/oa-NN/.test(recordPath)) continue;
    const normalized = normalizedRecordPath(recordPath);
    if (skipRunlog && normalized === "trace/runlog.jsonl") continue;
    const target = safeRecordedFile(matterDir, normalized);
    if (!target || !existsSync(target.abs)) continue;
    const stat = statSync(target.abs);
    if (stat.isFile()) files.push(target.abs);
    else if (stat.isDirectory()) walkFiles(matterDir, target.abs, files);
  }
  return [...new Set(files)];
}

function stepBoundaryIds(step) {
  return [...new Set([
    ...asArray(step.human_checkpoints).map(String).filter(Boolean),
    ...asArray(step.gates_after).map((id) => `gate:${id}`).filter((id) => id !== "gate:"),
  ])];
}

function continuationId(stepId) {
  return `orchestrator-continue-after:${stepId}`;
}

function hasContinuation(entries, stepId) {
  const id = continuationId(stepId);
  let latestStepEntry = -1;
  entries.forEach((entry, index) => {
    if (entry?.skill === stepId) latestStepEntry = index;
  });
  return entries.some((entry, index) => (
    index > latestStepEntry
    && entry?.skill === "apa-run"
    && asArray(entry.human_checkpoints).some((checkpoint) => checkpoint?.id === id && checkpoint.satisfied)
  ));
}

function appendContinuation(matterDir, stepId) {
  return appendRunlog(matterDir, buildRunlogEntry({
    skill: "apa-run",
    ruleVersion: "apa-run-execution-v1",
    commands: [commandRecord({
      argv: ["apa-run", "run", "--continue-after", stepId],
      exitCode: 0,
    })],
    humanCheckpoints: [
      humanCheckpoint({
        id: continuationId(stepId),
        required: true,
        satisfied: true,
        timestamp: new Date().toISOString(),
      }),
    ],
    notes: [`explicit continuation recorded after ${stepId}`],
  }));
}

function appendRunnerAttempt({
  matterDir,
  step,
  argv,
  cwd,
  exitCode,
  startedAt,
  endedAt,
  inputFiles,
  outputFiles,
  failureMessage = "",
}) {
  const checkpoints = stepBoundaryIds(step).map((id) => humanCheckpoint({
    id,
    required: true,
    satisfied: false,
  }));
  return appendRunlog(matterDir, buildRunlogEntry({
    skill: step.id,
    ruleVersion: "apa-run-execution-v1",
    inputs: existingFileRecords(matterDir, inputFiles),
    outputs: exitCode === 0 ? existingFileRecords(matterDir, outputFiles) : [],
    commands: [commandRecord({ argv, cwd, exitCode, startedAt, endedAt })],
    humanCheckpoints: checkpoints,
    notes: failureMessage ? [`runner failed: ${failureMessage}`] : [],
  }));
}

function executionResult(plan, status, extra = {}) {
  return {
    schema: "apa-run-execution-v1",
    matter: plan.matter,
    status,
    ...extra,
  };
}

function isCheckpointOnly(completion) {
  const reasons = asArray(completion?.reasons);
  return (
    asArray(completion?.pending_checkpoints).length > 0
    && reasons.length > 0
    && reasons.every((item) => item?.code === "CHECKPOINT_PENDING")
  );
}

export function executePipeline({
  matter,
  domains = [],
  supports = [],
  graph = loadSkillGraph(),
  continueAfter = [],
  runnerRoot = REPO_ROOT,
} = {}) {
  const matterDir = resolve(matter || ".");
  const root = resolve(runnerRoot);
  const plan = planPipeline({ matter: matterDir, domains, supports, graph });
  const continueSet = new Set(asArray(continueAfter).map(String).filter(Boolean));
  const executed = [];
  const ledger = validateRunlog(matterDir);
  if (!ledger.ok) {
    return executionResult(plan, "failed", {
      executed,
      exit_code: 2,
      error: "runlog is invalid; repair or restore the ledger before executing runners",
      runlog_errors: ledger.errors,
    });
  }

  for (const step of plan.steps) {
    let status = statusForMatter({
      matter: matterDir,
      domains: plan.domains,
      supports: plan.supports,
      graph,
    });
    let current = status.steps.find((candidate) => candidate.id === step.id);
    if (!current) continue;

    if (current.completed) {
      if (stepBoundaryIds(step).length && !hasContinuation(validateRunlog(matterDir).entries, step.id)) {
        if (!continueSet.has(step.id)) {
          return executionResult(plan, "awaiting-continuation", {
            executed,
            step,
            message: `pass --continue-after ${step.id} after reviewing its satisfied checkpoints`,
          });
        }
        appendContinuation(matterDir, step.id);
      }
      continue;
    }

    if (isCheckpointOnly(current.completion)) {
      return executionResult(plan, "awaiting-checkpoint", {
        executed,
        step,
        pending_checkpoints: current.completion.pending_checkpoints,
      });
    }

    if (!step.runner) {
      return executionResult(plan, "awaiting-agent", {
        executed,
        step,
        message: "step has no declared deterministic runner; execute the named agent skill and record its evidence",
      });
    }

    const startedAt = new Date().toISOString();
    let inputFiles = [];
    let declared;
    try {
      inputFiles = declaredEvidenceFiles(matterDir, step.inputs, { skipRunlog: true });
      declared = resolveDeclaredRunner(step, root);
    } catch (error) {
      const endedAt = new Date().toISOString();
      appendRunnerAttempt({
        matterDir,
        step,
        argv: [String(step.runner)],
        cwd: root,
        exitCode: 2,
        startedAt,
        endedAt,
        inputFiles,
        outputFiles: [],
        failureMessage: error.message,
      });
      return executionResult(plan, "failed", {
        executed,
        step,
        exit_code: 2,
        error: error.message,
      });
    }
    const runnerArgs = [...declared.args, "--matter", matterDir];
    const commandArgv = [declared.executable, ...runnerArgs];
    const result = spawnSync(declared.executable, runnerArgs, {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const endedAt = new Date().toISOString();
    let outputFiles = [];
    let outputEvidenceError = "";
    if (exitCode === 0) {
      try {
        outputFiles = declaredEvidenceFiles(matterDir, step.outputs, { skipRunlog: true });
      } catch (error) {
        outputEvidenceError = error.message;
      }
    }
    appendRunnerAttempt({
      matterDir,
      step,
      argv: commandArgv,
      cwd: root,
      exitCode,
      startedAt,
      endedAt,
      inputFiles,
      outputFiles,
      failureMessage: (
        result.error?.message
        || outputEvidenceError
        || (exitCode === 0 ? "" : String(result.stderr || "").trim().slice(0, 500))
      ),
    });
    executed.push({
      id: step.id,
      exit_code: exitCode,
      outputs: exitCode === 0 ? outputFiles.length : 0,
    });
    if (exitCode !== 0) {
      return executionResult(plan, "failed", {
        executed,
        step,
        exit_code: exitCode,
      });
    }
    if (outputEvidenceError) {
      return executionResult(plan, "failed", {
        executed,
        step,
        exit_code: 2,
        error: `runner exited successfully but output evidence could not be verified: ${outputEvidenceError}`,
      });
    }

    status = statusForMatter({
      matter: matterDir,
      domains: plan.domains,
      supports: plan.supports,
      graph,
    });
    current = status.steps.find((candidate) => candidate.id === step.id);
    const incompleteReasons = asArray(current?.completion?.reasons)
      .filter((item) => item?.code !== "CHECKPOINT_PENDING");
    if (!current?.completed && incompleteReasons.length > 0) {
      return executionResult(plan, "failed", {
        executed,
        step,
        exit_code: 1,
        error: "runner exited successfully but its declared evidence is incomplete",
        reasons: current?.completion.reasons || [],
      });
    }
    if (current?.completion.pending_checkpoints.length) {
      return executionResult(plan, "awaiting-checkpoint", {
        executed,
        step,
        pending_checkpoints: current.completion.pending_checkpoints,
      });
    }
    if (!current?.completed) {
      return executionResult(plan, "failed", {
        executed,
        step,
        exit_code: 1,
        error: "runner exited successfully but its declared evidence is incomplete",
        reasons: current?.completion.reasons || [],
      });
    }
  }

  return executionResult(plan, "complete", { executed });
}
