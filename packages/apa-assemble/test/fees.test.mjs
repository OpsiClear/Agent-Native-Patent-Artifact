import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFees, countClaims, loadSchedule } from "../fees.mjs";

// A frozen, in-test schedule. Passing this via opts.schedule means these tests NEVER read the
// real dated schedule and NEVER make a network call - they assert the engine's arithmetic.
const SCHEDULE = {
  effectiveDate: "2025-01-19",
  retrievedDate: "2026-06-15",
  source: "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
  currency: "USD",
  entityMultipliers: { large: 1.0, small: 0.5, micro: 0.25 },
  utility: {
    basicFiling: 350,
    search: 770,
    examination: 880,
    excessIndependentOver3: 600,
    excessClaimsOver20: 200,
    multipleDependentClaim: 925,
    applicationSizePer50SheetsOver100: 450,
    nonDocxSurcharge: 430,
  },
  _unverified: [],
};

// ------------------------------------------------------------------------------------------------
// Tiny temp-matter builders
// ------------------------------------------------------------------------------------------------

function patentMd(entity) {
  return [
    "---",
    'apa_version: "0.1"',
    'application_type: "utility"',
    `entity_status: "${entity}"`,
    "---",
    "",
    "# Test matter",
    "",
  ].join("\n");
}

function indepClaim(id, n) {
  return [
    `### ${id} - Independent claim ${n} (apparatus)`,
    "",
    `An apparatus number ${n} comprising a widget.`,
    "",
    "```binding",
    "type: claim-independent",
    "category: apparatus",
    "```",
    "",
  ].join("\n");
}

function depClaim(id, n, dependsOn) {
  return [
    `### ${id} - Dependent claim ${n}`,
    "",
    `The apparatus of claim ${dependsOn}, further comprising a gizmo.`,
    "",
    "```binding",
    "type: claim-dependent",
    `depends_on: CLM${String(dependsOn).padStart(2, "0")}`,
    "category: apparatus",
    "```",
    "",
  ].join("\n");
}

/**
 * Build a matter with `indep` independent claims followed by enough dependent claims to reach
 * `total`. Each dependent claim depends on claim 1.
 */
function buildMatter(entity, indep, total) {
  const dir = mkdtempSync(join(tmpdir(), "apa-fees-"));
  mkdirSync(join(dir, "logic"), { recursive: true });
  writeFileSync(join(dir, "PATENT.md"), patentMd(entity));

  const sections = ["# Claims", ""];
  let idx = 1;
  for (let i = 0; i < indep; i++, idx++) {
    sections.push(indepClaim(`CLM${String(idx).padStart(2, "0")}`, idx));
  }
  for (let i = indep; i < total; i++, idx++) {
    sections.push(depClaim(`CLM${String(idx).padStart(2, "0")}`, idx, 1));
  }
  writeFileSync(join(dir, "logic", "claims.md"), sections.join("\n"));
  return dir;
}

const byCode = (lineItems) => Object.fromEntries(lineItems.map((it) => [it.code, it]));

// ------------------------------------------------------------------------------------------------
// (a) 1 independent + 2 total, large entity -> only base trio, no excess
// ------------------------------------------------------------------------------------------------

