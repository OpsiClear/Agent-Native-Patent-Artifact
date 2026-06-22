#!/usr/bin/env node
import { runFormulationDomain } from "./formulation-domain.mjs";

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
    "usage: node packages/apa-domain-formulation/cli.mjs <command> [--source DIR] [--matter DIR] [--out PATH] [--json]",
    "",
    "commands:",
    "  summary             write domain/formulation/formulation_summary.json",
    "  claim-seeds         write domain/formulation/formulation_claim_seeds.json",
    "  enablement-review   write domain/formulation/composition_enablement_review.json",
    "  ranges-review       write domain/formulation/ranges_and_examples_review.json",
    "  run-all             write every formulation-domain hook artifact",
    "",
    "The package reads local formulation/protocol/example source files, writes only under domain/formulation/",
    "when --matter is supplied, and emits flags/handoffs only; it does not write canonical APA files or legal conclusions.",
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
  const { outputs, result } = runFormulationDomain({
    command,
    source: args.source,
    matter: args.matter,
    out: args.out,
    argv: ["node", "packages/apa-domain-formulation/cli.mjs", ...argv],
    startedAt,
  });
  if (args.json) {
    console.log(JSON.stringify({ command, outputs, result }, null, 2));
  } else {
    console.log(`formulation domain ${command}: wrote ${outputs.length} artifact(s)`);
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
