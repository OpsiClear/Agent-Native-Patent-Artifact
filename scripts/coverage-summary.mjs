#!/usr/bin/env node
/**
 * Zero-dependency V8 coverage summary for first-party JS/MJS files.
 * Runs the offline test suite with NODE_V8_COVERAGE and summarizes function coverage.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const TEST_ARGS = [
  "--test",
  "packages/**/*.test.mjs",
  "lib/**/*.test.mjs",
  "scripts/**/*.test.mjs",
  "hosts/**/*.test.mjs",
  "skills/**/*.test.mjs",
  "test/**/*.test.mjs",
];
const SKIP_PREFIXES = [
  "benchmarks/fixtures/",
  "third_party/Agent-Native-Research-Artifact/",
  "third_party/gstack/",
  "node_modules/",
  "packages/apa-skills/skills/",
  "dist/",
  ".git/",
  ".autotune/",
];
const COVERAGE_EXCLUSIONS = new Map([
  ["packages/apa-viewer/viewer.js", "browser-only; exercised by test/viewer-browser.test.mjs in Chrome/Edge/Chromium"],
  ["scripts/check-package-isolation.mjs", "test/build controller that recursively launches package probes"],
  ["scripts/check-syntax.mjs", "build controller"],
  ["scripts/coverage-summary.mjs", "coverage controller cannot measure itself"],
  ["scripts/setup.mjs", "interactive workspace setup entrypoint"],
  ["scripts/smoke.mjs", "build controller exercised separately by npm run smoke"],
]);
const MIN_FILE_LOAD_PERCENT = 95;
const MIN_FUNCTION_PERCENT = 90;

function fwd(p) {
  return String(p).split("\\").join("/");
}

function isFirstPartyFile(file) {
  const rel = fwd(relative(ROOT, file));
  if (rel.startsWith("..") || rel === "") return false;
  if (COVERAGE_EXCLUSIONS.has(rel)) return false;
  if (![".js", ".mjs"].includes(extname(file))) return false;
  if (rel.endsWith(".test.mjs") || rel.endsWith(".test.js") || rel.startsWith("test/") || rel.includes("/test/")) return false;
  return !SKIP_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function listCoverageFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listCoverageFiles(path));
    else if (ent.isFile() && ent.name.endsWith(".json")) out.push(path);
  }
  return out;
}

function listFirstPartyFiles(dir = ROOT) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    const rel = fwd(relative(ROOT, file));
    if (entry.isDirectory()) {
      if (!SKIP_PREFIXES.some((prefix) => `${rel}/`.startsWith(prefix))) {
        out.push(...listFirstPartyFiles(file));
      }
    } else if (entry.isFile() && isFirstPartyFile(file)) {
      out.push(rel);
    }
  }
  return out.sort();
}

function isTopLevelFunction(fn, sourceLength) {
  return fn.functionName === "" &&
    fn.ranges.length === 1 &&
    fn.ranges[0].startOffset === 0 &&
    fn.ranges[0].endOffset >= Math.max(0, sourceLength - 1);
}

function mergeCoverage(coverageDir) {
  const byFile = new Map();
  for (const file of listCoverageFiles(coverageDir)) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    for (const script of Array.isArray(data.result) ? data.result : []) {
      if (!script.url || !script.url.startsWith("file://")) continue;
      const path = fileURLToPath(script.url);
      if (!isFirstPartyFile(path)) continue;
      const rel = fwd(relative(ROOT, path));
      const source = readFileSync(path, "utf8");
      const entry = byFile.get(rel) || { rel, functions: new Map() };
      for (const fn of Array.isArray(script.functions) ? script.functions : []) {
        if (isTopLevelFunction(fn, source.length)) continue;
        const first = fn.ranges[0] || { startOffset: 0, endOffset: 0 };
        const key = `${fn.functionName || ""}:${first.startOffset}:${first.endOffset}`;
        const existing = entry.functions.get(key) || { name: fn.functionName || "(anonymous)", covered: false };
        const hit = fn.ranges.some((r) => r.count > 0);
        existing.covered = existing.covered || hit;
        entry.functions.set(key, existing);
      }
      byFile.set(rel, entry);
    }
  }
  const entries = [...byFile.values()]
    .map((e) => {
      const functions = [...e.functions.values()];
      const uncovered = functions.filter((fn) => !fn.covered).slice(0, 5).map((fn) => fn.name);
      return {
        rel: e.rel,
        total: functions.length,
        covered: functions.filter((fn) => fn.covered).length,
        uncovered,
      };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => a.rel.localeCompare(b.rel));
  return { entries, loadedFiles: [...byFile.keys()].sort() };
}

