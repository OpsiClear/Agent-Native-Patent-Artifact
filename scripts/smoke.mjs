#!/usr/bin/env node
/**
 * Cross-platform smoke checks for the package CLIs. Keep this offline and dependency-free.
 * These checks are intentionally broader than `npm test`: they exercise the commands as users run them.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

function run(label, args) {
  try {
    execFileSync(node, args, { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    process.stderr.write(`failed - ${label}\n`);
    if (e.stdout) process.stderr.write(String(e.stdout));
    if (e.stderr) process.stderr.write(String(e.stderr));
    throw e;
  }
  console.log(`ok - ${label}`);
}

const tmp = mkdtempSync(join(tmpdir(), "apa-smoke-"));
const minimalMatter = join(tmp, "minimal-patent-artifact");
const manifestOut = join(tmp, "minimal-manifest.json");
const claimsReportOut = join(tmp, "claims_report.json");
cpSync(join(ROOT, "examples", "minimal-patent-artifact"), minimalMatter, { recursive: true });

run("validate minimal as json", ["packages/apa-validate/validate.mjs", minimalMatter, "--json"]);
run("validate full lifecycle", ["packages/apa-validate/validate.mjs", "examples/full-lifecycle-artifact"]);
run("build viewer manifest", ["packages/apa-viewer/build_manifest.mjs", minimalMatter, "--out", manifestOut]);
run("eval mock", ["packages/apa-eval/cli.mjs", "--matter", minimalMatter, "--mock", "--json"]);
run("scaffold report schema", ["packages/apa-reports/cli.mjs", "scaffold", "claims", "--matter", minimalMatter, "--out", claimsReportOut]);
run("check report schema", ["packages/apa-reports/cli.mjs", "check", claimsReportOut, "--kind", "claims"]);
run("skillgraph check", ["packages/apa-skillgraph/cli.mjs", "check"]);
run("apa-run plan", ["packages/apa-run/cli.mjs", "plan", "--matter", minimalMatter, "--domain", "software", "--json"]);
run("apa-bench mock", ["packages/apa-bench/cli.mjs", "--mock", "--json"]);
run("figure gallery quality", [
  "packages/apa-figure/cli.mjs",
  "review-dir",
  "examples/drawing-quality-gallery/src/drawing_src",
  "--svg-dir",
  "examples/drawing-quality-gallery/evidence/drawings",
  "--min-score",
  "88",
]);

console.log("smoke checks passed");
