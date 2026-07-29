#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter } from "../apa-core/apa-parse.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";
import {
  parseCorrespondenceText,
  validateCorrespondenceRecord,
} from "./parse.mjs";
import { computeNoticeDeadlines } from "./deadlines.mjs";
import {
  buildMissingPartsResponse,
  validateMissingPartsResponse,
} from "./response.mjs";
import { auditFilingReceipt } from "./receipt-audit.mjs";
import { loadOfficialFormRegistry } from "./forms.mjs";
import { noticeTypeRows } from "./taxonomy.mjs";

const DISCLAIMER =
  "Documentation aid only: estimates and checklists require human verification. " +
  "APA never gives legal advice, signs, certifies, pays, or files.";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

function usage(message) {
  if (message) process.stderr.write(`error: ${message}\n\n`);
  process.stderr.write([
    "apa-correspondence - USPTO correspondence documentation aid",
    "",
    "Usage:",
    "  node cli.mjs triage --input <txt|json> [--matter <dir> --write] [--json]",
    "  node cli.mjs deadlines --record <json> [--schedule <json>] [--entity large|small|micro] [--as-of YYYY-MM-DD] [--json]",
    "  node cli.mjs prepare-missing-parts --matter <dir> --record <json> [--schedule <json>] [--entity large|small|micro] [--write] [--json]",
    "  node cli.mjs receipt-audit --matter <dir> --receipt <json> [--write] [--json]",
    "  node cli.mjs forms [--json]",
    "  node cli.mjs taxonomy [--json]",
    "",
    DISCLAIMER,
    "",
  ].join("\n"));
  return 2;
}

function jsonOut(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function requireMatter(path) {
  if (!path) throw new Error("--matter <dir> is required");
  const matter = realpathSync(resolve(path));
  if (!existsSync(join(matter, "PATENT.md"))) throw new Error("matter must contain PATENT.md");
  return matter;
}

function correspondenceDir(matter) {
  const dir = join(matter, "correspondence");
  if (existsSync(dir)) {
    const stat = lstatSync(dir);
    if (stat.isSymbolicLink()) throw new Error("refusing a symlinked correspondence directory");
    const real = realpathSync(dir);
    if (!isWithin(matter, real)) throw new Error("correspondence directory escapes the matter");
  }
  return dir;
}

function ensureCorrespondenceDir(matter) {
  const dir = correspondenceDir(matter);
  mkdirSync(dir, { recursive: true });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) throw new Error("refusing a symlinked correspondence directory");
  const real = realpathSync(dir);
  if (!isWithin(matter, real)) throw new Error("correspondence directory escapes the matter");
  return real;
}

