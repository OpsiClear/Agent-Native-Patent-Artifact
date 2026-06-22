import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
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
