#!/usr/bin/env node
/**
 * apa-assemble/fees - USPTO fee WORKSHEET engine for the filing-assembly phase.
 *
 * Fees are an error-prone, dated thing. This engine is therefore:
 *   - DATA-DRIVEN: every dollar amount and multiplier comes from a dated schedule file
 *     (docs/fee-schedule.<YYYY-MM-DD>.json), never hardcoded inline here.
 *   - ALWAYS AN ESTIMATE: the returned `notes` carry an explicit verify caveat and the
 *     schedule's effective date. This is a worksheet to take to a human, not a bill.
 *   - NEVER A MICRO-ENTITY ASSERTION: 37 CFR 1.29 micro-entity status is a human
 *     certification. APA will COMPUTE a micro figure if a human supplies entity_status,
 *     but it never decides or asserts micro-entity status on its own.
 *
 * Counts come from the SHARED parser (../../lib/apa-parse.mjs) - there is no second parser here.
 *
 * Node.js >=18, ESM, zero dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFrontmatter,
  extractBindingBlocks,
  iterEntitySections,
} from "../../lib/apa-parse.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/apa-assemble -> repo root is two levels up.
const REPO_ROOT_DEFAULT = join(HERE, "..", "..");

const VALID_ENTITIES = new Set(["large", "small", "micro"]);

// -------------------------------------------------------------------------------------------------
// Schedule loading
// -------------------------------------------------------------------------------------------------

/**
 * Load the newest dated fee schedule from `<dir>/docs/`.
 *
 * "Newest" = the highest `effectiveDate` among files matching `fee-schedule.*.json`,
 * falling back to lexical filename order (the date is embedded in the name) so a malformed
 * file without a parseable effectiveDate still sorts deterministically.
 *
 * @param {string} [dir] repo root (defaults to this package's repo root).
 * @returns {object} the parsed schedule, with a non-enumerable `_path` for diagnostics.
 */
export function loadSchedule(dir = REPO_ROOT_DEFAULT) {
  const docsDir = join(dir, "docs");
  let names;
  try {
    names = readdirSync(docsDir);
  } catch {
    throw new Error(`No docs/ directory found at ${docsDir} - cannot load a fee schedule.`);
  }
  const candidates = names.filter((n) => /^fee-schedule\..+\.json$/.test(n));
  if (candidates.length === 0) {
    throw new Error(`No fee-schedule.*.json found in ${docsDir} - fees require a dated schedule file.`);
  }

  const parsed = candidates
    .map((name) => {
      try {
        const sched = JSON.parse(readFileSync(join(docsDir, name), "utf8"));
        return { name, sched };
      } catch {
        return null; // skip unreadable / malformed JSON
      }
    })
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error(`No readable fee-schedule.*.json in ${docsDir}.`);
  }

  parsed.sort((a, b) => {
    const ea = typeof a.sched?.effectiveDate === "string" ? a.sched.effectiveDate : "";
    const eb = typeof b.sched?.effectiveDate === "string" ? b.sched.effectiveDate : "";
    if (ea !== eb) return ea < eb ? 1 : -1; // newest effectiveDate first
    return a.name < b.name ? 1 : -1; // then newest filename first
  });

  const chosen = parsed[0];
  Object.defineProperty(chosen.sched, "_path", {
    value: join(docsDir, chosen.name),
    enumerable: false,
  });
  return chosen.sched;
}

// -------------------------------------------------------------------------------------------------
// Claim counting (via the shared parser)
// -------------------------------------------------------------------------------------------------

/**
 * A claim is "multiple dependent" if its text refers to more than one other claim, e.g.
 * "claims 1 or 2", "any of claims 1-3", "claims 1, 2 or 3". This is a deliberately simple
 * TEXT heuristic on the claim section body - it is a worksheet aid, not a 37 CFR 1.75(c)
 * adjudication. A registered practitioner verifies the final count.
 */
const MULTIPLE_DEP_RE =
  /\bclaims?\s+\d+\s*(?:,\s*\d+\s*)*(?:\bor\b|\band\b|[-‐-―])\s*(?:claim\s+)?\d+/i;
const ANY_OF_CLAIMS_RE = /\bany\s+of\s+claims?\b/i;

/**
 * Count independent / total / multiple-dependent claims in `<matterDir>/logic/claims.md`.
 * Uses the shared parser's entity-section + binding extraction. A claim is counted by its
 * binding `type`: "claim-independent" vs "claim-dependent". Returns zeros if the file is absent.
 */
export function countClaims(matterDir) {
  let text;
  try {
    text = readFileSync(join(matterDir, "logic", "claims.md"), "utf8");
  } catch {
    return { independent: 0, total: 0, multipleDependent: 0 };
  }

  let independent = 0;
  let total = 0;
  let multipleDependent = 0;

  for (const section of iterEntitySections(text)) {
    const binding = extractBindingBlocks(section.body)[0] || {};
    const type = binding.type;
    if (type !== "claim-independent" && type !== "claim-dependent") continue; // not a claim entity
    total += 1;
    if (type === "claim-independent") independent += 1;
    // Multiple-dependent check is a text heuristic over the section's prose (above the binding).
    if (ANY_OF_CLAIMS_RE.test(section.body) || MULTIPLE_DEP_RE.test(section.body)) {
      multipleDependent += 1;
    }
  }

  return { independent, total, multipleDependent };
}

// -------------------------------------------------------------------------------------------------
// Fee computation
// -------------------------------------------------------------------------------------------------

