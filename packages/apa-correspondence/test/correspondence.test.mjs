import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseCorrespondenceText,
  validateCorrespondenceRecord,
} from "../parse.mjs";
import {
  addCalendarMonths,
  adjustForWeekendOrFederalHoliday,
  computeNoticeDeadlines,
  parseYmd,
} from "../deadlines.mjs";
import {
  buildMissingPartsResponse,
  validateMissingPartsResponse,
} from "../response.mjs";
import {
  auditFilingReceipt,
  validateFilingReceiptAudit,
  validateFilingReceiptInput,
} from "../receipt-audit.mjs";
import { classifyNoticeText } from "../taxonomy.mjs";
import {
  formByCode,
  loadOfficialFormRegistry,
} from "../forms.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");
const jsonFixture = (name) => JSON.parse(fixture(name));

const HASH = "c".repeat(64);
const TEST_SCHEDULE = {
  effectiveDate: "2030-01-01",
  retrievedDate: "2031-02-01",
  source: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
  entityMultipliers: { large: 1, small: 0.4, micro: 0.2 },
  provisional: {
    extensions: { "1": 50, "2": 100, "3": 200, "4": 400, "5": 800 },
    extensionCodes: { "1": "1261", "2": "1262", "3": "1263", "4": "1264", "5": "1265" },
  },
  prosecution: {
    extensions: { "1": 235, "2": 690, "3": 1590, "4": 2495, "5": 3395 },
    extensionCodes: { "1": "1251", "2": "1252", "3": "1253", "4": "1254", "5": "1255" },
  },
  _sourceEvidence: {
    "provisional.extensions": {
      effectiveDate: "2030-01-01",
      retrievedDate: "2031-02-01",
      source: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
      sourceSnapshotSha256: HASH,
    },
    "prosecution.extensions": {
      effectiveDate: "2030-01-01",
      retrievedDate: "2031-02-01",
      source: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
      sourceSnapshotSha256: HASH,
    },
  },
};

function verifiedRecord() {
  return jsonFixture("verified-provisional-record.json");
}

function nonprovisionalRecord() {
  const record = verifiedRecord();
  record.classification = {
    ...record.classification,
    notice_type: "nonprovisional-missing-parts",
    label: "Notice to File Missing Parts of Nonprovisional Application",
    application_type: "utility",
  };
  record.issues = [{
    id: "oath-declaration",
    label: "Inventor oath or declaration is missing or deficient",
    rule_anchor: "37 CFR 1.63",
    extraction_confidence: "high",
    human_verified: true,
    resolution_status: "unresolved",
  }];
  return record;
}

test("parser extracts procedural facts but never embeds notice text", () => {
  const text = fixture("provisional-missing-parts.txt");
  const record = parseCorrespondenceText(text, {
    sourceFilename: "synthetic-notice.txt",
    sourceBytes: Buffer.from(text),
  });
  assert.equal(record.classification.notice_type, "provisional-missing-parts");
  assert.equal(record.mailing_date.value, "2031-02-03");
  assert.equal(record.response_period.months, 2);
  assert.deepEqual(
    record.issues.map((issue) => issue.id),
    ["provisional-cover-sheet", "ads-signature", "inventorship-not-established", "late-provisional-surcharge"],
  );
  assert.equal(record.fees[0].amount, 17.25);
  assert.equal(record.response_channel.document_description, "Miscellaneous Incoming Letter");
  assert.equal(record.extension.mentioned, true);
  assert.equal(record.consequences[0].id, "abandonment-risk");
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("SYNTHETIC TEST FIXTURE"), false);
  assert.equal(serialized.includes("DATE MAILED"), false);
  assert.equal(record.source.source_text_stored, false);
});

test("parser and validator fail closed on conflicting dates and embedded private fields", () => {
  const conflicted = parseCorrespondenceText(
    `${fixture("provisional-missing-parts.txt")}\nDATE MAILED: 02/04/2031\n`,
    { sourceFilename: "conflict.txt" },
  );
  const conflictCheck = validateCorrespondenceRecord(conflicted);
  assert.equal(conflicted.mailing_date.value, null);
  assert.ok(conflictCheck.errors.some((error) => error.code === "NOTICE_FIELD_CONFLICT"));

  const embedded = verifiedRecord();
  embedded.raw_text = "forbidden source text";
  const embeddedCheck = validateCorrespondenceRecord(embedded);
  assert.ok(embeddedCheck.errors.some((error) => error.code === "EMBEDDED_PRIVATE_SOURCE_FIELD"));
});

test("taxonomy separates supported missing-parts notices from Office Actions and unknown papers", () => {
  assert.equal(classifyNoticeText("Notice to File Missing Parts of Provisional Application").id, "provisional-missing-parts");
  assert.equal(classifyNoticeText("Notice to File Missing Parts of Nonprovisional Application").id, "nonprovisional-missing-parts");
  assert.equal(classifyNoticeText("Non-Final Office Action").response_workflow, "apa-office-action");
  assert.equal(classifyNoticeText("Unrecognized correspondence").id, "unknown");
});

test("strict date arithmetic handles month ends, leap years, and federal-holiday carryover", () => {
  assert.deepEqual(addCalendarMonths(parseYmd("2032-01-31"), 1), { year: 2032, month: 2, day: 29 });
  assert.deepEqual(addCalendarMonths(parseYmd("2031-01-31"), 1), { year: 2031, month: 2, day: 28 });
  assert.throws(() => parseYmd("2031-02-29"), /out of range/);
  const newYear = adjustForWeekendOrFederalHoliday("2021-12-31");
  assert.equal(newYear.adjusted, "2022-01-03");
  assert.equal(newYear.adjusted_forward, true);
  const weekendHoliday = adjustForWeekendOrFederalHoliday("2032-07-04");
  assert.equal(weekendHoliday.adjusted, "2032-07-06");
});

