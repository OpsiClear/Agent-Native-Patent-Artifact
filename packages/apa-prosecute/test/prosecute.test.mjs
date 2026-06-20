import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseOfficeAction, parseOfficeActionFile } from "../parse.mjs";
import { computeDeadlines } from "../deadlines.mjs";
import { scaffoldResponse } from "../respond.mjs";
import { validateReport } from "../../apa-reports/validate.mjs";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "oa-01.md");
// packages/apa-prosecute/test -> repo root is three levels up.
const REPO_ROOT = join(HERE, "..", "..", "..");
const EXAMPLE_MATTER = join(REPO_ROOT, "examples", "minimal-patent-artifact");
const CLI = join(HERE, "..", "cli.mjs");

function writeUnsupportedOa(dir, actionType = "advisory action") {
  const file = join(dir, "oa-unsupported.md");
  writeFileSync(file, [
    "# Office Action - Unsupported Event",
    "",
    "```oa",
    "mailing_date: 2026-03-02",
    "examiner: \"Pat Examiner\"",
    "application_no: \"17/000,000\"",
    `action_type: ${actionType}`,
    "```",
    "",
    "## Summary",
    "",
    "This paper is intentionally outside the supported response-scaffold event set.",
    "",
  ].join("\n"), "utf8");
  return file;
}

// -------------------------------------------------------------------------------------------------
// parse
// -------------------------------------------------------------------------------------------------

test("parseOfficeAction reads the file-level ```oa header", () => {
  const { header } = parseOfficeActionFile(FIXTURE);
  assert.equal(header.mailing_date, "2026-03-02");
  assert.equal(header.action_type, "non-final");
  assert.equal(header.event.id, "non-final");
  assert.equal(header.event.response_scaffold_supported, true);
  assert.equal(header.application_no, "17/000,000");
  assert.match(header.examiner, /Pat Examiner/);
});

test("parseOfficeAction yields one rejection per REJ## with correct grounds/claims/references", () => {
  const { rejections } = parseOfficeActionFile(FIXTURE);
  assert.equal(rejections.length, 2);

  const rej01 = rejections.find((r) => r.id === "REJ01");
  assert.ok(rej01, "REJ01 present");
  assert.equal(rej01.ground, "102");
  assert.equal(rej01.ground_taxonomy.id, "102");
  assert.deepEqual(rej01.claims, ["CLM01"]);
  assert.deepEqual(rej01.references, ["PA01"]);
  assert.match(rej01.examiner_reasoning, /self-watering/i);

  const rej02 = rejections.find((r) => r.id === "REJ02");
  assert.ok(rej02, "REJ02 present");
  assert.equal(rej02.ground, "112b");
  assert.deepEqual(rej02.claims, ["CLM01"]);
  assert.deepEqual(rej02.references, []);
});

test("parseOfficeAction tolerates an empty / headerless string", () => {
  const { header, rejections } = parseOfficeAction("no header, no rejections here");
  assert.equal(header.mailing_date, null);
  assert.equal(rejections.length, 0);
});

// -------------------------------------------------------------------------------------------------
// deadlines
// -------------------------------------------------------------------------------------------------

test("computeDeadlines('2026-03-02') -> 3-month 2026-06-02, 6-month 2026-09-02, 3 extension rows", () => {
  const d = computeDeadlines("2026-03-02");
  assert.equal(d.mailingDate, "2026-03-02");
  assert.equal(d.actionType, "non-final");
  assert.equal(d.deadline_support.supported, true);
  assert.ok(d.deadline_support.matrix.some((row) => row.action_type === "advisory-action" && row.deadline_estimator_supported === false));
  assert.equal(d.statutory3Month, "2026-06-02");
  assert.equal(d.statutory6Month, "2026-09-02");
  assert.equal(d.extensions.length, 3);
  assert.deepEqual(
    d.extensions.map((e) => e.extensionMonths),
    [1, 2, 3],
  );
  // Extension months 1-3 -> response due in month 4/5/6.
  assert.equal(d.extensions[0].dueDate, "2026-07-02");
  assert.equal(d.extensions[1].dueDate, "2026-08-02");
  assert.equal(d.extensions[2].dueDate, "2026-09-02");
  // Every output carries the estimate/verify note.
  assert.ok(d.notes.some((n) => /estimate - verify against PAIR/.test(n)));
});

