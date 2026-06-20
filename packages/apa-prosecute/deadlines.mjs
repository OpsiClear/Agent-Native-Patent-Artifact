/**
 * apa-prosecute/deadlines - 37 CFR 1.136(a) response-period ESTIMATES for an Office Action.
 *
 * Per docs/protocol.md §9: from the OA `mailing_date`, an examination response has a
 * 3-month SHORTENED statutory period, extensible month-by-month (1.136(a)) to a 6-month
 * STATUTORY MAXIMUM, with escalating 37 CFR 1.17 extension fees.
 *
 * THIS IS AN ESTIMATE, NOT A DOCKETING SYSTEM OF RECORD. The mailing date is always a STRING
 * INPUT (never Date.now) so the function is pure and deterministic. Month arithmetic adds
 * CALENDAR months and clamps overflow (e.g. mailed 2024-11-30 + 3 months -> 2025-02-28).
 *
 * Extension fees come from a dated fee schedule's `prosecution`/`extensions` key if present;
 * otherwise CLEARLY-LABELED PLACEHOLDER amounts are used and the result is flagged `_unverified`.
 *
 * Node.js >=21, ESM, zero dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/apa-prosecute -> repo root is two levels up.
const REPO_ROOT_DEFAULT = join(HERE, "..", "..");

const ESTIMATE_NOTE =
  "estimate - verify against PAIR/Patent Center; not a docketing system of record.";

// Placeholder 37 CFR 1.17 extension-of-time fees (LARGE entity), used only when no dated
// fee schedule supplies a `prosecution.extensions` table. Clearly flagged as unverified.
// Verified LARGE-entity 37 CFR 1.17(a) extension-of-time amounts (effective 2025-01-19; see
// third_party/uspto-references/uspto-filing-and-fees.md). Used only as a FALLBACK when no dated
// fee schedule supplies a `prosecution.extensions` table. The fee is for the TOTAL extension length.
const PLACEHOLDER_EXTENSION_FEES = {
  1: 235, // 1.17(a)(1) - code 1251
  2: 690, // 1.17(a)(2) - code 1252
  3: 1590, // 1.17(a)(3) - code 1253
  4: 2495, // 1.17(a)(4) - code 1254 (usable only when the shortened period is < 3 months)
  5: 3395, // 1.17(a)(5) - code 1255
};

// -------------------------------------------------------------------------------------------------
// Date helpers (string in / string out; UTC math; no Date.now)
// -------------------------------------------------------------------------------------------------

/** Days in a given month (1-12) of a given year, accounting for leap years. */
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m as 1-based: day 0 of next month = last day of m
}

/** Parse a strict "YYYY-MM-DD" string into {y, m, d} (m is 1-12). Throws on malformed input. */
function parseYmd(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
  if (!m) {
    throw new Error(`Invalid mailing date "${str}": expected YYYY-MM-DD (a string, not a Date).`);
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  // Validate the day against the actual length of the month (leap-year aware): rejects e.g.
  // 2023-02-29, 2024-02-31, 2024-04-31 - phantom calendar dates that would otherwise roll over.
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new Error(`Invalid mailing date "${str}": month/day out of range.`);
  }
  return { y, m: mo, d };
}

/** Format {y, m, d} as "YYYY-MM-DD". */
function fmtYmd({ y, m, d }) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/**
 * Add `months` calendar months to a {y, m, d}, clamping the day to the target month's last day.
 * E.g. 2024-11-30 + 3 -> 2025-02-28; 2026-03-02 + 3 -> 2026-06-02.
 */
function addMonths({ y, m, d }, months) {
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return { y: ny, m: nm, d: nd };
}

// -------------------------------------------------------------------------------------------------
// Fee-schedule lookup (best-effort; placeholders if absent)
// -------------------------------------------------------------------------------------------------

/**
 * Find a `prosecution`/`extensions` extension-fee table in the newest dated fee schedule.
 * Returns `{ fees: {1,2,3}, effectiveDate, source, fromSchedule: true }` if found,
 * or `{ fromSchedule: false }` otherwise. Never throws (deadlines must still compute).
 */
