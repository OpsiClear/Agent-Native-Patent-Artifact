#!/usr/bin/env node
// Compatibility entrypoint. Canonical benchmark runtime lives in packages/apa-bench.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { main } from "../packages/apa-bench/benchmark.mjs";

export * from "../packages/apa-bench/benchmark.mjs";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
}
