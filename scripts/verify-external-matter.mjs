#!/usr/bin/env node
/**
 * Local-only external matter verifier.
 *
 * This runner never copies, writes, or prints matter content, titles, inventor data, citations, or
 * absolute paths. It composes APA's pure validation APIs and emits aggregate counts suitable for a
 * private regression check. External matters must not be added to the committed benchmark index.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { preflight } from "../packages/apa-assemble/preflight.mjs";
import { assembleIds } from "../packages/apa-assemble/ids.mjs";
import { buildAssemblyInputFingerprint } from "../packages/apa-assemble/input-fingerprint.mjs";
import { buildLegend } from "../packages/apa-figure/numerals.mjs";
import { scaffoldReport } from "../packages/apa-rigor/scaffold.mjs";
import { validateReport } from "../packages/apa-rigor/verdict.mjs";
import { statusForMatter } from "../packages/apa-run/runner.mjs";
import { validateMatter } from "../packages/apa-validate/validate.mjs";
import { build as buildViewerManifest } from "../packages/apa-viewer/build_manifest.mjs";

function codeCounts(findings = []) {
  const counts = {};
  for (const finding of findings) counts[finding.code] = (counts[finding.code] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizedGoNoGo(value) {
  return String(value || "").startsWith("NO-GO") ? "NO-GO" : "GO";
}

function stableObject(value) {
  return Object.fromEntries(
    Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {})
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function stableStrings(value) {
  return [...new Set(Array.isArray(value) ? value.map(String) : [])].sort();
}

export function checkAggregateOracle(result, oracle, canonicalInputSha256) {
  if (!oracle || typeof oracle !== "object" || Array.isArray(oracle)) {
    throw new Error("aggregate oracle must be a JSON object");
  }
  if (oracle.schema !== "apa-external-matter-oracle-v1") {
    throw new Error("aggregate oracle schema must be apa-external-matter-oracle-v1");
  }
  if (!/^[0-9a-f]{64}$/i.test(String(oracle.canonical_input_sha256 || ""))) {
    throw new Error("aggregate oracle canonical_input_sha256 must be a SHA-256 digest");
  }
  if (!oracle.valid_dossiers || typeof oracle.valid_dossiers !== "object") {
    throw new Error("aggregate oracle valid_dossiers must contain rigor and ids counts");
  }
  if (!Array.isArray(oracle.blocked_gates)) {
    throw new Error("aggregate oracle blocked_gates must be an array");
  }

  const mismatches = [];
  if (oracle.evaluated_at !== result.evaluated_at) mismatches.push("evaluated_at differs");
  if (String(oracle.canonical_input_sha256).toLowerCase() !== canonicalInputSha256) {
    mismatches.push("canonical input digest differs");
  }
  if (JSON.stringify(stableObject(oracle.mechanical_error_codes)) !== JSON.stringify(result.mechanical.error_codes)) {
    mismatches.push("mechanical error-code histogram differs");
  }
  if (JSON.stringify(stableObject(oracle.mechanical_warning_codes)) !== JSON.stringify(result.mechanical.warning_codes)) {
    mismatches.push("mechanical warning-code histogram differs");
  }
  if (Number(oracle.valid_dossiers.rigor) !== result.rigor.valid_dossiers) {
    mismatches.push("rigor valid-dossier count differs");
  }
  if (Number(oracle.valid_dossiers.ids) !== result.ids.valid_dossiers) {
    mismatches.push("IDS valid-dossier count differs");
  }
  if (JSON.stringify(stableStrings(oracle.blocked_gates)) !== JSON.stringify(stableStrings(result.filing.blocked_gates))) {
    mismatches.push("blocked-gate set differs");
  }
  return {
    schema: "apa-external-matter-oracle-check-v1",
    checked: true,
    ok: mismatches.length === 0,
    mismatches,
    canonical_digest_emitted: false,
  };
}

export function verifyExternalMatter(matterDir, {
  now = new Date().toISOString(),
  domains = [],
  supports = [],
  oracle = null,
} = {}) {
  if (!matterDir || !existsSync(join(matterDir, "PATENT.md"))) {
    throw new Error("external matter directory is missing or has no PATENT.md");
  }
  const evaluatedAt = new Date(now);
  if (Number.isNaN(evaluatedAt.getTime())) throw new Error("--now must be a valid date/time");

  const validation = validateMatter(matterDir);
  const viewer = buildViewerManifest(matterDir);
  const rigor = scaffoldReport(matterDir, { evaluatedAt: evaluatedAt.toISOString() });
  const ids = assembleIds(matterDir);
  const legend = buildLegend(matterDir);
  const filing = preflight(matterDir, {
    assembledDir: join(matterDir, "assembled"),
    now: evaluatedAt.toISOString(),
  });
  const fingerprint = buildAssemblyInputFingerprint(matterDir);
  const runStatus = statusForMatter({ matter: matterDir, domains, supports });

  let savedRigor = { present: false };
  const rigorPath = join(matterDir, "patent_rigor_report.json");
  if (existsSync(rigorPath)) {
    try {
      const report = JSON.parse(readFileSync(rigorPath, "utf8"));
      const checked = validateReport(report, { now: evaluatedAt.toISOString() });
      savedRigor = {
        present: true,
        structurally_valid: checked.ok,
        schema_error_count: checked.errors.length,
        verdict: checked.computed?.verdict || "unavailable",
        mean: checked.computed?.mean ?? null,
      };
    } catch {
      savedRigor = {
        present: true,
        structurally_valid: false,
        schema_error_count: 1,
        verdict: "unavailable",
        mean: null,
      };
    }
  }

  const result = {
    schema: "apa-external-matter-verification-v2",
    evaluated_at: evaluatedAt.toISOString(),
    mechanical: {
      errors: validation.errors.length,
      warnings: validation.warnings.length,
      error_codes: codeCounts(validation.errors),
      warning_codes: codeCounts(validation.warnings),
      claims: validation.meta.claims ?? null,
      inventors: validation.meta.inventors ?? null,
      figures: validation.meta.figures ?? null,
      active_prior_art: validation.meta.prior_art ?? null,
    },
    graph: {
      nodes: viewer.nodes.length,
      edges: viewer.edges.length,
      unresolved_edges: viewer.edges.filter((edge) => edge.resolved === false).length,
      wrong_kind_edges: viewer.edges.filter((edge) => edge.resolution_issue === "wrong-target-kind").length,
      provenance_blockers: viewer.review?.provenance?.blocking_count || 0,
    },
    rigor: {
      level1_passed: rigor.level1.passed,
      level1_error_count: rigor.level1.errorCount,
      level1_error_codes: rigor.level1.errorCounts,
      p3_score: rigor.dimensions.P3.score,
      p4_score: rigor.dimensions.P4.score,
      valid_dossiers: rigor.prior_art_state.dossiers_found,
      prior_art_cap_required: rigor.prior_art_state.cap_required,
      prior_art_cap_reasons: rigor.prior_art_state.cap_reasons,
      saved_report: savedRigor,
    },
    ids: {
      references: ids.count,
      unverified: ids.unverified,
      valid_dossiers: ids.dossierCount,
    },
    drawings: {
      figures: legend.briefDescription.length,
      numerals: legend.entries.length,
      legend_flags: legend.flags.length,
    },
    filing: {
      go_no_go: normalizedGoNoGo(filing.goNoGo),
      blocked_gates: filing.gates.filter((gate) => gate.status === "block").map((gate) => gate.name),
      warning_gates: filing.gates.filter((gate) => gate.status === "warn").map((gate) => gate.name),
      stale_saved_package: filing.gates.some((gate) => gate.name === "assembled-package-freshness" && gate.status === "block"),
    },
    privacy: {
      canonical_input_files: fingerprint.file_count,
      unsafe_linked_input_paths: fingerprint.unsafe_paths.length,
      aggregate_only: true,
    },
    orchestration: {
      schema: runStatus.schema,
      runlog_ok: runStatus.runlog_ok,
      runlog_error_count: runStatus.runlog_errors.length,
      steps: runStatus.steps.length,
      completed: runStatus.steps.filter((step) => step.completion.status === "completed").length,
      pending: runStatus.steps.filter((step) => step.completion.status === "pending").length,
      stale: runStatus.steps.filter((step) => step.completion.status === "stale").length,
      failed: runStatus.steps.filter((step) => step.completion.status === "failed").length,
      pending_required_checkpoints: runStatus.pending_checkpoints.length,
    },
  };
  result.oracle = oracle
    ? checkAggregateOracle(result, oracle, fingerprint.sha256)
    : {
        schema: "apa-external-matter-oracle-check-v1",
        checked: false,
        ok: null,
        mismatches: [],
        canonical_digest_emitted: false,
      };
  return result;
}

function parseArgs(argv) {
  const args = { expect: "any", json: false, require: false, domains: [], supports: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--matter") args.matter = argv[++i];
    else if (arg === "--now") args.now = argv[++i];
    else if (arg === "--expect") args.expect = String(argv[++i] || "").toLowerCase();
    else if (arg === "--domain") args.domains.push(String(argv[++i] || ""));
    else if (arg === "--support") args.supports.push(String(argv[++i] || ""));
    else if (arg === "--oracle") args.oracle = String(argv[++i] || "");
    else if (arg === "--json") args.json = true;
    else if (arg === "--require") args.require = true;
    else if (arg === "-h" || arg === "--help") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!["any", "go", "no-go"].includes(args.expect)) {
    throw new Error("--expect must be any, go, or no-go");
  }
  return args;
}

function readAggregateOracle(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("aggregate oracle could not be read as JSON");
  }
}

function humanSummary(result, expectation, ok) {
  const lines = [
    `external matter verification: ${ok ? "MATCH" : "MISMATCH"} (expected ${expectation}; actual ${result.filing.go_no_go})`,
    `  mechanical: ${result.mechanical.errors} error(s), ${result.mechanical.warnings} warning(s)`,
    `  graph: ${result.graph.nodes} nodes, ${result.graph.edges} edges, ${result.graph.unresolved_edges} unresolved`,
    `  rigor: Level-1 ${result.rigor.level1_passed ? "passed" : "failed"}; P4=${result.rigor.p4_score}; valid dossiers=${result.rigor.valid_dossiers}`,
    `  IDS: ${result.ids.references} reference(s), ${result.ids.unverified} unverified`,
    `  filing: ${result.filing.go_no_go}; blocked gates=${result.filing.blocked_gates.join(", ") || "none"}`,
    `  orchestration: ${result.orchestration.steps} step(s); ${result.orchestration.pending} pending; ${result.orchestration.stale} stale`,
    `  oracle: ${result.oracle.checked ? result.oracle.ok ? "matched" : `mismatch (${result.oracle.mismatches.join("; ")})` : "not configured"}`,
    `  privacy: aggregate-only; ${result.privacy.canonical_input_files} canonical input file(s); unsafe links=${result.privacy.unsafe_linked_input_paths}`,
  ];
  return lines.join("\n");
}

export function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
  if (args.help) {
    console.log("usage: node scripts/verify-external-matter.mjs [--matter <dir>] [--now <iso>] [--expect any|go|no-go] [--domain <id>] [--support <id>] [--oracle <json>] [--json] [--require]");
    console.log("       paths may instead be supplied in APA_EXTERNAL_MATTER and APA_EXTERNAL_ORACLE; output is aggregate-only and read-only");
    return 0;
  }

  const matter = args.matter || env.APA_EXTERNAL_MATTER;
  if (!matter) {
    if (args.require) {
      console.error("error: external matter path required via --matter or APA_EXTERNAL_MATTER");
      return 2;
    }
    const skipped = { schema: "apa-external-matter-verification-v2", skipped: true, reason: "no external matter configured" };
    if (args.json) console.log(JSON.stringify(skipped, null, 2));
    else console.log("external matter verification: SKIPPED (set APA_EXTERNAL_MATTER or pass --matter)");
    return 0;
  }

  try {
    const oraclePath = args.oracle || env.APA_EXTERNAL_ORACLE;
    const oracle = oraclePath ? readAggregateOracle(oraclePath) : null;
    const result = verifyExternalMatter(matter, {
      now: args.now || new Date().toISOString(),
      domains: args.domains.filter(Boolean),
      supports: args.supports.filter(Boolean),
      oracle,
    });
    const expected = args.expect === "any" ? null : args.expect === "go" ? "GO" : "NO-GO";
    const expectationMatches = expected === null || result.filing.go_no_go === expected;
    const privacySafe = result.privacy.unsafe_linked_input_paths === 0;
    const oracleMatches = !result.oracle.checked || result.oracle.ok;
    const ok = expectationMatches && privacySafe && oracleMatches;
    const output = { ...result, expectation: args.expect, ok };
    if (args.json) console.log(JSON.stringify(output, null, 2));
    else console.log(humanSummary(result, args.expect, ok));
    return ok ? 0 : 1;
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