test("deadline estimates require verified notice facts and use provisional fee evidence", () => {
  const unverified = verifiedRecord();
  unverified.mailing_date.human_verified = false;
  const blocked = computeNoticeDeadlines(unverified, {
    schedule: TEST_SCHEDULE,
    asOf: "2031-02-04",
  });
  assert.equal(blocked.calculation_status, "blocked-unverified");

  const result = computeNoticeDeadlines(verifiedRecord(), {
    schedule: TEST_SCHEDULE,
    asOf: "2031-02-04",
    entityStatus: "small",
  });
  assert.equal(result.base_due_date_tentative, "2031-04-03");
  assert.equal(result.extensions.length, 5);
  assert.equal(result.extensions[0].fee_family, "37 CFR 1.17(u)");
  assert.equal(result.extensions[0].fee_code, "1261");
  assert.equal(result.extensions[0].fee_amount_estimate, 20);
  assert.equal(result.extensions[0].fee_source_snapshot_sha256, HASH);
  assert.equal(result.fee_schedule.fee_family_evidence_verified, true);
});

test("nonprovisional deadlines cannot leak the provisional fee family", () => {
  const result = computeNoticeDeadlines(nonprovisionalRecord(), {
    schedule: TEST_SCHEDULE,
    asOf: "2031-02-04",
    entityStatus: "small",
  });
  assert.equal(result.extensions[0].fee_family, "37 CFR 1.17(a)");
  assert.equal(result.extensions[0].fee_code, "1251");
  assert.equal(result.extensions[0].fee_amount_estimate, 94);
  assert.equal(result.extensions.some((row) => row.fee_code.startsWith("126")), false);
});

test("stale or unverified fee schedules and absent extension language produce no payable estimate", () => {
  const stale = structuredClone(TEST_SCHEDULE);
  stale.retrievedDate = "2030-01-01";
  stale._sourceEvidence["provisional.extensions"].retrievedDate = "2030-01-01";
  const staleResult = computeNoticeDeadlines(verifiedRecord(), {
    schedule: stale,
    asOf: "2031-02-04",
    entityStatus: "large",
    freshnessMaxDays: 45,
  });
  assert.equal(staleResult.extensions[0].fee_amount_estimate, null);

  const noExtension = verifiedRecord();
  noExtension.extension = {
    mentioned: false,
    rule_anchor: null,
    maximum_additional_months: 0,
    human_verified: false,
  };
  const noExtensionResult = computeNoticeDeadlines(noExtension, {
    schedule: TEST_SCHEDULE,
    asOf: "2031-02-04",
  });
  assert.equal(noExtensionResult.extensions_available_per_verified_notice, false);
  assert.deepEqual(noExtensionResult.extensions, []);
});

test("missing-parts response remains blocked with every legal and filing choice human-owned", () => {
  const built = buildMissingPartsResponse(verifiedRecord(), {
    schedule: TEST_SCHEDULE,
    asOf: "2031-02-04",
    entityStatus: "small",
    generatedAt: "2031-02-04T12:00:00.000Z",
  });
  assert.equal(validateMissingPartsResponse(built.response).ok, true);
  assert.equal(built.response.status, "BLOCKED-HUMAN-ACTIONS");
  assert.deepEqual(
    built.response.document_options.map((document) => document.form_code),
    ["SB/16", "AIA/14", "AIA/22P"],
  );
  assert.ok(built.response.document_options.every((document) => document.selected === false));
  assert.ok(Object.values(built.response.boundaries).every((value) => value === false));
  assert.match(built.markdown, /A human reviewer selects the response route/);
});

test("filing receipt audit emits stable ADS and priority discrepancy flags", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-receipt-audit-"));
  try {
    writeFileSync(join(matter, "PATENT.md"), [
      "---",
      'title: "Synthetic Relay Controller"',
      'application_type: "utility"',
      'filing_date: "2031-01-02"',
      'application_no: "99/999999"',
      'applicant: "Example Applicant LLC"',
      'entity_status: "small"',
      'correspondence_address: "Example correspondence record"',
      "inventors:",
      '  - name: "Sample Inventor"',
      "related_applications:",
      '  - application_number: "88/888888"',
      "---",
      "",
    ].join("\n"));
    const receipt = jsonFixture("filing-receipt.json");
    assert.equal(validateFilingReceiptInput(receipt).ok, true);
    const audit = auditFilingReceipt(matter, receipt, {
      generatedAt: "2031-02-04T12:00:00.000Z",
    });
    assert.equal(validateFilingReceiptAudit(audit).ok, true);
    assert.deepEqual(
      audit.discrepancies.map((item) => item.code).sort(),
      ["RELATED_APPLICATIONS_DIFFER", "TITLE_DIFFERS"],
    );
    assert.equal(audit.corrected_ads_review_required, true);
    assert.equal(audit.priority_chain_review_required, true);
    assert.ok(Object.values(audit.boundaries).every((value) => value === false));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("official form registry contains all core forms with pinned official URLs and hashes", () => {
  const registry = loadOfficialFormRegistry();
  const coreCodes = registry.forms
    .filter((form) => form.release_role === "core")
    .map((form) => form.form_code)
    .sort();
  assert.deepEqual(coreCodes, ["AIA/01", "AIA/14", "AIA/15", "AIA/22P", "SB/08", "SB/16"]);
  assert.equal(formByCode(registry, "SB/16").id, "sb16-patent-center");
  assert.ok(registry.forms.every((form) => new URL(form.direct_url).hostname === "www.uspto.gov"));
  assert.ok(registry.forms.every((form) => /^[0-9a-f]{64}$/.test(form.sha256)));
});
