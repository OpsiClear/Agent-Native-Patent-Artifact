#!/usr/bin/env node
/**
 * Deterministic source-registry drift checker.
 *
 * `packages/apa-search/sources/index.mjs` is the executable registry. `docs/source-registry.md` is
 * the canonical human-facing table, and every generated skill gets a one-level
 * `references/source-registry.md` copy. This checker fails when those source IDs diverge.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCE_REGISTRY } from "../packages/apa-search/sources/index.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DOCS_REGISTRY = join(ROOT, "docs", "source-registry.md");
export const SKILLS_DIR = join(ROOT, "skills");
export const SOURCE_DIR = join(ROOT, "packages", "apa-search", "sources");

const SOURCE_ID_RE = /\|\s*`([^`]+)`\s*\|/g;
const REQUIRED_DOC_COLUMNS = [
  "source_id",
  "Provider / name",
  "Official",
  "Access mode",
  "Enabled by default",
  "Query payload class",
  "Returns full text?",
  "Human verification required",
  "Notes",
];

export function parseSourceIds(markdown) {
  const ids = [];
  const seen = new Set();
  for (const match of String(markdown || "").matchAll(SOURCE_ID_RE)) {
    const id = match[1].trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function sourceRegistryIds(registry = SOURCE_REGISTRY) {
  return registry.map((s) => s.id);
}

export function compareIdSets(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((id) => !actualSet.has(id));
  const extra = actual.filter((id) => !expectedSet.has(id));
  return [
    ...missing.map((id) => `${label}: missing source_id '${id}'`),
    ...extra.map((id) => `${label}: unexpected source_id '${id}'`),
  ];
}

export function validateSourceRegistryShape({ root = ROOT, registry = SOURCE_REGISTRY } = {}) {
  const errors = [];
  const ids = registry.map((s) => s.id);
  const seen = new Set();
  for (const source of registry) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(source.id || ""))) {
      errors.push(`SOURCE_REGISTRY: invalid source id '${source.id}'`);
    }
    if (seen.has(source.id)) errors.push(`SOURCE_REGISTRY: duplicate source id '${source.id}'`);
    seen.add(source.id);
    if (!["api", "dataset", "ui-restricted"].includes(source.accessMode)) {
      errors.push(`${source.id}: invalid accessMode '${source.accessMode}'`);
    }
    if (source.enabledByDefault && source.accessMode === "ui-restricted") {
      errors.push(`${source.id}: ui-restricted source cannot be enabled by default`);
    }
    if (source.module) {
      const abs = join(root, "packages", "apa-search", "sources", source.module.replace(/^\.\//, ""));
      if (!existsSync(abs)) errors.push(`${source.id}: module does not exist: ${normalize(abs)}`);
      if (source.status !== "implemented") errors.push(`${source.id}: module-bearing source must have status implemented`);
    } else if (source.status === "implemented") {
      errors.push(`${source.id}: implemented source must declare a module`);
    }
  }
  if (ids.length !== seen.size) errors.push("SOURCE_REGISTRY: duplicate ids detected");
  return errors;
}

export function validateDocsRegistry({ docsPath = DOCS_REGISTRY, registry = SOURCE_REGISTRY } = {}) {
  const errors = [];
  if (!existsSync(docsPath)) return [`missing docs source registry: ${normalize(docsPath)}`];
  const text = readFileSync(docsPath, "utf8");
  const headerLine = text.split(/\r?\n/).find((line) => line.includes("| source_id |"));
  if (!headerLine) {
    errors.push("docs/source-registry.md: missing source table header");
  } else {
    for (const col of REQUIRED_DOC_COLUMNS) {
      if (!headerLine.includes(col)) errors.push(`docs/source-registry.md: missing column '${col}'`);
    }
  }
  errors.push(...compareIdSets("docs/source-registry.md", sourceRegistryIds(registry), parseSourceIds(text)));
  return errors;
}

export function discoverSkillSourceReferenceFiles(skillsDir = SKILLS_DIR) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, "references", "source-registry.md"))
    .filter((path) => existsSync(path))
    .sort();
}

export function validateGeneratedSkillReferences({ skillsDir = SKILLS_DIR, registry = SOURCE_REGISTRY } = {}) {
  const errors = [];
  const expected = sourceRegistryIds(registry);
  for (const path of discoverSkillSourceReferenceFiles(skillsDir)) {
    const text = readFileSync(path, "utf8");
    const rel = normalize(path).split(normalize(ROOT) + normalize("/")).pop() || path;
    if (!text.includes("Generated routing reference")) errors.push(`${rel}: missing generated-reference marker`);
    errors.push(...compareIdSets(rel, expected, parseSourceIds(text)));
  }
  return errors;
}

export function checkSourceRegistry(opts = {}) {
  const errors = [
    ...validateSourceRegistryShape(opts),
    ...validateDocsRegistry(opts),
    ...validateGeneratedSkillReferences(opts),
  ];
  return { ok: errors.length === 0, errors, sources: sourceRegistryIds(opts.registry || SOURCE_REGISTRY) };
}

function main() {
  const result = checkSourceRegistry();
  if (!result.ok) {
    for (const e of result.errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log(`source registry check passed (${result.sources.length} source(s))`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
