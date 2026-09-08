#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile, atomicWriteJson } from "./review_io.mjs";
import {
  METADATA_FETCH_POLICY,
  safeMetadataFetch,
} from "./apa-safe-review-metadata-fetch.mjs";

const metadataEgress = [];
let approveNetworkEgress = false;

async function fetchText(url, opts) {
  const result = await safeMetadataFetch(url, { ...opts, approveEgress: approveNetworkEgress });
  if (Array.isArray(result.egress)) metadataEgress.push(...result.egress);
  return result;
}

function usage() {
  console.error([
    "usage: node verify_dates.mjs --matter <matter_dir> [--out <json>] [--markdown <md>] [--network|--no-network] [--approve-egress] [--limit N]",
    "",
    "Verifies public-source date metadata for APA IDS/prior-art references where possible."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { network: false, limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") args.matter = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--markdown") args.markdown = argv[++i];
    else if (a === "--network") args.network = true;
    else if (a === "--no-network") args.network = false;
    else if (a === "--approve-egress") args.approveEgress = true;
    else if (a === "--limit") args.limit = Number(argv[++i] || 0);
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.matter) throw new Error("--matter is required");
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error("--limit must be a non-negative integer");
  args.matter = resolve(args.matter);
  args.out = args.out ? resolve(args.out) : join(args.matter, "assembled", "date_verification.json");
  args.markdown = args.markdown ? resolve(args.markdown) : join(args.matter, "assembled", "date_verification.md");
  return args;
}

function readMaybe(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripHtml(text) {
  return normalizeWhitespace(String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"'));
}

function extractCitationTitle(citation) {
  const m = String(citation || "").match(/['"]([^'"]{8,})['"]/);
  return m ? normalizeWhitespace(m[1]) : "";
}

function parseIds(text) {
  const refs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\d+\.\s+\[(PA\d+)\]\s+(.+?)(?:\s+\*\*\[UNVERIFIED|\s*$)/);
    if (m) refs.push({ id: m[1], citation: normalizeWhitespace(m[2]) });
  }
  return refs;
}

function parseCanonicalLinks(text) {
  const links = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)>,;]+/g)) {
    links.push(m[0].replace(/[.,;]+$/, ""));
  }
  return [...new Set(links)];
}

function extractDates(text) {
  const dates = new Set();
  const patterns = [
    /\b(19|20)\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z?)?\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+(?:19|20)\d{2}\b/gi,
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2}\b/gi,
    /\b(?:19|20)\d{2}-\d{2}\b/g,
    /\b(?:19|20)\d{2}\b/g
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) dates.add(m[0]);
  }
  return [...dates].slice(0, 20);
}

function extractDoi(text) {
  const m = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return m ? m[0].replace(/[)\].,;]+$/, "") : "";
}

function extractArxiv(text) {
  const url = text.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/i);
  if (url) return url[1];
  const inline = text.match(/arXiv:?\s*(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return inline ? inline[1] : "";
}

function extractOpenReview(text) {
  const m = text.match(/openreview\.net\/forum\?id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}

function extractGithub(text) {
  const m = text.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "").replace(/[.]+$/, "") } : null;
}

