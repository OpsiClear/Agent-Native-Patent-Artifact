import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("apa-search --write appends a runlog entry with query sink hash and closest-art checkpoint", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-search-runlog-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    const parsed = validateRunlog(d);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
    assert.equal(parsed.entries.length, 1);
    const entry = parsed.entries[0];
    assert.equal(entry.skill, "apa-priorart");
    assert.equal(entry.external_sinks[0].kind, "prior-art-query");
    assert.match(entry.external_sinks[0].bytes_sha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.human_checkpoints[0].id, "closest-art-selection");
    assert.equal(entry.human_checkpoints[0].satisfied, false);
    assert.ok(entry.outputs.some((o) => /logic\/prior_art\.md$/.test(o.path)));
    assert.ok(entry.outputs.some((o) => /search-dossier-/.test(o.path)));

    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    assert.equal(validateRunlog(d).entries.length, 2, "second write appends a second entry");
    assert.ok(existsSync(join(d, "trace", "runlog.jsonl")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("apa-search check-dossier validates a generated search dossier", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-search-check-dossier-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    const priorArtDir = join(d, "evidence", "prior_art");
    const dossier = join(priorArtDir, readdirSync(priorArtDir).find((n) => /^search-dossier-.*\.json$/.test(n)));
    const stdout = execFileSync(process.execPath, [CLI, "check-dossier", dossier, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(JSON.parse(stdout).ok, true);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("apa-search verify-closest-art updates dossier and gates IDS readiness on all checks", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-search-verify-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    const priorArtDir = join(d, "evidence", "prior_art");
    const dossier = join(priorArtDir, readdirSync(priorArtDir).find((n) => /^search-dossier-.*\.json$/.test(n)));

    execFileSync(process.execPath, [
      CLI,
      "verify-closest-art",
      "--dossier", dossier,
      "--pa", "PA02",
      "--rationale", "Human selected PA02 as the closest art.",
      "--reviewer", "reviewer@example.test",
      "--title-verified",
      "--venue-verified",
    ], { stdio: "pipe" });
    let parsed = JSON.parse(readFileSync(dossier, "utf8"));
    assert.equal(parsed.closest_art_selection.human_verified, true);
    assert.equal(parsed.closest_art_selection.verification.ids_ready, false);
    let runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.length, 2);
    assert.equal(runlog.entries[1].skill, "apa-priorart");
    assert.ok(runlog.entries[1].inputs.some((input) => /search-dossier-/.test(input.path)));
    assert.ok(runlog.entries[1].outputs.some((output) => /search-dossier-/.test(output.path)));
    assert.equal(runlog.entries[1].human_checkpoints.find((cp) => cp.id === "closest-art-selection").satisfied, true);
    assert.equal(runlog.entries[1].human_checkpoints.find((cp) => cp.id === "ids-verification").satisfied, false);

    execFileSync(process.execPath, [
      CLI,
      "verify-closest-art",
      "--dossier", dossier,
      "--pa", "PA02",
      "--rationale", "Human selected PA02 as the closest art.",
      "--reviewer", "reviewer@example.test",
      "--title-verified",
      "--venue-verified",
      "--canonical-link-verified",
      "--relied-on-passage-verified",
    ], { stdio: "pipe" });
    parsed = JSON.parse(readFileSync(dossier, "utf8"));
    assert.equal(parsed.closest_art_selection.verification.ids_ready, true);
    assert.equal(parsed.assigned_references[0].verification.ids_ready, true);
    runlog = validateRunlog(d);
    assert.equal(runlog.entries.length, 3);
    assert.equal(runlog.entries[2].human_checkpoints.find((cp) => cp.id === "ids-verification").satisfied, true);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("apa-search verify-reference updates assigned reference IDS state without closest-art selection", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-search-ref-verify-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    const priorArtDir = join(d, "evidence", "prior_art");
    const dossier = join(priorArtDir, readdirSync(priorArtDir).find((n) => /^search-dossier-.*\.json$/.test(n)));

    execFileSync(process.execPath, [
      CLI,
      "verify-reference",
      "--dossier", dossier,
      "--pa", "PA02",
      "--notes", "Human checked bibliographic fields and relied-on passage.",
      "--reviewer", "reviewer@example.test",
      "--title-verified",
      "--venue-verified",
      "--canonical-link-verified",
      "--relied-on-passage-verified",
    ], { stdio: "pipe" });
    const parsed = JSON.parse(readFileSync(dossier, "utf8"));
    assert.equal(parsed.assigned_references[0].verification.human_verified, true);
    assert.equal(parsed.assigned_references[0].verification.ids_ready, true);
    assert.equal(parsed.assigned_references[0].verification_notes, "Human checked bibliographic fields and relied-on passage.");
    assert.equal(parsed.closest_art_selection.human_verified, false);
    assert.equal(parsed.reference_verification_history.length, 1);
    const runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.length, 2);
    assert.equal(runlog.entries[1].skill, "apa-priorart");
    assert.equal(runlog.entries[1].human_checkpoints.find((cp) => cp.id === "ids-verification").satisfied, true);
    assert.ok(runlog.entries[1].notes.some((note) => /reference verification updated/.test(note)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("apa-search import-pps-export imports a human PPS CSV without automating the UI", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-search-pps-import-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const csv = join(d, "pps-export.csv");
    writeFileSync(csv, [
      "Publication Number,Title,Abstract,Assignee,Inventors,Publication Date,CPC,URL",
      "\"US 12,345,678 B2\",\"Distributed encoder\",\"An encoder maps symbols to graph states.\",\"Public Example Inc.\",\"A. Inventor; B. Reviewer\",\"2020-01-02\",\"G06F17/00\",\"https://example.test/US12345678B2\"",
    ].join("\n"));

    execFileSync(process.execPath, [
      CLI,
      "import-pps-export",
      "--matter", d,
      "--file", csv,
      "--query", "graph state encoder symbol mapping",
      "--reviewer", "reviewer@example.test",
      "--notes", "Human exported PPS result list.",
      "--limit", "5",
    ], { stdio: "pipe" });

    const priorArtDir = join(d, "evidence", "prior_art");
    const dossier = join(priorArtDir, readdirSync(priorArtDir).find((n) => /^search-dossier-.*\.json$/.test(n)));
    const parsed = JSON.parse(readFileSync(dossier, "utf8"));
    assert.equal(parsed.sources[0].source_id, "uspto-pps");
    assert.equal(parsed.sources[0].query_parameters.human_import, true);
    assert.equal(parsed.query.human_query, "graph state encoder symbol mapping");
    assert.equal(parsed.search_plan[0].id, "human-pps-query");
    assert.equal(parsed.human_imports[0].sha256.length, 64);
    assert.match(parsed.human_imports[0].copied_path.replace(/\\/g, "/"), /evidence\/prior_art\/imports\/pps-export-/);
    assert.equal(parsed.coverage_limits.search_complete_asserted, false);
    assert.ok(parsed.coverage_limits.searched_source_ids.includes("uspto-pps"));
    assert.equal(parsed.assigned_references[0].pa_id, "PA02");
    assert.equal(parsed.assigned_references[0].verification.ids_ready, false);
    assert.ok(existsSync(join(d, "evidence", "prior_art", "imports")));
    assert.match(readFileSync(join(d, "logic", "prior_art.md"), "utf8"), /### PA02 - Distributed encoder/);

    const runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.length, 1);
    const entry = runlog.entries[0];
    assert.equal(entry.external_sinks[0].kind, "human-pps-query");
    assert.equal(entry.external_sinks[0].human_approved, true);
    assert.equal(entry.human_checkpoints.find((cp) => cp.id === "pps-human-export-import").satisfied, true);
    assert.equal(entry.human_checkpoints.find((cp) => cp.id === "closest-art-selection").satisfied, false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
