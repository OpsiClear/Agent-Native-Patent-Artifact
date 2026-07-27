import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFigure } from "../render.mjs";
import { aggregateReviews, reviewFigure } from "../quality.mjs";
import { composeDrawingSheetsFromDir } from "../sheets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const GALLERY_SRC = join(ROOT, "examples", "drawing-quality-gallery", "src", "drawing_src");
const GALLERY_META = join(ROOT, "examples", "drawing-quality-gallery", "gallery.json");
const KNOWN_BAD_SRC = join(ROOT, "examples", "drawing-quality-gallery", "src", "known_bad");
const KNOWN_BAD_SVG = join(ROOT, "examples", "drawing-quality-gallery", "evidence", "known_bad");
const GALLERY_SVG = join(ROOT, "examples", "drawing-quality-gallery", "evidence", "drawings");
const GALLERY_ASSEMBLED = join(ROOT, "examples", "drawing-quality-gallery", "assembled");

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

test("tracked gallery SVG, HTML, and screenshot artifacts are fresh and hash-bound", () => {
  const files = readdirSync(GALLERY_SRC).filter((file) => file.endsWith(".json")).sort();
  for (const file of files) {
    const figDef = JSON.parse(readFileSync(join(GALLERY_SRC, file), "utf8"));
    const expected = renderFigure(figDef);
    const actual = readFileSync(join(GALLERY_SVG, file.replace(/\.json$/, ".svg")), "utf8");
    assert.equal(actual, expected, `${file} tracked SVG is stale`);
  }

  const expectedHtml = composeDrawingSheetsFromDir(GALLERY_SVG, { title: "Drawing Quality Gallery" });
  const actualHtml = readFileSync(join(GALLERY_ASSEMBLED, "drawings.html"), "utf8");
  assert.equal(actualHtml, expectedHtml, "tracked gallery HTML is stale");

  const manifestPath = join(GALLERY_ASSEMBLED, "artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    const bytes = readFileSync(resolve(GALLERY_ASSEMBLED, relativePath));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath} does not match the artifact manifest`);
  }
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
