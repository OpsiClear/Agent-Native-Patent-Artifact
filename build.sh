#!/usr/bin/env bash
# Build = regenerate skill docs from templates + run the full test suite. Cross-platform via `node`
# (no Bun/Python required). Equivalent to `npm run build`.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> gen-skill-docs"
node scripts/gen-skill-docs.mjs

echo "==> freshness check"
node scripts/gen-skill-docs.mjs --check

echo "==> tests"
node --test "packages/**/*.test.mjs" "lib/**/*.test.mjs" "scripts/**/*.test.mjs" "hosts/**/*.test.mjs" "test/**/*.test.mjs"

echo "==> validate example matter"
node packages/apa-validate/validate.mjs examples/minimal-patent-artifact

echo "OK"
