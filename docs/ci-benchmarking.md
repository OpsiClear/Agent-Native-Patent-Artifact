# APA CI Benchmarking

`scripts/benchmark.mjs --mock` is the deterministic CI benchmark gate. The blocking GitHub workflow also runs `npm run sources:check` and `npm run score:prior-art-search` as named steps, so source registry drift and prior-art retrieval regressions fail visibly instead of being hidden inside smoke output. Use `--case <id>` for targeted simulation/tuning loops such as `software-patent-skill-sim`.

Current blocking local/CI commands:

```bash
npm run sources:check
npm run benchmark
npm run score:prior-art-search
```

The skill graph layer adds the convention that every domain pack lists benchmark intentions in `domain.yaml` and future benchmark cases should include `targeted_skills` plus expected mechanical/semantic metrics.

Commit-gate benchmark cases must be public or synthetic, offline, and reproducible. Live LLM/domain-quality evaluation remains periodic or advisory unless a deterministic oracle is committed.

Recommended case fields:

- `id`, `kind`, `source_class`, `targeted_skills`, `expected`.
- `metrics` naming claim concepts, support coverage, figure coverage, and domain-specific gaps.
- `source` or `matter` paths that are public/synthetic and safe for CI.
