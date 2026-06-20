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
  "test/**/*.test.mjs",
];
const SKIP_PREFIXES = [
  "third_party/Agent-Native-Research-Artifact/",
  "third_party/gstack/",
  "node_modules/",
  "dist/",
  ".autotune/",
];

function fwd(p) {
  return String(p).split("\\").join("/");
}

function isFirstPartyFile(file) {
  const rel = fwd(relative(ROOT, file));
  if (rel.startsWith("..") || rel === "") return false;
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
  return [...byFile.values()]
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
}

function percent(covered, total) {
  return total ? Math.round((covered / total) * 1000) / 10 : 100;
}

function render(entries) {
  const total = entries.reduce((n, e) => n + e.total, 0);
  const covered = entries.reduce((n, e) => n + e.covered, 0);
  const weakest = entries
    .slice()
    .sort((a, b) => percent(a.covered, a.total) - percent(b.covered, b.total) || b.total - a.total)
    .slice(0, 12);
  const lines = [];
  lines.push(`# APA Coverage Summary`);
  lines.push("");
  lines.push(`Function coverage: ${covered}/${total} (${percent(covered, total)}%) across ${entries.length} first-party file(s).`);
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
  const summary = render(mergeCoverage(coverageDir));
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
} finally {
  rmSync(coverageDir, { recursive: true, force: true });
}
