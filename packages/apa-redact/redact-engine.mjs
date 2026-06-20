/**
 * redact-engine — pure scanning + auto-redaction over the shared taxonomy.
 *
 * No I/O for the scan itself (`scanFile` is the one I/O helper, kept thin and
 * explicit). Deterministic. The CLI (`cli.mjs`) and tests all import from here.
 * Plain-ESM, zero-dependency Node.js port of gstack's `lib/redact-engine.ts`.
 *
 * Public contract (matches the APA spec):
 *   - `scan(text, opts?) -> Finding[]`
 *       Each Finding has at minimum: { patternName, tier, start, end, excerpt }.
 *       It also carries the richer gstack-derived fields (severity, category,
 *       description, line, col, autoRedactable, repoVisibility) the CLI needs.
 *   - `applyRedactions(text, findings) -> string`
 *       Replaces auto-redactable spans from the END backward so offsets stay
 *       valid, and returns the redacted body string.
 *   - `scanFile(path, opts?) -> Finding[]`
 *       Scan-at-sink helper: scans the EXACT bytes of a file.
 *
 * Key behaviors (ported from gstack, locked in /plan-eng-review + two Codex passes):
 *
 *   - Normalization BEFORE matching (NFKC + strip zero-width + strip lone
 *     surrogates) so Unicode-confusable / zero-width evasion fails. Findings map
 *     back to ORIGINAL offsets via an index map.
 *   - Fail CLOSED on oversize input: a hard input-size cap. Oversize input returns
 *     a single synthetic HIGH "input too large to scan safely" finding so callers
 *     BLOCK rather than skip. Patterns are linear-time.
 *   - NO visibility-based tier mutation. `repoVisibility` is recorded on each
 *     finding (drives sterner confirmation wording for the caller) but never
 *     promotes a MEDIUM to HIGH.
 *   - Placeholder suppression is per-matched-span.
 *
 * Scan-at-sink discipline: callers that are about to send bytes to an external
 * sink should write the EXACT payload to a temp file and call `scanFile(path)`
 * on THAT file, then send the SAME file. Never scan a rendered string and then
 * re-render — that reopens a scan-vs-send gap.
 *
 * Node.js >=18, ES module, zero dependencies.
 */

import { readFileSync, statSync } from "node:fs";
import { Buffer } from "node:buffer";

import { PATTERNS, PATTERNS_BY_NAME, isPlaceholderSpan } from "./redact-patterns.mjs";

export const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MiB

const EMAIL_ALLOW_DOMAINS = [/@example\.(com|org|net)$/i, /@example\.[a-z]{2,}$/i];
const EMAIL_ALLOW_LOCALPARTS = [/^noreply@/i, /^no-reply@/i, /^donotreply@/i];

// ── Normalization ─────────────────────────────────────────────────────────────

// Zero-width + BOM characters used for evasion.
const ZERO_WIDTH = new Set([
  "​", // zero-width space
  "‌", // zero-width non-joiner
  "‍", // zero-width joiner
  "⁠", // word joiner
  "﻿", // zero-width no-break space / BOM
]);

/**
 * A lone UTF-16 surrogate half (U+D800..U+DFFF). These can sneak past naive
 * matching and corrupt downstream API payloads; strip them in normalization.
 */
function isLoneSurrogate(cp) {
  return cp >= 0xd800 && cp <= 0xdfff;
}

/**
 * Normalize text for matching while producing an index map back to the original.
 *
 * Returns `{ normalized, map }` where `map[i]` is the original UTF-16 code-unit
 * offset that normalized char `i` came from. A sentinel `map[len] === text.length`
 * is appended so an offset == length maps to the original length.
 *
 * Strategy: walk the original code-unit by code-unit. We iterate by code unit
 * (not code point) so the recorded offsets line up with JS string indexing used
 * elsewhere; lone surrogates are dropped, paired surrogates are NFKC-normalized
 * as a unit, and the map stays exact for these local transformations.
 *
 * @param {string} text
 * @returns {{ normalized: string, map: number[] }}
 */
