#!/usr/bin/env node
import { runSoftwareDomain } from "./software-domain.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") out.source = argv[++i];
    else if (a === "--matter") out.matter = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else out._.push(a);
  }
  return out;
}

function usage() {
  return [
    "usage: node packages/apa-domain-software/cli.mjs <command> [--source DIR] [--matter DIR] [--out PATH] [--json]",
    "",
    "commands:",
    "  inventory      write domain/software/codebase_inventory.json",
    "  disclosure     write domain/software/software_disclosure_summary.md",
    "  claim-seeds    write domain/software/software_claim_seeds.json",
    "  101-review     write domain/software/software_101_review.json",
    "  figures        write domain/software/software_architecture_figures.json",
    "  run-all        write every software-domain hook artifact",
    "",
    "The package reads local source only, writes only under domain/software/ when --matter is supplied,",
    "and emits flags/handoffs only; it does not write canonical APA files or legal conclusions.",
  ].join("\n");
}

function main(argv) {
  const startedAt = new Date().toISOString();
  const args = parseArgs(argv);
  const command = args._[0] || "run-all";
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const { outputs, result } = runSoftwareDomain({
    command,
    source: args.source,
    matter: args.matter,
    out: args.out,
    argv: ["node", "packages/apa-domain-software/cli.mjs", ...argv],
    startedAt,
  });
  if (args.json) {
    console.log(JSON.stringify({ command, outputs, result }, null, 2));
  } else {
    console.log(`software domain ${command}: wrote ${outputs.length} artifact(s)`);
    for (const out of outputs) console.log(`  ${out}`);
  }
  return 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
