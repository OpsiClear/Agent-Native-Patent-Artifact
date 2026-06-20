#!/usr/bin/env node
/**
 * Syntax-check every first-party JS/ESM file with Node's parser.
 * Skips submodules and generated/transient directories.
 */

import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".autotune", "dist", "node_modules"]);
const SKIP_PREFIXES = [
  "third_party/Agent-Native-Research-Artifact/",
  "third_party/gstack/",
];

function fwd(p) {
  return p.split("\\").join("/");
}

function shouldSkip(path) {
  const rel = fwd(relative(ROOT, path));
  return SKIP_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !shouldSkip(path + "/")) walk(path, files);
    } else if ([".js", ".mjs"].includes(extname(entry.name)) && !shouldSkip(path)) {
      files.push(path);
    }
  }
  return files;
}

let checked = 0;
for (const file of walk(ROOT)) {
  if (!statSync(file).isFile()) continue;
  const res = spawnSync(process.execPath, ["--check", file], { cwd: ROOT, encoding: "utf8" });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout || `syntax check failed: ${file}\n`);
    process.exit(res.status || 1);
  }
  checked += 1;
}

console.log(`syntax check passed (${checked} file(s))`);
