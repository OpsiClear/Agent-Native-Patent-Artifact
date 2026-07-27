/**
 * apa-assemble/ids - seed an Information Disclosure Statement (SB/08) from the matter's prior-art index.
 * Every reference is marked UNVERIFIED: a human must confirm each before it is listed/relied on (37 CFR
 * 1.97/1.98), and the duty of candor is CONTINUING. APA does not file the IDS. Node >=21, ESM, zero deps.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { iterEntitySections, extractBindingBlocks } from "../../lib/apa-parse.mjs";
import { validateSearchDossier } from "../apa-search/dossier-schema.mjs";

export function assembleIds(matterDir) {
  let text = "";
  try { text = readFileSync(join(matterDir, "logic", "prior_art.md"), "utf8"); } catch { /* none */ }
  const refs = iterEntitySections(text)
    .filter((s) => /^PA\d+$/.test(s.id))
    .map((s) => ({ id: s.id, b: extractBindingBlocks(s.body)[0] || {} }));
  const readiness = assignedReferenceReadiness(matterDir);

  const lines = refs.map((r, i) => {
    const idsReady = readiness.byPaId.get(r.id)?.idsReady === true;
    return `${i + 1}. [${r.id}] ${r.b.citation || "(citation missing)"}  ${idsReady ? "" : "**[UNVERIFIED - confirm before listing]**"}`;
  });
  const unverified = refs.filter((r) => readiness.byPaId.get(r.id)?.idsReady !== true).length;
  const readinessNote = readiness.dossierCount > 0
    ? "> IDS readiness is derived only from each search dossier's assigned-reference `verification.ids_ready` state."
    : "> No search dossier was found. Every reference remains UNVERIFIED for IDS use; a legacy prior-art `verification.verified` flag is not sufficient.";

  const markdown = [
    "# Information Disclosure Statement - SEED (SB/08; 37 CFR 1.97/1.98)",
    "",
    "> A human must verify each reference (real title/venue/canonical link) before it is listed or relied",
    "> on. The duty of candor (1.56) is CONTINUING - disclose newly-found material references within the",
    "> 1.97 windows. As of Jan 2025 a size-based IDS fee may apply (see the fee worksheet). APA does not file.",
    readinessNote,
    "",
    `**References:** ${refs.length}  (**unverified:** ${unverified})`,
    "",
    ...(lines.length ? lines : ["*(no prior-art references on file - run /apa-priorart)*"]),
    "",
  ].join("\n");

  return {
    markdown,
    count: refs.length,
    unverified,
    dossierCount: readiness.dossierCount,
    readinessSource: "search-dossier-assigned-reference",
  };
}

/**
 * Read newest-first search dossiers and take the newest assigned-reference state for each PA id.
 * Missing, malformed, or non-dossier JSON never confers IDS readiness.
 */
function assignedReferenceReadiness(matterDir) {
  const evidenceDir = join(matterDir, "evidence", "prior_art");
  let names = [];
  try {
    names = readdirSync(evidenceDir)
      .filter((name) => /^search-dossier-.*\.json$/i.test(name))
      .sort()
      .reverse();
  } catch {
    return { byPaId: new Map(), dossierCount: 0 };
  }

  const dossiers = [];
  for (const name of names) {
    try {
      const value = JSON.parse(readFileSync(join(evidenceDir, name), "utf8"));
      if (!validateSearchDossier(value).ok) continue;
      dossiers.push({
        name,
        generatedAt: String(value.generated_at || ""),
        assigned: value.assigned_references,
      });
    } catch {
      // A malformed dossier must fail closed: it contributes no readiness evidence.
    }
  }
  dossiers.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt) || b.name.localeCompare(a.name));

  const byPaId = new Map();
  for (const dossier of dossiers) {
    for (const assigned of dossier.assigned) {
      const paId = String(assigned?.pa_id || "").trim();
      if (!/^PA\d+$/.test(paId) || byPaId.has(paId)) continue;
      byPaId.set(paId, {
        idsReady: dossierVerificationIsReady(assigned?.verification),
        dossier: dossier.name,
      });
    }
  }
  return { byPaId, dossierCount: dossiers.length };
}

function dossierVerificationIsReady(verification) {
  if (
    !verification ||
    verification.ids_ready !== true ||
    verification.human_verified !== true
  ) return false;
  const checks = verification.required_checks;
  return Boolean(
    checks &&
    checks.title === true &&
    checks.venue === true &&
    checks.canonical_link === true &&
    checks.relied_on_passage === true
  );
}