function nextNumberedPath(dir, prefix, extension) {
  const names = existsSync(dir) ? readdirSync(dir) : [];
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)\\.${extension.replace(".", "\\.")}$`, "i");
  for (const name of names) {
    const match = pattern.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return join(dir, `${prefix}-${String(max + 1).padStart(2, "0")}.${extension}`);
}

function readRecord(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  const check = validateCorrespondenceRecord(value);
  if (!check.ok) throw new Error(`invalid correspondence record: ${check.errors.map((item) => item.code).join(", ")}`);
  return value;
}

function readSchedule(path) {
  return path ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function ruleVersion(matter) {
  try {
    return parseFrontmatter(readFileSync(join(matter, "PATENT.md"), "utf8")).rules_effective_date || "";
  } catch {
    return "";
  }
}

function matterLocalInputs(matter, paths) {
  return existingFileRecords(matter, paths.filter((path) => {
    if (!path || !existsSync(path)) return false;
    const abs = realpathSync(path);
    return isWithin(matter, abs);
  }));
}

function privacySafeArgv(argv) {
  const replacements = new Map([
    ["--matter", "[matter]"],
    ["--input", "[external-input]"],
    ["--record", "[correspondence-record]"],
    ["--receipt", "[filing-receipt]"],
    ["--schedule", "[fee-schedule]"],
  ]);
  const safe = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    safe.push(token);
    if (replacements.has(token) && index + 1 < argv.length) {
      safe.push(replacements.get(token));
      index += 1;
    }
  }
  return safe;
}

function logWrite({ matter, skill, argv, startedAt, inputs, outputs, checkpoints, notes = [] }) {
  appendRunlog(matter, buildRunlogEntry({
    timestamp: new Date().toISOString(),
    skill,
    ruleVersion: ruleVersion(matter),
    inputs: matterLocalInputs(matter, inputs),
    outputs: existingFileRecords(matter, outputs),
    commands: [commandRecord({
      argv: ["node", "packages/apa-correspondence/cli.mjs", ...privacySafeArgv(argv)],
      cwd: process.cwd(),
      exitCode: 0,
      startedAt,
      endedAt: new Date().toISOString(),
    })],
    humanCheckpoints: checkpoints.map((id) => humanCheckpoint({ id, required: true, satisfied: false })),
    notes,
  }));
}

function cmdTriage(argv) {
  const startedAt = new Date().toISOString();
  const input = option(argv, "--input");
  if (!input) return usage("triage requires --input <txt|json>");
  const bytes = readFileSync(input);
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return usage(
      "PDF input requires local page rendering/text extraction or OCR first. Inspect every page, " +
      "save private extracted text outside Git, then pass that text to triage.",
    );
  }

  let record;
  const text = bytes.toString("utf8");
  if (text.trimStart().startsWith("{")) {
    try {
      record = JSON.parse(text);
    } catch (error) {
      return usage(`input looks like JSON but cannot be parsed: ${error.message}`);
    }
  } else {
    record = parseCorrespondenceText(text, { sourceFilename: input, sourceBytes: bytes });
  }
  const check = validateCorrespondenceRecord(record);
  const result = { record, validation: check, written: null };
  if (!check.ok) {
    if (argv.includes("--json")) jsonOut(result);
    else for (const error of check.errors) process.stderr.write(`${error.code}: ${error.message}\n`);
    return 2;
  }

  if (argv.includes("--write")) {
    let matter;
    try {
      matter = requireMatter(option(argv, "--matter"));
      const dir = ensureCorrespondenceDir(matter);
      const output = nextNumberedPath(dir, "notice", "json");
      writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      result.written = output;
      logWrite({
        matter,
        skill: "apa-correspondence",
        argv: ["triage", ...argv],
        startedAt,
        inputs: [join(matter, "PATENT.md")],
        outputs: [output],
        checkpoints: ["notice-classification-review", "notice-date-review", "notice-issues-review"],
        notes: ["The private source notice was hashed but not copied into the matter by this command."],
      });
    } catch (error) {
      return usage(error.message);
    }
  }

  if (argv.includes("--json")) {
    jsonOut(result);
  } else {
    process.stdout.write(`Notice type: ${record.classification.label}\n`);
    process.stdout.write(`Supported workflow: ${record.classification.supported ? "yes" : "no"}\n`);
    process.stdout.write(`Mailing date: ${record.mailing_date.value || "[not extracted]"}\n`);
    process.stdout.write(`Notice-stated response months: ${record.response_period.months || "[not extracted]"}\n`);
    process.stdout.write(`Issues extracted: ${record.issues.length}\n`);
    process.stdout.write(`Human verification required: yes\n`);
    if (result.written) process.stdout.write(`Wrote privacy-minimized record: ${result.written}\n`);
    process.stdout.write(`\n${DISCLAIMER}\n`);
  }
  return check.errors.some((item) => item.code === "NOTICE_TYPE_UNSUPPORTED") ? 2 : 0;
}

function cmdDeadlines(argv) {
  const recordPath = option(argv, "--record");
  if (!recordPath) return usage("deadlines requires --record <json>");
  let result;
  try {
    result = computeNoticeDeadlines(readRecord(recordPath), {
      schedule: readSchedule(option(argv, "--schedule")),
      entityStatus: option(argv, "--entity") || "unknown",
      asOf: option(argv, "--as-of") || new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    return usage(error.message);
  }
  if (argv.includes("--json")) jsonOut(result);
  else {
    process.stdout.write(`Calculation status: ${result.calculation_status}\n`);
    if (result.base_due_date_tentative) {
      process.stdout.write(`Tentative base date: ${result.base_due_date_tentative}\n`);
      process.stdout.write(`Extension rows: ${result.extensions.length}\n`);
    }
    for (const note of result.notes || []) process.stdout.write(`- ${note}\n`);
    process.stdout.write(`\n${DISCLAIMER}\n`);
  }
  return String(result.calculation_status).startsWith("blocked") ? 2 : 0;
}

function cmdPrepareMissingParts(argv) {
  const startedAt = new Date().toISOString();
  const recordPath = option(argv, "--record");
  if (!recordPath) return usage("prepare-missing-parts requires --record <json>");
  let matter;
  let built;
  try {
    matter = requireMatter(option(argv, "--matter"));
    built = buildMissingPartsResponse(readRecord(recordPath), {
      schedule: readSchedule(option(argv, "--schedule")),
      entityStatus: option(argv, "--entity") || "unknown",
      asOf: option(argv, "--as-of") || new Date().toISOString().slice(0, 10),
    });
    const check = validateMissingPartsResponse(built.response);
    if (!check.ok) throw new Error(`generated response failed validation: ${check.errors.map((item) => item.code).join(", ")}`);
  } catch (error) {
    return usage(error.message);
  }

  const result = { response: built.response, markdown: built.markdown, written: null };
  if (argv.includes("--write")) {
    try {
      const dir = ensureCorrespondenceDir(matter);
      const jsonPath = nextNumberedPath(dir, "response", "json");
      const match = /response-(\d+)\.json$/i.exec(basename(jsonPath));
      const mdPath = join(dir, `response-${match[1]}.md`);
      writeFileSync(jsonPath, `${JSON.stringify(built.response, null, 2)}\n`, "utf8");
      writeFileSync(mdPath, `${built.markdown.trimEnd()}\n`, "utf8");
      result.written = { json: jsonPath, markdown: mdPath };
      logWrite({
        matter,
        skill: "apa-missing-parts",
        argv: ["prepare-missing-parts", ...argv],
        startedAt,
        inputs: [join(matter, "PATENT.md"), recordPath],
        outputs: [jsonPath, mdPath],
        checkpoints: [
          "deadline-verification",
          "notice-item-review",
          "form-version-review",
          "signer-authority-review",
          "fee-entity-status-review",
          "pdf-visual-review",
          "human-patent-center-submission",
        ],
      });
    } catch (error) {
      return usage(error.message);
    }
  }
  if (argv.includes("--json")) jsonOut(result);
  else {
    process.stdout.write(result.markdown);
    if (result.written) process.stdout.write(`\nWrote: ${result.written.json}\nWrote: ${result.written.markdown}\n`);
  }
  return 0;
}

function cmdReceiptAudit(argv) {
  const startedAt = new Date().toISOString();
  const receiptPath = option(argv, "--receipt");
  if (!receiptPath) return usage("receipt-audit requires --receipt <json>");
  let matter;
  let audit;
  try {
    matter = requireMatter(option(argv, "--matter"));
    audit = auditFilingReceipt(matter, JSON.parse(readFileSync(receiptPath, "utf8")));
  } catch (error) {
    return usage(error.message);
  }
  const result = { audit, written: null };
  if (argv.includes("--write")) {
    try {
      const dir = ensureCorrespondenceDir(matter);
      const output = join(dir, "filing-receipt-audit.json");
      writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
      result.written = output;
      logWrite({
        matter,
        skill: "apa-correspondence",
        argv: ["receipt-audit", ...argv],
        startedAt,
        inputs: [join(matter, "PATENT.md"), receiptPath],
        outputs: [output],
        checkpoints: ["filing-receipt-review", "priority-chain-review", "corrected-ads-review"],
      });
    } catch (error) {
      return usage(error.message);
    }
  }
  if (argv.includes("--json")) jsonOut(result);
  else {
    process.stdout.write(`Receipt audit: ${audit.status}\n`);
    process.stdout.write(`Discrepancies: ${audit.discrepancy_count}\n`);
    process.stdout.write(`Corrected ADS review required: ${audit.corrected_ads_review_required ? "yes" : "no"}\n`);
    if (result.written) process.stdout.write(`Wrote: ${result.written}\n`);
    process.stdout.write(`\n${DISCLAIMER}\n`);
  }
  return 0;
}

function cmdForms(argv) {
  let registry;
  try {
    registry = loadOfficialFormRegistry();
  } catch (error) {
    return usage(error.message);
  }
  if (argv.includes("--json")) jsonOut(registry);
  else {
    for (const form of registry.forms) {
      process.stdout.write(`${form.form_code}: ${form.title}\n  ${form.direct_url}\n`);
    }
    process.stdout.write(`\n${DISCLAIMER}\n`);
  }
  return 0;
}

function cmdTaxonomy(argv) {
  const rows = noticeTypeRows();
  if (argv.includes("--json")) jsonOut(rows);
  else for (const row of rows) process.stdout.write(`${row.id}: ${row.label} -> ${row.response_workflow}\n`);
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  switch (command) {
    case "triage": return cmdTriage(argv);
    case "deadlines": return cmdDeadlines(argv);
    case "prepare-missing-parts": return cmdPrepareMissingParts(argv);
    case "receipt-audit": return cmdReceiptAudit(argv);
    case "forms": return cmdForms(argv);
    case "taxonomy": return cmdTaxonomy(argv);
    case "help":
    case "--help":
    case "-h":
      usage();
      return 0;
    default:
      return usage(command ? `unknown command '${command}'` : "no command given");
  }
}

process.exit(main());
