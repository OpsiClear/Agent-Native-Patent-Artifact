#!/usr/bin/env node
/**
 * apa-bench package entrypoint.
 *
 * The deterministic benchmark implementation lives in scripts/benchmark.mjs for historical
 * compatibility. This wrapper gives the architecture a package-level command without duplicating the
 * runner.
 */
import { main as runBenchmarkCli } from "../../scripts/benchmark.mjs";

try {
  process.exit(runBenchmarkCli(process.argv.slice(2)));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
