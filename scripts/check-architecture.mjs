#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_ROOT = join(ROOT, "packages");
const APP_ROOT = join(ROOT, "apps");
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*["']([^"']+)["']/g;

export function checkArchitecture({ root = ROOT } = {}) {
  const errors = [];
  const packageRoot = join(root, "packages");
  const appRoot = join(root, "apps");
  const packageDirs = directDirectories(packageRoot);
  const appDirs = directDirectories(appRoot);
  const manifestNames = new Map();
  const canonicalSkillSchema = join(root, "packages", "apa-core", "schemas", "skill.schema.json");
  const legacySkillSchema = join(root, "schemas", "skill.schema.json");
  if (existsSync(canonicalSkillSchema) && existsSync(legacySkillSchema)) {
    const canonical = JSON.stringify(JSON.parse(readFileSync(canonicalSkillSchema, "utf8")));
    const legacy = JSON.stringify(JSON.parse(readFileSync(legacySkillSchema, "utf8")));
    if (canonical !== legacy) {
      errors.push({
        code: "SKILL_SCHEMA_DRIFT",
        path: "schemas/skill.schema.json",
        message: "legacy skill schema differs from the core-owned contract",
      });
    }
  }

  for (const dir of [...packageDirs, ...appDirs]) {
    const manifestPath = join(dir, "package.json");
    const rel = posixRelative(root, dir);
    if (!existsSync(manifestPath)) {
      errors.push({ code: "MANIFEST_MISSING", path: rel, message: "workspace directory has no package.json" });
      continue;
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!manifest.name) {
        errors.push({ code: "PACKAGE_NAME_MISSING", path: `${rel}/package.json`, message: "package name is required" });
      } else if (manifestNames.has(manifest.name)) {
        errors.push({
          code: "PACKAGE_NAME_DUPLICATE",
          path: `${rel}/package.json`,
          message: `package name '${manifest.name}' is also used by ${manifestNames.get(manifest.name)}`,
        });
      } else {
        manifestNames.set(manifest.name, rel);
      }
      if (manifest.type !== "module") {
        errors.push({ code: "PACKAGE_TYPE", path: `${rel}/package.json`, message: "workspace packages must use ESM" });
      }
    } catch (error) {
      errors.push({ code: "MANIFEST_INVALID", path: `${rel}/package.json`, message: error.message });
    }
  }

  const edges = new Map(packageDirs.map((dir) => [dirName(dir), new Set()]));
  const runtimeFiles = [
    ...packageDirs.flatMap(runtimeSourceFiles),
    ...appDirs.flatMap(runtimeSourceFiles),
  ];
  for (const file of runtimeFiles) {
    const sourceRel = posixRelative(root, file);
    const sourcePackage = workspaceUnit(root, file);
    const text = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(text)) {
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(file), specifier);
      const targetRel = posixRelative(root, target);
      if (sourceRel.startsWith("packages/") && targetRel.startsWith("skills/")) {
        errors.push({
          code: "PACKAGE_IMPORTS_SKILL",
          path: sourceRel,
          message: `production package imports executable skill code: ${specifier}`,
        });
      }
      if (sourceRel.startsWith("packages/") && targetRel.startsWith("scripts/")) {
        errors.push({
          code: "PACKAGE_IMPORTS_SCRIPT",
          path: sourceRel,
          message: `production package imports root script code: ${specifier}`,
        });
      }
      if (sourceRel.startsWith("packages/") && targetRel.startsWith("apps/")) {
        errors.push({
          code: "PACKAGE_IMPORTS_APP",
          path: sourceRel,
          message: `inward package imports outward application code: ${specifier}`,
        });
      }
      const targetPackage = workspaceUnit(root, target);
      if (
        sourcePackage?.kind === "package"
        && targetPackage?.kind === "package"
        && sourcePackage.name !== targetPackage.name
      ) {
        edges.get(sourcePackage.name)?.add(targetPackage.name);
      }
    }
  }

  for (const imported of edges.get("apa-core") || []) {
    errors.push({
      code: "CORE_IMPORTS_OUTWARD",
      path: "packages/apa-core",
      message: `core must not import package '${imported}'`,
    });
  }
  for (const cycle of dependencyCycles(edges)) {
    errors.push({
      code: "PACKAGE_CYCLE",
      path: "packages",
      message: `production dependency cycle: ${cycle.join(" -> ")}`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    metrics: {
      packages: packageDirs.length,
      apps: appDirs.length,
      runtime_files: runtimeFiles.length,
      dependency_edges: [...edges.values()].reduce((sum, targets) => sum + targets.size, 0),
    },
  };
}

function directDirectories(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort();
}

function runtimeSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["test", "tests", "node_modules", "skills"].includes(entry.name)) walk(path);
      } else if (
        entry.isFile()
        && /\.(?:mjs|js)$/.test(entry.name)
        && !/\.test\.(?:mjs|js)$/.test(entry.name)
      ) {
        out.push(path);
      }
    }
  };
  walk(root);
  return out;
}

function importSpecifiers(text) {
  const out = new Set();
  for (const match of String(text).matchAll(IMPORT_RE)) out.add(match[1]);
  for (const match of String(text).matchAll(SIDE_EFFECT_IMPORT_RE)) out.add(match[1]);
  return [...out];
}

function workspaceUnit(root, path) {
  const rel = posixRelative(root, path).split("/");
  if ((rel[0] === "packages" || rel[0] === "apps") && rel[1]) {
    return { kind: rel[0] === "packages" ? "package" : "app", name: rel[1] };
  }
  return null;
}

function dependencyCycles(edges) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const canonical = new Set();

  const visit = (node) => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      const body = cycle.slice(0, -1);
      const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
      const key = rotations.map((items) => items.join("->")).sort()[0];
      if (!canonical.has(key)) {
        canonical.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const target of edges.get(node) || []) visit(target);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of [...edges.keys()].sort()) visit(node);
  return cycles;
}

function dirName(path) {
  return path.replace(/\\/g, "/").split("/").at(-1);
}

function posixRelative(root, path) {
  return relative(root, path).replace(/\\/g, "/");
}

function main() {
  const result = checkArchitecture();
  if (result.ok) {
    console.log(
      `architecture check passed: ${result.metrics.packages} packages, `
      + `${result.metrics.apps} apps, ${result.metrics.dependency_edges} dependency edges`,
    );
    return 0;
  }
  for (const error of result.errors) {
    console.error(`${error.code} ${error.path}: ${error.message}`);
  }
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
