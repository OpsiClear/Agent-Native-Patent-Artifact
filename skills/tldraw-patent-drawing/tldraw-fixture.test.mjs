import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectSvgSafety } from "../../packages/apa-figure/svg-safety.mjs";
import { extractSvgNumerals } from "../../packages/apa-figure/upgrade-report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

test("tldraw-style snapshot and exported SVG preserve numerals through the APA safety boundary", () => {
  const snapshot = JSON.parse(readFileSync(join(FIXTURES, "minimal-snapshot.json"), "utf8"));
  const svg = readFileSync(join(FIXTURES, "minimal-export.svg"), "utf8");
  const unsafeSvg = readFileSync(join(FIXTURES, "unsafe-foreign-object.svg"), "utf8");

  assert.equal(snapshot.schema, "apa-tldraw-snapshot-fixture-v1");
  assert.ok(snapshot.shapes.some((shape) => shape.type === "arrow"));
  const expectedNumerals = snapshot.shapes
    .map((shape) => shape.meta?.referenceNumeral)
    .filter(Boolean)
    .sort();
  const exportedNumerals = extractSvgNumerals(svg).map((record) => record.numeral).sort();
  assert.deepEqual(exportedNumerals, expectedNumerals);
  for (const shape of snapshot.shapes.filter((item) => item.props?.text)) {
    assert.match(svg, new RegExp(`>${shape.props.text}<`));
  }

  assert.equal(inspectSvgSafety(svg).safe, true);
  const unsafe = inspectSvgSafety(unsafeSvg);
  assert.equal(unsafe.safe, false);
  assert.ok(unsafe.issues.some((item) =>
    item.code === "SVG_ACTIVE_TAG" || item.code === "SVG_ELEMENT_NOT_ALLOWED"
  ));
});
