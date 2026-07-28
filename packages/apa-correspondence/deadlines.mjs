/**
 * Notice-specific response-date estimates.
 *
 * This module is deliberately separate from the Office Action deadline estimator. A pre-examination
 * notice supplies its own response period and may use a different extension-fee family.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noticeTypeById } from "./taxonomy.mjs";
import { validateCorrespondenceRecord } from "./parse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const DEFAULT_FRESHNESS_DAYS = 45;

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) throw new Error(`invalid date '${value}': expected YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`invalid date '${value}': month/day out of range`);
  }
  return { year, month, day };
}

export function formatYmd({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarMonths(date, months) {
  const total = date.year * 12 + (date.month - 1) + Number(months);
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return {
    year,
    month,
    day: Math.min(date.day, daysInMonth(year, month)),
  };
}

function utcDate(date) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function fromUtcDate(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addDays(date, days) {
  const next = utcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return fromUtcDate(next);
}

function nthWeekday(year, month, weekday, occurrence) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return { year, month, day: 1 + offset + (occurrence - 1) * 7 };
}

function lastWeekday(year, month, weekday) {
  const lastDay = daysInMonth(year, month);
  const last = new Date(Date.UTC(year, month - 1, lastDay));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return { year, month, day: lastDay - offset };
}

function observedFixedHoliday(year, month, day) {
  const actual = { year, month, day };
  const weekday = utcDate(actual).getUTCDay();
  if (weekday === 6) return addDays(actual, -1);
  if (weekday === 0) return addDays(actual, 1);
  return actual;
}

export function federalHolidayDates(year) {
  const dates = [
    observedFixedHoliday(year, 1, 1),
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 2, 1, 3), // Washington's Birthday
    lastWeekday(year, 5, 1), // Memorial Day
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 10, 1, 2), // Columbus Day
    observedFixedHoliday(year, 11, 11),
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    observedFixedHoliday(year, 12, 25),
  ];
  const nextNewYearObserved = observedFixedHoliday(year + 1, 1, 1);
  if (nextNewYearObserved.year === year) dates.push(nextNewYearObserved);
  // Inauguration Day is a legal public holiday for federal employees in the Washington, D.C.
  // metropolitan area every fourth year after 1965. Include it because 37 CFR 1.7 refers to D.C.
  if (year >= 1969 && (year - 1969) % 4 === 0) dates.push(observedFixedHoliday(year, 1, 20));
  return new Set(dates.map(formatYmd));
}

export function adjustForWeekendOrFederalHoliday(value) {
  const original = parseYmd(value);
  let current = original;
  const reasons = [];
  for (let guard = 0; guard < 10; guard += 1) {
    const date = utcDate(current);
    const iso = formatYmd(current);
    const weekday = date.getUTCDay();
    const holidays = federalHolidayDates(current.year);
    if (weekday === 0 || weekday === 6) {
      reasons.push(`${iso} is a weekend`);
      current = addDays(current, 1);
      continue;
    }
    if (holidays.has(iso)) {
      reasons.push(`${iso} is an observed federal holiday in Washington, D.C.`);
      current = addDays(current, 1);
      continue;
    }
    return {
      unadjusted: formatYmd(original),
      adjusted: iso,
      adjusted_forward: iso !== formatYmd(original),
      reasons,
      manual_uspto_closure_check_required: true,
    };
  }
  throw new Error("unable to find a business day within ten days");
}

function dateDiffDays(fromIso, toIso) {
  const from = utcDate(parseYmd(fromIso)).getTime();
  const to = utcDate(parseYmd(toIso)).getTime();
  return Math.floor((to - from) / 86_400_000);
}

function newestFeeSchedule(repoRoot = REPO_ROOT) {
  const docsDir = join(repoRoot, "docs");
  const candidates = readdirSync(docsDir)
    .filter((name) => /^fee-schedule\..+\.json$/.test(name))
    .map((name) => {
      try {
        return { name, value: JSON.parse(readFileSync(join(docsDir, name), "utf8")) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.value.retrievedDate || "").localeCompare(String(a.value.retrievedDate || "")));
  if (!candidates.length) throw new Error("no dated fee schedule found");
  return candidates[0].value;
}

function entityMultiplier(schedule, entityStatus) {
  const value = schedule.entityMultipliers?.[entityStatus];
  return typeof value === "number" ? value : null;
}

function scheduleFreshness(schedule, asOf, maxDays) {
  const retrieved = schedule.retrievedDate;
  if (!retrieved) return { current: false, age_days: null, reason: "retrievedDate is missing" };
  try {
    const age = dateDiffDays(retrieved, asOf);
    if (age < 0) return { current: false, age_days: age, reason: "schedule retrieval date is in the future" };
    return {
      current: age <= maxDays,
      age_days: age,
      reason: age <= maxDays ? "within freshness window" : `older than ${maxDays} days`,
    };
  } catch (error) {
    return { current: false, age_days: null, reason: error.message };
  }
}

function extensionFeeBlock(schedule, noticeType) {
  const type = noticeTypeById(noticeType);
  if (type.fee_family === "provisional") {
    return {
      family: "37 CFR 1.17(u)",
      fees: schedule.provisional?.extensions,
      codes: schedule.provisional?.extensionCodes,
    };
  }
  return {
    family: "37 CFR 1.17(a)",
    fees: schedule.prosecution?.extensions,
    codes: schedule.prosecution?.extensionCodes,
  };
}

function extensionFeeEvidence(schedule, noticeType) {
  const type = noticeTypeById(noticeType);
  return type.fee_family === "provisional"
    ? schedule._sourceEvidence?.["provisional.extensions"]
    : schedule._sourceEvidence?.["prosecution.extensions"];
}

function verifiedFeeEvidence(schedule, evidence) {
  if (!evidence || typeof evidence !== "object") return false;
  let source;
  try {
    source = new URL(evidence.source);
  } catch {
    return false;
  }
  return (
    source.protocol === "https:"
    && ["uspto.gov", "www.uspto.gov"].includes(source.hostname.toLowerCase())
    && /^[0-9a-f]{64}$/.test(String(evidence.sourceSnapshotSha256 || ""))
    && evidence.effectiveDate === schedule.effectiveDate
    && evidence.retrievedDate === schedule.retrievedDate
  );
}

/**
 * Compute a tentative date only from a human-verified, notice-stated period.
 */
