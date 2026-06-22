import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkSourceRegistry,
  compareIdSets,
  parseSourceIds,
  sourceRegistryIds,
  validateSourceRegistryShape,
} from "./check-source-registry.mjs";

test("source registry docs and generated skill references stay synchronized", () => {
  const result = checkSourceRegistry();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.sources, [
    "patentsview",
    "crossref",
    "arxiv",
    "openalex",
    "mock",
    "fixture",
    "pqai",
    "epo-ops",
    "google-bigquery",
    "uspto-pps",
    "google-patents-ui",
  ]);
});

test("parseSourceIds extracts markdown table source identifiers once", () => {
  const ids = parseSourceIds([
    "| source_id | Access mode |",
    "|---|---|",
    "| `patentsview` | API |",
    "| `openalex` | API |",
    "| `openalex` | duplicate row ignored by parser |",
  ].join("\n"));
  assert.deepEqual(ids, ["patentsview", "openalex"]);
});

test("compareIdSets reports missing and unexpected source ids", () => {
  assert.deepEqual(compareIdSets("registry", ["a", "b"], ["b", "c"]), [
    "registry: missing source_id 'a'",
    "registry: unexpected source_id 'c'",
  ]);
});

test("source registry shape rejects unsafe defaults and missing modules", () => {
  const errors = validateSourceRegistryShape({
    root: process.cwd(),
    registry: [
      { id: "valid-source", module: "./does-not-exist.mjs", accessMode: "api", enabledByDefault: false, status: "implemented" },
      { id: "bad source", module: null, accessMode: "api", enabledByDefault: false, status: "planned" },
      { id: "ui-auto", module: null, accessMode: "ui-restricted", enabledByDefault: true, status: "human-handoff" },
      { id: "no-module", module: null, accessMode: "api", enabledByDefault: false, status: "implemented" },
    ],
  });
  assert.ok(errors.some((e) => e.includes("valid-source: module does not exist")));
  assert.ok(errors.some((e) => e.includes("invalid source id 'bad source'")));
  assert.ok(errors.some((e) => e.includes("ui-auto: ui-restricted source cannot be enabled by default")));
  assert.ok(errors.some((e) => e.includes("no-module: implemented source must declare a module")));
  assert.ok(errors.some((e) => e.includes("missing referenceUrl")));
  assert.ok(errors.some((e) => e.includes("lastVerifiedAt must be YYYY-MM-DD")));
  assert.ok(errors.some((e) => e.includes("invalid automationPolicy")));
});

test("sourceRegistryIds reflects executable registry order", () => {
  assert.equal(sourceRegistryIds()[0], "patentsview");
  assert.ok(sourceRegistryIds().includes("openalex"));
});
