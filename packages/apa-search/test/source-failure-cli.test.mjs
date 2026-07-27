import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("CLI exits nonzero and writes nothing when its only automated source fails", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-search-failed-cli-"));
  cpSync(EXAMPLE, matter, { recursive: true });
  const priorArtPath = join(matter, "logic", "prior_art.md");
  const before = readFileSync(priorArtPath, "utf8");

  try {
    const result = spawnSync(process.execPath, [
      CLI,
      "--matter", matter,
      "--source", "patentsview",
      "--write",
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, PATENTSVIEW_API_KEY: "" },
    });

    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.allAutomatedSourcesFailed, true);
    assert.match(output.perSource[0].error, /API key required/i);

    assert.equal(readFileSync(priorArtPath, "utf8"), before);
    assert.equal(existsSync(join(matter, "logic", "reference_matrix.md")), false);
    const dossierNames = readdirSync(join(matter, "evidence", "prior_art"))
      .filter((name) => /^search-dossier-.*\.json$/.test(name));
    assert.deepEqual(dossierNames, []);

    const runlogLines = readFileSync(join(matter, "trace", "runlog.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const attempt = runlogLines.at(-1);
    assert.equal(attempt.skill, "apa-priorart");
    assert.equal(attempt.commands[0].exit_code, 1);
    assert.deepEqual(attempt.outputs, []);
    assert.equal(attempt.external_sinks[0].kind, "prior-art-query");
    assert.match(attempt.external_sinks[0].bytes_sha256, /^[a-f0-9]{64}$/);
    assert.ok(attempt.notes.some(note => /failed:authentication/.test(note)));
    assert.equal(JSON.stringify(attempt).includes("API key required"), false, "runlog stores error classes, not raw provider text");
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("CLI preserves a successful requested source when another automated source fails", () => {
  const result = spawnSync(process.execPath, [
    CLI,
    "--query", "float valve",
    "--source", "patentsview,mock",
    "--json",
  ], {
    encoding: "utf8",
    env: { ...process.env, PATENTSVIEW_API_KEY: "" },
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.allAutomatedSourcesFailed, true);
  assert.equal(output.allRequestedSourcesFailed, false);
  assert.ok(output.ranked.length > 0);
  assert.match(
    output.perSource.find((source) => source.id === "patentsview").error,
    /API key required/i,
  );
  assert.ok(output.perSource.some((source) => source.id === "mock" && !source.error));
});

test("CLI distinguishes a human-handoff skip from a failed runnable source", () => {
  const result = spawnSync(process.execPath, [
    CLI,
    "--query", "float valve",
    "--source", "patentsview,uspto-pps",
  ], {
    encoding: "utf8",
    env: { ...process.env, PATENTSVIEW_API_KEY: "" },
  });

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /source patentsview: failed - .*API key required/i);
  assert.match(result.stderr, /source uspto-pps: skipped - .*human handoff/i);
});
