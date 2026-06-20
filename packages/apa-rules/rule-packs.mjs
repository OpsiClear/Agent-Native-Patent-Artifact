import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RULE_PACK_DIR = join(ROOT, "docs", "rule-packs");
const ACTIVE_RULE_PACK_ID = "uspto-v1";

export function loadRulePack(id = ACTIVE_RULE_PACK_ID) {
  const file = id === "uspto-v1" ? "uspto.json" : `${id}.json`;
  const path = join(RULE_PACK_DIR, file);
  const pack = JSON.parse(readFileSync(path, "utf8"));
  return { ...pack, path: path.slice(ROOT.length + 1).replace(/\\/g, "/") };
}

export function currentRulePack() {
  return loadRulePack(ACTIVE_RULE_PACK_ID);
}

export function normalizeJurisdiction(value) {
  return String(value || "").trim().toUpperCase();
}

export function rulePackSummary(pack = currentRulePack()) {
  return {
    id: pack.id,
    jurisdiction: pack.jurisdiction,
    effective_date: pack.effective_date,
    status: pack.status,
    source: pack.path || "docs/rule-packs/uspto.json",
  };
}

export function evaluateMatterRulePack({ jurisdiction, rulesEffectiveDate } = {}, pack = currentRulePack()) {
  const normalized = normalizeJurisdiction(jurisdiction || pack.jurisdiction);
  const errors = [];
  const warnings = [];
  if (!jurisdiction) {
    warnings.push({
      code: "JURISDICTION_DEFAULTED",
      msg: `PATENT.md has no jurisdiction; defaulting to active rule pack '${pack.jurisdiction}'.`,
    });
  } else if (normalized !== normalizeJurisdiction(pack.jurisdiction)) {
    errors.push({
      code: "JURISDICTION_UNSUPPORTED",
      msg: `jurisdiction '${jurisdiction}' is not supported by active rule pack '${pack.id}' (${pack.jurisdiction}); route to jurisdiction-specific counsel/tooling.`,
    });
  }
  if (!rulesEffectiveDate) {
    warnings.push({
      code: "RULES_EFFECTIVE_DATE_MISSING",
      msg: `PATENT.md has no rules_effective_date; active rule pack '${pack.id}' is dated ${pack.effective_date}.`,
    });
  } else if (rulesEffectiveDate !== pack.effective_date) {
    warnings.push({
      code: "RULE_PACK_DATE_MISMATCH",
      msg: `PATENT.md rules_effective_date '${rulesEffectiveDate}' differs from active rule pack '${pack.id}' date ${pack.effective_date}; verify currency before relying.`,
    });
  }
  return {
    jurisdiction: normalized || pack.jurisdiction,
    rule_pack: rulePackSummary(pack),
    errors,
    warnings,
  };
}
