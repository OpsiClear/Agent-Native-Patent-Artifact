# APA Benchmark Fixtures

These fixtures are intentionally small, offline, and deterministic. They are not legal opinions,
patentability conclusions, clearance searches, filing packages, or representative drafting quality
claims. They exist to catch regressions in the APA mechanics and review gates.

Fixture policy:
- Use only public patents, public Office Action/sample prosecution documents, or synthetic
  disclosures.
- Keep source provenance beside each fixture.
- Keep paid LLM evaluation out of commit gates. `scripts/benchmark.mjs --mock` is the deterministic
  gate; live model evaluation remains periodic/advisory.
- Do not include confidential, client, unfiled, or private disclosure material.

Run:

```bash
node scripts/benchmark.mjs --mock
node scripts/benchmark.mjs --mock --json --out benchmark-results.json
node scripts/benchmark.mjs --mock --case software-patent-skill-sim
```

Use `/apa-public-patent-benchmark` when creating a new real public patent fixture. It converts the
public record into `source.md`, builds a source-span expected oracle, runs a target skill such as
`/apa-software-patent`, and emits a reproduction report before a case is adopted into CI.

Advisory public software-patent runs:

- `fixtures/public-software-patent-pagerank/` - PageRank linked-database ranking (`US6285999`).
- `fixtures/public-software-patent-mapreduce/` - heterogeneous-schema distributed MapReduce (`US8190610`).
- `fixtures/public-software-patent-ood-vehicle/` - autonomous-driving out-of-distribution detection (`US11603119`).

These are browser-extracted advisory fixtures. Direct CLI/Playwright access to the public Justia
pages returned Cloudflare verification pages during extraction, while Google Patents pages were
accessible through Playwright Chromium without challenge. Keep them out of `benchmarks/index.json`
until a deterministic public source fetch path is added.
