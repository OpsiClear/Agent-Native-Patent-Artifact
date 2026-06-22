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
npm run score:real-software-patents
npm run tune:software-patent -- --json
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

`npm run score:real-software-patents` scores these committed fixtures offline. It does not fetch
patent pages, call an LLM, or assert eligibility, validity, infringement, patentability, or freedom
to operate. The scorer reads each fixture's `source.md`, `expected.json`, and latest
`runs/*/software_patent_report.json`, verifies source hashes, checks source-span discipline, rewards
recovery of source-backed technical mechanisms, and blocks forbidden legal-conclusion phrases.

`npm run tune:software-patent -- --json` creates fresh candidate reports under
`.apa/tune/software-patent/<run-id>/` from public `source.md` and the current
`/apa-software-patent` skill instructions, then scores those candidates with tuning floors. Use this
for skill-tuning loops so committed advisory reports are not mistaken for fresh outputs.

Use the synthetic `software-patent-skill-sim` case as the fast regression guard for common traps
such as thin SaaS claims, AI black boxes, math-only claims, and CRM transitory risk. Use the fresh
real-public software-patent tuning command as the fixed metric for skill tuning. Auto-tune runs
should improve the real-patent average score or reduce warnings while keeping
`npm run simulate:software-patent` and `npm run skills:check` passing.
