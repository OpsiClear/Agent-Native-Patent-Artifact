/**
 * apa-assemble - collate a matter's drafted artifacts into a 37 CFR 1.77-ordered filing document
 * (canonical markdown + USPTO print-CSS HTML). PDF is the filing-faithful format (DESIGN.md §4.2): this
 * machine has no Chromium, so we emit HTML with the 1.52 print stylesheet and the human prints to PDF
 * in a browser (exactly what Chromium page.pdf would render). Schema-valid DOCX is deferred (build-new).
 * Node >=21, ESM, zero deps. This COLLATES drafted text; it does not author it (that is /apa-spec).
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, iterEntitySections } from "../../lib/apa-parse.mjs";

function read(p) { try { return readFileSync(p, "utf8"); } catch { return ""; } }
function prose(body) { return body.split("```binding")[0].trim(); }
const MISSING = (what) => `*[Not drafted - run ${what}]*`;

/** Pull a "## <name>" section's text out of a simple markdown doc (e.g. problem.md). */
function mdSection(text, name) {
  const lines = String(text || "").split(/\r?\n/);
  const header = new RegExp(`^##\\s+${escapeRegex(name)}(?:\\s|$)`, "i");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (header.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return "";
  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i]) || /^```/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function briefDescriptionLines(legend) {
  if (!legend || !Array.isArray(legend.briefDescription)) return [];
  return legend.briefDescription
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry.line === "string") return entry.line;
      if (entry && entry.ordinal && entry.title) return `${entry.ordinal} - ${entry.title}`;
      return "";
    })
    .filter(Boolean);
}

/**
 * Read a dedicated neutral specification-prose file (src/background.md, src/summary.md), stripping
 * markdown headings and blockquote notes. Returns "" if the file is absent, so callers fall back to the
 * prior source. This lets a matter supply a NEUTRAL, non-disparaging Background/Summary for the filed
 * spec while keeping the internal problem/gap analysis (logic/problem.md) out of the filed text.
 */
function neutralDoc(p) {
  const t = read(p);
  if (!t) return "";
  return t.split("\n").filter((l) => !/^\s*#/.test(l) && !/^\s*>/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function assembleMatter(matterDir, { legend } = {}) {
  const fm = parseFrontmatter(read(join(matterDir, "PATENT.md")));
  const problem = read(join(matterDir, "logic", "problem.md"));
  const claimsSecs = iterEntitySections(read(join(matterDir, "logic", "claims.md")));
  const specSecs = iterEntitySections(read(join(matterDir, "src", "embodiments.md")));
  const warnings = [];

  const title = fm.title || "[REQUIRED - title]";
  const field = mdSection(problem, "Field of invention") || (problem ? prose(problem).split("\n")[0] : "");
  // Prefer a dedicated NEUTRAL background/summary (src/background.md, src/summary.md) for the filed spec;
  // fall back to the legacy sources (problem.md / frontmatter) when those files are absent.
  const background = neutralDoc(join(matterDir, "src", "background.md")) || mdSection(problem, "Problem") || mdSection(problem, "The gap") || "";
  const summary = neutralDoc(join(matterDir, "src", "summary.md")) || fm.abstract || (fm.claims_summary && fm.claims_summary.join(" ")) || "";

  // Detailed description: SPEC#### prose in order, renumbered to contiguous [0001], [0002], ...
  let n = 0;
  const detailed = specSecs.map((s) => {
    n += 1;
    const body = prose(s.body).replace(/^\[\d{4}\]\s*/, "");
    return `[${String(n).padStart(4, "0")}] ${body}`;
  });
  if (!detailed.length) warnings.push("no SPEC#### paragraphs - Detailed Description is empty (run /apa-spec).");

  // Claims, numbered 1..N in document order.
  const claims = claimsSecs.map((c, i) => `${i + 1}. ${prose(c.body).replace(/^[A-Z]+\d+\s*-\s*[^\n]*\n/, "").trim()}`);
  if (!claims.length && fm.application_type !== "provisional") warnings.push("no claims (run /apa-claims).");

  const briefLines = briefDescriptionLines(legend);
  const brief = briefLines.length ? briefLines.join("\n") : (specSecs.length ? "" : "");

  const sections = {
    title,
    crossReference: (fm.related_applications && fm.related_applications.length) ? JSON.stringify(fm.related_applications) : "",
    field: field || MISSING("/apa-spec"),
    background: background || MISSING("/apa-spec"),
    summary: summary || MISSING("/apa-spec"),
    briefDescription: brief || (brief === "" && (legend ? "*[no figures]*" : "*[run /apa-figures]*")),
    detailedDescription: detailed.join("\n\n") || MISSING("/apa-spec"),
    claims,
    abstract: fm.abstract || MISSING("/apa-spec"),
  };

  return { sections, markdown: toMarkdown(sections), html: toHtml(sections, fm), warnings };
}

function toMarkdown(s) {
  const parts = [
    `# ${s.title}`, "",
    "## CROSS-REFERENCE TO RELATED APPLICATIONS", s.crossReference || "Not applicable.", "",
    "## FIELD OF THE INVENTION", s.field, "",
    "## BACKGROUND", s.background, "",
    "## BRIEF SUMMARY", s.summary, "",
    "## BRIEF DESCRIPTION OF THE DRAWINGS", s.briefDescription, "",
    "## DETAILED DESCRIPTION", s.detailedDescription, "",
    "## CLAIMS", "", "What is claimed is:", "", ...s.claims.map(formatClaimMarkdown), "",
    "## ABSTRACT", s.abstract, "",
  ];
  return parts.join("\n");
}