export function normalizeWithMap(text) {
  const out = [];
  const map = [];
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);

    // Drop zero-width chars (single BMP code unit each).
    if (ZERO_WIDTH.has(text[i])) {
      i += 1;
      continue;
    }

    // High surrogate: try to read the full surrogate pair.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const ch = text.slice(i, i + 2); // full code point (2 code units)
        const norm = ch.normalize("NFKC");
        for (const nch of norm) {
          for (let k = 0; k < nch.length; k++) {
            out.push(nch[k]);
            map.push(i);
          }
        }
        i += 2;
        continue;
      }
    }

    // Lone surrogate half — NEUTRALIZE with a non-word sentinel rather than DELETE it. Deleting it
    // would concatenate the chars on either side and destroy the `\b` word boundary that fixed-length
    // HIGH patterns (aws.access_key, github.*, stripe.secret, …) rely on, letting e.g.
    // "AKIA…ABCDEF\uD800x" join into one token and EVADE the scan. U+FFFD keeps the boundary intact.
    // (Zero-width chars above remain a true delete: that is the intended "rejoin a split secret" path.)
    if (isLoneSurrogate(code)) {
      out.push("�");
      map.push(i);
      i += 1;
      continue;
    }

    const ch = text[i];
    const norm = ch.normalize("NFKC");
    for (const nch of norm) {
      for (let k = 0; k < nch.length; k++) {
        out.push(nch[k]);
        map.push(i);
      }
    }
    i += 1;
  }
  map.push(text.length); // sentinel
  return { normalized: out.join(""), map };
}

// ── Offset → line/col on the ORIGINAL text ────────────────────────────────────

