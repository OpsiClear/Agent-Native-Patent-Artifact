# APA CI Benchmarking

`scripts/benchmark.mjs --mock` is the deterministic CI benchmark gate. The skill graph layer adds the convention that every domain pack lists benchmark intentions in `domain.yaml` and future benchmark cases should include `targeted_skills` plus expected mechanical/semantic metrics.

Commit-gate benchmark cases must be public or synthetic, offline, and reproducible. Live LLM/domain-quality evaluation remains periodic or advisory unless a deterministic oracle is committed.

Recommended case fields:

- `id`, `kind`, `source_class`, `targeted_skills`, `expected`.
- `metrics` naming claim concepts, support coverage, figure coverage, and domain-specific gaps.
- `source` or `matter` paths that are public/synthetic and safe for CI.
