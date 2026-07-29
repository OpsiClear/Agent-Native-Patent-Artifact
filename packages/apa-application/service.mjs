import {
  appendPlanRunlog,
  executePipeline,
  planPipeline,
  statusForMatter,
} from "../apa-run/runner.mjs";
import { currentRunlogHead } from "../apa-trace/runlog.mjs";
import {
  currentArtifacts,
  decideProposal,
  harnessSummary,
  ingestSource,
  initializeHarness,
  proposalQueue,
  proposeArtifact,
  recordCheckpoint,
  requestLoop,
  verifyHarness,
} from "../apa-workflow/commands.mjs";

export function planMatter({ matter = "", domains = [], supports = [] } = {}) {
  return planPipeline({ matter, domains, supports });
}

export function statusMatter({ matter, domains = [], supports = [] } = {}) {
  return statusForMatter({ matter, domains, supports });
}

export function nextMatterStep({ matter, domains = [], supports = [] } = {}) {
  const status = statusMatter({ matter, domains, supports });
  return status.steps.find((step) => !step.completed) || null;
}

export function runMatter({
  matter,
  domains = [],
  supports = [],
  continueAfter = [],
  writePlan = false,
  dryRun = false,
} = {}) {
  const plan = planMatter({ matter, domains, supports });
  if (writePlan) appendPlanRunlog({ matter, plan, domains, supports });
  if (dryRun) return { schema: "apa-run-execution-v1", matter, status: "dry-run", plan };
  return executePipeline({ matter, domains, supports, continueAfter });
}

export function matterHead({ matter } = {}) {
  return currentRunlogHead(matter);
}

export function executeApplicationCommand(command, input = {}) {
  switch (command) {
    case "init":
      return initializeHarness(input.matter, input);
    case "ingest":
      return ingestSource(input.matter, input);
    case "plan":
      return planMatter(input);
    case "status":
      return statusMatter(input);
    case "next":
      return nextMatterStep(input);
    case "run":
      return runMatter(input);
    case "head":
      return matterHead(input);
    case "propose":
      return proposeArtifact(input.matter, input);
    case "adopt":
      return decideProposal(input.matter, { ...input, outcome: "adopted" });
    case "reject":
      return decideProposal(input.matter, { ...input, outcome: "rejected" });
    case "checkpoint":
      return recordCheckpoint(input.matter, input);
    case "proposals":
      return proposalQueue(input.matter);
    case "artifacts":
      return currentArtifacts(input.matter);
    case "loop":
      return requestLoop(input.matter, input);
    case "summary":
      return harnessSummary(input.matter);
    case "verify":
      return verifyHarness(input.matter);
    default:
      throw new Error(`unknown application command '${command}'`);
  }
}
