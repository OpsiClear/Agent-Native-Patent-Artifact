#!/usr/bin/env node
/**
 * gen-skill-docs - compile skills/<name>/SKILL.md.tmpl -> SKILL.md by resolving `{{TOKEN}}` /
 * `{{TOKEN:arg}}` placeholders from scripts/resolvers (DESIGN.md §6). The generated SKILL.md is the
 * legal-procedure spec, so a multi-pass resolve hard-errors on any leftover `{{...}}`, and `--check`
 * fails CI if any on-disk SKILL.md is stale.
 *
 * Per-host generation (DESIGN.md §11.6): the canonical Claude output lives in skills/<name>/SKILL.md;
 * other hosts apply their HostConfig (frontmatter rewrite + non-safety resolver suppression) and write
 * to dist/<host>/<name>/SKILL.md. Safety resolvers (NON_SUPPRESSIBLE) can never be suppressed.
 *
 *   node scripts/gen-skill-docs.mjs                 # canonical Claude SKILL.md for every skill
 *   node scripts/gen-skill-docs.mjs --check         # freshness gate on the Claude outputs (no writes)
 *   node scripts/gen-skill-docs.mjs --host cursor    # one host -> dist/cursor/<name>/SKILL.md
 *   node scripts/gen-skill-docs.mjs --all-hosts      # claude (skills/) + codex/cursor (dist/)
 * Node >=21, ESM, zero dependencies.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RESOLVERS } from "./resolvers/index.mjs";
import { generatedReferences } from "./resolvers/references.mjs";
import { getHost, ALL_HOSTS, NON_SUPPRESSIBLE } from "../hosts/index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(ROOT, "skills");
const MAX_PASSES = 6;
const TOKEN_RE = /\{\{([A-Z0-9_]+)(?::([^}]*))?\}\}/g;

function parseTemplate(text) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("template missing --- frontmatter --- fence");
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const k = line.slice(0, ci).trim();
    let v = line.slice(ci + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[k] = v;
  }
  return { frontmatter: fm, body: m[2] };
}

export function resolveAll(body, ctx, suppressed = []) {
  for (const tok of suppressed) {
    if (NON_SUPPRESSIBLE.includes(tok)) throw new Error(`refusing to suppress safety-critical resolver '${tok}'`);
  }
  const sup = new Set(suppressed);
  let text = body;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let replaced = false;
    text = text.replace(TOKEN_RE, (full, token, arg) => {
      if (sup.has(token)) { replaced = true; return `_(Section omitted for this host — see the canonical Claude skill for the full guidance.)_`; }
      const fn = RESOLVERS[token];
      if (!fn) return full; // leave for the leftover check
      replaced = true;
      const out = fn(arg, ctx);
      return out === undefined || out === null ? "" : String(out);
    });
    if (!replaced) break;
  }
  const leftover = [...text.matchAll(TOKEN_RE)].map((m) => m[0]);
  if (leftover.length) throw new Error(`unresolved placeholders: ${[...new Set(leftover)].join(", ")}`);
  return text;
}

export function renderSkill(tmplPath, hostId) {
  const host = getHost(hostId);
  const { frontmatter, body } = parseTemplate(readFileSync(tmplPath, "utf8"));
  const fm = host.frontmatterTransform ? host.frontmatterTransform({ ...frontmatter }) : frontmatter;
  const ctx = { frontmatter: fm, host };
  const resolvedBody = resolveAll(body, ctx, host.suppressedResolvers || []);
  const header = [
    "---",
    `name: ${fm.name}`,
    fm.description ? `description: ${JSON.stringify(fm.description)}` : null,
    fm["allowed-tools"] ? `allowed-tools: ${fm["allowed-tools"]}` : null,
    "alwaysApply" in fm ? `alwaysApply: ${fm.alwaysApply}` : null,
    `version: ${fm.version || "0.1"}`,
    "---",
    "",
    `<!-- AUTO-GENERATED for host '${hostId}' from ${relName(tmplPath)} by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->`,
    "",
  ].filter((x) => x !== null).join("\n");
  return header + resolvedBody.replace(/^\s+/, "") + "\n";
}

export function renderReferences(tmplPath, hostId) {
  return generatedReferences().map((ref) => ({
    path: ref.path,
    content: [
      `<!-- AUTO-GENERATED for host '${hostId}' from ${relName(tmplPath)} by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->`,
      "",
      ref.content.trimEnd(),
      "",
    ].join("\n"),
  }));
}

function relName(p) { return p.slice(ROOT.length + 1).replace(/\\/g, "/"); }

function discoverTemplates() {
  if (!existsSync(SKILLS_DIR)) return [];
  const out = [];
  for (const name of readdirSync(SKILLS_DIR).sort()) {
    const tmpl = join(SKILLS_DIR, name, "SKILL.md.tmpl");
    if (existsSync(tmpl)) out.push({ name, tmpl });
  }
  return out;
}

// Canonical Claude output is committed in-tree; other hosts are build artifacts under dist/.
function outPath(name, hostId) {
  return hostId === "claude"
    ? join(SKILLS_DIR, name, "SKILL.md")
    : join(ROOT, "dist", hostId, name, "SKILL.md");
}

function referenceOutPath(name, hostId, relPath) {
  const base = hostId === "claude"
    ? join(SKILLS_DIR, name)
    : join(ROOT, "dist", hostId, name);
  return join(base, ...relPath.split("/"));
}

function main(argv) {
  const check = argv.includes("--check");
  const allHosts = argv.includes("--all-hosts");
  const hostArg = argv[argv.indexOf("--host") + 1];
  const hostIds = allHosts ? ALL_HOSTS.map((h) => h.id) : [argv.includes("--host") && hostArg ? hostArg : "claude"];

  const templates = discoverTemplates();
  if (templates.length === 0) { console.error("no skills/*/SKILL.md.tmpl found"); process.exit(2); }
  let drift = 0;
  for (const hostId of hostIds) {
    for (const t of templates) {
      let rendered;
      try { rendered = renderSkill(t.tmpl, hostId); }
      catch (e) { console.error(`FAIL ${hostId}/${t.name}: ${e.message}`); process.exit(2); }
      const out = outPath(t.name, hostId);
      const refs = renderReferences(t.tmpl, hostId);
      if (check) {
        // Freshness gate applies to the committed Claude outputs only; dist/ is a build artifact.
        if (hostId !== "claude") {
          console.error(
            `NOTE ${hostId}/${t.name}: --check only validates the committed Claude SKILL.md; ` +
              `dist/${hostId}/ outputs are build artifacts (run without --check to regenerate them).`,
          );
          continue;
        }
        const current = existsSync(out) ? readFileSync(out, "utf8") : "";
        // Normalize line endings before comparing: under git core.autocrlf=true a committed-LF
        // SKILL.md checks out as CRLF on Windows, which is not genuine drift.
        if (current.replace(/\r\n/g, "\n") !== rendered) { console.error(`STALE ${relName(out)} (re-run gen-skill-docs)`); drift++; }
        else console.log(`FRESH ${relName(out)}`);
        for (const ref of refs) {
          const refOut = referenceOutPath(t.name, hostId, ref.path);
          const currentRef = existsSync(refOut) ? readFileSync(refOut, "utf8") : "";
          if (currentRef.replace(/\r\n/g, "\n") !== ref.content) { console.error(`STALE ${relName(refOut)} (re-run gen-skill-docs)`); drift++; }
          else console.log(`FRESH ${relName(refOut)}`);
        }
      } else {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, rendered);
        console.log(`wrote ${relName(out)} (${rendered.length} bytes)`);
        for (const ref of refs) {
          const refOut = referenceOutPath(t.name, hostId, ref.path);
          mkdirSync(dirname(refOut), { recursive: true });
          writeFileSync(refOut, ref.content);
        }
      }
    }
  }
  if (check && drift) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv);
}