function percent(covered, total) {
  return total ? Math.round((covered / total) * 1000) / 10 : 100;
}

function summarize({ entries, loadedFiles }, firstPartyFiles) {
  const total = entries.reduce((n, e) => n + e.total, 0);
  const covered = entries.reduce((n, e) => n + e.covered, 0);
  const loaded = new Set(loadedFiles);
  const loadedFirstParty = firstPartyFiles.filter((file) => loaded.has(file));
  const unloaded = firstPartyFiles.filter((file) => !loaded.has(file));
  const weakest = entries
    .slice()
    .sort((a, b) => percent(a.covered, a.total) - percent(b.covered, b.total) || b.total - a.total)
    .slice(0, 12);
  return {
    total,
    covered,
    loadedFirstParty,
    unloaded,
    weakest,
    fileLoadPercent: percent(loadedFirstParty.length, firstPartyFiles.length),
    functionPercent: percent(covered, total),
  };
}

function render(summary, firstPartyFiles) {
  const {
    total,
    covered,
    loadedFirstParty,
    unloaded,
    weakest,
    fileLoadPercent,
    functionPercent,
  } = summary;
  const lines = [];
  lines.push(`# APA Coverage Summary`);
  lines.push("");
  lines.push(`First-party files loaded by tests: ${loadedFirstParty.length}/${firstPartyFiles.length} (${fileLoadPercent}%; blocking floor ${MIN_FILE_LOAD_PERCENT}%).`);
  lines.push(`Function coverage among loaded files with functions: ${covered}/${total} (${functionPercent}%; blocking floor ${MIN_FUNCTION_PERCENT}%).`);
  if (unloaded.length) {
    const shown = unloaded.slice(0, 12).map((file) => `\`${file}\``).join(", ");
    lines.push(`Unloaded production files (${unloaded.length}): ${shown}${unloaded.length > 12 ? ", ..." : ""}.`);
  }
  lines.push(`Intentional exclusions (${COVERAGE_EXCLUSIONS.size}): ${[...COVERAGE_EXCLUSIONS.entries()].map(([file, reason]) => `\`${file}\` (${reason})`).join("; ")}.`);
  lines.push("");
  lines.push(`| File | Functions | Covered |`);
  lines.push(`|---|---:|---:|`);
  for (const e of weakest) {
    const note = e.uncovered.length ? `; uncalled: ${e.uncovered.join(", ")}` : "";
    lines.push(`| \`${e.rel}\` | ${e.covered}/${e.total} | ${percent(e.covered, e.total)}%${note} |`);
  }
  return lines.join("\n");
}

const coverageDir = mkdtempSync(join(tmpdir(), "apa-coverage-"));
try {
  const res = spawnSync(process.execPath, TEST_ARGS, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_V8_COVERAGE: coverageDir },
  });
  if (res.status !== 0) process.exit(res.status || 1);
  const firstPartyFiles = listFirstPartyFiles();
  const summary = summarize(mergeCoverage(coverageDir), firstPartyFiles);
  const rendered = render(summary, firstPartyFiles);
  console.log(`\n${rendered}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${rendered}\n`);
  if (summary.fileLoadPercent < MIN_FILE_LOAD_PERCENT || summary.functionPercent < MIN_FUNCTION_PERCENT) {
    console.error(
      `coverage floor failed: file-load ${summary.fileLoadPercent}% (min ${MIN_FILE_LOAD_PERCENT}%), ` +
      `functions ${summary.functionPercent}% (min ${MIN_FUNCTION_PERCENT}%)`,
    );
    process.exitCode = 1;
  }
} finally {
  rmSync(coverageDir, { recursive: true, force: true });
}
