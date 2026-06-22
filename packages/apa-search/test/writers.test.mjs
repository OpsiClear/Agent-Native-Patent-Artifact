import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSearchDossier, idsVerificationStatus, updateClosestArtSelection, updateReferenceVerification, writeLandscape, writeSearchDossier } from "../writers.mjs";
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
    rawRecords: [
      REFS[0],
      { ...REFS[0], docNumber: "US 9,000,002 B1", title: "Duplicate richer record", assignee: "Garden Inc" },
      REFS[1],
    ],
    deduped: REFS,
    dedupe: {
      clusters: [{
        key: "US9000002B1",
        winner: { source_id: "mock", doc_number: "US-9000002-B1", title: "Wicking self-watering container" },
        members: [],
        rationale: "kept the record with the most populated fields; ties keep earliest source order",
      }],
      excludedResults: [{
        reason: "duplicate-doc-number",
        duplicate_of: "US-9000002-B1",
        doc_number: "US 9,000,002 B1",
      }],
    },
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
  assert.ok("query_parameters" in dossier.sources[0]);
  assert.equal(dossier.top_n.before_dedupe.length, 2);
  assert.equal(dossier.top_n.after_dedupe_before_ranking.length, 2);
  assert.equal(dossier.top_n.after_ranking.length, 2);
  assert.equal(dossier.dedupe_clusters.length, 1);
  assert.equal(dossier.excluded_results[0].reason, "duplicate-doc-number");
  assert.equal(dossier.coverage_limits.search_complete_asserted, false);
  assert.equal(Array.isArray(dossier.search_plan), true);
  assert.equal(dossier.search_plan[0].id, "claim-keywords");
  assert.ok(dossier.coverage_limits.known_unsearched_sources.some((s) => s.source_id === "uspto-pps"));
  assert.ok(dossier.coverage_limits.known_unsearched_sources.some((s) => s.source_id === "paywalled-npl-full-text"));
  assert.equal(dossier.ranked_candidates.length, 2);
  assert.equal(dossier.ranked_candidates[0].quote_handoff.quote, "a reservoir feeds a wick");
  assert.equal(dossier.ranked_candidates[0].quote_handoff.page_or_para, "mock abstract/snippet");
  assert.equal(dossier.analysis_handoff.schema, "apa-search-to-patentability-handoff-v1");
  assert.equal(dossier.analysis_handoff.candidate_cells[0].pa_id, "PA02");
  assert.equal(dossier.analysis_handoff.candidate_cells[0].appears_teaches, "unknown");
  assert.equal(dossier.analysis_handoff.candidate_cells[0].quote, "a reservoir feeds a wick");
  assert.equal(dossier.analysis_handoff.candidate_cells[0].page_or_para, "mock abstract/snippet");
  assert.equal(dossier.closest_art_selection.human_verified, false);
  assert.equal(dossier.assigned_references[0].verification.ids_ready, false);
  assert.match(dossier.caveats.join("\n"), /not a complete search/);
});

test("idsVerificationStatus only becomes IDS-ready after all required checks", () => {
  const partial = idsVerificationStatus({ human_verified: true, title_verified: true, venue_verified: true });
  assert.equal(partial.human_verified, true);
  assert.equal(partial.ids_ready, false);
  assert.equal(partial.required_checks.canonical_link, false);

  const ready = idsVerificationStatus({
    human_verified: true,
    title_verified: true,
    venue_verified: true,
    canonical_link_verified: true,
    relied_on_passage_verified: true,
  });
  assert.equal(ready.ids_ready, true);
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

test("updateClosestArtSelection records human closest-art state and IDS readiness separately", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-dossier-verify-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    const { path } = writeSearchDossier(dir, {
      query: { keywords: ["reservoir"], cpc: [], limit: 1 },
      result: { verdict: { text: "reservoir\n{}", high: [], medium: [] }, perSource: [], ranked: REFS.slice(0, 1) },
      assigned: [{ paId: "PA02", docNumber: "US-9000002-B1", title: "Wicking self-watering container" }],
      limit: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
    });
    let updated = updateClosestArtSelection(path, {
      selectedPaIds: ["PA02"],
      rationale: "Most relevant float/wick reference after human review.",
      reviewer: "reviewer@example.test",
      verifiedAt: "2026-06-20T01:00:00.000Z",
      checks: { title_verified: true, venue_verified: true },
    });
    assert.equal(updated.closest_art_selection.human_verified, true);
    assert.equal(updated.closest_art_selection.verification.ids_ready, false);
    assert.equal(updated.assigned_references[0].verification.ids_ready, false);

    updated = updateClosestArtSelection(path, {
      selectedPaIds: ["PA02"],
      rationale: "Most relevant float/wick reference after human review.",
      reviewer: "reviewer@example.test",
      verifiedAt: "2026-06-20T02:00:00.000Z",
      checks: {
        title_verified: true,
        venue_verified: true,
        canonical_link_verified: true,
        relied_on_passage_verified: true,
      },
    });
    assert.equal(updated.closest_art_selection.verification.ids_ready, true);
    assert.equal(updated.assigned_references[0].verification.ids_ready, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("updateReferenceVerification records IDS readiness without selecting closest art", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-dossier-ref-verify-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    const { path } = writeSearchDossier(dir, {
      query: { keywords: ["reservoir"], cpc: [], limit: 1 },
      result: { verdict: { text: "reservoir\n{}", high: [], medium: [] }, perSource: [], ranked: REFS.slice(0, 1) },
      assigned: [{ paId: "PA02", docNumber: "US-9000002-B1", title: "Wicking self-watering container" }],
      limit: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
    });
    const updated = updateReferenceVerification(path, {
      paIds: ["PA02"],
      notes: "Title, venue, canonical link, and relied-on passage checked against source document.",
      reviewer: "reviewer@example.test",
      verifiedAt: "2026-06-20T03:00:00.000Z",
      checks: {
        title_verified: true,
        venue_verified: true,
        canonical_link_verified: true,
        relied_on_passage_verified: true,
      },
    });
    assert.equal(updated.assigned_references[0].verification.human_verified, true);
    assert.equal(updated.assigned_references[0].verification.ids_ready, true);
    assert.equal(updated.assigned_references[0].verification_notes, "Title, venue, canonical link, and relied-on passage checked against source document.");
    assert.equal(updated.closest_art_selection.human_verified, false);
    assert.equal(updated.reference_verification_history.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
