import test from "node:test";
import assert from "node:assert/strict";

import { search as searchCrossref, meta as crossrefMeta } from "../sources/crossref.mjs";
import { search as searchArxiv, meta as arxivMeta } from "../sources/arxiv.mjs";
import { search as searchFixture, meta as fixtureMeta } from "../sources/fixture.mjs";
import { buildSearchPlan, runSearch } from "../search.mjs";

test("crossref source maps Works API metadata to NormalizedRefs", async () => {
  assert.equal(crossrefMeta.id, "crossref");
  let seenUrl = "";
  const fetch = async (url) => {
    seenUrl = String(url);
    return ({
    ok: true,
    status: 200,
    json: async () => ({
      message: {
        "total-results": 1,
        items: [{
          DOI: "10.1145/1234567.8901234",
          title: ["A block video codec for point attributes"],
          abstract: "<jats:p>Encodes point attributes as atlas video.</jats:p>",
          "container-title": ["Proceedings of ExampleConf"],
          publisher: "ACM",
          issued: { "date-parts": [[2024, 5, 9]] },
          URL: "https://doi.org/10.1145/1234567.8901234",
          author: [{ given: "Ada", family: "Lovelace" }],
          subject: ["Computer graphics"],
        }],
      },
    }),
    });
  };
  const res = await searchCrossref({ keywords: ["point", "attribute", "codec"], limit: 5 }, { fetch });
  assert.equal(res.rawCount, 1);
  assert.equal(res.records[0].source, "crossref");
  assert.equal(res.records[0].docNumber, "DOI:10.1145/1234567.8901234");
  assert.equal(res.records[0].date, "2024-05-09");
  assert.match(res.records[0].snippet, /atlas video/);
  assert.match(res.notes.join(" "), /metadata candidate/);
  assert.match(seenUrl, /query=point\+attribute\+codec/);
});

test("arxiv source maps Atom entries to NormalizedRefs", async () => {
  assert.equal(arxivMeta.id, "arxiv");
  const xml = `<?xml version="1.0"?><feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
    <opensearch:totalResults>1</opensearch:totalResults>
    <entry>
      <id>http://arxiv.org/abs/2601.01234v2</id>
      <published>2026-01-02T00:00:00Z</published>
      <updated>2026-01-03T00:00:00Z</updated>
      <title>Gaussian splat video coding</title>
      <summary>Compresses dynamic Gaussian splats using video frames.</summary>
      <author><name>Grace Hopper</name></author>
      <category term="cs.CV" />
      <link title="pdf" href="http://arxiv.org/pdf/2601.01234v2" />
    </entry>
  </feed>`;
  const fetch = async () => ({ ok: true, status: 200, text: async () => xml });
  const res = await searchArxiv({ keywords: ["gaussian", "video", "coding"], limit: 5 }, { fetch });
  assert.equal(res.rawCount, 1);
  assert.equal(res.records[0].source, "arxiv");
  assert.equal(res.records[0].docNumber, "arXiv:2601.01234v2");
  assert.equal(res.records[0].date, "2026-01-02");
  assert.deepEqual(res.records[0].inventors, ["Grace Hopper"]);
  assert.match(res.notes.join(" "), /preprint metadata/);
});

test("broad search plan fans out distinct query strategies", async () => {
  const query = {
    keywords: [
      "gaussian primitive",
      "block-based video codec",
      "image atlas",
      "morton curve",
      "quantization range",
    ],
    cpc: ["G06T9/00"],
    limit: 10,
  };
  const plan = buildSearchPlan(query, { broad: true });
  assert.ok(plan.length >= 3);
  assert.ok(plan.some((p) => p.id === "core-technical"));
  assert.ok(plan.some((p) => p.id === "phrase-elements"));
  const res = await runSearch({ query, sources: ["mock"], opts: { broadSearch: true } });
  assert.ok(res.searchPlan.length >= 3);
  assert.ok(res.perSource.every((s) => s.strategy_id));
});

test("fixture source supports deterministic prior-art recall benchmarks", async () => {
  assert.equal(fixtureMeta.id, "fixture");
  const res = await searchFixture({
    keywords: ["out-of-distribution", "threshold"],
    limit: 5,
  }, {
    fixtureRecords: [{
      docNumber: "ARXIV-1610.02136",
      title: "A Baseline for Detecting Misclassified and Out-of-Distribution Examples in Neural Networks",
      abstract: "Uses thresholding for out-of-distribution detection.",
      snippet: "thresholding for out-of-distribution detection",
    }],
  });
  assert.equal(res.rawCount, 1);
  assert.equal(res.records[0].docNumber, "ARXIV-1610.02136");
  assert.equal(res.parameters.mode, "offline-benchmark-fixture");
});

test("ranked search candidates include audit explanations", async () => {
  const res = await runSearch({
    query: { keywords: ["out-of-distribution", "threshold"], cpc: [], limit: 5 },
    sources: ["fixture"],
    opts: {
      broadSearch: true,
      fixtureRecords: [{
        source: "fixture",
        docNumber: "ARXIV-1610.02136",
        title: "A Baseline for Detecting Misclassified and Out-of-Distribution Examples in Neural Networks",
        abstract: "Uses thresholding for out-of-distribution detection.",
        snippet: "thresholding for out-of-distribution detection",
      }],
    },
  });
  assert.equal(res.ranked.length, 1);
  assert.ok(res.ranked[0].rank_explanation);
  assert.ok(res.ranked[0].rank_explanation.score_breakdown.length > 0);
  assert.ok(res.searchPlan.some((p) => p.id === "term-variants"));
});