function splitClaimNumber(claim) {
  const m = String(claim).match(/^(\d+\.)\s*([\s\S]*)$/);
  return m ? { number: m[1], body: m[2] } : { number: "", body: String(claim) };
}

function claimBlocks(claimBody) {
  const blocks = [];
  let current = null;
  const push = () => {
    if (current && current.text.trim()) blocks.push(current);
    current = null;
  };
  for (const raw of String(claimBody).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const bullet = raw.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      push();
      current = { kind: "step", text: bullet[1].trim() };
      continue;
    }
    if (current && /^\s+/.test(raw)) {
      current.text += ` ${raw.trim()}`;
      continue;
    }
    if (current && current.kind === "lead") {
      current.text += ` ${raw.trim()}`;
      continue;
    }
    push();
    current = { kind: "lead", text: raw.trim() };
  }
  push();
  return blocks;
}

function formatClaimMarkdown(claim) {
  const { number, body } = splitClaimNumber(claim);
  const blocks = claimBlocks(body);
  if (!blocks.length) return claim;
  const out = [`${number} ${blocks[0].text}`.trim()];
  for (const block of blocks.slice(1)) {
    out.push(`    ${block.text}`);
  }
  return out.join("\n");
}

/** USPTO print stylesheet (37 CFR 1.52): ~1in top/left, ~0.75in right/bottom; double spacing; 12pt. */
export function usptoPrintCss() {
  return `@page { size: letter; margin: 1in 0.75in 0.75in 1in; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 2; color: #000; }
  h1 { font-size: 13pt; text-align: center; text-transform: uppercase; }
  h2 { font-size: 12pt; text-transform: uppercase; page-break-after: avoid; }
  .claims, .abstract { page-break-before: always; }
  ol.claims-list > li { margin-bottom: 1em; }
  .claim-step { display: block; margin-left: 0.25in; text-indent: -0.25in; }`;
}

function toHtml(s, fm) {
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (x) => esc(x)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  const para = (t, { preserveLineBreaks = false } = {}) => inline(t)
    .split(/\n{2,}/)
    .map((p) => `<p>${preserveLineBreaks ? p.replace(/\n/g, "<br>") : p.replace(/\s*\n\s*/g, " ")}</p>`)
    .join("\n");
  const claimBody = (claim) => claimBlocks(splitClaimNumber(claim).body)
    .map((b) => `<span class="${b.kind === "step" ? "claim-step" : "claim-lead"}">${inline(b.text)}</span>`)
    .join("");
  const claimsHtml = s.claims.length ? `<ol class="claims-list">${s.claims.map((c) => `<li>${claimBody(c)}</li>`).join("")}</ol>` : "<p><em>[no claims]</em></p>";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.title)}</title>
<style>${usptoPrintCss()}</style></head><body>
<h1>${esc(s.title)}</h1>
<h2>Cross-Reference to Related Applications</h2>${para(s.crossReference || "Not applicable.")}
<h2>Field of the Invention</h2>${para(s.field)}
<h2>Background</h2>${para(s.background)}
<h2>Brief Summary</h2>${para(s.summary)}
<h2>Brief Description of the Drawings</h2>${para(s.briefDescription, { preserveLineBreaks: true })}
<h2>Detailed Description</h2>${para(s.detailedDescription)}
<div class="claims"><h2>Claims</h2><p>What is claimed is:</p>${claimsHtml}</div>
<div class="abstract"><h2>Abstract</h2>${para(s.abstract)}</div>
</body></html>`;
}
