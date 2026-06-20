/**
 * apa-assemble/ids - seed an Information Disclosure Statement (SB/08) from the matter's prior-art index.
 * Every reference is marked UNVERIFIED: a human must confirm each before it is listed/relied on (37 CFR
 * 1.97/1.98), and the duty of candor is CONTINUING. APA does not file the IDS. Node >=21, ESM, zero deps.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { iterEntitySections, extractBindingBlocks } from "../../lib/apa-parse.mjs";

export function assembleIds(matterDir) {
  let text = "";
  try { text = readFileSync(join(matterDir, "logic", "prior_art.md"), "utf8"); } catch { /* none */ }
  const refs = iterEntitySections(text)
    .filter((s) => /^PA\d+$/.test(s.id))
    .map((s) => ({ id: s.id, b: extractBindingBlocks(s.body)[0] || {} }));

  const lines = refs.map((r, i) => {
    const verified = r.b.verification && r.b.verification.verified === true;
    return `${i + 1}. [${r.id}] ${r.b.citation || "(citation missing)"}  ${verified ? "" : "**[UNVERIFIED - confirm before listing]**"}`;
  });
  const unverified = refs.filter((r) => !(r.b.verification && r.b.verification.verified === true)).length;

  const markdown = [
    "# Information Disclosure Statement - SEED (SB/08; 37 CFR 1.97/1.98)",
    "",
    "> A human must verify each reference (real title/venue/canonical link) before it is listed or relied",
    "> on. The duty of candor (1.56) is CONTINUING - disclose newly-found material references within the",
    "> 1.97 windows. As of Jan 2025 a size-based IDS fee may apply (see the fee worksheet). APA does not file.",
    "",
    `**References:** ${refs.length}  (**unverified:** ${unverified})`,
    "",
    ...(lines.length ? lines : ["*(no prior-art references on file - run /apa-priorart)*"]),
    "",
  ].join("\n");

  return { markdown, count: refs.length, unverified };
}
