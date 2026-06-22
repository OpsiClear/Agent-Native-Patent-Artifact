#!/usr/bin/env node
/**
 * Offline deterministic benchmark runner for the APA checklist.
 *
 * This is intentionally not a drafting-quality or legal-quality claim. It verifies that curated
 * public/synthetic benchmark fixtures continue to pass the mechanical gates and produce stable,
 * machine-readable summary metrics. Live LLM evaluation remains periodic/advisory; commit gates use
 * `--mock`.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMatter } from "../packages/apa-validate/validate.mjs";
import { build as buildManifest } from "../packages/apa-viewer/build_manifest.mjs";
import { preflight } from "../packages/apa-assemble/preflight.mjs";
import { parseOfficeActionFile } from "../packages/apa-prosecute/parse.mjs";
import { computeDeadlines } from "../packages/apa-prosecute/deadlines.mjs";
import { runSoftwarePatentSimulation } from "../packages/apa-bench/software-patent-sim.mjs";
import { runSoftwareDomain } from "../packages/apa-domain-software/software-domain.mjs";
import { validateRunlog } from "../packages/apa-trace/runlog.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INDEX = "benchmarks/index.json";
const ALLOWED_SOURCE_CLASSES = new Set(["public_patent", "public_office_action", "synthetic_disclosure", "synthetic_software_patent", "synthetic_codebase"]);

function parseArgs(argv) {
  const args = { index: DEFAULT_INDEX };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock") args.mock = true;
    else if (a === "--json") args.json = true;
    else if (a === "--index") args.index = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--case") args.caseId = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function readJson(relOrAbs) {
  return JSON.parse(readFileSync(resolve(ROOT, relOrAbs), "utf8"));
}

function fileSha256(relOrAbs) {
  return createHash("sha256").update(readFileSync(resolve(ROOT, relOrAbs))).digest("hex");
}

function passCase(id, kind, sourceClass, metrics) {
  return { id, kind, source_class: sourceClass, status: "pass", metrics, findings: [] };
}

function failCase(id, kind, sourceClass, metrics, findings) {
  return { id, kind, source_class: sourceClass, status: "fail", metrics, findings };
}

function checkEqual(findings, actual, expected, path) {
  if (actual !== expected) {
    findings.push({
      severity: "blocking",
      path,
      expected,
      actual,
      message: `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    });
  }
}

function countLimitations(manifest) {
  return manifest.nodes.filter((n) => n.kind === "claim-limitation").length;
}

function reviewBlockingCount(review = {}) {
  return (
    (review.provenance?.blocking_count || 0) +
    (review.drawings?.blocking_count || 0)
  );
}

function reviewWarningCount(review = {}) {
  return (
    (review.ids?.warning_count || 0) +
    (review.support?.warning_count || 0) +
    (review.drawings?.warning_count || 0)
  );
}

function evalMockScores(matter) {
  const stdout = execFileSync(process.execPath, [
    "packages/apa-eval/cli.mjs",
    "--matter",
    matter,
    "--mock",
    "--json",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(stdout);
  return Object.fromEntries(
    Object.entries(parsed.run.dimensions).map(([name, verdict]) => [name, verdict.score]),
  );
}

function requirePath(findings, rel, label) {
  if (!rel) {
    findings.push({ severity: "blocking", path: label, message: `${label} is missing from benchmark index` });
    return false;
  }
  if (!existsSync(resolve(ROOT, rel))) {
    findings.push({ severity: "blocking", path: rel, message: `${label} does not exist: ${rel}` });
    return false;
  }
  return true;
}

function runMatterCase(testCase, expected, { includePreflight = false, includeMockEval = false } = {}) {
  const findings = [];
  requirePath(findings, testCase.matter, "matter");
  if (testCase.source) requirePath(findings, testCase.source, "source");
  if (findings.length) return failCase(testCase.id, testCase.kind, testCase.source_class, {}, findings);

  const matter = resolve(ROOT, testCase.matter);
  const validation = validateMatter(matter);
  const manifest = buildManifest(matter);
  const unresolved = manifest.edges.filter((e) => e.resolved === false).length;
  const metrics = {
    validation_errors: validation.errors.length,
    validation_warnings: validation.warnings.length,
    claims: manifest.nodes.filter((n) => n.kind === "claim").length,
    limitations: countLimitations(manifest),
    unresolved_edges: unresolved,
    review_blocking_count: reviewBlockingCount(manifest.review),
    review_warning_count: reviewWarningCount(manifest.review),
  };

  if (testCase.source) metrics.source_sha256 = fileSha256(testCase.source);

  if (includePreflight) {
    const pf = preflight(matter);
    metrics.preflight_go = pf.blocked === false;
    metrics.preflight_blocks = pf.gates.filter((g) => g.status === "block").length;
    metrics.preflight_warnings = pf.gates.filter((g) => g.status === "warn").length;
  }

  if (includeMockEval) {
    metrics.mock_eval_scores = evalMockScores(testCase.matter);
  }

  const mech = expected.mechanical || {};
  for (const key of Object.keys(mech)) {
    if (Object.hasOwn(metrics, key)) checkEqual(findings, metrics[key], mech[key], `mechanical.${key}`);
  }

  const semantic = expected.semantic_snapshot || {};
  if (semantic.source_class) checkEqual(findings, testCase.source_class, semantic.source_class, "semantic_snapshot.source_class");
  if (semantic.expected_title) checkEqual(findings, manifest.meta.title, semantic.expected_title, "semantic_snapshot.expected_title");
  if (semantic.mock_eval_scores) {
    for (const [name, score] of Object.entries(semantic.mock_eval_scores)) {
      checkEqual(findings, metrics.mock_eval_scores?.[name], score, `semantic_snapshot.mock_eval_scores.${name}`);
    }
  }

  return findings.length
    ? failCase(testCase.id, testCase.kind, testCase.source_class, metrics, findings)
    : passCase(testCase.id, testCase.kind, testCase.source_class, metrics);
}

function runOfficeActionCase(testCase, expected) {
  const findings = [];
  requirePath(findings, testCase.office_action, "office_action");
  if (findings.length) return failCase(testCase.id, testCase.kind, testCase.source_class, {}, findings);

  const parsed = parseOfficeActionFile(resolve(ROOT, testCase.office_action));
  const deadlines = computeDeadlines(parsed.header.mailing_date);
  const metrics = {
    rejections: parsed.rejections.length,
    grounds: parsed.rejections.map((r) => r.ground),
    mailing_date: parsed.header.mailing_date,
    statutory_3_month: deadlines.statutory3Month,
    statutory_6_month: deadlines.statutory6Month,
    authoritative_deadline: false,
    office_action_sha256: fileSha256(testCase.office_action),
  };

  const mech = expected.mechanical || {};
  checkEqual(findings, metrics.rejections, mech.rejections, "mechanical.rejections");
  checkEqual(findings, metrics.mailing_date, mech.mailing_date, "mechanical.mailing_date");
  checkEqual(findings, metrics.statutory_3_month, mech.statutory_3_month, "mechanical.statutory_3_month");
  checkEqual(findings, metrics.statutory_6_month, mech.statutory_6_month, "mechanical.statutory_6_month");
  if (Array.isArray(mech.grounds)) {
    checkEqual(findings, metrics.grounds.join(","), mech.grounds.join(","), "mechanical.grounds");
  }

  const semantic = expected.semantic_snapshot || {};
  if (semantic.source_class) checkEqual(findings, testCase.source_class, semantic.source_class, "semantic_snapshot.source_class");
  if (semantic.authoritative_deadline !== undefined) {
    checkEqual(findings, metrics.authoritative_deadline, semantic.authoritative_deadline, "semantic_snapshot.authoritative_deadline");
  }

  return findings.length
    ? failCase(testCase.id, testCase.kind, testCase.source_class, metrics, findings)
    : passCase(testCase.id, testCase.kind, testCase.source_class, metrics);
}

function runSoftwarePatentSimulationCase(testCase) {
  const sim = runSoftwarePatentSimulation({ scenarios: testCase.scenarios });
  return sim.findings.length
    ? failCase(testCase.id, testCase.kind, testCase.source_class, sim.metrics, sim.findings)
    : passCase(testCase.id, testCase.kind, testCase.source_class, sim.metrics);
}

function runSyntheticCodebaseDomainCase(testCase, expected) {
  const findings = [];
  requirePath(findings, testCase.source, "source");
  requirePath(findings, testCase.matter_template, "matter_template");
  if (findings.length) return failCase(testCase.id, testCase.kind, testCase.source_class, {}, findings);

  const tmp = mkdtempSync(join(tmpdir(), "apa-bench-codebase-domain-"));
  try {
    cpSync(resolve(ROOT, testCase.matter_template), tmp, { recursive: true });
    const { outputs, result } = runSoftwareDomain({
      command: "run-all",
      source: resolve(ROOT, testCase.source),
      matter: tmp,
      argv: ["node", "packages/apa-domain-software/cli.mjs", "run-all", "--matter", tmp, "--source", testCase.source],
    });
    const relOutputs = outputs.map((p) => relative(tmp, p).replace(/\\/g, "/")).sort();
    const runlog = validateRunlog(tmp);
    const metrics = {
      files_scanned: result.inventory.files_scanned,
      output_count: outputs.length,
      canonical_writes: relOutputs.some((p) => !p.startsWith("domain/software/")),
      runlog_entries: runlog.entries.length,
      mechanism_terms: result.seeds.method_seed.candidate_limitations.length,
      outputs: relOutputs,
      source_sha256: hashTree(resolve(ROOT, testCase.source)),
    };

    const mech = expected.mechanical || {};
    for (const key of ["files_scanned", "output_count", "canonical_writes", "runlog_entries"]) {
      if (Object.hasOwn(mech, key)) checkEqual(findings, metrics[key], mech[key], `mechanical.${key}`);
    }
    if (Number.isFinite(mech.min_mechanism_terms) && metrics.mechanism_terms < mech.min_mechanism_terms) {
      findings.push({
        severity: "blocking",
        path: "mechanical.min_mechanism_terms",
        expected: mech.min_mechanism_terms,
        actual: metrics.mechanism_terms,
        message: `mechanical.min_mechanism_terms: expected at least ${mech.min_mechanism_terms}, got ${metrics.mechanism_terms}`,
      });
    }
    const semantic = expected.semantic_snapshot || {};
    if (semantic.source_class) checkEqual(findings, testCase.source_class, semantic.source_class, "semantic_snapshot.source_class");
    for (const out of semantic.required_outputs || []) {
      if (!relOutputs.includes(out)) {
        findings.push({ severity: "blocking", path: out, message: `required output missing: ${out}` });
      }
    }
    if (!runlog.ok) {
      findings.push({ severity: "blocking", path: "trace/runlog.jsonl", message: `runlog invalid: ${JSON.stringify(runlog.errors)}` });
    }
    return findings.length
      ? failCase(testCase.id, testCase.kind, testCase.source_class, metrics, findings)
      : passCase(testCase.id, testCase.kind, testCase.source_class, metrics);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function runCase(testCase, opts) {
  const findings = [];
  if (!ALLOWED_SOURCE_CLASSES.has(testCase.source_class)) {
    findings.push({
      severity: "blocking",
      path: "source_class",
      message: `unsupported benchmark source_class '${testCase.source_class}'`,
    });
  }
  if (testCase.kind === "software-patent-skill-simulation") {
    requirePath(findings, testCase.scenarios, "scenarios");
    return findings.length
      ? failCase(testCase.id, testCase.kind, testCase.source_class, {}, findings)
      : runSoftwarePatentSimulationCase(testCase);
  }

  requirePath(findings, testCase.expected, "expected");
  if (findings.length) return failCase(testCase.id, testCase.kind, testCase.source_class, {}, findings);

  const expected = readJson(testCase.expected);
  if (expected.case_id && expected.case_id !== testCase.id) {
    return failCase(testCase.id, testCase.kind, testCase.source_class, {}, [{
      severity: "blocking",
      path: testCase.expected,
      message: `expected case_id '${expected.case_id}' does not match index id '${testCase.id}'`,
    }]);
  }

  if (testCase.kind === "compiled-public-patent") return runMatterCase(testCase, expected);
  if (testCase.kind === "public-office-action") return runOfficeActionCase(testCase, expected);
  if (testCase.kind === "synthetic-disclosure-to-assembly") {
    return runMatterCase(testCase, expected, { includePreflight: true, includeMockEval: opts.mock });
  }
  if (testCase.kind === "synthetic-codebase-domain") return runSyntheticCodebaseDomainCase(testCase, expected);
  return failCase(testCase.id, testCase.kind, testCase.source_class, {}, [{
    severity: "blocking",
    path: "kind",
    message: `unknown benchmark case kind '${testCase.kind}'`,
  }]);
}

function hashTree(root) {
  const files = [];
  collectFiles(root, files);
  const h = createHash("sha256");
  for (const file of files.sort()) {
    h.update(relative(root, file).replace(/\\/g, "/"));
    h.update("\0");
    h.update(readFileSync(file));
    h.update("\0");
  }
  return h.digest("hex");
}

function collectFiles(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

export function runBenchmarks(opts = {}) {
  if (!opts.mock) {
    throw new Error("benchmark commit gate is deterministic/offline; pass --mock");
  }
  const index = readJson(opts.index || DEFAULT_INDEX);
  const allCases = Array.isArray(index.cases) ? index.cases : [];
  const cases = opts.caseId ? allCases.filter((c) => c.id === opts.caseId) : allCases;
  if (opts.caseId && cases.length === 0) throw new Error(`benchmark case not found: ${opts.caseId}`);
  const results = cases.map((testCase) => runCase(testCase, opts));
  const summary = {
    schema: "apa-benchmark-results-v1",
    generated_at: new Date().toISOString(),
    mode: "mock-offline",
    index: opts.index || DEFAULT_INDEX,
    case: opts.caseId || null,
    policy: index.policy || {},
    totals: {
      cases: results.length,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status !== "pass").length,
    },
    cases: results,
  };
  summary.ok = summary.totals.failed === 0;
  return summary;
}

function printText(summary) {
  console.log(`APA benchmark suite (${summary.mode})`);
  for (const c of summary.cases) {
    console.log(`  ${c.status === "pass" ? "ok" : "FAIL"} - ${c.id}`);
    for (const f of c.findings) console.log(`    ${f.message}`);
  }
  console.log(`benchmarks ${summary.ok ? "passed" : "failed"} (${summary.totals.passed}/${summary.totals.cases})`);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("usage: node scripts/benchmark.mjs --mock [--json] [--out <file>] [--index <file>] [--case <id>]");
    return 0;
  }
  const summary = runBenchmarks(args);
  if (args.out) {
    const out = resolve(ROOT, args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printText(summary);
  return summary.ok ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
}
