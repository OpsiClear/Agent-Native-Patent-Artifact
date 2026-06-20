import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanQueryAtSink, buildQueryFromClaims, runSearch, queryToString } from "../search.mjs";
import { normalizeDocNumber } from "../lib/refs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("scan-at-sink: clean query passes", () => {
  const v = scanQueryAtSink({ keywords: ["self-watering", "float", "valve"] });
  assert.equal(v.ok, true);
  assert.equal(v.blocked, false);
});

test("scan-at-sink: a HIGH secret in the query BLOCKS egress", () => {
  const v = scanQueryAtSink({ keywords: ["valve", "AKIA3KZ7QWER9TYU2PXM"] });
  assert.equal(v.blocked, true);
  assert.ok(v.high.length >= 1);
});

test("scan-at-sink: a MEDIUM marker holds for confirmation", () => {
  const v = scanQueryAtSink({ keywords: ["CONFIDENTIAL", "valve"] });
  assert.equal(v.blocked, false);
  assert.equal(v.needsConfirm, true);
});

test("buildQueryFromClaims pulls element keywords from the example", () => {
  const q = buildQueryFromClaims(EXAMPLE);
  for (const k of ["reservoir", "float", "valve", "wick"]) assert.ok(q.keywords.includes(k), `missing ${k}: ${q.keywords}`);
});

test("runSearch (mock): dedupes and ranks; blocked query returns no results", async () => {
  const q = { keywords: ["reservoir", "float", "valve", "wick"], cpc: ["A01G27/00"], limit: 10 };
  const res = await runSearch({ query: q, sources: ["mock"] });
  assert.equal(res.blocked, false);
  assert.ok(Array.isArray(res.rawRecords));
  assert.ok(Array.isArray(res.dedupe.clusters));
  assert.ok(res.dedupe.excludedResults.some((r) => r.reason === "duplicate-doc-number"));
  assert.equal(res.perSource[0].parameters.mode, "deterministic-fixture");
  // mock returns "US-10000001-B2" AND a comma/space-formatted duplicate "US 10,000,001 B2";
  // they must collapse to ONE canonical key. 4 records -> 3 unique.
  const keys = res.ranked.map((r) => normalizeDocNumber(r.docNumber));
  assert.equal(new Set(keys).size, keys.length, "duplicates not removed: " + JSON.stringify(res.ranked.map((r) => r.docNumber)));
  assert.equal(res.ranked.length, 3, "expected the formatted duplicate to merge: " + JSON.stringify(res.ranked.map((r) => r.docNumber)));
  // the float-actuated valve patent should rank at the top
  assert.match(res.ranked[0].docNumber, /10000001/);

  const blocked = await runSearch({ query: { keywords: ["AKIA3KZ7QWER9TYU2PXM"] }, sources: ["mock"] });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.ranked.length, 0);
});

test("queryToString joins the egressing terms", () => {
  assert.equal(queryToString({ keywords: ["a", "b"], cpc: ["C1"], assignee: "X" }), "a b C1 X");
});
