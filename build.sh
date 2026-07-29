#!/usr/bin/env bash
# Build delegates to the canonical npm gate so shell and npm entrypoints cannot drift.
set -euo pipefail
cd "$(dirname "$0")"

npm run build
