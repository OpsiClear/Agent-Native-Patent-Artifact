import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeLandscape, buildSearchDossier, writeSearchDossier } from "../writers.mjs";
import { validateMatter } from "../../apa-validate/validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

const REFS = [
  { source: "mock", docNumber: "US-9000002-B1", title: "Wicking self-watering container",
    abstract: "A reservoir feeds a wick.", date: "2015-02-03", cpc: ["A01G27/04"],
    url: "https://patents.google.com/patent/US9000002B1", snippet: "a reservoir feeds a wick" },
  { source: "mock", docNumber: "US-8000003-A1", title: "Irrigation timer",
    abstract: "An electronic timer controlling a solenoid valve.", date: "2012-08-21",
    url: "https://patents.google.com/patent/US8000003A1", snippet: "an electronic timer" },
];

test("writeLandscape appends valid PA## blocks and keeps the matter mechanically valid", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-writers-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    const before = validateMatter(dir);
    assert.equal(before.errors.length, 0);

    const { assigned } = writeLandscape(dir, REFS);
    assert.deepEqual(assigned.map((a) => a.paId), ["PA02", "PA03"]);   // continues after existing PA01

    const priorArt = readFileSync(join(dir, "logic", "prior_art.md"), "utf8");
    assert.match(priorArt, /### PA02/);
    assert.match(priorArt, /### PA03/);
    assert.ok(existsSync(join(dir, "evidence", "prior_art", "pa02.md")));
    assert.ok(existsSync(join(dir, "logic", "reference_matrix.md")));
    assert.match(readFileSync(join(dir, "logic", "reference_matrix.md"), "utf8"), /Blocks/);

    // The appended blocks must parse and not introduce mechanical errors.
    const after = validateMatter(dir);
    assert.equal(after.errors.length, 0, JSON.stringify(after.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("search dossier records query hash, source summary, ranked refs, and unverified closest-art state", () => {
  const query = { keywords: ["reservoir", "float"], cpc: ["A01G27/00"], limit: 2 };
  const result = {
    verdict: { text: "reservoir float A01G27/00\n{}", high: [], medium: [] },
    perSource: [{ id: "mock", count: 2, rawCount: 3, notes: ["offline"] }],
    ranked: REFS.map((r, i) => ({ ...r, score: 10 - i })),
  };
  const dossier = buildSearchDossier({
    query,
    result,
    assigned: [{ paId: "PA02", docNumber: "US-9000002-B1", title: "Wicking self-watering container" }],
    limit: 2,
    generatedAt: "2026-06-20T00:00:00.000Z",
  });
  assert.equal(dossier.schema, "apa-search-dossier-v1");
  assert.match(dossier.query.serialized_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(dossier.sources.map((s) => s.source_id), ["mock"]);
  assert.equal(dossier.ranked_candidates.length, 2);
  assert.equal(dossier.closest_art_selection.human_verified, false);
  assert.match(dossier.caveats.join("\n"), /not a complete search/);
});

test("writeSearchDossier writes a timestamped JSON dossier under evidence/prior_art", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-dossier-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    const { path, dossier } = writeSearchDossier(dir, {
      query: { keywords: ["reservoir"], cpc: [], limit: 1 },
      result: { verdict: { text: "reservoir\n{}", high: [], medium: [] }, perSource: [], ranked: REFS.slice(0, 1) },
      assigned: [],
      limit: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
    });
    assert.ok(existsSync(path));
    assert.equal(JSON.parse(readFileSync(path, "utf8")).schema, dossier.schema);
    assert.match(path.replace(/\\/g, "/"), /evidence\/prior_art\/search-dossier-2026-06-20T00-00-00-000Z\.json$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