function extractPatentLinks(text) {
  return parseCanonicalLinks(text).filter(u => /patents\.google\.com\/patent\//i.test(u) || /image-ppubs\.uspto\.gov/i.test(u));
}

function extractStandardsLinks(text) {
  return parseCanonicalLinks(text).filter(u => /(?:iso\.org|mpeg\.org|mpeg\.expert)\//i.test(u));
}

function classify(ref, text) {
  const all = `${ref.citation}\n${text}`;
  const doi = extractDoi(all);
  const arxiv = extractArxiv(all);
  const openreview = extractOpenReview(all);
  const github = extractGithub(all);
  const patentLinks = extractPatentLinks(all);
  const standardsLinks = extractStandardsLinks(all);
  const links = parseCanonicalLinks(all);
  let type = "manual";
  if (doi) type = "doi";
  else if (arxiv) type = "arxiv";
  else if (openreview) type = "openreview";
  else if (patentLinks.length) type = "patent";
  else if (github) type = "github";
  else if (standardsLinks.length || /MPEG|ISO\/IEC/i.test(all)) type = "standards";
  return { type, doi, arxiv, openreview, github, patentLinks, standardsLinks, links, candidateDates: extractDates(all) };
}

export function crossrefDate(parts) {
  const values = parts?.[0];
  if (!Array.isArray(values) || values.length < 1 || values.length > 3 || !values.every(Number.isInteger)) return null;
  const [year, month, day] = values;
  if (year < 1 || year > 9999 || (month !== undefined && (month < 1 || month > 12))) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day !== undefined && (day < 1 || day > days[month - 1])) return null;
  return { value: values.map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0")).join("-"),
    precision: ["year", "month", "day"][values.length - 1], dateParts: [...values] };
}

async function verifyDoi(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetchText(url);
  if (!res.ok) return { source: "crossref", ok: false, url, error: res.error || `HTTP ${res.status}` };
  try {
    const json = JSON.parse(res.text);
    const msg = json.message || {};
    const dates = [
      ["published-print", crossrefDate(msg["published-print"]?.["date-parts"])],
      ["published-online", crossrefDate(msg["published-online"]?.["date-parts"])],
      ["issued", crossrefDate(msg.issued?.["date-parts"])],
      ["created", crossrefDate(msg.created?.["date-parts"])]
    ].filter(([, v]) => v);
    return {
      source: "crossref",
      ok: true,
      url,
      title: Array.isArray(msg.title) ? msg.title[0] : "",
      verifiedDates: dates.map(([kind, date]) => ({ kind, ...date,
        evidenceRole: kind === "created" ? "metadata-creation" : "publication-metadata" })),
      caveat: "Partial dates retain source precision; metadata creation does not establish public availability. Exact-day comparisons require day-precision evidence.",
      rawStatus: "public metadata fetched"
    };
  } catch (err) {
    return { source: "crossref", ok: false, url, error: `parse failed: ${err.message}` };
  }
}

async function verifyArxiv(id) {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
  const res = await fetchText(url, { accept: "application/atom+xml,text/xml" });
  if (!res.ok) return { source: "arxiv", ok: false, url, error: res.error || `HTTP ${res.status}` };
  const entry = res.text.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) return { source: "arxiv", ok: false, url, error: "no entry returned" };
  const body = entry[1];
  const title = normalizeWhitespace((body.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
  const published = (body.match(/<published>(.*?)<\/published>/) || [])[1] || "";
  const updated = (body.match(/<updated>(.*?)<\/updated>/) || [])[1] || "";
  return {
    source: "arxiv",
    ok: true,
    url,
    title,
    verifiedDates: [
      published && { kind: "published", value: published },
      updated && { kind: "updated", value: updated }
    ].filter(Boolean),
    rawStatus: "public metadata fetched"
  };
}

async function verifyOpenReview(id, ref, extracted) {
  const url = `https://api2.openreview.net/notes?forum=${encodeURIComponent(id)}`;
  const res = await fetchText(url);
  let apiError = "";
  if (res.ok) {
    try {
      const json = JSON.parse(res.text);
      const note = (json.notes || [])[0] || {};
      const content = note.content || {};
      const title = typeof content.title === "string" ? content.title : content.title?.value || "";
      const dates = [];
      for (const [kind, value] of [["cdate", note.cdate], ["mdate", note.mdate], ["odate", note.odate]]) {
        if (value) dates.push({ kind, value: new Date(value).toISOString() });
      }
      return { source: "openreview", ok: true, url, title, verifiedDates: dates, rawStatus: "public metadata fetched" };
    } catch (err) {
      apiError = `parse failed: ${err.message}`;
    }
  } else {
    apiError = res.error || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(res.text || "{}");
      if (json.name === "ChallengeRequiredError") apiError = `challenge required: ${json.message || "OpenReview API blocked automated access"}`;
    } catch { /* ignore non-JSON */ }
  }

  const titleNeedle = extractCitationTitle(ref?.citation);
  const searchTerms = [
    titleNeedle?.split(":")[0],
    titleNeedle?.split(/\s+/).find(w => /^[A-Z0-9-]{3,}$/.test(w)),
    id
  ].filter(Boolean);
  for (const term of [...new Set(searchTerms)]) {
    const searchUrl = `https://api2.openreview.net/notes/search?term=${encodeURIComponent(term)}`;
    const search = await fetchText(searchUrl);
    if (!search.ok) continue;
    try {
      const json = JSON.parse(search.text);
      const note = (json.notes || []).find(n => n.id === id || n.forum === id || n.content?.title?.value === titleNeedle);
      if (!note) continue;
      const content = note.content || {};
      const title = typeof content.title === "string" ? content.title : content.title?.value || titleNeedle;
      const dates = [];
      for (const [kind, value] of [["cdate", note.cdate], ["mdate", note.mdate], ["odate", note.odate], ["pdate", note.pdate]]) {
        if (value) dates.push({ kind, value: new Date(value).toISOString() });
      }
      return {
        source: "openreview-search",
        ok: true,
        url: searchUrl,
        title,
        verifiedDates: dates,
        rawStatus: "public metadata fetched from OpenReview search API",
        venue: typeof content.venue === "string" ? content.venue : content.venue?.value || "",
        venueid: typeof content.venueid === "string" ? content.venueid : content.venueid?.value || "",
        caveat: `OpenReview search fallback used because forum API check failed: ${apiError || "unknown API failure"}`
      };
    } catch {
      /* try the next fallback */
    }
  }

  const htmlLinks = (extracted?.links || []).filter(u => /openreview\.net\/submissions/i.test(u));
  for (const pageUrl of htmlLinks) {
    const page = await fetchText(pageUrl, { accept: "text/html,*/*" });
    if (!page.ok) continue;
    const text = stripHtml(page.text);
    const titleFound = titleNeedle && text.includes(titleNeedle);
    const idFound = page.text.includes(id);
    if (!titleFound && !idFound) continue;
    const contextStart = titleFound ? Math.max(0, text.indexOf(titleNeedle) - 200) : 0;
    const context = text.slice(contextStart, contextStart + 1000);
    const verifiedDates = [];
    const submitted = context.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s+\(modified:\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\)/i);
    if (submitted) {
      verifiedDates.push({ kind: "submitted", value: submitted[1] });
      verifiedDates.push({ kind: "modified", value: submitted[2] });
    }
    for (const d of extractDates(context).slice(0, 6)) {
      if (!verifiedDates.some(v => v.value === d)) verifiedDates.push({ kind: "page_date_candidate", value: d });
    }
    return {
      source: "openreview-page",
      ok: verifiedDates.length > 0 || titleFound || idFound,
      url: pageUrl,
      title: titleNeedle,
      verifiedDates,
      rawStatus: "public metadata fetched from OpenReview submissions HTML",
      caveat: `OpenReview API fallback used because API check failed: ${apiError || "unknown API failure"}`
    };
  }

  return { source: "openreview", ok: false, url, error: apiError || "OpenReview API/page metadata unavailable" };
}

