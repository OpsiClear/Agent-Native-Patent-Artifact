#!/usr/bin/env node
/**
 * apa-prosecute - the OPTIONAL post-filing office-action package (docs/protocol.md §8).
 *
 * It models the examination round-trip: parse an Office Action, ESTIMATE the 37 CFR 1.136(a)
 * response period, and scaffold a response. Everything it emits is a flag/question for a
 * registered practitioner; deadlines are estimates to verify; APA NEVER files.
 *
 *   node cli.mjs parse     --oa <file> [--json]
 *   node cli.mjs deadlines (--mailed <YYYY-MM-DD> | --oa <file>) [--json]
 *   node cli.mjs respond   --matter <dir> --oa <file> [--write] [--json]
 *
 * Exit: 0 = ok · 2 = usage error.
 *
 * Node.js >=18, ESM, zero dependencies.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseOfficeActionFile } from "./parse.mjs";
import { computeDeadlines } from "./deadlines.mjs";
import { scaffoldResponse, oaNumberFromFile } from "./respond.mjs";

const DISCLAIMER =
  "Post-filing assistance: flags and estimates for a registered practitioner. " +
  "APA does not file or compute authoritative deadlines.";

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function usage(msg) {
  if (msg) process.stderr.write(`error: ${msg}\n\n`);
  process.stderr.write(
    [
      "apa-prosecute - post-filing office-action assistant (optional; never files).",
      "",
      "Usage:",
      "  node cli.mjs parse     --oa <file> [--json]",
      "  node cli.mjs deadlines (--mailed <YYYY-MM-DD> | --oa <file>) [--json]",
      "  node cli.mjs respond   --matter <dir> --oa <file> [--write] [--json]",
      "",
      DISCLAIMER,
      "",
    ].join("\n"),
  );
  return 2;
}

function printDisclaimer() {
  process.stdout.write(`\n${DISCLAIMER}\n`);
}

// -------------------------------------------------------------------------------------------------
// Subcommands
// -------------------------------------------------------------------------------------------------

function cmdParse(argv) {
  const oaFile = flag(argv, "--oa");
  if (!oaFile) return usage("parse requires --oa <file>");
  const asJson = argv.includes("--json");

  let parsed;
  try {
    parsed = parseOfficeActionFile(oaFile);
  } catch (e) {
    return usage(`cannot read OA file: ${e.message}`);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(parsed, null, 2) + "\n");
    return 0;
  }

  const h = parsed.header;
  process.stdout.write(`Office Action: ${basename(oaFile)}\n`);
  process.stdout.write(`  Application no.: ${h.application_no || "(not stated)"}\n`);
  process.stdout.write(`  Examiner:        ${h.examiner || "(not stated)"}\n`);
  process.stdout.write(`  Mailing date:    ${h.mailing_date || "(not stated)"}\n`);
  process.stdout.write(`  Action type:     ${h.action_type || "(not stated)"}\n`);
  process.stdout.write(`  Rejections:      ${parsed.rejections.length}\n\n`);
  for (const r of parsed.rejections) {
    process.stdout.write(`  ${r.id} - ${r.gist}\n`);
    process.stdout.write(`    ground:     ${r.ground || "(unspecified)"}\n`);
    process.stdout.write(`    claims:     ${r.claims.join(", ") || "(none)"}\n`);
    process.stdout.write(`    references: ${r.references.join(", ") || "(none)"}\n`);
  }
  printDisclaimer();
  return 0;
}

function cmdDeadlines(argv) {
  const mailedFlag = flag(argv, "--mailed");
  const oaFile = flag(argv, "--oa");
  const asJson = argv.includes("--json");

  let mailingDate = mailedFlag;
  if (!mailingDate && oaFile) {
    let parsed;
    try {
      parsed = parseOfficeActionFile(oaFile);
    } catch (e) {
      return usage(`cannot read OA file: ${e.message}`);
    }
    mailingDate = parsed.header.mailing_date;
    if (!mailingDate) return usage(`OA file ${basename(oaFile)} has no mailing_date in its \`\`\`oa header`);
  }
  if (!mailingDate) return usage("deadlines requires --mailed <YYYY-MM-DD> or --oa <file>");

  let result;
  try {
    result = computeDeadlines(mailingDate);
  } catch (e) {
    return usage(e.message);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  }

  process.stdout.write(`Response-period ESTIMATE for OA mailed ${result.mailingDate}\n`);
  process.stdout.write(`  3-month shortened statutory period (due): ${result.statutory3Month}\n`);
  process.stdout.write(`  6-month statutory MAXIMUM (cannot extend past): ${result.statutory6Month}\n\n`);
  process.stdout.write("  Extensions of time (37 CFR 1.136(a)):\n");
  for (const ext of result.extensions) {
    const fee = ext.feeLarge != null ? `$${ext.feeLarge} (large entity)` : "(fee unknown)";
    process.stdout.write(
      `    +${ext.extensionMonths} month(s) -> due ${ext.dueDate}, fee ${fee}\n`,
    );
  }
  if (result._unverified) {
    process.stdout.write("\n  [UNVERIFIED] Extension fees are PLACEHOLDERS - no fee schedule table found.\n");
  }
  process.stdout.write("\n  Notes:\n");
  for (const n of result.notes) process.stdout.write(`    - ${n}\n`);
  printDisclaimer();
  return 0;
}

function cmdRespond(argv) {
  const matter = flag(argv, "--matter");
  const oaFile = flag(argv, "--oa");
  const doWrite = argv.includes("--write");
  const asJson = argv.includes("--json");

  if (!matter) return usage("respond requires --matter <dir>");
  if (!oaFile) return usage("respond requires --oa <file>");

  let result;
  try {
    result = scaffoldResponse(matter, oaFile);
  } catch (e) {
    return usage(`cannot scaffold response: ${e.message}`);
  }

  const nn = result.oaNumber || oaNumberFromFile(oaFile);
  let outPath = null;
  if (doWrite) {
    const dir = join(matter, "prosecution");
    mkdirSync(dir, { recursive: true });
    outPath = join(dir, `response-${nn}.md`);
    writeFileSync(outPath, result.markdown, "utf8");
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        { rejectionCount: result.rejectionCount, oaNumber: nn, written: outPath },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  process.stdout.write(`Scaffolded response to OA ${nn}: ${result.rejectionCount} rejection(s).\n`);
  if (outPath) {
    process.stdout.write(`  Wrote draft scaffold -> ${outPath}\n`);
    process.stdout.write("  This is a DRAFT a registered practitioner completes, argues, and files.\n");
  } else {
    process.stdout.write("  (dry run - pass --write to save under <matter>/prosecution/response-NN.md)\n\n");
    process.stdout.write(result.markdown + "\n");
  }
  printDisclaimer();
  return 0;
}

// -------------------------------------------------------------------------------------------------
// Entry
// -------------------------------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  switch (sub) {
    case "parse":
      return cmdParse(argv.slice(1));
    case "deadlines":
      return cmdDeadlines(argv.slice(1));
    case "respond":
      return cmdRespond(argv.slice(1));
    case "-h":
    case "--help":
    case "help":
      usage();
      return 0;
    default:
      return usage(sub ? `unknown subcommand "${sub}"` : "no subcommand given");
  }
}

process.exit(main());
