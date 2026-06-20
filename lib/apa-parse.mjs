/**
 * Shared, dependency-free parsing for the Patent Artifact protocol.
 *
 * The protocol stores machine-readable data in two places (see docs/protocol.md):
 *   - PATENT.md : YAML frontmatter between leading `---` fences.
 *   - layer .md : one or more ```binding fenced blocks (YAML) per entity section.
 *
 * The validator and the viewer's build_manifest both import this module so there is a SINGLE parser
 * (no divergence). It implements a bounded YAML subset covering exactly what the protocol uses:
 * block maps, block lists (incl. list-of-maps), inline flow maps `{k: v}` and lists `[a, b]`,
 * scalars (int/float/bool/null/quoted/bare), `#` comments, and `>` / `|` block scalars. It is
 * intentionally NOT a general YAML parser. Node.js >=18, no dependencies, ES module.
 */

// -------------------------------------------------------------------------------------------------
// Public: locate the YAML payloads inside markdown
// -------------------------------------------------------------------------------------------------

/** Return the YAML frontmatter of a markdown file (between the first pair of `---` lines). */
export function parseFrontmatter(text) {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(text);
  if (!m) return {};
  const parsed = loadYaml(m[1]);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

/** Coerce a parsed value to an array. A list field stays; a scalar/object/null (malformed-but-parseable
 * input the bounded parser keeps as-is) becomes []. Use at EVERY site that iterates a binding list, so a
 * malformed `limitations: 5` coerces to [] instead of throwing `.filter is not a function`. */
export function asArray(v) { return Array.isArray(v) ? v : []; }

/** Return every ```binding fenced block in `text`, parsed to an object (in document order). */
export function extractBindingBlocks(text) {
  const blocks = [];
  // The opening fence MUST be at column 0 (`^` + the `m` flag). Per the protocol every real binding
  // block is unindented; anchoring stops UNTRUSTED embedded text (e.g. a fetched prior-art abstract)
  // from smuggling a fake ```binding block - whether space-prefixed (apa-search's neutralizeBlock) or
  // mid-line - that would otherwise become the authoritative first block and drop the UNVERIFIED stamp.
  // NB: confidentiality of UNTRUSTED embedded content (bare CR / U+2028 / U+2029) is enforced at the
  // SINK in apa-search/lib/refs.mjs (oneLine/neutralizeBlock normalize all four terminators); the parser
  // does NOT mutate value bytes here, so an in-value terminator is never silently truncated.
  const re = /^```binding[ \t]*\r?\n([\s\S]*?)\r?\n```/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const parsed = loadYaml(m[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) blocks.push(parsed);
  }
  return blocks;
}

/**
 * Yield { id, heading, body } for every `### <ID> ...` section. An entity ID is an UPPERCASE token
 * like CLM01 / SPEC0002 / FIG01 / PA01 / TERM01 at the start of a level-3 heading. The body runs to
 * the next `### ` heading.
 */
export function iterEntitySections(text) {
  const out = [];
  // `^` (with the m flag) treats CRLF, bare CR, U+2028 and U+2029 all as line boundaries, so untrusted
  // embedded content is neutralized at the SINK (apa-search/lib/refs.mjs oneLine/neutralizeBlock), not by
  // mutating bytes here. The body slices use the same raw text, so offsets stay exact.
  const re = /^###[ \t]+([A-Z]+[0-9]+)\b(.*)$/gm;
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) matches.push(m);
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    out.push({ id: matches[i][1], heading: matches[i][2].trim(), body: text.slice(start, end) });
  }
  return out;
}

// -------------------------------------------------------------------------------------------------
// Bounded YAML-subset loader
// -------------------------------------------------------------------------------------------------

const MAX_NESTING_DEPTH = 100;

// Assign a parsed map key WITHOUT triggering the `__proto__` prototype setter. A literal `__proto__`
// key on a plain object mutates the prototype: the sub-tree becomes an invisible inherited ghost
// (dropped from Object.keys / JSON / spread, yet still readable via dot-access). A dropped supported_by
// edge or consent/provenance field is a safety hole, so define `__proto__` as a normal own data property.
function safeSet(obj, key, val) {
  if (key === "__proto__") Object.defineProperty(obj, key, { value: val, enumerable: true, writable: true, configurable: true });
  else obj[key] = val;
}

// The key/value separator is the first colon OUTSIDE quotes, so a quoted key like "a:b": 1 is not
// split at its internal colon. For unquoted keys this is identical to indexOf(":").
function findKeyColon(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ":") return i;
  }
  // An UNTERMINATED quote (a stray apostrophe/quote, e.g. `don't: x` or `The inventor's note: ...`) must
  // NOT swallow the real colon and make parseMap silently drop the line: fall back to the first literal
  // colon so a genuine map line is always parsed (fail loud, never silent data loss).
  if (quote !== null) return s.indexOf(":");
  return -1;
}

