/**
 * apa-prosecute/respond - scaffold a `prosecution/response-NN.md` for an Office Action.
 *
 * Per docs/protocol.md §9: for each `REJ##`, emit the affected claims, a FLAGS-AND-QUESTIONS
 * argument block (NOT legal conclusions), and a proposed-amendment block written under the
 * NEW-MATTER GUARD - it never invents specification support; where the spec as filed does not
 * support an amendment, it says so and routes to counsel.
 *
 * A response is NEVER a legal conclusion: a registered practitioner authors, argues, and files it.
 *
 * Node.js >=21, ESM, zero dependencies.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { iterEntitySections, extractBindingBlocks } from "../../lib/apa-parse.mjs";
import { parseOfficeActionFile } from "./parse.mjs";
import { classifyOfficeActionEvent } from "./taxonomy.mjs";

const NEW_MATTER_GUARD =
  "Not supported by the spec as filed - route to counsel.";

// Ground-specific flag prompts. These are QUESTIONS to a practitioner, not arguments or conclusions.
const GROUND_FLAGS = {
  "101": [
    "Is the claim directed to an abstract idea / law of nature / natural phenomenon (Alice/Mayo step 1)? - attorney to assess.",
    "If so, is there an inventive concept / practical application that integrates it (step 2A prong 2 / 2B)? - attorney to assess.",
  ],
  "102": [
    "Does the cited reference disclose EVERY limitation, arranged as in the claim (anticipation)? - attorney to verify against the claim chart.",
    "Is any limitation absent from, or only inherent (not necessarily present) in, the reference? - flag for attorney.",
    "Is the reference properly prior art (date, public availability, 35 USC 102(a)/(b))? - attorney to confirm.",
  ],
  "103": [
    "Is there a proper articulated rationale to combine/modify the cited art (KSR / MPEP 2143)? - attorney to assess.",
    "Does the combination teach away, or lack a reasonable expectation of success? - flag for attorney.",
    "Are there secondary considerations (long-felt need, unexpected results, commercial success)? - gather evidence for attorney.",
  ],
  "112a": [
    "Is the rejected subject matter supported by written description / enabled in the spec as filed? - attorney to assess (no new matter).",
  ],
  "112b": [
    "What exactly does the examiner find indefinite (a term of degree, antecedent basis, unclear scope)? - identify the precise phrase.",
    "Can a defined TERM (lexicography) or claim language already in the spec resolve it WITHOUT adding new matter? - attorney to assess.",
  ],
  "112f": [
    "Is the examiner invoking means-plus-function treatment, and is corresponding structure disclosed in the spec? - attorney to assess.",
  ],
  "double-patenting": [
    "Is this statutory or obviousness-type double patenting? - attorney to assess.",
    "Would a terminal disclaimer be appropriate (and is common ownership present)? - attorney decision, not APA's.",
  ],
};

const GENERIC_FLAGS = [
  "Confirm the examiner's characterization of the claim against the claim as actually drafted.",
  "Identify which limitation(s) the examiner says are missing or disclosed - map each to the claim chart.",
];

/** Derive the NN suffix from an OA filename like `oa-01.md` -> "01". Falls back to "01". */
export function oaNumberFromFile(oaFile) {
  const m = /oa-(\d+)\.md$/i.exec(basename(String(oaFile || "")));
  return m ? m[1] : "01";
}

/** Build the flags-and-questions list for a rejection (ground-specific + generic). */
function flagsForRejection(rej) {
  const ground = (rej.ground || "").toLowerCase();
  const specific = GROUND_FLAGS[ground] || [];
  return [...specific, ...GENERIC_FLAGS];
}

/**
 * Scaffold the response markdown for a matter + an Office Action file.
 *
 * @param {string} matterDir  the matter directory (PATENT.md, logic/claims.md, prosecution/).
 * @param {string} oaFile     path to the OA file (`prosecution/oa-NN.md`).
 * @returns {{ markdown: string, rejectionCount: number, oaNumber: string }}
 */
