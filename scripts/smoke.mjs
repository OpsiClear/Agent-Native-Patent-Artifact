#!/usr/bin/env node
/**
 * Cross-platform smoke checks for the package CLIs. Keep this offline and dependency-free.
 * These checks are intentionally broader than `npm test`: they exercise the commands as users run them.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
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
const manifestOut = join(tmp, "minimal-manifest.json");

run("validate minimal as json", ["packages/apa-validate/validate.mjs", "examples/minimal-patent-artifact", "--json"]);
run("validate full lifecycle", ["packages/apa-validate/validate.mjs", "examples/full-lifecycle-artifact"]);
run("build viewer manifest", ["packages/apa-viewer/build_manifest.mjs", "examples/minimal-patent-artifact", "--out", manifestOut]);
run("eval mock", ["packages/apa-eval/cli.mjs", "--matter", "examples/minimal-patent-artifact", "--mock", "--json"]);
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
