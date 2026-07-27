#!/usr/bin/env node
// prepack: copy the APA repo-root skills/ into this package's skills/ so the
// published tarball is self-contained. Each skill dir (SKILL.md + any
// references/ and other files) is copied recursively. Re-run any time to
// refresh the bundled copy deterministically.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const a = path.join(s, e.name);
    const b = path.join(d, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
    else throw new Error(`refusing unsupported bundled skill entry: ${a}`);
  }
}

export function bundleSkills({ src, dst, packageRoot } = {}) {
  if (!src || !dst || !packageRoot) {
    throw new Error("bundleSkills requires src, dst, and packageRoot");
  }
  const source = path.resolve(src);
  const destination = path.resolve(dst);
  const root = path.resolve(packageRoot);
  if (!fs.existsSync(source)) throw new Error(`source not found: ${source}`);
  if (path.dirname(destination) !== root || path.basename(destination) !== "skills") {
    throw new Error(`bundle destination must be the direct "skills" child of packageRoot: ${root}`);
  }
  const overlaps = source === destination
    || source.startsWith(`${destination}${path.sep}`)
    || destination.startsWith(`${source}${path.sep}`);
  if (overlaps) {
    throw new Error("bundle source and destination must not overlap");
  }

  fs.mkdirSync(root, { recursive: true });
  const transactionRoot = fs.mkdtempSync(path.join(root, ".apa-skill-bundle-"));
  const staged = path.join(transactionRoot, "skills");
  const backup = path.join(transactionRoot, "previous");
  let count = 0;
  let hadPrevious = false;
  let installed = false;
  try {
    fs.mkdirSync(staged, { recursive: true });
    for (const e of fs.readdirSync(source, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const skillMd = path.join(source, e.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      copyDir(path.join(source, e.name), path.join(staged, e.name));
      count++;
    }
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
      hadPrevious = true;
    }
    fs.renameSync(staged, destination);
    installed = true;
    if (hadPrevious) fs.rmSync(backup, { recursive: true, force: true });
    return { count, src: source, dst: destination };
  } catch (error) {
    if (installed && fs.existsSync(destination)) {
      fs.rmSync(destination, { recursive: true, force: true });
    }
    if (hadPrevious && fs.existsSync(backup)) {
      fs.renameSync(backup, destination);
    }
    throw error;
  } finally {
    fs.rmSync(transactionRoot, { recursive: true, force: true });
  }
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgRoot = path.resolve(here, "..");
  const src = path.resolve(pkgRoot, "..", "..", "skills");
  const dst = path.join(pkgRoot, "skills");
  try {
    const result = bundleSkills({ src, dst, packageRoot: pkgRoot });
    console.log(`[apa-skills:bundle] bundled ${result.count} skill(s) from ${result.src} -> ${result.dst}`);
  } catch (err) {
    console.error(`[apa-skills:bundle] ${err?.message || err}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
