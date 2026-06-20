/**
 * apa-assemble/ads - draft the Application Data Sheet (37 CFR 1.76) from PATENT.md frontmatter. The ADS
 * is the controlling document for inventor names, applicant, and benefit/priority claims (a wrong/missing
 * benefit claim forfeits priority), so missing required fields are marked [REQUIRED] for the human. The
 * human signs the declaration; APA never does. Node >=21, ESM, zero deps.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";

export function assembleAds(matterDir) {
  const fm = parseFrontmatter((() => { try { return readFileSync(join(matterDir, "PATENT.md"), "utf8"); } catch { return ""; } })());
  const flags = [];
  const req = (v, what) => { if (!v || /^(tbd|unassigned|none|unfiled|unknown)$/i.test(String(v))) { flags.push(what); return `[REQUIRED - ${what}]`; } return v; };

  const inventors = (fm.inventors || []);
  if (!inventors.length) flags.push("at least one inventor");
  const invLines = inventors.map((i) => `- ${req(i.name, `inventor ${i.id} legal name`)} — residence & mailing address [REQUIRED]`);

  const applicant = (fm.assignee && !/^unassigned$/i.test(fm.assignee)) ? fm.assignee : "the named inventor(s) (37 CFR 1.46 assignee-applicant otherwise)";
  const benefit = (fm.related_applications && fm.related_applications.length) ? fm.related_applications.map((r) => `- ${JSON.stringify(r)}`).join("\n") : "[none claimed - confirm: a missing domestic-benefit (120/365(c)) or foreign-priority (119) claim forfeits priority]";

  const markdown = [
    "# Application Data Sheet (ADS) - DRAFT (37 CFR 1.76)",
    "",
    "> Controlling document for inventor names, applicant, and benefit/priority. Review and have a human",
    "> sign; APA does not sign or file. Estimate/draft - verify every field.",
    "",
    `**Title:** ${req(fm.title, "application title")}`,
    `**Application type:** ${fm.application_type || "[REQUIRED]"}`,
    `**Attorney docket:** ${fm.matter_docket || "[none]"}`,
    `**Entity status:** ${fm.entity_status || "unknown"}  (micro-entity is a separate 1.29 certification a human makes; APA does not assert it)`,
    "",
    "## Inventor(s)",
    invLines.join("\n") || "[REQUIRED - at least one natural person]",
    "",
    `## Applicant`, applicant, "",
    "## Domestic benefit / foreign priority", benefit, "",
    "## Correspondence / customer number", "[REQUIRED - to be supplied by the filer]", "",
  ].join("\n");

  return { markdown, flags };
}
