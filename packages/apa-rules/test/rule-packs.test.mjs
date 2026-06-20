import { test } from "node:test";
import assert from "node:assert/strict";

import {
  currentRulePack,
  evaluateMatterRulePack,
  loadRulePack,
  normalizeJurisdiction,
  rulePackSummary,
} from "../rule-packs.mjs";

test("currentRulePack loads the dated active USPTO pack", () => {
  const pack = currentRulePack();
  assert.equal(pack.id, "uspto-v1");
  assert.equal(pack.jurisdiction, "USPTO");
  assert.equal(pack.effective_date, "2026-06-15");
  assert.equal(pack.status, "active");
  assert.ok(pack.path.endsWith("docs/rule-packs/uspto.json"));
  assert.ok(pack.supported_application_types.includes("utility"));
});

test("rulePackSummary exposes stable report metadata", () => {
  assert.deepEqual(rulePackSummary(loadRulePack("uspto-v1")), {
    id: "uspto-v1",
    jurisdiction: "USPTO",
    effective_date: "2026-06-15",
    status: "active",
    source: "docs/rule-packs/uspto.json",
  });
});

test("evaluateMatterRulePack errors on non-USPTO and warns on date drift", () => {
  const state = evaluateMatterRulePack({ jurisdiction: "EPO", rulesEffectiveDate: "2025-01-01" });
  assert.equal(state.errors[0].code, "JURISDICTION_UNSUPPORTED");
  assert.ok(state.warnings.some((w) => w.code === "RULE_PACK_DATE_MISMATCH"));
});

test("missing jurisdiction defaults to USPTO with a warning, not an enabled foreign pack", () => {
  const state = evaluateMatterRulePack({ rulesEffectiveDate: "2026-06-15" });
  assert.equal(state.jurisdiction, "USPTO");
  assert.equal(state.errors.length, 0);
  assert.ok(state.warnings.some((w) => w.code === "JURISDICTION_DEFAULTED"));
  assert.equal(normalizeJurisdiction("uspto"), "USPTO");
});