function loadExtensionFees(repoRoot = REPO_ROOT_DEFAULT) {
  const docsDir = join(repoRoot, "docs");
  let names;
  try {
    names = readdirSync(docsDir);
  } catch {
    return { fromSchedule: false };
  }
  const candidates = names
    .filter((n) => /^fee-schedule\..+\.json$/.test(n))
    .map((name) => {
      try {
        return { name, sched: JSON.parse(readFileSync(join(docsDir, name), "utf8")) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (candidates.length === 0) return { fromSchedule: false };

  candidates.sort((a, b) => {
    const ea = typeof a.sched?.effectiveDate === "string" ? a.sched.effectiveDate : "";
    const eb = typeof b.sched?.effectiveDate === "string" ? b.sched.effectiveDate : "";
    if (ea !== eb) return ea < eb ? 1 : -1;
    return a.name < b.name ? 1 : -1;
  });

  for (const { sched } of candidates) {
    // Accept either a top-level `extensions` map or a `prosecution.extensions` map.
    const block =
      (sched && sched.prosecution && sched.prosecution.extensions) || sched.extensions;
    if (!block) continue;
    const fees = {};
    for (const k of [1, 2, 3, 4, 5]) {
      const v = block[k] ?? block[String(k)];
      if (typeof v === "number") fees[k] = v;
    }
    if (Object.keys(fees).length > 0) {
      return {
        fromSchedule: true,
        fees,
        effectiveDate: sched.effectiveDate || null,
        source: sched.source || null,
      };
    }
  }
  return { fromSchedule: false };
}

// -------------------------------------------------------------------------------------------------
// Public: compute the response-period estimates
// -------------------------------------------------------------------------------------------------

/**
 * Compute the 37 CFR 1.136(a) response-period estimates from an OA mailing date.
 *
 * @param {string} mailingDateStr  the OA mailing date as "YYYY-MM-DD" (a STRING; never Date.now).
 * @param {object} [opts]
 * @param {string} [opts.repoRoot]  repo root for fee-schedule lookup (default: package repo root).
 * @param {object} [opts.schedule]  pre-loaded schedule object (skips disk read; for tests).
 * @returns {{ mailingDate: string, statutory3Month: string, statutory6Month: string,
 *             extensions: Array<{ extensionMonths: number, dueDate: string, feeLarge: number }>,
 *             feeEffectiveDate: (string|null), feeSource: (string|null),
 *             _unverified: boolean, notes: string[] }}
 */
export function computeDeadlines(mailingDateStr, opts = {}) {
  const mailed = parseYmd(mailingDateStr);
  const mailingDate = fmtYmd(mailed);

  // 3-month shortened statutory period; 6-month statutory maximum (calendar-month math, clamped).
  const statutory3Month = fmtYmd(addMonths(mailed, 3));
  const statutory6Month = fmtYmd(addMonths(mailed, 6));

  // Extension fees: from the dated schedule if present, else clearly-labeled placeholders.
  let feeInfo;
  if (opts.schedule) {
    const block =
      (opts.schedule.prosecution && opts.schedule.prosecution.extensions) ||
      opts.schedule.extensions;
    const fees = {};
    if (block) {
      for (const k of [1, 2, 3, 4, 5]) {
        const v = block[k] ?? block[String(k)];
        if (typeof v === "number") fees[k] = v;
      }
    }
    feeInfo = Object.keys(fees).length > 0
      ? { fromSchedule: true, fees, effectiveDate: opts.schedule.effectiveDate || null, source: opts.schedule.source || null }
      : { fromSchedule: false };
  } else {
    feeInfo = loadExtensionFees(opts.repoRoot);
  }

  const usingPlaceholders = !feeInfo.fromSchedule;
  const feeTable = usingPlaceholders ? PLACEHOLDER_EXTENSION_FEES : feeInfo.fees;

  // Extension rows: 1-3 months of extension -> response in month 4/5/6, due before the 6-month max.
  const extensions = [1, 2, 3].map((ext) => ({
    extensionMonths: ext,
    dueDate: fmtYmd(addMonths(mailed, 3 + ext)),
    feeLarge: typeof feeTable[ext] === "number" ? feeTable[ext] : null,
  }));

  const notes = [ESTIMATE_NOTE];
  notes.push(
    "Response period: 3-month shortened statutory period under the OA; extensions of time " +
      "available month-by-month under 37 CFR 1.136(a) up to the 6-month statutory maximum (35 USC 133).",
  );
  notes.push(
    "Only 1-3 months of extension are listed here: from a 3-month shortened period, a 4th- or 5th-month " +
      "total response would exceed the 6-month statutory maximum. The 37 CFR 1.17(a) fee table has 5 tiers " +
      "(codes 1251-1255); tiers 4-5 apply only when the shortened statutory period is shorter than 3 months.",
  );
  if (usingPlaceholders) {
    notes.push(
      "EXTENSION FEES ARE PLACEHOLDERS (no `prosecution.extensions` table found in any " +
        "docs/fee-schedule.*.json): the listed 37 CFR 1.17(a) amounts are illustrative LARGE-entity " +
        "figures and MUST be verified against the live USPTO fee schedule before relying.",
    );
  } else {
    notes.push(
      `37 CFR 1.17(a) extension fees from fee schedule effective ${feeInfo.effectiveDate || "(unknown)"}; ` +
        "amounts are LARGE-entity and still an estimate - verify currency and apply any entity discount.",
    );
  }
  notes.push(
    "These are date and fee ESTIMATES only. Holidays/weekends (37 CFR 1.7), USPTO mailing nuances, " +
      "final-action shortened periods, and any restriction/RCE timing can shift the actual due date.",
  );

  return {
    mailingDate,
    statutory3Month,
    statutory6Month,
    extensions,
    feeEffectiveDate: usingPlaceholders ? null : feeInfo.effectiveDate || null,
    feeSource: usingPlaceholders ? null : feeInfo.source || null,
    _unverified: usingPlaceholders,
    notes,
  };
}
