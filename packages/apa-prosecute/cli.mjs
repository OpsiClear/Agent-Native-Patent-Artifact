#!/usr/bin/env node
/**
 * apa-prosecute - the OPTIONAL post-filing office-action package (docs/protocol.md §9).
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
 * Node.js >=21, ESM, zero dependencies.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";
import { parseOfficeActionFile } from "./parse.mjs";
import { computeDeadlines } from "./deadlines.mjs";
import { scaffoldResponse, oaNumberFromFile } from "./respond.mjs";
import { defaultReportFor, expectedReportPath } from "../apa-reports/schemas.mjs";
import { formatErrors, validateReport } from "../apa-reports/validate.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

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
      "  node cli.mjs respond   --matter <dir> --oa <file> [--write] [--report-out file] [--json]",
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

function matterUserRole(matter) {
  try {
    return parseFrontmatter(readFileSync(join(matter, "PATENT.md"), "utf8")).user_role || "unknown";
  } catch {
    return "unknown";
  }
}

function ruleVersionOf(matter) {
  try {
    return parseFrontmatter(readFileSync(join(matter, "PATENT.md"), "utf8")).rules_effective_date || "";
  } catch {
    return "";
  }
}

function ruleAnchorForGround(ground) {
  const g = String(ground || "").toLowerCase();
  if (g === "101") return "35-usc-101";
  if (g === "102") return "35-usc-102";
  if (g === "103") return "35-usc-103";
  if (g === "112a") return "35-usc-112a";
  if (g === "112b") return "35-usc-112b";
  if (g === "112f") return "35-usc-112f";
  if (g === "double-patenting") return "double-patenting";
  return "office-action";
}

function buildOfficeActionReport({ matter, oaFile, result, outPath }) {
  const parsed = parseOfficeActionFile(oaFile);
  const report = defaultReportFor("office_action", {
    matter,
    inputs: existingFileRecords(matter, [join(matter, "PATENT.md"), join(matter, "logic", "claims.md"), oaFile].filter(Boolean)),
    outputs: existingFileRecords(matter, [outPath].filter(Boolean)),
  });
  report.office_action = {
    source_file: oaFile,
    oa_number: result.oaNumber,
    action_type: parsed.header.action_type || "",
    mailing_date: parsed.header.mailing_date || "",
    rejection_count: result.rejectionCount,
  };
  report.response_mode = "practitioner_scaffold";
  report.authoritative_deadline = false;
  report.deadline_estimate = parsed.header.mailing_date
    ? { mailing_date: parsed.header.mailing_date, verify_against: "PAIR/Patent Center" }
    : null;
  report.human_checkpoints = [
    { id: "registered-practitioner-review", required: true, satisfied: false },
    { id: "deadline-verification", required: true, satisfied: false },
    { id: "new-matter-review", required: true, satisfied: false },
  ];
  report.findings = parsed.rejections.map((r) => ({
    finding_type: "flag",
    severity: "fix-before-filing",
    rule_anchor: ruleAnchorForGround(r.ground),
    evidence_span: r.examiner_reasoning || r.gist || r.id,
    recommendation: `Practitioner must evaluate ${r.id} against the cited claims and references before any response is filed.`,
    rejection_id: r.id,
    claims: r.claims,
    references: r.references,
  }));
  report.next_allowed_steps = ["practitioner-completes-response", "verify-deadlines", "human-files-if-approved"];
  return report;
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
  const startedAt = new Date().toISOString();
  const matter = flag(argv, "--matter");
  const oaFile = flag(argv, "--oa");
  const doWrite = argv.includes("--write");
  const asJson = argv.includes("--json");
  const reportOutArg = flag(argv, "--report-out");

  if (!matter) return usage("respond requires --matter <dir>");
  if (!oaFile) return usage("respond requires --oa <file>");
  if (matterUserRole(matter) === "pro_se") {
    return usage("respond scaffolds proposed amendments/arguments and is practitioner-mode only; pro-se matters should use parse/deadlines plus a neutral summary/checklist");
  }

  let result;
  try {
    result = scaffoldResponse(matter, oaFile);
  } catch (e) {
    return usage(`cannot scaffold response: ${e.message}`);
  }

  const nn = result.oaNumber || oaNumberFromFile(oaFile);
  let outPath = null;
  let reportPath = null;
  if (doWrite) {
    const dir = join(matter, "prosecution");
    mkdirSync(dir, { recursive: true });
    outPath = join(dir, `response-${nn}.md`);
    writeFileSync(outPath, result.markdown, "utf8");
  }
  reportPath = reportOutArg || (doWrite ? join(matter, expectedReportPath("office_action")) : null);
  if (reportPath) {
    const report = buildOfficeActionReport({ matter, oaFile, result, outPath });
    const check = validateReport(report, { kind: "office_action" });
    if (!check.ok) return usage(`office_action_report.json failed validation: ${formatErrors(check.errors).join("; ")}`);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  if (doWrite) {
    appendRunlog(matter, buildRunlogEntry({
      timestamp: new Date().toISOString(),
      skill: "apa-office-action",
      ruleVersion: ruleVersionOf(matter),
      inputs: existingFileRecords(matter, [
        join(matter, "PATENT.md"),
        join(matter, "logic", "claims.md"),
        oaFile,
      ]),
      outputs: existingFileRecords(matter, [outPath, reportPath].filter(Boolean)),
      commands: [commandRecord({
        argv: ["node", "packages/apa-prosecute/cli.mjs", "respond", ...argv],
        cwd: process.cwd(),
        exitCode: 0,
        startedAt,
        endedAt: new Date().toISOString(),
      })],
      humanCheckpoints: [
        humanCheckpoint({ id: "registered-practitioner-review", required: true, satisfied: false }),
        humanCheckpoint({ id: "deadline-verification", required: true, satisfied: false }),
        humanCheckpoint({ id: "new-matter-review", required: true, satisfied: false }),
        humanCheckpoint({ id: "human-filing-if-approved", required: true, satisfied: false }),
      ],
    }));
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        { rejectionCount: result.rejectionCount, oaNumber: nn, written: outPath, report: reportPath },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  process.stdout.write(`Scaffolded response to OA ${nn}: ${result.rejectionCount} rejection(s).\n`);
  if (outPath) {
    process.stdout.write(`  Wrote draft scaffold -> ${outPath}\n`);
    if (reportPath) process.stdout.write(`  Wrote machine report -> ${reportPath}\n`);
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