test("computeDeadlines handles month overflow (Nov 30 + 3 months clamps to Feb)", () => {
  const d = computeDeadlines("2024-11-30");
  assert.equal(d.statutory3Month, "2025-02-28"); // Feb 2025 has 28 days
  assert.equal(d.statutory6Month, "2025-05-30");
});

test("computeDeadlines rejects non-string / malformed dates", () => {
  assert.throws(() => computeDeadlines("2026/03/02"), /Invalid mailing date/);
  assert.throws(() => computeDeadlines("not-a-date"), /Invalid mailing date/);
});

test("computeDeadlines accepts real calendar dates including a leap-day", () => {
  // 2024 is a leap year, so Feb 29 is valid; Nov has 30 days.
  assert.equal(computeDeadlines("2024-02-29").mailingDate, "2024-02-29");
  assert.equal(computeDeadlines("2024-11-30").mailingDate, "2024-11-30");
});

test("computeDeadlines rejects non-existent calendar dates (no phantom rollover)", () => {
  assert.throws(() => computeDeadlines("2023-02-29"), /Invalid mailing date/); // not a leap year
  assert.throws(() => computeDeadlines("2024-02-31"), /Invalid mailing date/); // Feb never has 31
  assert.throws(() => computeDeadlines("2024-04-31"), /Invalid mailing date/); // April has 30
});

test("computeDeadlines fails loud for unsupported Office Action event timing", () => {
  const d = computeDeadlines("2026-03-02", { actionType: "advisory action" });
  assert.equal(d.actionType, "advisory-action");
  assert.equal(d.deadline_support.supported, false);
  assert.equal(d._unsupported_event, true);
  assert.equal(d.statutory3Month, null);
  assert.equal(d.statutory6Month, null);
  assert.deepEqual(d.extensions, []);
  assert.ok(d.deadline_support.matrix.some((row) => row.action_type === "non-final" && row.deadline_estimator_supported === true));
  assert.ok(d.notes.some((n) => /does not estimate deadlines/i.test(n)));
});

test("computeDeadlines uses a schedule's prosecution.extensions table when supplied", () => {
  const d = computeDeadlines("2026-03-02", {
    schedule: {
      effectiveDate: "2026-06-15",
      source: "test",
      prosecution: { extensions: { 1: 111, 2: 222, 3: 333 } },
    },
  });
  assert.equal(d._unverified, false);
  assert.deepEqual(
    d.extensions.map((e) => e.feeLarge),
    [111, 222, 333],
  );
  assert.equal(d.feeEffectiveDate, "2026-06-15");
});

test("computeDeadlines falls back to clearly-flagged placeholders without a schedule table", () => {
  const d = computeDeadlines("2026-03-02", { schedule: { effectiveDate: "2026-06-15" } });
  assert.equal(d._unverified, true);
  assert.ok(d.extensions.every((e) => typeof e.feeLarge === "number"));
  assert.ok(d.notes.some((n) => /PLACEHOLDER/i.test(n)));
});

// -------------------------------------------------------------------------------------------------
// respond
// -------------------------------------------------------------------------------------------------