export function loadYaml(text) {
  const lines = logicalLines(text);
  if (lines.length === 0) return {};
  return parseBlock(lines, { i: 0 }, 0, 0);
}

function logicalLines(text) {
  const out = [];
  // Only CRLF -> LF: a bare CR / U+2028 / U+2029 that appears INSIDE a scalar value (block scalar or a
  // quoted string) must be preserved as a literal char, NOT split into a new line - splitting it would
  // truncate the value and make parseMap silently drop the following keys (a supported_by / provenance /
  // consent field). Line boundaries for the protocol are LF (or CRLF); the toolchain + .gitattributes
  // enforce LF on disk, and untrusted embedded content is neutralized at the sink (apa-search/refs.mjs).
  for (const raw of String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n")) {
    if (raw.trim() === "") continue;
    if (raw.trimStart().startsWith("#")) continue;
    // Indentation must be spaces only. A leading tab counts as zero spaces here, so tab-indented
    // children would silently become top-level siblings; fail loud instead (standard YAML rule).
    // Only the leading whitespace is checked, so a tab inside a quoted value is unaffected.
    const lead = /^[ \t]*/.exec(raw)[0];
    if (lead.includes("\t")) {
      throw new Error("tab indentation is not supported; use spaces: " + raw);
    }
    const stripped = raw.replace(/^ +/, "");
    out.push({ raw, indent: raw.length - stripped.length, content: stripped });
  }
  return out;
}

// Bound nesting so adversarial deep input fails LOUD with a descriptive error rather than a raw
// stack-overflow RangeError. Checked at the top of EVERY recursive function (parseBlock/parseMap/
// parseList for block structure, and parseScalar for nested inline flow [..]/{..}) - a guard placed only
// in parseBlock would be bypassed by the parseMap<->parseList direct calls and the parseScalar flow path.
function guardDepth(depth) {
  if (depth > MAX_NESTING_DEPTH) {
    throw new Error(`nesting too deep (>${MAX_NESTING_DEPTH} levels); malformed or hostile input - route to counsel`);
  }
}

// `cur` is a mutable cursor { i }. Returns the parsed value; advances cur.i.
function parseBlock(lines, cur, indent, depth) {
  guardDepth(depth);
  if (cur.i >= lines.length) return {};
  const c = lines[cur.i].content;
  if (c === "-" || c.startsWith("- ")) return parseList(lines, cur, indent, depth);
  return parseMap(lines, cur, indent, depth);
}

function parseMap(lines, cur, indent, depth) {
  guardDepth(depth);
  const result = {};
  while (cur.i < lines.length) {
    const line = lines[cur.i];
    if (line.indent < indent) break;
    // A line more indented than this map level that was NOT consumed as a child block above is an
    // orphan (e.g. a stray over-indented `provenance:`); dropping it could erase a safety field.
    if (line.indent > indent) throw new Error("unexpected indentation: " + line.raw);
    if (line.content === "-" || line.content.startsWith("- ")) break;
    const ci = findKeyColon(line.content);
    if (ci === -1) break;
    const key = stripQuotes(line.content.slice(0, ci).trim());
    let rest = stripInlineComment(line.content.slice(ci + 1).trim());
    cur.i++;
    if (rest === ">" || rest === "|" || rest === ">-" || rest === "|-") {
      safeSet(result, key, parseBlockScalar(lines, cur, indent, rest[0] === ">"));
    } else if (rest === "") {
      const nx = cur.i < lines.length ? lines[cur.i] : null;
      if (nx && nx.indent > indent) {
        safeSet(result, key, parseBlock(lines, cur, nx.indent, depth + 1));
      } else if (nx && nx.indent === indent && (nx.content === "-" || nx.content.startsWith("- "))) {
        // A block list written at the SAME indent as its key (the idiomatic YAML style) IS the key's
        // value - NOT null. Without this, `limitations:\n- id: LIM01` silently parsed to null, dropping
        // the whole list (and the ai-suggested / supported_by guards that depend on it). Route through
        // parseBlock (like the indented branch above) so the depth guard applies.
        safeSet(result, key, parseBlock(lines, cur, indent, depth + 1));
      } else {
        safeSet(result, key, null);
      }
    } else {
      safeSet(result, key, parseScalar(rest));
    }
  }
  return result;
}

