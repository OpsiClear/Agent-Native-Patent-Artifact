#!/usr/bin/env node
// prepack: copy the APA repo-root skills/ into this package's skills/ so the
// published tarball is self-contained. Each skill dir (SKILL.md + any
// references/ and other files) is copied recursively. Re-run any time to
// refresh the bundled copy deterministically.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const src = path.resolve(pkgRoot, "..", "..", "skills");
const dst = path.join(pkgRoot, "skills");

if (!fs.existsSync(src)) {
  console.error(`[apa-skills:bundle] source not found: ${src}`);
  process.exit(1);
}

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const a = path.join(s, e.name);
    const b = path.join(d, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

// Refresh the bundle for determinism.
fs.rmSync(dst, { recursive: true, force: true });

let count = 0;
fs.mkdirSync(dst, { recursive: true });
for (const e of fs.readdirSync(src, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const skillMd = path.join(src, e.name, "SKILL.md");
  if (!fs.existsSync(skillMd)) continue;
  copyDir(path.join(src, e.name), path.join(dst, e.name));
  count++;
}

console.log(`[apa-skills:bundle] bundled ${count} skill(s) from ${src} -> ${dst}`);
