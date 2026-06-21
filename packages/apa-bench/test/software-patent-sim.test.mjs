import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runSoftwarePatentSimulation,
  simulateSoftwarePatentScenario,
} from "../software-patent-sim.mjs";

test("software patent simulation suite passes all scenario contracts", () => {
  const result = runSoftwarePatentSimulation();
  assert.equal(result.status, "pass", result.findings.map((f) => f.message).join("\n"));
  assert.equal(result.metrics.scenarios, 6);
  assert.equal(result.metrics.score, 1);
  assert.equal(result.metrics.domain_output_contract_ok, true);
});

test("software patent simulator blocks thin SaaS claim drafting and permits supported codec families", () => {
  const thin = simulateSoftwarePatentScenario({
    id: "thin",
    traits: ["business_automation", "generic_computer", "missing_technical_mechanism", "result_only"],
    support: { mechanism: false, algorithm: false, technical_effect: false, non_transitory_storage: false },
    requested_claim_types: ["method", "system", "non_transitory_crm"],
  });
  assert.equal(thin.support_state.overall, "needs-inventor-confirmation");
  assert.deepEqual(thin.claim_family, {
    method: "unsupported",
    system: "unsupported",
    non_transitory_crm: "unsupported",
  });
  assert.ok(thin.eligibility_flags.some((f) => f.risk === "abstract-idea"));
  assert.ok(thin.support_flags.some((f) => f.risk === "missing-algorithm"));

  const codec = simulateSoftwarePatentScenario({
    id: "codec",
    traits: ["codec", "technical_mechanism", "measured_effect", "data_transform"],
    support: { mechanism: true, algorithm: true, technical_effect: true, non_transitory_storage: true },
    requested_claim_types: ["method", "system", "non_transitory_crm"],
  });
  assert.equal(codec.support_state.overall, "supported-now");
  assert.deepEqual(codec.claim_family, {
    method: "proposed",
    system: "proposed",
    non_transitory_crm: "proposed",
  });
  assert.equal(codec.eligibility_flags.length, 0);
  assert.equal(codec.support_flags.length, 0);
});