test("scaffoldResponse emits a section per rejection plus the new-matter-guard language", () => {
  const { markdown, rejectionCount, oaNumber } = scaffoldResponse(EXAMPLE_MATTER, FIXTURE);
  assert.equal(rejectionCount, 2);
  assert.equal(oaNumber, "01");

  // A section per rejection.
  assert.match(markdown, /## REJ01 -/);
  assert.match(markdown, /## REJ02 -/);

  // New-matter guard language is present.
  assert.match(markdown, /Not supported by the spec as filed - route to counsel\./);

  // Flags-and-questions, not conclusions.
  assert.match(markdown, /flags & questions/i);
  assert.match(markdown, /NOT conclusions/i);

  // Draft scaffold header + never-files disclaimer.
  assert.match(markdown, /DRAFT SCAFFOLD/);
  assert.match(markdown, /APA does not file/i);

  // The 102 rejection surfaces its cited reference; the claim label is resolved from claims.md.
  assert.match(markdown, /PA01/);
  assert.match(markdown, /CLM01 \(Self-watering planter insert/);
});

test("scaffoldResponse does not invent specification support", () => {
  const { markdown } = scaffoldResponse(EXAMPLE_MATTER, FIXTURE);
  // The amendment + support-basis fields both defer to counsel rather than inventing support.
  const guardCount = (markdown.match(/Not supported by the spec as filed - route to counsel\./g) || []).length;
  assert.ok(guardCount >= 2, "both the amendment and the support-basis defer to counsel");
});

test("scaffoldResponse throws for unsupported Office Action event types", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-prosecute-unsupported-"));
  try {
    const oa = writeUnsupportedOa(d);
    assert.throws(() => scaffoldResponse(EXAMPLE_MATTER, oa), /unsupported Office Action event type/i);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("respond CLI refuses proposed response scaffolds for pro-se matters", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-prosecute-"));
  try {
    cpSync(EXAMPLE_MATTER, d, { recursive: true });
    const patent = join(d, "PATENT.md");
    writeFileSync(patent, readFileSync(patent, "utf8").replace('user_role: "unknown"', 'user_role: "pro_se"'));
    const res = spawnSync(process.execPath, [CLI, "respond", "--matter", d, "--oa", FIXTURE, "--write"], {
      encoding: "utf8",
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /practitioner-mode only/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("respond CLI writes a valid office_action_report.json in practitioner mode", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-prosecute-report-"));
  try {
    cpSync(EXAMPLE_MATTER, d, { recursive: true });
    const res = spawnSync(process.execPath, [CLI, "respond", "--matter", d, "--oa", FIXTURE, "--write", "--json"], {
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.ok(parsed.report, "json output includes report path");
    const report = JSON.parse(readFileSync(parsed.report, "utf8"));
    const check = validateReport(report, { kind: "office_action" });
    assert.equal(check.ok, true, JSON.stringify(check.errors));
    assert.equal(report.response_mode, "practitioner_scaffold");
    assert.equal(report.authoritative_deadline, false);
    assert.equal(report.findings.length, 2);
    const log = validateRunlog(d);
    assert.equal(log.ok, true, JSON.stringify(log.errors));
    assert.equal(log.entries.length, 1);
    const entry = log.entries[0];
    assert.equal(entry.skill, "apa-office-action");
    assert.ok(entry.outputs.some((o) => /prosecution\/response-01\.md$/.test(o.path)));
    assert.ok(entry.outputs.some((o) => o.path === "prosecution/office_action_report.json"));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "registered-practitioner-review"));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "deadline-verification"));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "new-matter-review"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("deadlines CLI returns unsupported-event JSON for unsupported OA event types", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-prosecute-deadlines-"));
  try {
    const oa = writeUnsupportedOa(d, "after-final");
    const res = spawnSync(process.execPath, [CLI, "deadlines", "--oa", oa, "--json"], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.actionType, "after-final");
    assert.equal(parsed._unsupported_event, true);
    assert.equal(parsed.deadline_support.supported, false);
    assert.equal(parsed.statutory3Month, null);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("respond CLI writes unsupported-event office_action_report.json and runlog", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-prosecute-unsupported-report-"));
  try {
    cpSync(EXAMPLE_MATTER, d, { recursive: true });
    const oa = writeUnsupportedOa(d, "advisory action");
    const res = spawnSync(process.execPath, [CLI, "respond", "--matter", d, "--oa", oa, "--write", "--json"], {
      encoding: "utf8",
    });
    assert.equal(res.status, 2);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.unsupported_event, "advisory-action");
    assert.ok(parsed.report, "json output includes report path");
    const report = JSON.parse(readFileSync(parsed.report, "utf8"));
    const check = validateReport(report, { kind: "office_action" });
    assert.equal(check.ok, true, JSON.stringify(check.errors));
    assert.equal(report.response_mode, "summary_only");
    assert.equal(report.deadline_support.supported, false);
    assert.equal(report.office_action.event_supported, false);
    assert.ok(report.findings.some((f) => f.code === "UNSUPPORTED_OA_EVENT" && f.severity === "blocking"));
    assert.ok(report.next_allowed_steps.includes("do-not-use-apa-response-scaffold"));
    const log = validateRunlog(d);
    assert.equal(log.ok, true, JSON.stringify(log.errors));
    assert.equal(log.entries.length, 1);
    assert.equal(log.entries[0].commands[0].exit_code, 2);
    assert.ok(log.entries[0].outputs.some((o) => o.path === "prosecution/office_action_report.json"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------------------------------------
// no network: ensure the fixture loads from disk only
// -------------------------------------------------------------------------------------------------

test("fixture exists on disk (no network access required)", () => {
  const text = readFileSync(FIXTURE, "utf8");
  assert.match(text, /```oa/);
  assert.match(text, /### REJ01/);
});
