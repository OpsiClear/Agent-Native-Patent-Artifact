#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executeApplicationCommand } from "../../packages/apa-application/service.mjs";
import { proposalForReview } from "../../packages/apa-core/store.mjs";

const VALUE_FLAGS = new Set([
  "--matter",
  "--matter-id",
  "--application-type",
  "--jurisdiction",
  "--user-role",
  "--title",
  "--file",
  "--content-file",
  "--label",
  "--media-type",
  "--artifact-id",
  "--artifact-type",
  "--stage",
  "--checkpoint",
  "--proposal",
  "--actor-id",
  "--actor-kind",
  "--provider",
  "--model",
  "--reviewer-id",
  "--reviewer-role",
  "--rationale",
  "--idempotency-key",
  "--expected-head",
  "--suggested-view",
  "--notes",
  "--from",
  "--to",
  "--domain",
  "--support",
  "--continue-after",
]);
const BOOLEAN_FLAGS = new Set([
  "--json",
  "--human-override",
  "--write-runlog",
  "--dry-run",
  "--help",
  "-h",
]);
const MULTI_FLAGS = new Set(["--domain", "--support", "--continue-after"]);

function parseArgs(argv) {
  const args = { _: [], domain: [], support: [], continueAfter: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      index += 1;
      const key = flagKey(arg);
      if (MULTI_FLAGS.has(arg)) args[key].push(value);
      else args[key] = value;
    } else if (BOOLEAN_FLAGS.has(arg)) {
      args[flagKey(arg)] = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option '${arg}'`);
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function flagKey(flag) {
  return flag
    .replace(/^-+/, "")
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    .replace(/^h$/, "help");
}

function usage() {
  return [
    "APA patent drafting harness",
    "",
    "usage: apa <command> [options]",
    "",
    "Lifecycle:",
    "  init       create a local harness matter",
    "  ingest     register an immutable disclosure source",
    "  plan       show the lifecycle plan and workflow-v2 contract",
    "  status     derive stage status from the matter ledger",
    "  next       show the next incomplete stage",
    "  run        execute deterministic stages and stop at agent/human boundaries",
    "  loop       request an allowed bounded examiner loop",
    "",
    "Draft review:",
    "  propose    store an immutable candidate without adopting it",
    "  review     list proposals or show one proposal record",
    "  adopt      record a human adoption and create an artifact revision",
    "  reject     record a human rejection",
    "  checkpoint record a human review checkpoint against the exact ledger head",
    "  artifacts  list current adopted artifact revisions",
    "",
    "Evidence:",
    "  head       print the current compare-and-swap ledger head",
    "  summary    print a minimal matter and review summary",
    "  verify     verify contracts, content hashes, decisions, and ledger chains",
    "  recover    finish a journaled commit; reclaim only a dead local writer lock",
    "",
    "Every mutation after init requires --expected-head and --idempotency-key.",
    "APA never signs, certifies, pays, or files.",
  ].join("\n");
}

function requireValue(args, key, label = `--${key}`) {
  const value = args[key];
  if (value === undefined || value === "") throw new Error(`${label} is required`);
  return value;
}

function mutationIdentity(args) {
  return {
    expectedHead: requireValue(args, "expectedHead", "--expected-head"),
    idempotencyKey: requireValue(args, "idempotencyKey", "--idempotency-key"),
  };
}

function actorFrom(args, defaultKind = "agent") {
  return {
    kind: args.actorKind || defaultKind,
    id: requireValue(args, "actorId", "--actor-id"),
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: args.model } : {}),
  };
}

function commandInput(command, args) {
  const matter = args.matter;
  if (command !== "init") requireValue(args, "matter", "--matter");
  if (command === "init") {
    return {
      matter: requireValue(args, "matter", "--matter"),
      matterId: requireValue(args, "matterId", "--matter-id"),
      applicationType: args.applicationType || "provisional",
      jurisdiction: args.jurisdiction || "USPTO",
      userRole: args.userRole || "unknown",
      title: args.title || "",
      actor: args.actorId
        ? actorFrom(args, "human")
        : { kind: "human", id: "local-user" },
      idempotencyKey: requireValue(args, "idempotencyKey", "--idempotency-key"),
    };
  }
  if (command === "ingest") {
    return {
      matter,
      file: requireValue(args, "file", "--file"),
      label: args.label,
      mediaType: args.mediaType,
      actor: actorFrom(args, "human"),
      ...mutationIdentity(args),
    };
  }
  if (["plan", "status", "next"].includes(command)) {
    return { matter, domains: args.domain, supports: args.support };
  }
  if (command === "run") {
    return {
      matter,
      domains: args.domain,
      supports: args.support,
      continueAfter: args.continueAfter,
      writePlan: Boolean(args.writeRunlog),
      dryRun: Boolean(args.dryRun),
    };
  }
  if (command === "propose") {
    const contentPath = requireValue(args, "contentFile", "--content-file");
    return {
      matter,
      artifactId: requireValue(args, "artifactId", "--artifact-id"),
      artifactType: requireValue(args, "artifactType", "--artifact-type"),
      stageId: args.stage,
      content: readFileSync(contentPath),
      mediaType: args.mediaType || "text/markdown",
      actor: actorFrom(args, "agent"),
      suggestedView: args.suggestedView,
      notes: args.notes,
      inputs: [],
      ...mutationIdentity(args),
    };
  }
  if (["adopt", "reject"].includes(command)) {
    return {
      matter,
      proposalId: requireValue(args, "proposal", "--proposal"),
      reviewer: {
        id: requireValue(args, "reviewerId", "--reviewer-id"),
        role: args.reviewerRole || "reviewer",
      },
      rationale: args.rationale,
      ...mutationIdentity(args),
    };
  }
  if (command === "checkpoint") {
    return {
      matter,
      stageId: requireValue(args, "stage", "--stage"),
      checkpointId: requireValue(args, "checkpoint", "--checkpoint"),
      reviewer: {
        id: requireValue(args, "reviewerId", "--reviewer-id"),
        role: args.reviewerRole || "reviewer",
      },
      rationale: args.rationale,
      ...mutationIdentity(args),
    };
  }
  if (command === "loop") {
    return {
      matter,
      from: requireValue(args, "from", "--from"),
      to: requireValue(args, "to", "--to"),
      actor: actorFrom(args, args.humanOverride ? "human" : "tool"),
      humanOverride: Boolean(args.humanOverride),
      ...mutationIdentity(args),
    };
  }
  if (["head", "summary", "verify", "recover", "artifacts", "review"].includes(command)) {
    return { matter };
  }
  throw new Error(`unknown command '${command}'`);
}

function printableResult(command, input, args) {
  if (command === "review" && args.proposal) return proposalForReview(input.matter, args.proposal);
  const mapped = command === "review" ? "proposals" : command;
  return executeApplicationCommand(mapped, input);
}

function printHuman(command, result) {
  if (command === "head") {
    console.log(result.sha256);
    return;
  }
  if (command === "summary") {
    console.log(`Matter ${result.matter.matter_id} (${result.matter.application_type}, ${result.matter.jurisdiction})`);
    console.log(`Ledger head: ${result.head.sha256}`);
    console.log(`Proposals: ${result.proposals.pending} pending, ${result.proposals.adopted} adopted, ${result.proposals.rejected} rejected`);
    console.log(`Current artifacts: ${result.current_artifacts.length}`);
    console.log(result.submit_boundary);
    return;
  }
  if (["verify", "recover"].includes(command)) {
    console.log(result.ok ? "APA harness verification passed" : "APA harness verification failed");
    for (const error of result.errors) console.log(`  ${error.code}: ${error.path}: ${error.message}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || "help";
  if (args.help || command === "help") {
    console.log(usage());
    return 0;
  }
  const input = commandInput(command, args);
  const result = printableResult(command, input, args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(command, result);
  if (["verify", "recover"].includes(command) && !result.ok) return 1;
  if (command === "run" && result.status === "failed") return 1;
  if (command === "loop" && result.allowed === false) return 1;
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
}
