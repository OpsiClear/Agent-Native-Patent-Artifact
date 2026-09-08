import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "verify_dates.mjs");

function fixture(citation) {
  const matter = mkdtempSync(join(tmpdir(), "apa-date-verifier-"));
  mkdirSync(join(matter, "assembled"), { recursive: true });
  writeFileSync(join(matter, "assembled", "IDS_SB08.md"), `1. [PA1] ${citation}\n`, "utf8");
  return matter;
}

function run(matter, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, "--matter", matter, ...args], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(readFileSync(join(matter, "assembled", "date_verification.json"), "utf8"));
}

test("date verification is offline by default and omits local matter paths", () => {
  const matter = fixture('Example, "Public paper", DOI 10.5555/example.1');
  try {
    const report = run(matter);
    assert.equal(report.networkUsed, false);
    assert.equal(report.references[0].status, "candidate_only");
    assert.equal(Object.hasOwn(report, "matterPath"), false);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("network mode rejects a lookalike URL outside the metadata host allowlist", () => {
  const matter = fixture("Example https://evil.invalid/patents.google.com/patent/US123");
  try {
    const report = run(matter, "--network");
    assert.equal(report.networkUsed, true);
    assert.equal(report.references[0].status, "fetch_failed_or_manual");
    assert.match(report.references[0].summary, /not allowlisted/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});
import { crossrefDate } from "./verify_dates.mjs";

test("Crossref dates preserve source precision and reject impossible dates", () => {
  assert.deepEqual(crossrefDate([[2020]]), { value: "2020", precision: "year", dateParts: [2020] });
  assert.deepEqual(crossrefDate([[2020, 7]]), { value: "2020-07", precision: "month", dateParts: [2020, 7] });
  assert.deepEqual(crossrefDate([[2020, 2, 29]]), { value: "2020-02-29", precision: "day", dateParts: [2020, 2, 29] });
  for (const input of [[], [[2021, 2, 29]], [[2020, 13]], [[2020, 1, 0]], [["2020"]]]) assert.equal(crossrefDate(input), null);
});
