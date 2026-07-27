#!/usr/bin/env node
import { planPipeline, statusForMatter, appendPlanRunlog } from "./runner.mjs";

function parseArgs(argv) {
  const out = { _: [], domains: [], supports: [] };
  const valueAfter = (i, flag) => {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") out.matter = valueAfter(i++, a);
    else if (a === "--domain") out.domains.push(valueAfter(i++, a));
    else if (a === "--support") out.supports.push(valueAfter(i++, a));
    else if (a === "--json") out.json = true;
    else if (a === "--write-runlog") out.writeRunlog = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else out._.push(a);
  }
  return out;
}

function usage() {
  return [
    "usage: node packages/apa-run/cli.mjs <plan|status|next|run> --matter <matter> [--domain <id>] [--support <skill-id>] [--json]",
    "",
    "  plan          print the graph-derived execution plan",
    "  status        show completed/pending steps from trace/runlog.jsonl",
    "  next          show the first incomplete step",
    "  run           dry-run the plan; with --write-runlog append an orchestrator planning record",
  ].join("\n");
}

function printPlan(plan) {
  console.log(`APA run plan for ${plan.matter || "(no matter)"}`);
  for (const [idx, step] of plan.steps.entries()) {
    const tag = step.domain ? ` domain:${step.domain}` : "";
    const support = step.enabled_support ? " support" : "";
    console.log(`${String(idx + 1).padStart(2, "0")}. ${step.id} ${step.command}${tag}${support}`);
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0] || "plan";
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.matter && cmd !== "plan") {
    console.error("error: --matter is required");
    return 2;
  }
  if (cmd === "plan") {
    const plan = planPipeline({ matter: args.matter || "", domains: args.domains, supports: args.supports });
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
    return 0;
  }
  if (cmd === "status") {
    const status = statusForMatter({ matter: args.matter, domains: args.domains, supports: args.supports });
    if (args.json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(`APA run status for ${status.matter}`);
      for (const step of status.steps) {
        const reasonCodes = step.completion?.reasons?.map((reason) => reason.code).join(", ");
        console.log(`${step.completed ? "done" : "todo"} ${step.id} ${step.command}${reasonCodes ? ` [${reasonCodes}]` : ""}`);
      }
      if (!status.runlog_ok) for (const e of status.runlog_errors) console.log(`runlog error line ${e.line}: ${e.message}`);
    }
    return status.runlog_ok ? 0 : 1;
  }
  if (cmd === "next") {
    const status = statusForMatter({ matter: args.matter, domains: args.domains, supports: args.supports });
    const next = status.steps.find((s) => !s.completed);
    if (args.json) console.log(JSON.stringify(next || null, null, 2));
    else console.log(next ? `${next.id} ${next.command}` : "complete");
    return status.runlog_ok ? 0 : 1;
  }
  if (cmd === "run") {
    const plan = planPipeline({ matter: args.matter, domains: args.domains, supports: args.supports });
    if (args.writeRunlog) {
      const path = appendPlanRunlog({ matter: args.matter, plan, domains: plan.domains, supports: plan.supports });
      console.log(`appended orchestrator planning record to ${path}`);
    }
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
    console.log("run mode is an orchestrator handoff: execute agent skills in order and enforce gates; use --dry-run for planning-only semantics.");
    return 0;
  }
  console.error(`unknown command: ${cmd}\n${usage()}`);
  return 2;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