async function verifyGithub(repo) {
  const api = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const res = await fetchText(api);
  if (!res.ok) return { source: "github", ok: false, url: api, error: res.error || `HTTP ${res.status}` };
  try {
    const json = JSON.parse(res.text);
    return {
      source: "github",
      ok: true,
      url: api,
      title: json.full_name || `${repo.owner}/${repo.repo}`,
      verifiedDates: [
        json.created_at && { kind: "repo_created", value: json.created_at },
        json.pushed_at && { kind: "repo_last_pushed", value: json.pushed_at },
        json.updated_at && { kind: "repo_updated", value: json.updated_at }
      ].filter(Boolean),
      caveat: "GitHub repository dates are not a complete public-availability or release-date verification."
    };
  } catch (err) {
    return { source: "github", ok: false, url: api, error: `parse failed: ${err.message}` };
  }
}

async function verifyPatent(link) {
  const res = await fetchText(link, { accept: "text/html,*/*" });
  if (!res.ok) return { source: "patent-page", ok: false, url: link, error: res.error || `HTTP ${res.status}` };
  const text = res.text;
  const title = normalizeWhitespace(
    (text.match(/<meta[^>]+name=["']DC\.title["'][^>]+content=["']([^"']+)/i) || [])[1] ||
    (text.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] ||
    ""
  );
  const dates = [];
  const fields = [
    ["publication", /Publication of [A-Z0-9/]+\s+(\d{4}-\d{2}-\d{2})/i],
    ["application", /Application filed.*?(\d{4}-\d{2}-\d{2})/i],
    ["priority", /Priority to .*?(\d{4}-\d{2}-\d{2})/i],
    ["granted", /Application granted.*?(\d{4}-\d{2}-\d{2})/i]
  ];
  for (const [kind, re] of fields) {
    const m = text.match(re);
    if (m) dates.push({ kind, value: m[1] });
  }
  if (!dates.length) {
    const generic = extractDates(text).filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).slice(0, 6);
    for (const d of generic) dates.push({ kind: "page_date_candidate", value: d });
  }
  return { source: "patent-page", ok: true, url: link, title, verifiedDates: dates, caveat: "Patent page parsing should be checked against official publication/file history." };
}

async function verifyStandardsLink(link) {
  const res = await fetchText(link, { accept: "text/html,*/*" });
  if (!res.ok) return { source: "standards-page", ok: false, url: link, error: res.error || `HTTP ${res.status}` };
  const text = res.text;
  const title = normalizeWhitespace(
    (text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, " ") ||
    (text.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] ||
    ""
  );
  const verifiedDates = [];
  if (/iso\.org\//i.test(link)) {
    const stageMatches = [...text.matchAll(/(\d{2}\.\d{2})\s+(\d{4}-\d{2}-\d{2})\s+([^<\n]+)/g)];
    for (const m of stageMatches.slice(0, 6)) {
      verifiedDates.push({ kind: `iso_stage_${m[1]}`, value: m[2], note: normalizeWhitespace(m[3]) });
    }
  }
  if (/mpeg\.org\//i.test(link)) {
    const m = text.match(/(?:^|>|\s)([A-Z][a-z]+ \d{1,2}, \d{4})\s+\1/);
    if (m) verifiedDates.push({ kind: "mpeg_page_date", value: m[1] });
  }
  if (!verifiedDates.length) {
    for (const d of extractDates(text).filter(v => /^\d{4}-\d{2}-\d{2}|^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(v)).slice(0, 6)) {
      verifiedDates.push({ kind: "page_date_candidate", value: d });
    }
  }
  return {
    source: "standards-page",
    ok: verifiedDates.length > 0,
    url: link,
    title,
    verifiedDates,
    caveat: "Standards-page metadata verifies public page/stage dates only; exact standards documents and IDS materiality remain human/practitioner checks.",
    error: verifiedDates.length ? undefined : "no date parsed"
  };
}

async function verifyReference(ref, matter, network) {
  const n = ref.id.toLowerCase();
  const evidence = readMaybe(join(matter, "evidence", "prior_art", `${n}.md`));
  const logic = readMaybe(join(matter, "logic", "prior_art.md"));
  const section = (logic.match(new RegExp(`### ${ref.id}[\\s\\S]*?(?=\\n### PA\\d+|\\n## Broad-search|$)`)) || [])[0] || "";
  const text = `${ref.citation}\n${evidence || section}`;
  const extracted = classify(ref, text);
  const result = {
    id: ref.id,
    citation: ref.citation,
    type: extracted.type,
    links: extracted.links,
    extracted,
    checks: [],
    status: "manual_required",
    summary: "",
    manualRequired: []
  };
  if (!network) {
    result.status = "candidate_only";
    result.summary = "Network disabled; extracted candidate dates only.";
    return result;
  }
  if (extracted.doi) result.checks.push(await verifyDoi(extracted.doi));
  if (extracted.arxiv) result.checks.push(await verifyArxiv(extracted.arxiv));
  if (extracted.openreview) result.checks.push(await verifyOpenReview(extracted.openreview, ref, extracted));
  if (extracted.github) result.checks.push(await verifyGithub(extracted.github));
  if (extracted.patentLinks.length) {
    result.checks.push(await verifyPatent(extracted.patentLinks[0]));
  }
  if (extracted.type === "standards" && extracted.standardsLinks.length) {
    for (const link of extracted.standardsLinks.slice(0, 4)) {
      result.checks.push(await verifyStandardsLink(link));
    }
  }
  const okChecks = result.checks.filter(c => c.ok);
  if (okChecks.length) {
    result.status = "public_metadata_fetched";
    result.summary = okChecks.map(c => `${c.source}: ${c.verifiedDates?.map(d => `${d.kind}=${d.value}`).join(", ") || "metadata fetched"}`).join("; ");
  } else if (result.checks.length) {
    result.status = "fetch_failed_or_manual";
    result.summary = result.checks.map(c => `${c.source}: ${c.error || "no date parsed"}`).join("; ");
  } else if (extracted.candidateDates.length) {
    result.status = "candidate_only";
    result.summary = `candidate dates extracted: ${extracted.candidateDates.slice(0, 5).join(", ")}`;
  } else {
    result.status = "manual_required";
    result.summary = "no automatable public date source detected";
  }
  result.manualRequired = [
    "Confirm exact IDS-ready bibliographic citation and public availability date.",
    "Confirm materiality and whether to list on an IDS.",
    "For patents, confirm official publication/file-history data.",
    "For code repositories, confirm release/public availability dates, not just repository metadata."
  ];
  return result;
}

function markdownReport(report) {
  const lines = [
    "# Date Verification Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "> Automated public metadata checks are evidence-gathering aids only. Human verification remains required for IDS citation, public availability, materiality, and inventor-only disclosure facts.",
    "",
    "| Ref | Type | Status | Automated summary | Manual follow-up |",
    "|---|---|---|---|---|"
  ];
  for (const r of report.references) {
    lines.push(`| ${r.id} | ${r.type} | ${r.status} | ${escapeMd(r.summary)} | ${escapeMd((r.manualRequired || []).slice(0, 2).join(" "))} |`);
  }
  lines.push("", "## Manual-Only Date Questions", "");
  for (const item of report.manualOnly) lines.push(`- ${item}`);
  lines.push("");
  return lines.join("\n");
}

function escapeMd(text) {
  return String(text || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function main() {
  const args = parseArgs(process.argv);
  approveNetworkEgress = args.approveEgress === true;
  if (!existsSync(args.matter)) throw new Error(`matter directory not found: ${args.matter}`);
  const ids = parseIds(readMaybe(join(args.matter, "assembled", "IDS_SB08.md")));
  const refs = args.limit ? ids.slice(0, args.limit) : ids;
  const references = [];
  for (const ref of refs) {
    references.push(await verifyReference(ref, args.matter, args.network));
  }
  const report = {
    schema: "apa-date-verification-v1",
    generatedAt: new Date().toISOString(),
    networkUsed: args.network,
    networkPolicy: METADATA_FETCH_POLICY,
    networkEgress: metadataEgress,
    referenceCount: references.length,
    references,
    manualOnly: [
      "Inventor/public disclosure dates for the applicants' own code, docs, examples, demos, talks, customer trials, offers for sale, sales, and public uses.",
      "Whether a disclosure was confidential or public.",
      "Foreign filing impact and statutory-bar legal conclusions.",
      "IDS materiality and final decision to submit a reference."
    ]
  };
  atomicWriteJson(args.out, report);
  atomicWriteFile(args.markdown, markdownReport(report));
  console.log(`wrote ${args.out}`);
  console.log(`wrote ${args.markdown}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  await main();
} catch (err) {
  console.error(`error: ${err.message}`);
  usage();
  process.exit(1);
}
