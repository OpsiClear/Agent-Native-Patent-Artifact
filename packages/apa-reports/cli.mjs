#!/usr/bin/env node
/**
 * apa-reports - scaffold and validate semantic APA report JSON.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { defaultReportFor, expectedReportPath, normalizeReportType, REPORT_TYPES } from "./schemas.mjs";
import { formatErrors, validateReport } from "./validate.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

function value(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function usage(msg = "") {
  if (msg) process.stderr.write(`error: ${msg}\n\n`);
  process.stderr.write([
    "apa-reports - semantic report schema helper (flags/questions, not legal conclusions).",
    "",
    "Usage:",
    "  node cli.mjs list",
    "  node cli.mjs scaffold <report-type> --matter <dir> [--out file] [--oa file]",
    "  node cli.mjs check <report.json> [--kind type] [--json]",
    "",
  ].join("\n"));
  return 2;
}

function defaultInputCandidates(type, matter, args) {
  const p = (...parts) => join(matter, ...parts);
  if (type === "claims") {
    return [p("PATENT.md"), p("logic", "claims.md"), p("src", "embodiments.md"), p("logic", "prior_art.md")];
  }
  if (type === "patentability") {
    return [p("PATENT.md"), p("logic", "claims.md"), p("logic", "prior_art.md"), p("logic", "reference_matrix.md")];
  }
  if (type === "disclosure_capture") {
    return [p("PATENT.md"), p("staging", "observations.yaml"), p("trace", "prosecution.yaml"), p("logic", "claims.md"), p("src", "embodiments.md")];
  }
  if (type === "compile") {
    return [p("PATENT.md"), p("staging", "source-fetch.md"), p("logic", "claims.md"), p("src", "embodiments.md"), p("evidence", "drawings")];
  }
  if (type === "specification") {
    return [p("PATENT.md"), p("logic", "claims.md"), p("src", "embodiments.md"), p("evidence", "drawings")];
  }
  if (type === "examiner_adversary") {
    return [p("PATENT.md"), p("logic", "claims.md"), p("src", "embodiments.md"), p("logic", "prior_art.md"), p("patent_rigor_report.json")];
  }
  if (type === "office_action") {
    return [p("PATENT.md"), value(args, "--oa"), p("logic", "claims.md")].filter(Boolean);
  }
  return [p("PATENT.md")];
}

function cmdList() {
  for (const cfg of Object.values(REPORT_TYPES)) {
    process.stdout.write(`${cfg.type}\t${cfg.schema}\t${cfg.defaultPath}\n`);
  }
  return 0;
}

function cmdScaffold(args) {
  const startedAt = new Date().toISOString();
  const type = normalizeReportType(args.find((a) => !a.startsWith("--")));
  if (!type) return usage("scaffold requires a known report type");
  const matter = value(args, "--matter");
  if (!matter) return usage("scaffold requires --matter <dir>");
  const out = value(args, "--out") || join(matter, expectedReportPath(type));
  const inputs = existingFileRecords(matter, defaultInputCandidates(type, matter, args).filter((p) => p && existsSync(p)));
  const report = defaultReportFor(type, { matter, inputs });
  const check = validateReport(report, { kind: type });
  if (!check.ok) {
    process.stderr.write(formatErrors(check.errors).join("\n") + "\n");
    return 2;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
  appendRunlog(matter, buildRunlogEntry({
    timestamp: new Date().toISOString(),
    skill: report.skill,
    ruleVersion: report.rule_pack?.effective_date || "",
    inputs,
    outputs: existingFileRecords(matter, [out]),
    commands: [commandRecord({
      argv: ["node", "packages/apa-reports/cli.mjs", ...process.argv.slice(2)],
      cwd: process.cwd(),
      exitCode: 0,
      startedAt,
      endedAt: new Date().toISOString(),
    })],
    humanCheckpoints: (report.human_checkpoints || []).map((cp) => humanCheckpoint(cp)),
    notes: ["semantic report scaffold written; flags/questions only, not a legal conclusion"],
  }));
  process.stdout.write(`wrote ${out} (${type}; human checkpoints unsatisfied)\n`);
  return 0;
}

function cmdCheck(args) {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) return usage("check requires <report.json>");
  let report;
  try {
    report = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    process.stderr.write(`cannot read/parse ${file}: ${e.message}\n`);
    return 2;
  }
  const result = validateReport(report, { kind: value(args, "--kind") || "" });
  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`apa-reports check: ${file}\n`);
    if (result.ok) process.stdout.write(`  OK ${result.reportType}\n`);
    else for (const e of formatErrors(result.errors)) process.stdout.write(`  SCHEMA ${e}\n`);
    process.stdout.write("  NOTE: report validity is structural only; no legal conclusion is made.\n");
  }
  return result.ok ? 0 : 2;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "list") return cmdList(rest);
  if (cmd === "scaffold") return cmdScaffold(rest);
  if (cmd === "check") return cmdCheck(rest);
  if (cmd === "-h" || cmd === "--help" || cmd === "help") return usage();
  return usage(cmd ? `unknown subcommand "${cmd}"` : "no subcommand given");
}

process.exit(main());
