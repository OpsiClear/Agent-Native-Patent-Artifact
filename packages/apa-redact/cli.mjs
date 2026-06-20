#!/usr/bin/env node
/**
 * apa-redact CLI — scan text for secrets/PII/legal/patent content at a sink.
 *
 * Plain-ESM, zero-dependency Node.js port of gstack's `bin/gstack-redact`. Reads
 * from stdin (default) or `--from-file PATH`, scans via the pure engine, and
 * prints findings as JSON (`--json`) or a human table.
 *
 * Exit codes (consumed by a caller to gate a prior-art search query, a cloud-LLM
 * payload, or a filing submission):
 *   0  clean (no HIGH, no MEDIUM)
 *   2  MEDIUM present (no HIGH) — caller runs per-finding confirmation
 *   3  HIGH present            — caller BLOCKS
 *
 * LOW findings never change the exit code.
 *
 * Flags:
 *   --json                    Emit JSON {findings, counts, repoVisibility, oversize}
 *   --repo-visibility V       public | private | unknown (default: unknown = public-strict wording)
 *   --from-file PATH          Read input from PATH instead of stdin (scan-at-sink)
 *   --allowlist PATH          Newline-delimited exact spans to suppress
 *   --self-email EMAIL        Suppress the invoking user's own email
 *   --repo-public-emails PATH Newline-delimited repo-public emails to suppress
 *   --auto-redact IDS         Comma-separated finding ids to auto-redact; prints
 *                             the redacted body to stdout + diff to stderr, exit 0.
 *   --max-bytes N             Override the fail-closed size cap (default 1 MiB).
 *
 * Security note: this is a GUARDRAIL, not airtight enforcement. A determined user
 * can always bypass it. It catches accidents. In non-json mode the CLI NEVER
 * echoes a matched secret value to stdout — only category + offset + a masked
 * preview. The JSON output is masked too (`excerpt` only; the raw secret is
 * never emitted).
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import process from "node:process";

import {
  DEFAULT_MAX_BYTES,
  scan,
  scanFile,
  applyRedactionsDetailed,
  exitCodeFor,
  countsFor,
  isOversize,
} from "./redact-engine.mjs";

const MAX_INPUT_BYTES = 16 * 1024 * 1024; // hard ceiling before the engine cap

// ── Arg parsing (no dependencies) ─────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name) {
  return process.argv.includes(name);
}

function readLines(path) {
  if (!path || !existsSync(path)) return undefined;
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function readStdin() {
  // Synchronous full read of fd 0. readFileSync(0) drains all of stdin at once.
  let data;
  try {
    data = readFileSync(0);
  } catch {
    data = Buffer.alloc(0);
  }
  if (data.length > MAX_INPUT_BYTES) {
    process.stderr.write("apa-redact: stdin too large\n");
    process.exit(3);
  }
  return data.toString("utf8");
}

function readFromFile(path) {
  return readFileSync(path, "utf8");
}

function buildOpts(repoVisibility, maxBytes) {
  return {
    repoVisibility,
    allowlist: readLines(arg("--allowlist")),
    selfEmail: arg("--self-email"),
    repoPublicEmails: readLines(arg("--repo-public-emails")),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
  };
}

function humanTable(findings) {
  if (!findings.length) return "  (no findings)";
  return findings
    .map((f) => {
      const loc = `${f.line}:${f.col}`;
      return `  ${String(f.severity).padEnd(6)} ${String(f.patternName).padEnd(32)} ${loc.padEnd(8)} ${f.excerpt}`;
    })
    .join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // --repo-visibility validation.
  const visRaw = arg("--repo-visibility") || "unknown";
  const repoVisibility = ["public", "private", "unknown"].includes(visRaw) ? visRaw : "unknown";

  // --max-bytes: validate the RAW string (parseInt-style coercion silently
  // corrupts the fail-closed oversize guard).
  const maxBytesRaw = arg("--max-bytes");
  let maxBytes;
  if (maxBytesRaw !== undefined) {
    if (!/^\d+$/.test(maxBytesRaw) || Number(maxBytesRaw) <= 0) {
      process.stderr.write(
        `apa-redact: --max-bytes must be a positive integer (got "${maxBytesRaw}")\n`,
      );
      process.exit(1);
    }
    maxBytes = Number(maxBytesRaw);
  }

  const opts = buildOpts(repoVisibility, maxBytes);
  const fromFile = arg("--from-file");

  // --from-file boundary cap (fail closed before reading a giant file).
  if (fromFile) {
    let size = null;
    try {
      size = statSync(fromFile).size;
    } catch {
      process.stderr.write(`apa-redact: cannot stat --from-file (${fromFile})\n`);
      process.exit(1);
    }
    if (size !== null && size > MAX_INPUT_BYTES) {
      process.stderr.write(`apa-redact: input file too large (${size} bytes)\n`);
      process.exit(3);
    }
  }

  // Auto-redact mode: print redacted body to stdout, diff to stderr, exit 0.
  const autoIds = arg("--auto-redact");
  if (autoIds) {
    const text = fromFile ? readFromFile(fromFile) : readStdin();
    const findings = scan(text, opts);
    const onlyNames = autoIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { body, diff, skipped } = applyRedactionsDetailed(text, findings, { onlyNames });
    process.stdout.write(body);
    if (diff) process.stderr.write(diff + "\n");
    if (skipped.length) {
      process.stderr.write(
        `\napa-redact: ${skipped.length} finding(s) could not be auto-redacted ` +
          "(structural) — edit manually:\n" +
          skipped.map((f) => `  ${f.patternName} @ ${f.line}:${f.col}`).join("\n") +
          "\n",
      );
    }
    process.exit(0);
  }

  // Scan mode. Prefer scanFile so we honor the scan-at-sink discipline: we scan
  // the EXACT bytes on disk, not a re-decoded string.
  const findings = fromFile ? scanFile(fromFile, opts) : scan(readStdin(), opts);
  const code = exitCodeFor(findings);
  const counts = countsFor(findings);
  const oversize = isOversize(findings);

  if (flag("--json")) {
    const payload = {
      findings, // each carries `excerpt` (masked) — never the raw secret
      counts,
      repoVisibility: findings.length ? findings[0].repoVisibility : repoVisibility,
      oversize,
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    const vis = repoVisibility.toUpperCase();
    process.stdout.write(`apa-redact scan — repo ${vis}\n`);
    if (oversize) {
      process.stdout.write("  BLOCKED — input too large to scan safely (fail-closed)\n");
    } else {
      // NEVER echo a raw matched secret in non-json mode — masked preview only.
      process.stdout.write(humanTable(findings) + "\n");
      process.stdout.write(`  HIGH=${counts.HIGH} MEDIUM=${counts.MEDIUM} LOW=${counts.LOW}\n`);
      if ((repoVisibility === "public" || repoVisibility === "unknown") && counts.MEDIUM > 0) {
        process.stdout.write(
          "  NOTE: public/unknown visibility — confirm each MEDIUM finding " +
            "individually before sending (no batch-acknowledge).\n",
        );
      }
    }
  }
  process.exit(code);
}

main();