export function scaffoldResponse(matterDir, oaFile) {
  const oa = parseOfficeActionFile(oaFile);
  const nn = oaNumberFromFile(oaFile);
  const event = classifyOfficeActionEvent(oa.header.action_type);
  if (!event.response_scaffold_supported) {
    const label = event.raw || event.id;
    throw new Error(`unsupported Office Action event type '${label}' for response scaffolding; write an office_action_report.json unsupported-event finding instead.`);
  }

  // Build a CLM## -> short title map from logic/claims.md (best effort; used for readable labels).
  const claimTitles = {};
  try {
    const claimsText = readFileSync(join(matterDir, "logic", "claims.md"), "utf8");
    for (const sec of iterEntitySections(claimsText)) {
      const b = extractBindingBlocks(sec.body)[0] || {};
      if (b.type === "claim-independent" || b.type === "claim-dependent") {
        claimTitles[sec.id] = sec.heading.replace(/^[-\s]+/, "").trim();
      }
    }
  } catch {
    /* claims.md optional for scaffolding; labels degrade gracefully */
  }

  const claimLabel = (id) => (claimTitles[id] ? `${id} (${claimTitles[id]})` : id);

  const lines = [];
  lines.push(`# Response to Office Action ${nn} - DRAFT SCAFFOLD`);
  lines.push("");
  lines.push(
    "> **DRAFT SCAFFOLD - NOT A FILING.** This is a structured starting point that a registered " +
      "patent practitioner completes, argues, and files. Everything below is a FLAG or QUESTION, " +
      "not a legal conclusion. APA does not author arguments, decide patentability, or file papers.",
  );
  lines.push("");
  lines.push("## Office Action under response");
  lines.push("");
  lines.push(`- **Application no.:** ${oa.header.application_no || "[verify in PAIR/Patent Center]"}`);
  lines.push(`- **Examiner:** ${oa.header.examiner || "[verify]"}`);
  lines.push(`- **Mailing date:** ${oa.header.mailing_date || "[verify]"}`);
  lines.push(`- **Action type:** ${oa.header.action_type || "[verify]"}`);
  lines.push(`- **Source OA file:** \`${basename(oaFile)}\``);
  lines.push("");
  lines.push(
    "> **Deadlines are ESTIMATES** (37 CFR 1.136(a)) - run `cli.mjs deadlines --oa <file>` and " +
      "verify against PAIR/Patent Center. APA is not a docketing system of record and computes no " +
      "authoritative dates.",
  );
  lines.push("");

  if (oa.rejections.length === 0) {
    lines.push("## No rejections parsed");
    lines.push("");
    lines.push(
      "No `### REJ## - ...` sections were found in the Office Action. Confirm the OA was captured " +
        "into `prosecution/oa-NN.md` in the protocol format (file-level ```oa header + REJ## sections).",
    );
    lines.push("");
  }

  for (const rej of oa.rejections) {
    const groundLabel = rej.ground ? `35 USC 112 / 102 / 103 ground "${rej.ground}"` : "ground (unspecified)";
    lines.push(`## ${rej.id} - ${rej.gist || "(no gist)"}`);
    lines.push("");
    lines.push(`**Rejection ground:** \`${rej.ground || "unspecified"}\` (${groundLabel}).`);
    lines.push(
      `**Affected claims:** ${rej.claims.length ? rej.claims.map(claimLabel).join(", ") : "[none parsed - verify]"}.`,
    );
    if (rej.references.length) {
      lines.push(`**Cited references:** ${rej.references.join(", ")}.`);
    }
    lines.push("");
    if (rej.examiner_reasoning) {
      lines.push("**Examiner's stated reasoning (as captured):**");
      lines.push("");
      lines.push(`> ${rej.examiner_reasoning.replace(/\n/g, "\n> ")}`);
      lines.push("");
    }

    // ---- Flags-and-questions argument block (NOT conclusions) ---------------------------------
    lines.push("### Argument - flags & questions for the practitioner (NOT conclusions)");
    lines.push("");
    for (const f of flagsForRejection(rej)) {
      lines.push(`- [ ] ${f}`);
    }
    lines.push(
      "- [ ] Draft the actual argument: APA does not assert traversal positions or patentability. " +
        "The practitioner decides what to argue and how.",
    );
    lines.push("");

    // ---- Proposed amendment under the new-matter guard ----------------------------------------
    lines.push("### Proposed amendment (under the new-matter guard)");
    lines.push("");
    lines.push(
      "Any claim amendment MUST be supported by the specification AS FILED (35 USC 132 / 37 CFR 1.121; " +
        "no new matter). APA does not invent support.",
    );
    lines.push("");
    lines.push("```text");
    lines.push("Proposed claim amendment text:");
    lines.push(`  ${NEW_MATTER_GUARD}`);
    lines.push("");
    lines.push("Written-description / support basis (cite SPEC#### from the spec as filed):");
    lines.push(`  ${NEW_MATTER_GUARD}`);
    lines.push("```");
    lines.push("");
    lines.push(
      "> If a needed amendment is not supported by the spec as filed, do NOT add new matter - " +
        "route to counsel to assess a continuation-in-part or other strategy. That is a human decision.",
    );
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "**Post-filing assistance disclaimer.** This scaffold surfaces flags and estimates for a " +
      "registered practitioner. APA does not file, does not compute authoritative deadlines, and " +
      "does not provide legal advice. A registered practitioner authors the response, decides every " +
      "argument and amendment, and files it.",
  );
  lines.push("");

  return {
    markdown: lines.join("\n"),
    rejectionCount: oa.rejections.length,
    oaNumber: nn,
  };
}