test("small matter, large entity: only base filing/search/exam, no excess line items", () => {
  const dir = buildMatter("large", 1, 2);
  try {
    const counts = countClaims(dir);
    assert.deepEqual(counts, { independent: 1, total: 2, multipleDependent: 0 });

    const r = computeFees(dir, { schedule: SCHEDULE });
    const codes = r.lineItems.map((it) => it.code).sort();
    assert.deepEqual(codes, ["1011", "1111", "1311"], "only the base trio should be present");

    const items = byCode(r.lineItems);
    assert.equal(items["1011"].amount, 350);
    assert.equal(items["1111"].amount, 770);
    assert.equal(items["1311"].amount, 880);

    // No excess-independent / excess-total / multiple-dependent items.
    assert.equal(items["1201"], undefined);
    assert.equal(items["1202"], undefined);
    assert.equal(items["1203"], undefined);

    assert.equal(r.entityStatus, "large");
    assert.equal(r.multiplier, 1.0);
    assert.equal(r.subtotalLarge, 2000);
    assert.equal(r.total, 2000); // 350 + 770 + 880

    // notes carry the verify caveat.
    assert.ok(
      r.notes.some((n) => /ESTIMATE ONLY/i.test(n) && /verify/i.test(n)),
      "notes must include the estimate/verify caveat",
    );
    assert.ok(
      r.notes.some((n) => /2025-01-19/.test(n)),
      "notes must include the effective date",
    );
    assert.ok(
      r.notes.some((n) => /micro-entity/i.test(n) && /human certification/i.test(n)),
      "notes must state micro-entity is a human certification APA does not assert",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------
// (b) 5 independent + 25 total, small entity -> excess-indep qty=2, excess-total qty=5,
//     and every amount = large-amount x 0.5
// ------------------------------------------------------------------------------------------------

test("big matter, small entity: excess line items present and all amounts halved", () => {
  const dir = buildMatter("small", 5, 25);
  try {
    const counts = countClaims(dir);
    assert.deepEqual(counts, { independent: 5, total: 25, multipleDependent: 0 });

    const r = computeFees(dir, { schedule: SCHEDULE });
    const items = byCode(r.lineItems);

    // Excess-independent: qty = 5 - 3 = 2.
    assert.ok(items["1201"], "excess-independent line item present");
    assert.equal(items["1201"].qty, 2);
    // Excess-total: qty = 25 - 20 = 5.
    assert.ok(items["1202"], "excess-total line item present");
    assert.equal(items["1202"].qty, 5);

    assert.equal(r.entityStatus, "small");
    assert.equal(r.multiplier, 0.5);

    // Every amount equals large-entity (each*qty) x 0.5.
    for (const it of r.lineItems) {
      assert.equal(
        it.amount,
        Math.round(it.each * it.qty * 0.5 * 100) / 100,
        `amount for ${it.code} should be the large amount x 0.5`,
      );
    }

    // Concrete totals.
    // Large each*qty: 350 + 770 + 880 + 600*2 + 200*5 = 4200.
    assert.equal(r.subtotalLarge, 4200);
    // Total at 0.5: 2100.
    assert.equal(r.total, 2100);
    assert.equal(items["1201"].amount, 600); // 600*2*0.5
    assert.equal(items["1202"].amount, 500); // 200*5*0.5

    // notes carry the verify caveat.
    assert.ok(
      r.notes.some((n) => /ESTIMATE ONLY/i.test(n) && /verify/i.test(n)),
      "notes must include the estimate/verify caveat",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------
// Behavior checks: unknown entity, overrides, optional fees, multiple-dependent detection.
// ------------------------------------------------------------------------------------------------

test("unknown entity assumed large with an explanatory note; override wins", () => {
  const dir = buildMatter("unknown", 1, 1);
  try {
    const r = computeFees(dir, { schedule: SCHEDULE });
    assert.equal(r.entityStatus, "large");
    assert.equal(r.multiplier, 1.0);
    assert.ok(
      r.notes.some((n) => /unknown/i.test(n) && /LARGE/i.test(n) && /assumed/i.test(n)),
      "must note that large-entity was assumed for unknown status",
    );

    // entityOverride beats PATENT.md.
    const r2 = computeFees(dir, { schedule: SCHEDULE, entityOverride: "micro" });
    assert.equal(r2.entityStatus, "micro");
    assert.equal(r2.multiplier, 0.25);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("optional application-size and non-DOCX fees", () => {
  const dir = buildMatter("large", 1, 1);
  try {
    // 201 sheets -> ceil((201-100)/50) = 3 blocks @ 450.
    const r = computeFees(dir, { schedule: SCHEDULE, sheets: 201, nonDocx: true });
    const items = byCode(r.lineItems);
    assert.equal(items["1081"].qty, 3);
    assert.equal(items["1081"].amount, 1350);
    assert.equal(items["1054"].amount, 430);

    // No size fee at exactly 100 sheets.
    const r2 = computeFees(dir, { schedule: SCHEDULE, sheets: 100 });
    assert.equal(byCode(r2.lineItems)["1081"], undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multiple-dependent claim detected via text and billed", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-fees-md-"));
  try {
    mkdirSync(join(dir, "logic"), { recursive: true });
    writeFileSync(join(dir, "PATENT.md"), patentMd("large"));
    const claims = [
      "# Claims",
      "",
      indepClaim("CLM01", 1),
      indepClaim("CLM02", 2),
      "### CLM03 - Multiple dependent claim",
      "",
      "The apparatus of any of claims 1 or 2, further comprising a sprocket.",
      "",
      "```binding",
      "type: claim-dependent",
      "depends_on: CLM01",
      "category: apparatus",
      "```",
      "",
    ].join("\n");
    writeFileSync(join(dir, "logic", "claims.md"), claims);

    const counts = countClaims(dir);
    assert.equal(counts.multipleDependent, 1);

    const r = computeFees(dir, { schedule: SCHEDULE });
    const items = byCode(r.lineItems);
    assert.ok(items["1203"], "multiple dependent claim fee line item present");
    assert.equal(items["1203"].qty, 1);
    assert.equal(items["1203"].amount, 925);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------
// Fix 4: the 'claim N or claim M' phrasing (repeated 'claim' before the second number) is detected.
// ------------------------------------------------------------------------------------------------

test("multiple-dependent claim detected via 'claim 1 or claim 2' phrasing", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-fees-md2-"));
  try {
    mkdirSync(join(dir, "logic"), { recursive: true });
    writeFileSync(join(dir, "PATENT.md"), patentMd("large"));
    const claims = [
      "# Claims",
      "",
      indepClaim("CLM01", 1),
      indepClaim("CLM02", 2),
      "### CLM03 - Multiple dependent claim",
      "",
      "The widget of claim 1 or claim 2, further comprising a sprocket.",
      "",
      "```binding",
      "type: claim-dependent",
      "depends_on: CLM01",
      "category: apparatus",
      "```",
      "",
    ].join("\n");
    writeFileSync(join(dir, "logic", "claims.md"), claims);

    const counts = countClaims(dir);
    assert.equal(counts.multipleDependent, 1, "'claim 1 or claim 2' must be detected as multiple-dependent");

    const r = computeFees(dir, { schedule: SCHEDULE });
    assert.ok(byCode(r.lineItems)["1203"], "code 1203 must be emitted for 'claim 1 or claim 2'");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------
// Fix 3: 37 CFR 1.16(j) is owed ONCE PER APPLICATION, even with multiple multiple-dependent claims.
// ------------------------------------------------------------------------------------------------

test("multiple-dependent fee (1203) is billed once per application, not per claim", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-fees-md3-"));
  try {
    mkdirSync(join(dir, "logic"), { recursive: true });
    writeFileSync(join(dir, "PATENT.md"), patentMd("large"));
    const mdepClaim = (id, label) => [
      `### ${id} - ${label}`,
      "",
      "The apparatus of any of claims 1 or 2, further comprising a sprocket.",
      "",
      "```binding",
      "type: claim-dependent",
      "depends_on: CLM01",
      "category: apparatus",
      "```",
      "",
    ].join("\n");
    const claims = [
      "# Claims",
      "",
      indepClaim("CLM01", 1),
      indepClaim("CLM02", 2),
      mdepClaim("CLM03", "Multiple dependent claim A"),
      mdepClaim("CLM04", "Multiple dependent claim B"),
    ].join("\n");
    writeFileSync(join(dir, "logic", "claims.md"), claims);

    // Detection counts every multiple-dependent claim...
    const counts = countClaims(dir);
    assert.equal(counts.multipleDependent, 2, "both multiple-dependent claims should be detected");

    // ...but the fee is charged exactly once (qty === 1), per 37 CFR 1.16(j).
    const r = computeFees(dir, { schedule: SCHEDULE });
    const items = byCode(r.lineItems);
    assert.ok(items["1203"], "multiple dependent claim fee line item present");
    assert.equal(items["1203"].qty, 1, "1203 must be billed once per application regardless of count");
    assert.equal(items["1203"].amount, 925, "1203 amount must reflect a single unit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------
// Fix 5: computeFees returns `currency` so --json machine output labels the schedule's currency.
// ------------------------------------------------------------------------------------------------

test("computeFees returns the schedule currency (default USD)", () => {
  const dir = buildMatter("large", 1, 2);
  try {
    const r = computeFees(dir, { schedule: SCHEDULE });
    assert.equal(r.currency, "USD", "currency must come from the schedule");

    // A non-USD schedule must be surfaced, not silently mislabeled.
    const eurSchedule = { ...SCHEDULE, currency: "EUR" };
    const r2 = computeFees(dir, { schedule: eurSchedule });
    assert.equal(r2.currency, "EUR");

    // A schedule with no currency falls back to USD.
    const noCurrency = { ...SCHEDULE };
    delete noCurrency.currency;
    const r3 = computeFees(dir, { schedule: noCurrency });
    assert.equal(r3.currency, "USD", "missing schedule currency defaults to USD");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSchedule reads the newest dated schedule from the repo docs/ dir", () => {
  // Uses the real on-disk schedule (no network). Asserts shape, not specific dollar values.
  const sched = loadSchedule();
  assert.equal(typeof sched.effectiveDate, "string");
  assert.equal(typeof sched.utility.basicFiling, "number");
  assert.ok(sched.entityMultipliers && typeof sched.entityMultipliers.large === "number");
});
