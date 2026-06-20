#!/usr/bin/env node
/**
 * apa-safe - guarded external sink wrappers.
 *
 * Exit codes follow apa-redact:
 *   0 clean or explicitly approved MEDIUM findings
 *   2 MEDIUM hold / policy refusal
 *   3 HIGH block
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  appendSinkRunlog,
  assertPinnedPackageSpec,
  buildNpxPayload,
  exitCodeForApproval,
  fetchTextWithBounds,
  scanBytesAtSink,
  scanFileAtSink,
  wrapFetchedText,
} from "./sinks.mjs";

function flag(args, name) {
  return args.includes(name);
}

function value(args, name, fallback = undefined) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

function readStdinBuffer() {
  try {
    return readFileSync(0);
  } catch {
    return Buffer.alloc(0);
  }
}

function commandFromInvocation(argv) {
  const bin = basename(argv[1] || "").toLowerCase();
  if (bin.includes("apa-safe-fetch")) return { cmd: "fetch", args: argv.slice(2) };
  if (bin.includes("apa-safe-send")) return { cmd: "send", args: argv.slice(2) };
  if (bin.includes("apa-safe-npx")) return { cmd: "npx", args: argv.slice(2) };
  return { cmd: argv[2], args: argv.slice(3) };
}

function scanOpts(args) {
  const repoVisibility = value(args, "--repo-visibility", "unknown");
  const maxRaw = value(args, "--max-bytes");
  return {
    repoVisibility: ["public", "private", "unknown"].includes(repoVisibility) ? repoVisibility : "unknown",
    ...(maxRaw && /^\d+$/.test(maxRaw) ? { maxBytes: Number(maxRaw) } : {}),
  };
}

function maskedFindings(verdict) {
  return [...verdict.high, ...verdict.medium].map((f) => ({
    tier: f.tier,
    patternName: f.patternName,
    line: f.line,
    col: f.col,
    excerpt: f.excerpt,
  }));
}

function finish({
  args,
  startedAt,
  kind,
  bytes,
  verdict,
  approved,
  exitCode,
  notes = [],
}) {
  appendSinkRunlog({
    matterDir: value(args, "--matter"),
    kind,
    bytes,
    verdict,
    humanApproved: approved,
    argv: ["node", "packages/apa-safe/cli.mjs", ...process.argv.slice(2)],
    cwd: process.cwd(),
    exitCode,
    startedAt,
    notes,
  });
}

function emitBlocked(kind, verdict) {
  process.stderr.write(`BLOCKED: ${kind} contains HIGH-tier sensitive content; not sent.\n`);
  for (const f of maskedFindings(verdict)) process.stderr.write(`  ${f.tier} ${f.patternName} @${f.line}:${f.col} ${f.excerpt}\n`);
}

function emitHold(kind, verdict) {
  process.stderr.write(`HOLD: ${kind} contains MEDIUM-tier sensitive content. Re-run with --yes to proceed.\n`);
  for (const f of maskedFindings(verdict)) process.stderr.write(`  ${f.tier} ${f.patternName} @${f.line}:${f.col} ${f.excerpt}\n`);
}

function outputJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function sendCommand(args, startedAt) {
  const fromFile = value(args, "--from-file");
  const kind = value(args, "--kind", "outbound-payload");
  const approved = flag(args, "--yes");
  const bytes = fromFile ? readFileSync(fromFile) : readStdinBuffer();
  const verdict = fromFile ? scanFileAtSink(fromFile, scanOpts(args)) : scanBytesAtSink(bytes, scanOpts(args));
  const code = exitCodeForApproval(verdict, approved);
  finish({ args, startedAt, kind, bytes, verdict, approved, exitCode: code });

  if (code === 3) emitBlocked(kind, verdict);
  else if (code === 2) emitHold(kind, verdict);
  else if (flag(args, "--json")) outputJson({ kind, allowed: true, verdict: redactVerdict(verdict) });
  else process.stdout.write(bytes);
  return code;
}

async function fetchCommand(args, startedAt) {
  const url = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--matter" && args[args.indexOf(a) - 1] !== "--kind" && args[args.indexOf(a) - 1] !== "--out" && args[args.indexOf(a) - 1] !== "--timeout-ms" && args[args.indexOf(a) - 1] !== "--max-response-bytes");
  if (!url) {
    process.stderr.write("usage: apa-safe fetch <url> [--yes] [--matter DIR] [--json|--out PATH]\n");
    return 2;
  }
  const kind = value(args, "--kind", "url-fetch");
  const approved = flag(args, "--yes");
  const bytes = Buffer.from(url, "utf8");
  const verdict = scanBytesAtSink(bytes, scanOpts(args));
  let code = exitCodeForApproval(verdict, approved);
  if (code !== 0) {
    finish({ args, startedAt, kind, bytes, verdict, approved, exitCode: code });
    if (code === 3) emitBlocked(kind, verdict);
    else emitHold(kind, verdict);
    return code;
  }

  const fetched = await fetchTextWithBounds(url, {
    timeoutMs: Number(value(args, "--timeout-ms", "30000")),
    maxResponseBytes: Number(value(args, "--max-response-bytes", "1048576")),
  });
  const wrapped = wrapFetchedText(fetched.text, url);
  const out = value(args, "--out");
  if (out) writeFileSync(out, wrapped.text);
  finish({ args, startedAt, kind, bytes, verdict, approved, exitCode: 0, notes: [`fetched_status=${fetched.status}`, `response_bytes=${fetched.bytes}`] });
  if (flag(args, "--json")) outputJson({ kind, allowed: true, verdict: redactVerdict(verdict), response: { status: fetched.status, url: fetched.url, bytes: fetched.bytes, canary: wrapped.canary, ...(out ? { out } : { text: wrapped.text }) } });
  else if (out) process.stdout.write(`wrote wrapped untrusted content to ${out}\n`);
  else process.stdout.write(wrapped.text + "\n");
  return 0;
}

function splitNpxArgs(args) {
  const sep = args.indexOf("--");
  const head = sep >= 0 ? args.slice(0, sep) : args;
  const tail = sep >= 0 ? args.slice(sep + 1) : [];
  const valueFlags = new Set(["--matter", "--kind", "--repo-visibility", "--max-bytes"]);
  let packageSpec = "";
  for (let i = 0; i < head.length; i++) {
    const t = head[i];
    if (valueFlags.has(t)) { i++; continue; }
    if (t.startsWith("--")) continue;
    packageSpec = t;
    break;
  }
  return { packageSpec, packageArgs: tail };
}

function redactVerdict(verdict) {
  return {
    ok: verdict.ok,
    blocked: verdict.blocked,
    needsConfirm: verdict.needsConfirm,
    counts: verdict.counts,
    high: maskedFindings({ high: verdict.high, medium: [] }),
    medium: maskedFindings({ high: [], medium: verdict.medium }),
  };
}

function npxCommand(args, startedAt) {
  const { packageSpec, packageArgs } = splitNpxArgs(args);
  const kind = value(args, "--kind", "npx-command");
  const approved = flag(args, "--yes");
  const pin = assertPinnedPackageSpec(packageSpec);
  const overrideUnpinned = Boolean(packageSpec) && flag(args, "--allow-unpinned") && approved;
  const payload = buildNpxPayload(packageSpec || "", packageArgs);
  const verdict = scanBytesAtSink(payload, scanOpts(args));

  if (!pin.ok && !overrideUnpinned) {
    const code = 2;
    finish({ args, startedAt, kind, bytes: payload, verdict, approved, exitCode: code, notes: [`npx_refused=${pin.reason}`] });
    process.stderr.write(`HOLD: ${pin.reason}. Use an explicit package@version, or --allow-unpinned --yes to override and log it.\n`);
    return code;
  }

  const code = exitCodeForApproval(verdict, approved);
  if (code !== 0) {
    finish({ args, startedAt, kind, bytes: payload, verdict, approved, exitCode: code });
    if (code === 3) emitBlocked(kind, verdict);
    else emitHold(kind, verdict);
    return code;
  }

  const command = ["npx", "--yes", packageSpec, ...packageArgs];
  if (flag(args, "--dry-run")) {
    finish({ args, startedAt, kind, bytes: payload, verdict, approved, exitCode: 0, notes: [`npx_pinned=${pin.ok}`, `dry_run=true`] });
    if (flag(args, "--json")) outputJson({ kind, allowed: true, dryRun: true, packageSpec, pinned: pin.ok, command, verdict: redactVerdict(verdict) });
    else process.stdout.write(`${command.join(" ")}\n`);
    return 0;
  }

  const res = spawnSync("npx", ["--yes", packageSpec, ...packageArgs], { stdio: "inherit", shell: process.platform === "win32" });
  const exitCode = typeof res.status === "number" ? res.status : 1;
  finish({ args, startedAt, kind, bytes: payload, verdict, approved, exitCode, notes: [`npx_pinned=${pin.ok}`] });
  return exitCode;
}

function usage() {
  process.stderr.write([
    "usage:",
    "  apa-safe send [--from-file PATH] [--yes] [--matter DIR] [--json]",
    "  apa-safe fetch <url> [--yes] [--matter DIR] [--json|--out PATH]",
    "  apa-safe npx <package@version> -- [args...] [--dry-run] [--matter DIR]",
  ].join("\n") + "\n");
}

async function main() {
  const startedAt = new Date().toISOString();
  const { cmd, args } = commandFromInvocation(process.argv);
  let code;
  if (cmd === "send") code = sendCommand(args, startedAt);
  else if (cmd === "fetch") code = await fetchCommand(args, startedAt);
  else if (cmd === "npx") code = npxCommand(args, startedAt);
  else {
    usage();
    code = 2;
  }
  process.exit(code);
}

main().catch((e) => {
  process.stderr.write(`error: ${e.message}\n`);
  process.exit(1);
});
