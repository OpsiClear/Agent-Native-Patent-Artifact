const STAGE_STATES = [
  "pending",
  "running",
  "awaiting-human",
  "accepted",
  "rejected",
  "stale",
  "superseded",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function compileWorkflowPlan(plan, { registry = {} } = {}) {
  if (!plan || !Array.isArray(plan.steps)) throw new Error("an APA run plan is required");
  const stages = plan.steps.map((step, index) => {
    const later = plan.steps.slice(index + 1).map((candidate) => candidate.id);
    const executorKind = step.runner ? "node" : "agent";
    return {
      id: step.id,
      phase: step.phase || "unspecified",
      executor: {
        kind: executorKind,
        ...(step.runner ? { runner: step.runner } : { skill: step.command }),
      },
      commit_mode: executorKind === "agent" ? "proposal-required" : "engine-owned",
      consumes: asArray(step.inputs),
      produces: asArray(step.outputs),
      gates: asArray(step.gates_after),
      checkpoints: asArray(step.human_checkpoints),
      invalidates: later,
      states: STAGE_STATES,
      ...(step.domain ? { domain: step.domain } : {}),
      ...(step.hook ? { hook: step.hook } : {}),
    };
  });
  const alternatives = Object.entries(registry?.pipeline?.alternatives || {}).map(([id, members]) => ({
    id,
    members: asArray(members),
    selection: "exactly-one",
  }));
  const loops = asArray(registry?.allowed_loops).map((loop) => {
    const maxIterations = Number(loop?.max_iterations);
    if (!loop?.from || !loop?.to || !Number.isInteger(maxIterations) || maxIterations < 1) {
      throw new Error("workflow loop requires from, to, and a positive integer max_iterations");
    }
    return {
      from: loop.from,
      to: loop.to,
      max_iterations: maxIterations,
      overflow: "block-unless-human-override",
    };
  });
  return {
    schema: "apa-workflow-plan-v2",
    matter: plan.matter || "",
    domains: asArray(plan.domains),
    supports: asArray(plan.supports),
    stages,
    alternatives,
    loops,
    global_gates: asArray(registry?.global_gates),
    transition_order: stages.map((stage) => stage.id),
  };
}

export function workflowLoopPolicy(registry, from, to) {
  return asArray(registry?.allowed_loops)
    .map((loop) => ({
      from: String(loop?.from || ""),
      to: String(loop?.to || ""),
      max_iterations: Number(loop?.max_iterations),
    }))
    .find((loop) => loop.from === from && loop.to === to) || null;
}