export function computeNoticeDeadlines(record, {
  schedule = null,
  repoRoot = REPO_ROOT,
  entityStatus = "unknown",
  asOf = new Date().toISOString().slice(0, 10),
  freshnessMaxDays = DEFAULT_FRESHNESS_DAYS,
} = {}) {
  const validation = validateCorrespondenceRecord(record, { requireVerified: true });
  if (!validation.ok) {
    return {
      schema: "apa-correspondence-deadline-estimate-v1",
      calculation_status: "blocked-unverified",
      authoritative: false,
      errors: validation.errors,
      notes: ["No date was calculated because the notice record is incomplete or not human-verified."],
    };
  }

  const type = noticeTypeById(record.classification.notice_type);
  if (type.id === "unknown" || !type.supported || type.deadline_profile !== "notice-stated") {
    return {
      schema: "apa-correspondence-deadline-estimate-v1",
      calculation_status: "blocked-unsupported",
      authoritative: false,
      errors: [{ code: "DEADLINE_PROFILE_UNSUPPORTED", path: "classification.notice_type", message: "route to the notice-specific workflow" }],
      notes: [type.id === "office-action" ? "Use /apa-office-action for Office Action timing." : "No supported timing profile exists."],
    };
  }

  const mailing = parseYmd(record.mailing_date.value);
  const baseUnadjusted = formatYmd(addCalendarMonths(mailing, record.response_period.months));
  const base = adjustForWeekendOrFederalHoliday(baseUnadjusted);
  const feeSchedule = schedule || newestFeeSchedule(repoRoot);
  const freshness = scheduleFreshness(feeSchedule, asOf, freshnessMaxDays);
  const multiplier = entityMultiplier(feeSchedule, entityStatus);
  const feeBlock = extensionFeeBlock(feeSchedule, type.id);
  const feeEvidence = extensionFeeEvidence(feeSchedule, type.id);
  const evidenceCurrent = verifiedFeeEvidence(feeSchedule, feeEvidence);
  const extensions = [];

  const extensionVerified = record.extension?.mentioned === true
    && record.extension?.human_verified === true
    && Number.isInteger(record.extension?.maximum_additional_months)
    && record.extension.maximum_additional_months > 0;

  if (extensionVerified) {
    for (let month = 1; month <= record.extension.maximum_additional_months; month += 1) {
      const unadjusted = formatYmd(addCalendarMonths(mailing, record.response_period.months + month));
      const adjusted = adjustForWeekendOrFederalHoliday(unadjusted);
      const largeAmount = Number(feeBlock.fees?.[String(month)] ?? feeBlock.fees?.[month]);
      const canQuote = freshness.current && evidenceCurrent && multiplier != null && Number.isFinite(largeAmount);
      extensions.push({
        extension_months: month,
        due_date_unadjusted: adjusted.unadjusted,
        due_date_tentative: adjusted.adjusted,
        adjustment_reasons: adjusted.reasons,
        fee_family: feeBlock.family,
        fee_code: feeBlock.codes?.[String(month)] ?? feeBlock.codes?.[month] ?? null,
        fee_effective_date: feeSchedule.effectiveDate || null,
        fee_retrieved_date: feeSchedule.retrievedDate || null,
        fee_official_url: feeEvidence?.source || null,
        fee_source_snapshot_sha256: feeEvidence?.sourceSnapshotSha256 || null,
        entity_status: entityStatus,
        fee_amount_estimate: canQuote ? Math.round(largeAmount * multiplier * 100) / 100 : null,
        fee_amount_verified_current: canQuote,
      });
    }
  }

  return {
    schema: "apa-correspondence-deadline-estimate-v1",
    calculation_status: "estimate-human-verification-required",
    authoritative: false,
    notice_type: type.id,
    mailing_date: record.mailing_date.value,
    response_period_months: record.response_period.months,
    base_due_date_unadjusted: base.unadjusted,
    base_due_date_tentative: base.adjusted,
    base_adjustment_reasons: base.reasons,
    extensions_available_per_verified_notice: extensionVerified,
    extensions,
    fee_schedule: {
      effective_date: feeSchedule.effectiveDate || null,
      retrieved_date: feeSchedule.retrievedDate || null,
      source: feeSchedule.source || null,
      source_snapshot_sha256: feeEvidence?.sourceSnapshotSha256 || null,
      fee_family_evidence_verified: evidenceCurrent,
      current_for_estimate: freshness.current,
      age_days: freshness.age_days,
      freshness_reason: freshness.reason,
    },
    notes: [
      "Estimate only. Verify the notice, Patent Center record, 37 CFR 1.7, and any USPTO closure before relying.",
      "Extensions are listed only when the notice's extension language and maximum additional months were human-verified.",
      "A null fee amount means the schedule, official source snapshot, fee family, or entity status was not current and verified enough to quote.",
    ],
  };
}
