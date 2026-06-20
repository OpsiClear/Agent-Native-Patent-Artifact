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
const GALLERY_META = join(ROOT, "examples", "drawing-quality-gallery", "gallery.json");
const KNOWN_BAD_SRC = join(ROOT, "examples", "drawing-quality-gallery", "src", "known_bad");
const KNOWN_BAD_SVG = join(ROOT, "examples", "drawing-quality-gallery", "evidence", "known_bad");

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

test("drawing-quality gallery includes known-bad regression examples", () => {
  const meta = JSON.parse(readFileSync(GALLERY_META, "utf8"));
  assert.ok(Array.isArray(meta.known_bad_examples));
  assert.equal(meta.known_bad_examples.length, 3);

  const reviews = meta.known_bad_examples.map((example) => {
    const figDef = JSON.parse(readFileSync(join(KNOWN_BAD_SRC, example.file), "utf8"));
    const svg = example.svg
      ? readFileSync(join(KNOWN_BAD_SVG, example.svg), "utf8")
      : renderFigure(figDef);
    const review = reviewFigure(figDef, svg, { file: example.file });
    for (const code of example.expected_codes) {
      assert.ok(review.findings.some((f) => f.code === code), `${example.file} should flag ${code}`);
    }
    for (const f of review.findings) {
      assert.ok(f.sheet, `${example.file} finding has sheet`);
      assert.ok(f.figure, `${example.file} finding has figure`);
      assert.ok("bbox" in f, `${example.file} finding has bbox`);
      assert.ok(f.issue_type, `${example.file} finding has issue_type`);
      assert.ok(f.rule_reference, `${example.file} finding has rule_reference`);
      assert.match(f.measured_or_visual, /^(measured|visual)$/);
    }
    return review;
  });

  const report = aggregateReviews(reviews);
  assert.ok(report.blocking_count > 0);
  assert.ok(report.fix_before_filing_count > 0);
  assert.ok(report.findings.some((f) => Array.isArray(f.bbox)), "known-bad report contains located findings");
});
