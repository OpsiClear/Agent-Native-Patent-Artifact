import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkArchitecture } from "./check-architecture.mjs";

function manifest(name) {
  return `${JSON.stringify({ name, version: "0.1.0", private: true, type: "module" }, null, 2)}\n`;
}

test("current production package graph respects inward boundaries", () => {
  const result = checkArchitecture();
  assert.deepEqual(result.errors, []);
  assert.ok(result.metrics.packages >= 26);
  assert.ok(result.metrics.dependency_edges > 0);
});

test("architecture checker detects package cycles and package-to-skill runtime imports", () => {
  const root = mkdtempSync(join(tmpdir(), "apa-architecture-"));
  try {
    for (const name of ["alpha", "beta"]) {
      mkdirSync(join(root, "packages", name), { recursive: true });
      writeFileSync(join(root, "packages", name, "package.json"), manifest(`@test/${name}`));
    }
    mkdirSync(join(root, "skills", "sample"), { recursive: true });
    writeFileSync(join(root, "skills", "sample", "runtime.mjs"), "export const runtime = true;\n");
    writeFileSync(
      join(root, "packages", "alpha", "index.mjs"),
      'import "../beta/index.mjs";\nimport "../../skills/sample/runtime.mjs";\n',
    );
    writeFileSync(join(root, "packages", "beta", "index.mjs"), 'import "../alpha/index.mjs";\n');
    const result = checkArchitecture({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === "PACKAGE_IMPORTS_SKILL"));
    assert.ok(result.errors.some((error) => error.code === "PACKAGE_CYCLE"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