function lineColAt(original, offset) {
  let line = 1;
  let col = 1;
  const limit = Math.min(offset, original.length);
  for (let i = 0; i < limit; i++) {
    if (original[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

// ── Safe preview masking ──────────────────────────────────────────────────────

/** Show ≤4 leading chars, mask the rest. Never reconstructable. */
export function maskPreview(span) {
  const visible = span.slice(0, 4);
  const masked = span.length > 4 ? "*".repeat(Math.min(span.length - 4, 8)) : "";
  const ellipsis = span.length > 12 ? "…" : "";
  return `${visible}${masked}${ellipsis}`;
}

// ── Regex flag handling ───────────────────────────────────────────────────────

/** Recompile a pattern's source with the global+multiline flags the engine needs. */
function compile(pat) {
  let flags = "gm";
  if (pat.ignoreCase) flags += "i";
  // Preserve dotAll / unicode if a literal carried them (none do today, but be safe).
  if (pat.regex.flags.includes("s") && !flags.includes("s")) flags += "s";
  if (pat.regex.flags.includes("u") && !flags.includes("u")) flags += "u";
  return new RegExp(pat.regex.source, flags);
}

// ── Proximity check ───────────────────────────────────────────────────────────

function hasNear(normalized, matchStart, matchEnd, nearRegex, window) {
  const from = Math.max(0, matchStart - window);
  const to = Math.min(normalized.length, matchEnd + window);
  const slice = normalized.slice(from, to);
  const re = new RegExp(nearRegex.source, nearRegex.flags.replace(/g/g, ""));
  return re.test(slice);
}

// ── Email allowlist ───────────────────────────────────────────────────────────

function emailAllowed(email, opts) {
  const lower = email.toLowerCase();
  if (opts.selfEmail && lower === opts.selfEmail.toLowerCase()) return true;
  if (opts.repoPublicEmails && opts.repoPublicEmails.some((e) => e.toLowerCase() === lower)) {
    return true;
  }
  if (EMAIL_ALLOW_DOMAINS.some((re) => re.test(email))) return true;
  if (EMAIL_ALLOW_LOCALPARTS.some((re) => re.test(email))) return true;
  return false;
}

// ── Finding factory ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} Finding
 * @property {string} patternName  Stable dotted id, e.g. "aws.access_key".
 * @property {"HIGH"|"MEDIUM"|"LOW"} tier
 * @property {number} start        0-based offset in the ORIGINAL text.
 * @property {number} end          0-based exclusive end offset in the ORIGINAL text.
 * @property {string} excerpt      Safe-masked preview (NEVER the raw secret).
 * @property {"HIGH"|"MEDIUM"|"LOW"} severity  Effective severity (== tier; no promotion).
 * @property {string} category
 * @property {string} description
 * @property {number} line         1-based line in the ORIGINAL text.
 * @property {number} col          1-based column in the ORIGINAL text.
 * @property {boolean} autoRedactable
 * @property {"public"|"private"|"unknown"} repoVisibility
 */

function oversizeFinding(byteLen, cap, vis, isFile) {
  return {
    patternName: "engine.input_too_large",
    tier: "HIGH",
    start: 0,
    end: 0,
    excerpt: "",
    severity: "HIGH",
    category: "secret",
    description: `Input${isFile ? " file" : ""} too large to scan safely (${byteLen} > ${cap} bytes) — blocking fail-closed`,
    line: 1,
    col: 1,
    autoRedactable: false,
    repoVisibility: vis,
  };
}

function normalizeVisibility(v) {
  return v === "public" || v === "private" || v === "unknown" ? v : "unknown";
}

function resolveCap(maxBytes) {
  // Any non-finite or non-positive value falls back to the default cap, so the
  // fail-closed oversize guard is never silently disabled (gstack #1824).
  return Number.isFinite(maxBytes) && maxBytes > 0 ? Math.floor(maxBytes) : DEFAULT_MAX_BYTES;
}

// ── The scan ──────────────────────────────────────────────────────────────────

/**
 * Scan `text` for secrets / PII / legal / patent content.
 *
 * Returns an array of Finding objects (original-offset, masked excerpt). Fails
 * CLOSED on oversize input (returns a single synthetic HIGH finding whose
 * `patternName` is "engine.input_too_large"). Never mutates a finding's tier
 * based on visibility — `repoVisibility` is recorded only.
 *
 * @param {string} text
 * @param {Object} [opts]
 * @param {"public"|"private"|"unknown"} [opts.repoVisibility]
 * @param {string[]} [opts.allowlist]   Exact spans to suppress.
 * @param {string} [opts.selfEmail]     The invoking user's own email (allowlisted).
 * @param {string[]} [opts.repoPublicEmails]  Repo-public emails to suppress.
 * @param {number} [opts.maxBytes]      Hard byte cap. Oversize fails CLOSED.
 * @returns {Finding[]}
 */
export function scan(text, opts = {}) {
  const vis = normalizeVisibility(opts.repoVisibility ?? "unknown");
  const cap = resolveCap(opts.maxBytes);

  // Fail CLOSED on oversize input. Check byte length BEFORE heavy work.
  const byteLen = Buffer.byteLength(text, "utf8");
  if (byteLen > cap) {
    return [oversizeFinding(byteLen, cap, vis, false)];
  }

  const { normalized, map } = normalizeWithMap(text);
  const allow = new Set(opts.allowlist ?? []);

  /** @type {Finding[]} */
  const findings = [];
  // Dedup by (name, original-offset) so overlapping matches don't double-count.
  const seen = new Set();

  for (const pat of PATTERNS) {
    const re = compile(pat);
    let m;
    while ((m = re.exec(normalized)) !== null) {
      // Guard against zero-width matches looping forever.
      if (m.index === re.lastIndex) re.lastIndex++;

      const span = m[1] !== undefined ? m[1] : m[0];
      // Offset of the captured span within the normalized text.
      const spanStartInMatch = m[1] !== undefined ? m[0].indexOf(m[1]) : 0;
      const normOffset = m.index + Math.max(0, spanStartInMatch);

      // Per-span placeholder suppression.
      if (isPlaceholderSpan(span)) continue;
      if (allow.has(span)) continue;

      // Pattern-specific validators (Luhn, entropy, RFC1918, etc).
      if (pat.validate && !pat.validate(span)) continue;

      // Proximity requirement.
      if (
        pat.nearRegex &&
        !hasNear(normalized, m.index, m.index + m[0].length, pat.nearRegex, pat.nearWindow ?? 100)
      ) {
        continue;
      }

      // Email allowlist (layered on top of the pattern).
      if (pat.name === "pii.email" && emailAllowed(span, opts)) continue;

      const origOffset = map[Math.min(normOffset, map.length - 1)] ?? 0;
      const key = `${pat.name}:${origOffset}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Map the END of the span back to an original offset too, so the finding
      // carries an accurate [start, end) for applyRedactions.
      const normEnd = normOffset + span.length;
      const origEnd = map[Math.min(normEnd, map.length - 1)] ?? text.length;

      const { line, col } = lineColAt(text, origOffset);

      findings.push({
        patternName: pat.name,
        tier: pat.tier,
        start: origOffset,
        end: origEnd,
        excerpt: maskPreview(span),
        severity: pat.tier, // no visibility-based promotion
        category: pat.category,
        description: pat.description,
        line,
        col,
        autoRedactable: !!pat.autoRedactable,
        repoVisibility: vis,
      });
    }
  }

  // Stable order: by start, then line, then col, then name.
  findings.sort(
    (a, b) =>
      a.start - b.start ||
      a.line - b.line ||
      a.col - b.col ||
      a.patternName.localeCompare(b.patternName),
  );

  return findings;
}

/**
 * Scan-at-sink helper: scan the EXACT bytes of a file.
 *
 * A caller writes the payload it is about to send to a temp file, calls
 * `scanFile` on THAT file, and then sends the SAME file. This closes the
 * scan-vs-send gap (never scan a string then re-render).
 *
 * We apply a hard byte cap at the file boundary (fail closed) so a giant file
 * never gets fully read into a string before the engine's own cap can fire: if
 * the on-disk size already exceeds the cap, we short-circuit to the oversize
 * finding.
 *
 * @param {string} path
 * @param {Object} [opts]  Same options as `scan`.
 * @returns {Finding[]}
 */
export function scanFile(path, opts = {}) {
  const vis = normalizeVisibility(opts.repoVisibility ?? "unknown");
  const cap = resolveCap(opts.maxBytes);

  let size = null;
  try {
    size = statSync(path).size;
  } catch {
    size = null;
  }

  if (size !== null && size > cap) {
    // Fail closed at the file boundary without reading the whole thing.
    return [oversizeFinding(size, cap, vis, true)];
  }

  // Read as bytes and decode so the engine sees the literal byte content.
  const raw = readFileSync(path);
  const text = raw.toString("utf8");
  return scan(text, opts);
}

// ── Auto-redaction ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RedactOutcome
 * @property {string} body            The redacted text.
 * @property {string} diff            ASCII line-diff preview of the substitutions.
 * @property {Finding[]} skipped      Findings that could NOT be auto-redacted.
 */

function inStructuralToken(body, start, end) {
  // Markdown link target: [text](...span...). Walk backward from the span: if we
  // reach `](` before hitting `)`/whitespace, and forward we reach `)` before
  // whitespace, the span is inside a link target.
  for (let i = start - 1; i >= 0; i--) {
    const ch = body[i];
    if (ch === ")" || ch === "\n" || ch === " " || ch === "\t") break;
    if (ch === "(" && i > 0 && body[i - 1] === "]") {
      for (let j = end; j < body.length; j++) {
        const c = body[j];
        if (c === " " || c === "\t" || c === "\n") break;
        if (c === ")") return true;
      }
      break;
    }
  }
  // JSON string value: "key": "...span..." — span is inside a quoted value.
  const before = body.slice(Math.max(0, start - 80), start);
  const after = body.slice(end, Math.min(body.length, end + 4));
  if (/:\s*"$/.test(before) && /^"/.test(after)) return true;
  return false;
}

function lineContaining(body, offset) {
  const start = body.lastIndexOf("\n", offset - 1) + 1;
  let end = body.indexOf("\n", offset);
  if (end === -1) end = body.length;
  return body.slice(start, end);
}

/**
 * Substitute redact tokens for the given findings, RIGHT-TO-LEFT so offsets stay
 * valid as we splice. Only auto-redactable findings are eligible.
 *
 * Per the APA spec, `applyRedactions(text, findings) -> string` returns the
 * redacted body string. For callers that also want the diff and the list of
 * spans that couldn't be auto-redacted (structural-corruption guard), use
 * `applyRedactionsDetailed`.
 *
 * @param {string} text
 * @param {Finding[]} findings
 * @param {Object} [opts]
 * @param {string[]} [opts.onlyNames]  Restrict to these pattern names.
 * @returns {string}  The redacted body.
 */
export function applyRedactions(text, findings, opts = {}) {
  return applyRedactionsDetailed(text, findings, opts).body;
}

/**
 * Full auto-redaction with diff + skipped list.
 *
 * @param {string} text
 * @param {Finding[]} findings
 * @param {Object} [opts]
 * @param {string[]} [opts.onlyNames]
 * @returns {RedactOutcome}
 */
export function applyRedactionsDetailed(text, findings, opts = {}) {
  const names = opts.onlyNames ? new Set(opts.onlyNames) : null;

  const tierRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const eligible = findings.filter(
    (f) =>
      f.autoRedactable &&
      (names === null || names.has(f.patternName)) &&
      f.start >= 0 &&
      f.end > f.start,
  );
  // Greedily select a NON-OVERLAPPING set, preferring higher tier then the longer span. Without this,
  // two overlapping auto-redactable findings (e.g. a credit card and a phone substring inside it) each
  // splice on the other's stale offsets - corrupting the output and mislabeling the larger secret.
  const byPriority = eligible.slice().sort(
    (a, b) =>
      (tierRank[b.severity] || 0) - (tierRank[a.severity] || 0) ||
      (b.end - b.start) - (a.end - a.start) ||
      a.start - b.start,
  );
  const chosen = [];
  for (const f of byPriority) {
    if (chosen.some((c) => f.start < c.end && c.start < f.end)) continue; // overlaps a chosen span
    chosen.push(f);
  }
  // Apply right-to-left (largest start first) so earlier offsets remain valid as we splice.
  const targets = chosen.sort((a, b) => b.start - a.start);

  /** @type {Finding[]} */
  const skipped = [];
  const diffLines = [];
  let body = text;

  for (const f of targets) {
    const pat = PATTERNS_BY_NAME[f.patternName];
    const token = pat && pat.redactToken ? pat.redactToken : "<REDACTED>";
    if (inStructuralToken(body, f.start, f.end)) {
      skipped.push(f);
      continue;
    }
    const before = lineContaining(body, f.start);
    body = body.slice(0, f.start) + token + body.slice(f.end);
    const after = lineContaining(body, f.start);
    diffLines.push(`- ${before}`);
    diffLines.push(`+ ${after}`);
  }

  return { body, diff: diffLines.reverse().join("\n"), skipped };
}

// ── Result helpers (derived from a Finding[]) ─────────────────────────────────

/** True when the input-size cap tripped (caller should BLOCK). */
export function isOversize(findings) {
  return findings.some((f) => f.patternName === "engine.input_too_large");
}

/** Per-severity counts over a Finding[]. */
export function countsFor(findings) {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

/** 0 clean, 2 MEDIUM present (no HIGH), 3 HIGH present. LOW does not gate. */
export function exitCodeFor(findings) {
  const counts = countsFor(findings);
  if (counts.HIGH > 0) return 3;
  if (counts.MEDIUM > 0) return 2;
  return 0;
}
