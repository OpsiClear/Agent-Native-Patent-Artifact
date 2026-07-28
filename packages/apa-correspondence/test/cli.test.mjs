import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, "..");
const CLI = join(PACKAGE, "cli.mjs");
const FIXTURE = join(HERE, "fixtures", "provisional-missing-parts.txt");

function matterDir() {
  const dir = mkdtempSync(join(tmpdir(), "apa-correspondence-cli-"));
  writeFileSync(join(dir, "PATENT.md"), [
    "---",
    'title: "Synthetic CLI Matter"',
    'application_type: "provisional"',
    'rules_effective_date: "2031-01-01"',
    "---",
    "",
  ].join("\n"));
  return dir;
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: PACKAGE,
    encoding: "utf8",
  });
}

function readTreeText(root) {
  const chunks = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name === "PATENT.md") continue;
      try {
        const names = readdirSync(path);
        if (names) walk(path);
      } catch {
        chunks.push(readFileSync(path, "utf8"));
      }
    }
  };
  walk(root);
  return chunks.join("\n");
}

test("triage is read-only unless --write and --matter are both explicit", () => {
  const matter = matterDir();
  try {
    const result = run(["triage", "--input", FIXTURE, "--matter", matter, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(matter, "correspondence")), false);
    assert.equal(existsSync(join(matter, "trace")), false);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("PDF input is rejected with an extraction/OCR handoff before any write", () => {
  const matter = matterDir();
  const pdf = join(matter, "synthetic.pdf");
  try {
    writeFileSync(pdf, Buffer.from("%PDF-1.7\nsynthetic"));
    const result = run(["triage", "--input", pdf, "--matter", matter, "--write"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /rendering\/text extraction or OCR/i);
    assert.equal(existsSync(join(matter, "correspondence")), false);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("write mode confines output and redacts external paths from the runlog", () => {
  const matter = matterDir();
  const external = mkdtempSync(join(tmpdir(), "apa-private-input-"));
  const input = join(external, "sensitive-local-name.txt");
  try {
    writeFileSync(input, readFileSync(FIXTURE));
    const result = run(["triage", "--input", input, "--matter", matter, "--write", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(join(matter, "correspondence"));
    assert.deepEqual(files, ["notice-01.json"]);
    const matterText = readTreeText(matter);
    assert.equal(matterText.includes(external), false);
    assert.equal(matterText.includes(input), false);
    assert.match(matterText, /\[external-input\]/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("invalid JSON records are never written", () => {
  const matter = matterDir();
  const bad = join(matter, "bad.json");
  try {
    writeFileSync(bad, JSON.stringify({ schema: "wrong", raw_text: "forbidden" }));
    const result = run(["triage", "--input", bad, "--matter", matter, "--write", "--json"]);
    assert.equal(result.status, 2);
    assert.equal(existsSync(join(matter, "correspondence")), false);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("symlinked correspondence directories are refused", (t) => {
  const matter = matterDir();
  const outside = mkdtempSync(join(tmpdir(), "apa-correspondence-outside-"));
  try {
    mkdirSync(join(outside, "sink"));
    try {
      symlinkSync(join(outside, "sink"), join(matter, "correspondence"), "junction");
    } catch (error) {
      t.skip(`junction creation unavailable: ${error.message}`);
      return;
    }
    const result = run(["triage", "--input", FIXTURE, "--matter", matter, "--write"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /symlinked correspondence directory/i);
    assert.deepEqual(readdirSync(join(outside, "sink")), []);
  } finally {
    rmSync(matter, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
