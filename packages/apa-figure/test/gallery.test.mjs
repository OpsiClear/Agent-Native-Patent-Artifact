import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFigure } from "../render.mjs";
import { aggregateReviews, reviewFigure } from "../quality.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const GALLERY_SRC = join(ROOT, "examples", "drawing-quality-gallery", "src", "drawing_src");

test("drawing-quality gallery has eight specs that pass deterministic review", () => {
  const files = readdirSync(GALLERY_SRC).filter((f) => f.endsWith(".json")).sort();
  assert.equal(files.length, 8);
  const reviews = files.map((file) => {
    const figDef = JSON.parse(readFileSync(join(GALLERY_SRC, file), "utf8"));
    return reviewFigure(figDef, renderFigure(figDef), { file });
  });
  const report = aggregateReviews(reviews);
  assert.equal(report.blocking_count, 0, JSON.stringify(report, null, 2));
  assert.equal(report.fix_before_filing_count, 0, JSON.stringify(report, null, 2));
  assert.ok(report.min_score >= 88, JSON.stringify(report, null, 2));
});