function parseList(lines, cur, indent, depth) {
  guardDepth(depth);
  const result = [];
  while (cur.i < lines.length) {
    const line = lines[cur.i];
    if (line.indent !== indent || !(line.content === "-" || line.content.startsWith("- "))) break;
    let after = stripInlineComment(line.content.slice(1).replace(/^ +/, ""));
    if (after === "") {
      cur.i++;
      if (cur.i < lines.length && lines[cur.i].indent > indent) {
        result.push(parseBlock(lines, cur, lines[cur.i].indent, depth + 1));
      } else {
        result.push(null);
      }
      continue;
    }
    const ci = findKeyColon(after);
    if (ci !== -1 && !looksLikeFlow(after)) {
      // List item that is itself a map: "- key: value" + possibly deeper continuation lines.
      const itemIndent = line.indent + (line.content.length - after.length);
      const synth = [{ raw: " ".repeat(itemIndent) + after, indent: itemIndent, content: after }];
      let j = cur.i + 1;
      while (
        j < lines.length &&
        lines[j].indent >= itemIndent &&
        !(lines[j].indent === indent && (lines[j].content === "-" || lines[j].content.startsWith("- ")))
      ) {
        synth.push(lines[j]);
        j++;
      }
      const childCur = { i: 0 };
      result.push(parseMap(synth, childCur, itemIndent, depth + 1));
      cur.i = j;
    } else {
      result.push(parseScalar(after));
      cur.i++;
    }
  }
  return result;
}

function parseBlockScalar(lines, cur, parentIndent, fold) {
  // Gather the block's lines first so the dedent amount is the MINIMUM indent across the block
  // (per YAML), not just the first content line's indent. Slicing a fixed first-line indent off a
  // less-indented continuation line would eat real content (e.g. turn "line two" into "ine two").
  const block = [];
  let blockIndent = Infinity;
  while (cur.i < lines.length) {
    if (lines[cur.i].indent <= parentIndent) break;
    blockIndent = Math.min(blockIndent, lines[cur.i].indent);
    block.push(lines[cur.i]);
    cur.i++;
  }
  // Strip at most each line's own leading whitespace, never more than blockIndent.
  const collected = block.map((ln) => ln.raw.slice(Math.min(ln.indent, blockIndent)));
  return fold ? collected.map((s) => s.trim()).join(" ") : collected.join("\n");
}

// -------------------------------------------------------------------------------------------------
// Scalars and inline flow collections
// -------------------------------------------------------------------------------------------------

function looksLikeFlow(s) {
  const t = s.trim();
  return t.startsWith("[") || t.startsWith("{");
}

function parseScalar(tokenIn, depth = 0) {
  // parseScalar is the 4th recursive parser path (nested inline flow collections), so it carries its own
  // depth and is guarded like parseBlock/parseMap/parseList - else a value like `[[[[...]]]]` overflows the
  // stack with a raw RangeError instead of the descriptive 'nesting too deep' error. (Use an arrow on .map
  // so the array INDEX is not passed as depth.)
  guardDepth(depth);
  const token = tokenIn.trim();
  if (token.startsWith("[") && token.endsWith("]")) {
    return splitFlow(token.slice(1, -1)).map((s) => parseScalar(s, depth + 1));
  }
  if (token.startsWith("{") && token.endsWith("}")) {
    const out = {};
    for (const part of splitFlow(token.slice(1, -1))) {
      const ci = findKeyColon(part);
      if (ci !== -1) safeSet(out, stripQuotes(part.slice(0, ci).trim()), parseScalar(part.slice(ci + 1).trim(), depth + 1));
    }
    return out;
  }
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1);
  }
  const low = token.toLowerCase();
  if (low === "true" || low === "yes") return true;
  if (low === "false" || low === "no") return false;
  if (low === "null" || low === "~" || low === "") return null;
  if (/^-?\d+$/.test(token)) {
    // Only coerce to a number when it round-trips losslessly: no significant leading zero (which a
    // docket like "00123" must keep) and within safe-integer range (so "100...0" stays a string,
    // not 1e20). Otherwise the original token is the truth (YAML 1.2).
    const n = parseInt(token, 10);
    if (!/^-?0\d/.test(token) && Number.isSafeInteger(n)) return n;
    return token;
  }
  if (/^-?\d+\.\d+$/.test(token)) return parseFloat(token);
  return token;
}

function splitFlow(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; }
    else if (ch === "[" || ch === "{") { depth++; cur += ch; }
    else if (ch === "]" || ch === "}") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur.trim());
  return parts;
}

function stripInlineComment(s) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === "#" && depth === 0 && i > 0 && (s[i - 1] === " " || s[i - 1] === "\t")) {
      return s.slice(0, i).trimEnd();
    }
  }
  return s.trimEnd();
}

function stripQuotes(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}