function readEntityStatus(matterDir) {
  let text;
  try {
    text = readFileSync(join(matterDir, "PATENT.md"), "utf8");
  } catch {
    return "unknown";
  }
  const fm = parseFrontmatter(text);
  const raw = typeof fm.entity_status === "string" ? fm.entity_status.trim().toLowerCase() : "";
  return raw || "unknown";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute an itemized, entity-adjusted USPTO fee worksheet for a utility matter.
 *
 * @param {string} matterDir  path to the matter (contains PATENT.md, logic/claims.md).
 * @param {object} [opts]
 * @param {string} [opts.entityOverride]  "large"|"small"|"micro" - wins over PATENT.md.
 * @param {number} [opts.sheets]          total spec/drawing sheet count -> application-size fee.
 * @param {boolean}[opts.nonDocx]         add the non-DOCX filing surcharge.
 * @param {string} [opts.repoRoot]        repo root for schedule lookup (default: package repo root).
 * @param {object} [opts.schedule]        pre-loaded schedule (skips disk read; used by tests).
 * @returns {{lineItems:Array,subtotalLarge:number,entityStatus:string,multiplier:number,
 *            total:number,currency:string,effectiveDate:string,source:string,notes:string[]}}
 */
export function computeFees(matterDir, opts = {}) {
  const schedule = opts.schedule || loadSchedule(opts.repoRoot);
  const u = schedule.utility || {};
  const multipliers = schedule.entityMultipliers || { large: 1.0, small: 0.4, micro: 0.2 };

  const notes = [];

  // ---- Resolve entity status -------------------------------------------------------------------
  let entityStatus = opts.entityOverride
    ? String(opts.entityOverride).trim().toLowerCase()
    : readEntityStatus(matterDir);

  let assumedLarge = false;
  if (!VALID_ENTITIES.has(entityStatus)) {
    // "unknown" (or anything unrecognized) -> conservatively treat as LARGE (no discount asserted).
    assumedLarge = true;
    entityStatus = "large";
  }

  const multiplier = typeof multipliers[entityStatus] === "number" ? multipliers[entityStatus] : 1.0;

  // ---- Count claims (shared parser) ------------------------------------------------------------
  const { independent, total, multipleDependent } = countClaims(matterDir);

  // ---- Build line items (LARGE-entity `each`, then apply multiplier to `amount`) ---------------
  const items = [];
  const add = (code, label, each, qty) => {
    const e = typeof each === "number" ? each : 0;
    items.push({
      code,
      label,
      each: e,
      qty,
      amount: round2(e * qty * multiplier),
    });
  };

  // Base utility trio - always present for a utility filing.
  add("1011", "Basic filing fee - Utility", u.basicFiling, 1);
  add("1111", "Utility search fee", u.search, 1);
  add("1311", "Utility examination fee", u.examination, 1);

  // Excess claims.
  const excessIndep = Math.max(0, independent - 3);
  if (excessIndep > 0) {
    add("1201", "Each independent claim in excess of 3", u.excessIndependentOver3, excessIndep);
  }
  const excessTotal = Math.max(0, total - 20);
  if (excessTotal > 0) {
    add("1202", "Each claim in excess of 20", u.excessClaimsOver20, excessTotal);
  }
  // 37 CFR 1.16(j): the multiple-dependent-claim fee is owed ONCE PER APPLICATION containing any
  // multiple dependent claim - never per multiple-dependent claim. Charge a single unit.
  if (multipleDependent > 0) {
    add("1203", "Multiple dependent claim present (per application)", u.multipleDependentClaim, 1);
  }

  // Optional: application-size fee (per additional 50 sheets, or fraction, over 100).
  if (typeof opts.sheets === "number" && opts.sheets > 100) {
    const blocks = Math.ceil((opts.sheets - 100) / 50);
    add(
      "1081",
      "Application size fee (per 50 sheets, or fraction, over 100)",
      u.applicationSizePer50SheetsOver100,
      blocks,
    );
  }

  // Optional: non-DOCX filing surcharge.
  if (opts.nonDocx) {
    add("1054", "Non-DOCX filing surcharge", u.nonDocxSurcharge, 1);
  }

  const subtotalLarge = round2(
    items.reduce((s, it) => s + it.each * it.qty, 0),
  );
  const total_ = round2(items.reduce((s, it) => s + it.amount, 0));

  // ---- Notes (estimate caveat is MANDATORY) ----------------------------------------------------
  notes.push(
    "ESTIMATE ONLY - verify every amount against the live USPTO fee schedule (37 CFR 1.16/1.17) " +
      "before filing. This is a worksheet, not a bill.",
  );
  notes.push(`Fee schedule effective date: ${schedule.effectiveDate || "(unknown)"}.`);
  if (Array.isArray(schedule._unverified) && schedule._unverified.length > 0) {
    notes.push(
      `Schedule flags these fields as UNVERIFIED - confirm before relying: ${schedule._unverified.join(", ")}.`,
    );
  }
  if (assumedLarge) {
    notes.push(
      "Entity status was 'unknown' (or unset); LARGE-entity (no discount) was assumed. " +
        "Set entity_status in PATENT.md or pass entityOverride to apply a small-entity discount.",
    );
  }
  notes.push(
    "APA does NOT assert micro-entity status: 37 CFR 1.29 micro-entity status is a human " +
      "certification, not an APA determination. A micro figure is shown only if a human supplied it.",
  );

  return {
    lineItems: items,
    subtotalLarge,
    entityStatus,
    multiplier,
    total: total_,
    currency: schedule.currency || "USD",
    effectiveDate: schedule.effectiveDate || null,
    source: schedule.source || null,
    notes,
  };
}
