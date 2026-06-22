import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { appendRunlog, buildRunlogEntry, humanCheckpoint, validateRunlog } from "../apa-trace/runlog.mjs";
import { loadSkillGraph } from "../apa-skillgraph/skillgraph.mjs";

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
    source: "skill.yaml",
  };
}

export function planPipeline({ matter = "", domains = [], graph = loadSkillGraph() } = {}) {
  const skills = idMap(graph.skills);
  const hooks = hookPlacements(graph.registry);
  const order = asArray(graph.registry?.pipeline?.order);
  const enabledDomains = domains.length ? domains : [];
  const steps = [];

  for (const id of order) {
    const beforeHooks = [...hooks.values()].filter((h) => asArray(h.before).includes(id));
    for (const hook of beforeHooks) steps.push(...domainStepsForHook(graph, enabledDomains, hook.id));
    const skill = skills.get(id);
    if (skill) steps.push(coreStep(skill));
    const afterHooks = [...hooks.values()].filter((h) => asArray(h.after).includes(id));
    for (const hook of afterHooks) steps.push(...domainStepsForHook(graph, enabledDomains, hook.id));
  }

  return {
    schema: "apa-run-plan-v1",
    matter: matter || "",
    domains: enabledDomains,
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

export function statusForMatter({ matter, domains = [], graph = loadSkillGraph() } = {}) {
  const plan = planPipeline({ matter, domains, graph });
  const matterDir = resolve(matter || ".");
  const runlog = validateRunlog(matterDir);
  const completed = new Set(runlog.entries.map((e) => e.skill).filter(Boolean));
  const steps = plan.steps.map((step) => ({
    ...step,
    completed: completed.has(step.id),
    input_status: asArray(step.inputs).map((input) => checkInput(matterDir, input)),
  }));
  return {
    schema: "apa-run-status-v1",
    matter: matterDir,
    runlog_ok: runlog.ok,
    runlog_errors: runlog.errors,
    pending_checkpoints: steps.flatMap((s) => asArray(s.human_checkpoints).map((id) => ({ skill: s.id, id, required: true }))),
    steps,
  };
}

export function appendPlanRunlog({ matter, plan, domains = [] } = {}) {
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
    ],
  });
  return appendRunlog(resolve(matter), entry);
}
