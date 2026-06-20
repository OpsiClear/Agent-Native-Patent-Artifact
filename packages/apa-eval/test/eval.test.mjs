/**
 * apa-eval tests - NO live network. We inject a mock `fetchImpl` (or use MockClient) that returns a
 * canned forced-tool `tool_use` verdict, so `node --test` runs fully offline and makes no API call.
 *
 * Covers:
 *   (a) client.judge parses the forced-tool verdict and CLAMPS the score into 1-5.
 *   (b) the deterministic pre-pass returns score 1 WITHOUT calling fetch, on a matter with a planted
 *       Level-1 error (a broken depends_on).
 *   (c) the judges return a real verdict on the clean example matter via the mock.
 *   (d) budgetGate flags both a claim-quality score drop and a >2x cost growth.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { makeClient, MockClient, clampScore, buildRequestBody, parseResponse, API_URL, DEFAULT_MODEL } from "../client.mjs";
import { judgeClaim, judgeSpec, judgePatentability, prePass, SKIP_RATIONALE } from "../judges.mjs";
import { budgetGate, compare, recordRun, latestRun, costOf, costUnitOf } from "../store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

// A mock fetch returning a forced-tool verdict. Records that it was called, and lets the test set the
// returned input (incl. an out-of-range score to prove clamping).
function mockFetch(verdictInput, { stop_reason } = {}) {
  const state = { calls: 0, lastBody: null };
  const impl = async (url, opts) => {
    state.calls += 1;
    state.lastBody = JSON.parse(opts.body);
    const content = stop_reason === "refusal"
      ? []
      : [{ type: "tool_use", name: "submit_verdict", id: "tu_1", input: verdictInput }];
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() { return { stop_reason: stop_reason || "tool_use", content, usage: { input_tokens: 100, output_tokens: 20 } }; },
      async text() { return ""; },
    };
  };
  impl.state = state;
  return impl;
}

const SCHEMA = { type: "object", properties: { score: { type: "integer" }, rationale: { type: "string" } }, required: ["score", "rationale"] };

// ------------------------------------------------------------------------------------------------
// (a) forced-tool parse + clamp, and the exact request shape
// ------------------------------------------------------------------------------------------------

test("clampScore clamps into 1-5 and rounds", () => {
  assert.equal(clampScore(9), 5);
  assert.equal(clampScore(0), 1);
  assert.equal(clampScore(-3), 1);
  assert.equal(clampScore(3), 3);
  assert.equal(clampScore(3.6), 4);
});

test("buildRequestBody forces the submit_verdict tool with the verdict schema", () => {
  const body = buildRequestBody({ model: "claude-opus-4-8", systemPrompt: "sys", userPrompt: "u", verdictSchema: SCHEMA });
  assert.equal(body.model, "claude-opus-4-8");
  assert.equal(body.max_tokens, 1024);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, "submit_verdict");
  assert.deepEqual(body.tools[0].input_schema, SCHEMA);
  assert.deepEqual(body.tool_choice, { type: "tool", name: "submit_verdict" });
  assert.equal("thinking" in body, false, "must NOT set a thinking param with a forced tool");
});

test("client.judge parses the forced-tool verdict and clamps an out-of-range score", async () => {
  const fetchImpl = mockFetch({ score: 9, rationale: "way out of range" });
  const client = makeClient({ apiKey: "sk-test", model: "claude-opus-4-8", fetchImpl });
  const verdict = await client.judge("sys", "user prompt", SCHEMA);
  assert.equal(fetchImpl.state.calls, 1);
  assert.equal(verdict.score, 5, "score 9 must be clamped to 5");
  assert.equal(verdict.rationale, "way out of range");
  // exact request shape
  assert.equal(fetchImpl.state.lastBody.tool_choice.name, "submit_verdict");
  assert.equal(fetchImpl.state.lastBody.model, "claude-opus-4-8");
});

test("client uses the documented endpoint + headers", async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, headers: opts.headers, method: opts.method, signal: opts.signal };
    return { ok: true, status: 200, statusText: "OK", async json() { return { content: [{ type: "tool_use", name: "submit_verdict", input: { score: 3, rationale: "ok" } }] }; }, async text() { return ""; } };
  };
  const client = makeClient({ apiKey: "sk-test", fetchImpl });
  await client.judge("s", "u", SCHEMA);
  assert.equal(seen.url, API_URL);
  assert.equal(seen.method, "POST");
  assert.ok(seen.signal, "client passes an AbortSignal for timeout enforcement");
  assert.equal(seen.headers["x-api-key"], "sk-test");
  assert.equal(seen.headers["anthropic-version"], "2023-06-01");
  assert.equal(seen.headers["content-type"], "application/json");
});

test("a refusal stop_reason yields a null verdict (never crashes)", async () => {
  const fetchImpl = mockFetch({}, { stop_reason: "refusal" });
  const client = makeClient({ apiKey: "sk-test", fetchImpl });
  const verdict = await client.judge("s", "u", SCHEMA);
  assert.equal(verdict, null);
});

test("a non-200 response throws a clear error with status + body", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, statusText: "Too Many Requests", async json() { return {}; }, async text() { return "rate limited"; } });
  const client = makeClient({ apiKey: "sk-test", fetchImpl, retryAttempts: 1 });
  await assert.rejects(() => client.judge("s", "u", SCHEMA), /429.*rate limited/s);
});

test("client retries transient fetch failures then parses the verdict", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary network failure");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() { return { content: [{ type: "tool_use", name: "submit_verdict", input: { score: 4, rationale: "recovered" } }] }; },
      async text() { return ""; },
    };
  };
  const client = makeClient({ apiKey: "sk-test", fetchImpl, retryAttempts: 2, retryDelayMs: 1 });
  const verdict = await client.judge("s", "u", SCHEMA);
  assert.equal(calls, 2);
  assert.equal(verdict.score, 4);
  assert.equal(verdict.rationale, "recovered");
});

test("client rejects an oversized API response before JSON parsing", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    async text() { return JSON.stringify({ content: [{ type: "tool_use", name: "submit_verdict", input: { score: 3, rationale: "x".repeat(200) } }] }); },
  });
  const client = makeClient({ apiKey: "sk-test", fetchImpl, maxResponseBytes: 80, retryAttempts: 1 });
  await assert.rejects(() => client.judge("s", "u", SCHEMA), /response too large/);
});

test("missing ANTHROPIC_API_KEY (non-mock) throws 'set ANTHROPIC_API_KEY'", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const client = makeClient({ fetchImpl: async () => { throw new Error("should not be called"); } });
    await assert.rejects(() => client.judge("s", "u", SCHEMA), /set ANTHROPIC_API_KEY/);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("parseResponse default model constant is the exact unsuffixed string", () => {
  assert.equal(DEFAULT_MODEL, "claude-opus-4-8");
  assert.equal(parseResponse({ content: [{ type: "tool_use", name: "submit_verdict", input: { score: 3, rationale: "x" } }] }).verdict.score, 3);
});

// ------------------------------------------------------------------------------------------------
// (b) deterministic pre-pass skips the paid call on a broken matter (fetch NOT called)
// ------------------------------------------------------------------------------------------------

test("pre-pass returns score 1 WITHOUT calling fetch on a planted Level-1 error", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "apa-eval-broken-"));
  const matter = join(tmp, "matter");
  cpSync(EXAMPLE, matter, { recursive: true });

  // Plant a Level-1 ERROR: break CLM02's depends_on so it points at a nonexistent claim.
  const claimsPath = join(matter, "logic", "claims.md");
  const broken = readFileSync(claimsPath, "utf8").replace("depends_on: CLM01", "depends_on: CLM99");
  writeFileSync(claimsPath, broken);

  // Sanity: the pre-pass must classify the matter as broken.
  const pp = prePass(matter);
  assert.equal(pp.broken, true, "expected a Level-1 error from the broken depends_on");
  assert.ok(pp.errorCodes.includes("DEP_UNRESOLVED"));

  // A fetch impl that fails the test if it is ever called.
  let called = 0;
  const fetchImpl = async () => { called += 1; throw new Error("fetch must NOT be called when the pre-pass fails"); };
  const client = makeClient({ apiKey: "sk-test", fetchImpl });

  const verdict = await judgeClaim(client, matter);
  assert.equal(called, 0, "fetch must not be called on a structurally broken matter");
  assert.equal(verdict.score, 1);
  assert.equal(verdict.rationale, SKIP_RATIONALE);
  assert.equal(verdict.skipped, true);
  assert.ok(verdict.structural_errors.includes("DEP_UNRESOLVED"));
});

// ------------------------------------------------------------------------------------------------
// (c) judges return a verdict on the clean example via the mock (no network)
// ------------------------------------------------------------------------------------------------

test("judges return verdicts on the clean example matter via MockClient", async () => {
  const client = new MockClient((sys) => {
    if (/PRIOR-ART DETECTION/.test(sys)) return { score: 4, rationale: "closest art flagged", anticipated_claims: [], closest_reference: "PA01" };
    if (/WRITTEN DESCRIPTION/.test(sys)) return { score: 5, rationale: "fully supported" };
    return { score: 4, rationale: "claims commensurate with support" };
  });

  const claim = await judgeClaim(client, EXAMPLE);
  const spec = await judgeSpec(client, EXAMPLE);
  const pat = await judgePatentability(client, EXAMPLE, ["A planter with a reservoir and a wick but no float-actuated valve."]);

  assert.equal(claim.dimension, "claim");
  assert.equal(claim.score, 4);
  assert.equal(spec.dimension, "spec");
  assert.equal(spec.score, 5);
  assert.equal(pat.dimension, "patentability");
  assert.equal(pat.closest_reference, "PA01");
  assert.equal(client.calls.length, 3, "one judge call per dimension");
  // injection fence present in the user prompt
  assert.match(client.calls[0].userPrompt, /<<<UNTRUSTED>>>/);
  assert.match(client.calls[0].userPrompt, /<<<END UNTRUSTED>>>/);
  // planted ref reached the patentability prompt
  assert.match(client.calls[2].userPrompt, /float-actuated valve/);
});

test("MockClient clamps and a null canned verdict yields an abstain verdict", async () => {
  const client = new MockClient({ score: 99, rationale: "too high" });
  const v = await judgeClaim(client, EXAMPLE);
  assert.equal(v.score, 5);

  const nullClient = new MockClient(null);
  const v2 = await judgeClaim(nullClient, EXAMPLE);
  assert.equal(v2.score, null);
  assert.equal(v2.abstained, true);
});

// ------------------------------------------------------------------------------------------------
// (d) budgetGate flags a score drop and a >2x cost growth
// ------------------------------------------------------------------------------------------------

const runWith = (claimScore, cost) => ({ dimensions: { claim: { score: claimScore }, spec: { score: 4 }, patentability: { score: 4 } }, cost });

test("budgetGate flags a claim-quality score drop", () => {
  const prev = runWith(4, 100);
  const cur = runWith(3, 100);
  const gate = budgetGate(prev, cur);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => /claim-quality score dropped/.test(r)));
});

test("budgetGate flags >2x cost growth", () => {
  const prev = runWith(4, 100);
  const cur = runWith(4, 250);
  const gate = budgetGate(prev, cur);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => /cost grew >2x/.test(r)));
});

test("budgetGate passes on a stable run, and on the very first run", () => {
  assert.equal(budgetGate(runWith(4, 100), runWith(4, 150)).ok, true);
  assert.equal(budgetGate(null, runWith(4, 100)).ok, true);
});

test("compare reports per-dimension deltas and regressions", () => {
  const c = compare(runWith(4, 100), { dimensions: { claim: { score: 5 }, spec: { score: 2 }, patentability: { score: 4 } } });
  assert.equal(c.deltas.length, 3);
  assert.equal(c.regressions.length, 1);
  assert.equal(c.regressions[0].dimension, "spec");
});

test("costOf sums token usage when present, else counts non-skipped judge calls", () => {
  const tokenRun = { dimensions: { claim: { score: 4, usage: { input_tokens: 100, output_tokens: 20 } }, spec: { score: 4, usage: { input_tokens: 50, output_tokens: 10 } } } };
  assert.equal(costOf(tokenRun), 180);
  const callRun = { dimensions: { claim: { score: 4 }, spec: { score: 4 }, patentability: { score: 1, skipped: true } } };
  assert.equal(costOf(callRun), 2, "two non-skipped calls; the pre-pass-skipped one is free");
});

test("recordRun/latestRun round-trips a timestamped record (timestamp passed in)", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-eval-store-"));
  recordRun(dir, runWith(4, 100), "2026-06-15T10:00:00.000Z");
  recordRun(dir, runWith(5, 120), "2026-06-15T11:00:00.000Z");
  const latest = latestRun(dir);
  assert.equal(latest.timestamp, "2026-06-15T11:00:00.000Z");
  assert.equal(latest.dimensions.claim.score, 5);
  assert.throws(() => recordRun(dir, runWith(4, 100)), /timestamp is required/);
});

// ------------------------------------------------------------------------------------------------
// (e) REGRESSION: finalize() must NOT let the adversarial model forge dimension/skipped/usage.
//     A model returning {dimension:"HACKED", skipped:true} could otherwise (1) mis-route results and
//     (2) make cli.mjs skip usage attachment (`!verdict.skipped`), zeroing the cost of a paid call and
//     evading budgetGate's >2x check. finalize() whitelists the model's fields and stamps trusted ones.
// ------------------------------------------------------------------------------------------------

test("finalize ignores a model-forged dimension/skipped/usage (adversarial verdict)", async () => {
  const client = new MockClient(() => ({
    score: 4,
    dimension: "HACKED",      // model tries to forge the routing dimension
    skipped: true,            // model tries to mark a PAID call as free
    usage: { input_tokens: 0, output_tokens: 0 }, // model tries to forge its own usage
    rationale: "r",
  }));

  const v = await judgeClaim(client, EXAMPLE);

  // trusted dimension wins, NOT the forged one
  assert.equal(v.dimension, "claim");
  // the model can never set `skipped` (only skippedVerdict()/the pre-pass can)
  assert.ok(!v.skipped, "model must not be able to set skipped:true");
  // the model can never inject its own `usage` into the finalized verdict
  assert.equal("usage" in v, false, "model-supplied usage must not survive finalize()");
  // the whitelisted, clamped fields DO survive
  assert.equal(v.score, 4);
  assert.equal(v.rationale, "r");

  // and therefore cli.mjs's guard `if (client.lastUsage && !verdict.skipped)` STILL attaches usage,
  // so store.costOf() sees a real (non-zero) cost and the >2x gate is not evaded.
  assert.equal(!v.skipped, true);
  if (client.lastUsage && !v.skipped) v.usage = { input_tokens: 100, output_tokens: 20 };
  assert.equal(costOf({ dimensions: { claim: v } }), 120, "the paid call must be costed in tokens, not zeroed");
});

test("clampVerdict still bounds a forged out-of-range score after whitelisting", async () => {
  const client = new MockClient(() => ({ score: 99, dimension: "HACKED", skipped: true, rationale: "x" }));
  const v = await judgeClaim(client, EXAMPLE);
  assert.equal(v.score, 5, "score 99 must still be clamped to 5");
  assert.equal(v.dimension, "claim");
  assert.ok(!v.skipped);
});

// the deterministic pre-pass path is the ONLY thing allowed to set skipped:true
test("skipped:true is reserved for the deterministic pre-pass (not the model)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "apa-eval-skip-"));
  const matter = join(tmp, "matter");
  cpSync(EXAMPLE, matter, { recursive: true });
  const claimsPath = join(matter, "logic", "claims.md");
  writeFileSync(claimsPath, readFileSync(claimsPath, "utf8").replace("depends_on: CLM01", "depends_on: CLM99"));

  // even if the (never-reached) model would forge skipped:false, the pre-pass sets skipped:true.
  const client = new MockClient(() => ({ score: 4, skipped: false, rationale: "should not be used" }));
  const v = await judgeClaim(client, matter);
  assert.equal(v.skipped, true, "the pre-pass legitimately marks this skipped");
  assert.equal(v.rationale, SKIP_RATIONALE);
});

// ------------------------------------------------------------------------------------------------
// (f) REGRESSION: budgetGate must not compare cost magnitudes across DIFFERENT cost units.
//     A call-count-costed mock run vs a later token-costed live run (or vice versa) is meaningless;
//     comparing them produces a spurious or masked >2x regression. The gate tags the unit and skips.
// ------------------------------------------------------------------------------------------------

const callRun = (claimScore) => ({ dimensions: { claim: { score: claimScore }, spec: { score: 4 }, patentability: { score: 4 } } });
const tokenRun = (claimScore, perDim) => ({
  dimensions: {
    claim: { score: claimScore, usage: { input_tokens: perDim, output_tokens: 0 } },
    spec: { score: 4, usage: { input_tokens: perDim, output_tokens: 0 } },
    patentability: { score: 4, usage: { input_tokens: perDim, output_tokens: 0 } },
  },
});

test("costUnitOf reports tokens vs calls", () => {
  assert.equal(costUnitOf(callRun(4)), "calls");
  assert.equal(costUnitOf(tokenRun(4, 100)), "tokens");
  // an explicit costUnit on a record (e.g. a persisted run) is honored
  assert.equal(costUnitOf({ costUnit: "tokens", dimensions: {} }), "tokens");
});

test("budgetGate does NOT report a spurious cost regression across different cost units", () => {
  // prev costed by call-count (=3 calls), cur costed by tokens (=300). 300 > 3*2 would FALSELY trip
  // the old >2x check; the unit mismatch must skip it and keep the gate green.
  const prev = callRun(4);          // unit: calls, cost 3
  const cur = tokenRun(4, 100);     // unit: tokens, cost 300
  const gate = budgetGate(prev, cur);
  assert.equal(gate.ok, true, "a unit change must not be reported as a cost regression");
  assert.equal(gate.reasons.length, 0, "no failing reason on a unit mismatch");
  assert.ok(gate.notes.some((n) => /cost unit changed/.test(n)), "the skip is surfaced as a note");

  // the reverse direction (tokens -> calls) is also non-comparable and must not flip the gate.
  const gate2 = budgetGate(tokenRun(4, 100), callRun(4));
  assert.equal(gate2.ok, true);
  assert.ok(gate2.notes.some((n) => /cost unit changed/.test(n)));
});

test("budgetGate STILL flags same-unit >2x cost growth (token-costed)", () => {
  const prev = tokenRun(4, 100);    // 300 tokens
  const cur = tokenRun(4, 250);     // 750 tokens > 2x
  const gate = budgetGate(prev, cur);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => /cost grew >2x/.test(r)));
});

test("a unit mismatch never masks a real claim-quality score drop", () => {
  // even though the cost units differ, a claim drop must still FAIL the gate.
  const gate = budgetGate(callRun(4), tokenRun(3, 100));
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => /claim-quality score dropped/.test(r)));
});
