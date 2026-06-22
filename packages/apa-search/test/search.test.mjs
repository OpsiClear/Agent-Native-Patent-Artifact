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

test("runSearch can expand citation-neighborhood candidates with audit metadata", async () => {
  const res = await runSearch({
    query: { keywords: ["linked", "ranking"], cpc: [], limit: 10 },
    sources: ["fixture"],
    opts: {
      citationExpand: true,
      fixtureRecords: [{
        source: "fixture",
        docNumber: "US-1-A",
        title: "Linked database ranking",
        abstract: "Ranks linked documents.",
        snippet: "Ranks linked documents.",
        backwardCitations: [{
          docNumber: "NPL-LINK-1",
          title: "Link graph ranking",
          abstract: "Ranks nodes in a link graph.",
          snippet: "Ranks nodes in a link graph.",
        }],
        forwardCitations: [{
          docNumber: "US-2-B",
          title: "Improved linked ranking",
          abstract: "Improves ranking in linked databases.",
          snippet: "Improves ranking in linked databases.",
        }],
      }],
    },
  });
  assert.equal(res.citationExpansion.enabled, true);
  assert.equal(res.citationExpansion.added_count, 2);
  assert.ok(res.ranked.some((r) => r.docNumber === "NPL-LINK-1" && r.citation_expansion.relation === "backward"));
  assert.ok(res.ranked.some((r) => r.docNumber === "US-2-B" && r.citation_expansion.relation === "forward"));
});

test("controlled term variants help rank synonym references without beating exact primary matches", async () => {
  const res = await runSearch({
    query: {
      keywords: ["dictionary compression", "string table", "variable length code"],
      cpc: [],
      limit: 10,
    },
    sources: ["fixture"],
    opts: {
      broadSearch: true,
      fixtureRecords: [
        {
          source: "fixture",
          docNumber: "NPL-PRIMARY",
          title: "Dictionary compression using string tables",
          abstract: "Dictionary compression with a string table and variable length code output.",
          snippet: "dictionary compression with a string table",
        },
        {
          source: "fixture",
          docNumber: "NPL-SYNONYM",
          title: "Compression of Individual Sequences via Variable-Rate Coding",
          abstract: "Adaptive dictionary coding uses a string dictionary of stored strings and emits variable-rate codes.",
          snippet: "adaptive dictionary coding with a string dictionary and variable-rate codes",
        },
        {
          source: "fixture",
          docNumber: "NPL-DISTRACTOR",
          title: "Minimum-redundancy codes",
          abstract: "Variable length code words are assigned from symbol frequencies without adaptive dictionary coding.",
          snippet: "variable length code words from symbol frequencies",
        },
      ],
    },
    confirmMedium: true,
  });
  assert.equal(res.ranked[0].docNumber, "NPL-PRIMARY");
  assert.equal(res.ranked[1].docNumber, "NPL-SYNONYM");
  assert.ok(res.ranked[1].rank_explanation.matched_variants.length >= 1);
});
