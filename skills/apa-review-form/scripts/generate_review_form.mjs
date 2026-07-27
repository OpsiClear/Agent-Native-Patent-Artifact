#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { atomicWriteFile } from "./review_io.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_APA_KIT = resolve(SCRIPT_DIR, "..", "..", "..");
const GENERATOR_VERSION = "apa-review-form-2026-06-30";

function usage() {
  console.error([
    "usage: node generate_review_form.mjs --matter <matter_dir> [--out <file>] [--apa-kit <dir>] [--run-apa] [--template <file>]",
    "",
    "Generates a standalone local HTML review form for an APA patent matter."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { apaKit: DEFAULT_APA_KIT, runApa: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") args.matter = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--apa-kit") args.apaKit = argv[++i];
    else if (a === "--template") args.template = argv[++i];
    else if (a === "--run-apa") args.runApa = true;
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.matter) throw new Error("--matter is required");
  args.matter = resolve(args.matter);
  args.apaKit = resolve(args.apaKit);
  args.out = args.out ? resolve(args.out) : join(args.matter, "assembled", "human_review_form.html");
  return args;
}

function readMaybe(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function firstMatch(text, re, fallback = "") {
  const m = text.match(re);
  return m ? (m[1] || "").trim().replace(/^["']|["']$/g, "") : fallback;
}

function parsePatentManifest(text) {
  return {
    title: firstMatch(text, /^title:\s*(.+)$/m, "Untitled APA Matter"),
    docket: firstMatch(text, /^matter_docket:\s*(.+)$/m),
    jurisdiction: firstMatch(text, /^jurisdiction:\s*(.+)$/m),
    entityStatus: firstMatch(text, /^entity_status:\s*(.+)$/m),
    status: firstMatch(text, /^status:\s*(.+)$/m)
  };
}

function parseClaims(text) {
  const claims = [];
  const matches = [...text.matchAll(/^###\s+(CLM\d+)\s+-\s+(.+)$/gm)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    const claimText = body.split(/```binding/i)[0].trim();
    const title = m[2].trim();
    claims.push({
      id: m[1],
      title,
      independent: /independent/i.test(title),
      category: /crm|computer-readable/i.test(title) ? "crm" : "method",
      exactText: claimText,
      source: "logic/claims.md"
    });
  }
  return claims;
}

function parseIds(text) {
  const refs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\d+\.\s+\[(PA\d+)\]\s+(.+?)(?:\s+\*\*\[UNVERIFIED|\s*$)/);
    if (m) refs.push({
      id: m[1],
      citation: m[2].trim(),
      exactText: line.trim(),
      source: "assembled/IDS_SB08.md"
    });
  }
  return refs;
}

function extractReadableMarkdown(text) {
  return String(text || "").split(/```binding/i)[0].trim();
}

function parseFigures(text, matter) {
  const figures = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(FIG\d+)\s*\|\s*([^|]+)\|/);
    if (m) {
      const id = m[1];
      const rel = join("evidence", "drawings", `${id.toLowerCase()}.md`);
      figures.push({
        id,
        title: m[2].trim(),
        exactText: extractReadableMarkdown(readMaybe(join(matter, rel))),
        source: rel.replace(/\\/g, "/")
      });
    }
  }
  return figures;
}

function parsePreflight(text) {
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^-\s+\*\*(PASS|FAIL|WARN)\*\*\s+(.+)$/i);
    if (m) items.push({ status: m[1].toUpperCase(), text: m[2].trim() });
  }
  return items;
}

function parseDateVerification(text) {
  if (!text.trim()) return null;
  try {
    const report = JSON.parse(text);
    if (!Array.isArray(report.references)) return null;
    return report;
  } catch {
    return null;
  }
}

function runCommand(name, cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  return {
    name,
    ok: result.status === 0,
    output: [
      `$ ${command} ${args.join(" ")}`,
      result.stdout || "",
      result.stderr || ""
    ].join("\n").trim()
  };
}

function redactLocalPaths(text, replacements) {
  let redacted = String(text || "");
  for (const [path, label] of replacements) {
    if (!path) continue;
    redacted = redacted.split(path).join(label);
    redacted = redacted.split(path.replace(/\\/g, "/")).join(label);
  }
  return redacted;
}

function runApaCommands(matter, apaKit) {
  if (!existsSync(apaKit)) {
    return [{ name: "APA toolkit", ok: false, output: "APA toolkit not found at the configured local path." }];
  }
  const results = [
    runCommand("apa-validate", apaKit, "node", ["packages/apa-validate/validate.mjs", matter]),
    runCommand("claim-lint", apaKit, "node", ["packages/apa-draft/claim-lint.mjs", matter]),
    runCommand("apa-assemble", apaKit, "node", ["packages/apa-assemble/cli.mjs", "--matter", matter])
  ];
  const replacements = [[matter, "<matter>"], [apaKit, "<apa-kit>"]];
  return results.map(result => ({
    ...result,
    output: redactLocalPaths(result.output, replacements)
  }));
}

function checklistSections({ claims, references, figures, preflight, dateVerification }) {
  const independentClaims = claims.filter(c => c.independent);
  const claimItems = independentClaims.length ? independentClaims : claims.slice(0, 6);
  const sections = [
    {
      id: "filing",
      title: "Filing Readiness",
      description: "Human-only filing tasks and generated artifact checks.",
      items: [
        ...preflight.map((p, i) => ({ id: `preflight-${i + 1}`, tag: p.status, text: p.text })),
        { id: "ads", tag: "ADS", text: "ADS has inventor residence, mailing address, correspondence data, entity status, and priority/benefit data verified." },
        { id: "declaration", tag: "Declaration", text: "Inventor declaration is complete, current, and signed by the inventor or filing strategy accounts for later declaration." },
        { id: "fees", tag: "Fees", text: "Patent Center fees, entity status, DOCX/PDF surcharge, IDS fees, and excess-claim status are verified live." },
        { id: "final-pdf", tag: "PDF", text: "Final specification and drawing PDFs/DOCX are opened page by page in a normal viewer before filing." }
      ]
    },
    {
      id: "statutory-bar",
      title: "Statutory-Bar / Disclosure Screen",
      description: "Record dates for public disclosures, offers, sales, demos, and customer trials.",
      items: [
        { id: "public-code", tag: "102", text: "Any public source repository or package release is identified with first-public date." },
        { id: "public-docs", tag: "102", text: "Any public docs, examples, blog posts, videos, talks, or demos are identified with dates." },
        { id: "sales", tag: "102", text: "Any offer for sale, sale, customer trial, investor/customer demo, or commercial use is identified with dates and confidentiality status." },
        { id: "foreign", tag: "Foreign", text: "Foreign-rights impact is reviewed if any prefiling disclosure occurred." }
      ]
    },
    {
      id: "claims",
      title: "Independent Claim Review",
      description: "Check claim scope, written-description support, and code accuracy.",
      items: claimItems.map(c => ({ id: c.id, tag: c.id, text: `${c.title}. Verify 101/102/103/112 posture and support in src/embodiments.md.` }))
    },
  ];
  if (dateVerification?.references?.length) {
    sections.push({
      id: "date-verification",
      title: "Automated Date Verification",
      description: "Public metadata checks are automated aids only; human IDS/public-availability verification remains required.",
      items: dateVerification.references.map(r => ({
        id: r.id,
        tag: r.status || r.type || r.id,
        text: `${r.id}: ${r.summary || "No automated summary."} Manual follow-up: ${(r.manualRequired || []).slice(0, 2).join(" ")}`
      }))
    });
  } else {
    sections.push({
      id: "date-verification",
      title: "Automated Date Verification",
      description: "Run verify_dates.mjs to populate public metadata checks.",
      items: [
        { id: "run-date-verifier", tag: "Dates", text: "Run the date verifier and review its public metadata output before IDS finalization." },
        { id: "manual-disclosures", tag: "Manual", text: "Inventor-only disclosure, offer-for-sale, customer-trial, and confidentiality dates remain manual facts." }
      ]
    });
  }
  sections.push(
    {
      id: "ids",
      title: "IDS / Citation Verification",
      description: "Every listed reference remains unverified until a human confirms it.",
      items: references.map(r => ({ id: r.id, tag: r.id, text: r.citation }))
    },
    {
      id: "closest-art",
      title: "Closest-Art Pressure",
      description: "Document the practical claim boundary against the matter's cited references.",
      items: references.length
        ? references.slice(0, 8).map(ref => ({
            id: `pressure-${ref.id}`,
            tag: ref.id,
            text: `Compare every relied-on claim limitation with ${ref.id}; record the exact distinction and supporting disclosure instead of relying on labels or intended use.`
          }))
        : [
            {
              id: "identify-closest-art",
              tag: "Prior art",
              text: "Identify the closest references, map each relied-on limitation, and record exact distinctions with specification support."
            }
          ]
    },
    {
      id: "drawings",
      title: "Drawings / PDF Review",
      description: "Check readability, figure numerals, leaders, and consistency with the spec.",
      items: figures.map(f => ({ id: f.id, tag: f.id, text: `${f.title}. Verify labels, leaders, arrows, sheet scale, and spec consistency.` }))
    },
    {
      id: "code-consistency",
      title: "Implementation Consistency",
      description: "Spot-check the draft against the disclosed implementation and evidence.",
      items: [
        { id: "terms", tag: "Terms", text: "Claim and specification terms match the terminology used in the disclosure, source evidence, diagrams, and embodiments." },
        { id: "sequence", tag: "Sequence", text: "Required ordering, data flow, and reconstruction or processing steps match the disclosed implementation." },
        { id: "optionality", tag: "Scope", text: "Optional implementation details are not presented as mandatory unless that narrowing is intentional and supported." },
        { id: "negative-limitations", tag: "Limits", text: "Any negative limitation or excluded behavior is factually accurate and has written-description support." },
        { id: "examples", tag: "Examples", text: "Examples and figures do not contradict the independent claims or imply unsupported capabilities." }
      ]
    }
  );
  return sections;
}

function question(id, category, prompt, choices, opts = {}) {
  return {
    id,
    category,
    prompt,
    choices: choices.map(([value, label, effect]) => ({ value, label, effect })),
    why: opts.why || "",
    notePrompt: opts.notePrompt || "Optional notes, dates, URLs, file paths, or evidence:",
    source: opts.source || ""
  };
}

function disclosureQuestions() {
  return [
    question(
      "DISC-001",
      "disclosures",
      "Before the intended filing date, was any implementation source code, package, example, or repository for the claimed work publicly accessible?",
      [
        ["no_known_public_code", "No known public code/repo", "No public-code date needs to be supplied now."],
        ["yes_public_code", "Yes, public code/repo existed", "Supply first public date, URL, and what was disclosed."],
        ["uncertain_public_code", "Uncertain / needs checking", "Flag for follow-up before filing."]
      ],
      { why: "Inventor-only public code dates cannot be verified from prior-art metadata." }
    ),
    question(
      "DISC-002",
      "disclosures",
      "Before filing, were any docs, examples, blog posts, videos, talks, screenshots, demos, or public issue discussions available that described the claimed work?",
      [
        ["no_known_public_docs", "No known public docs/demos", "No public-doc date needs to be supplied now."],
        ["yes_public_docs", "Yes, public docs/demos existed", "Supply first public date, URL/archive, and disclosed subject matter."],
        ["uncertain_public_docs", "Uncertain / needs checking", "Flag for follow-up before filing."]
      ]
    ),
    question(
      "DISC-003",
      "disclosures",
      "Before filing, was the claimed work offered for sale, sold, licensed, used commercially, or shown in a customer/investor trial?",
      [
        ["no_sales_or_trials", "No sales/trials/offers", "No commercial-use date needs to be supplied now."],
        ["yes_sales_or_trials", "Yes, possible sale/trial/offer", "Supply dates, counterparties, and confidentiality status."],
        ["uncertain_sales_or_trials", "Uncertain / needs checking", "Flag for practitioner review."]
      ],
      { why: "Offer-for-sale and commercial-use facts are usually not public metadata." }
    ),
    question(
      "DISC-004",
      "disclosures",
      "For any non-public demos, customer access, investor meetings, or collaborators, what was the confidentiality status?",
      [
        ["all_confidential", "All confidential / NDA-covered", "Record evidence of confidentiality."],
        ["some_non_confidential", "Some public or no NDA", "Supply dates and details for review."],
        ["unknown_confidentiality", "Unknown / mixed", "Flag for evidence gathering."]
      ]
    ),
    question(
      "DISC-005",
      "disclosures",
      "Is there any possible pre-filing disclosure outside the United States that should be checked for foreign-rights impact?",
      [
        ["no_foreign_disclosure", "No known foreign disclosure", "No foreign disclosure follow-up from this answer."],
        ["possible_foreign_disclosure", "Possible foreign disclosure", "Supply country, date, and public/confidential status."],
        ["uncertain_foreign_disclosure", "Uncertain / needs checking", "Flag for practitioner review."]
      ]
    )
  ];
}

function idsQuestions(references) {
  return references.map(ref => question(
    `IDS-${ref.id}`,
    "ids",
    `Should ${ref.id} be treated as an IDS candidate for human citation/materiality review? ${ref.citation}`,
    [
      ["include_candidate", "Include as IDS candidate", "Keep in the IDS review set."],
      ["omit_candidate", "Omit unless practitioner disagrees", "Record reason for possible omission."],
      ["unsure_candidate", "Unsure", "Flag for practitioner or inventor follow-up."]
    ],
    { notePrompt: "Notes on materiality, citation quality, or why this reference should/should not be listed:" }
  ));
}

function dateQuestions(dateVerification) {
  const refs = Array.isArray(dateVerification?.references) ? dateVerification.references : [];
  const needsReview = refs.filter(r => r.status !== "public_metadata_fetched");
  const questions = [
    question(
      "DATE-OWN-001",
      "dates",
      "Can you provide the earliest known public disclosure date for your own claimed implementation, if any?",
      [
        ["no_known_public_disclosure", "No known public disclosure", "Record as inventor belief, still subject to review."],
        ["provide_public_disclosure_date", "Yes, I can provide a date", "Supply date, source, and disclosed subject matter."],
        ["unknown_public_disclosure_date", "Unknown / needs search", "Flag for follow-up."]
      ],
      { notePrompt: "Date, URL/archive/file path, and what was disclosed:" }
    ),
    question(
      "DATE-OWN-002",
      "dates",
      "Can you provide the earliest offer-for-sale, sale, commercial-use, or customer-trial date, if any?",
      [
        ["no_known_commercial_event", "No known commercial event", "Record as inventor belief, still subject to review."],
        ["provide_commercial_event_date", "Yes, I can provide a date", "Supply date, event type, counterparty, and confidentiality status."],
        ["unknown_commercial_event_date", "Unknown / needs search", "Flag for follow-up."]
      ],
      { notePrompt: "Date, event type, counterparty, confidentiality status, and evidence:" }
    )
  ];
  for (const ref of needsReview) {
    questions.push(question(
      `DATE-${ref.id}`,
      "dates",
      `${ref.id} has automated date status "${ref.status}". Can you confirm an IDS-ready public-availability date? ${ref.summary || ""}`,
      [
        ["confirmed_public_date", "Confirmed exact public date", "Record date/source for citation review."],
        ["not_confirmed_public_date", "Not confirmed", "Keep as manual follow-up."],
        ["not_material_or_omit", "Likely omit / not material", "Record rationale for practitioner review."]
      ],
      {
        source: ref.citation || ref.id,
        notePrompt: "Confirmed date/source, or reason this remains unresolved:"
      }
    ));
  }
  return questions;
}

function figureQuestions(figures) {
  return figures.map(fig => question(
    `FIG-${fig.id}`,
    "figures",
    `Does ${fig.id} look filing-ready and match the written description? ${fig.title}`,
    [
      ["figure_ready", "Ready", "No figure action from this answer."],
      ["figure_needs_fix", "Needs fix", "Record specific visual or logic issue."],
      ["figure_unsure", "Unsure", "Flag for visual/practitioner review."]
    ],
    { notePrompt: "Issue, page/sheet, reference numerals, overlap, missing leader, or spec mismatch:" }
  ));
}

function buildQuestionQueues({ references, figures, dateVerification }) {
  const queues = {
    disclosures: disclosureQuestions(),
    dates: dateQuestions(dateVerification),
    ids: idsQuestions(references),
    figures: figureQuestions(figures)
  };
  queues.all = [...queues.disclosures, ...queues.dates, ...queues.ids, ...queues.figures];
  return queues;
}

function dateEvidenceFor(ref, dateVerification) {
  const match = Array.isArray(dateVerification?.references)
    ? dateVerification.references.find(r => r.id === ref.id)
    : null;
  if (!match) return [];
  const evidence = [
    `Automated status: ${match.status || "unknown"}`,
    match.summary ? `Automated summary: ${match.summary}` : "",
    ...(match.links || []).slice(0, 4).map(link => `Source link: ${link}`),
    ...(match.manualRequired || []).slice(0, 3).map(item => `Manual follow-up: ${item}`)
  ].filter(Boolean);
  return evidence;
}

function buildReviewPages({ claims, references, figures, preflight, dateVerification }) {
  const independentClaims = claims.filter(c => c.independent);
  return [
    {
      id: "overview",
      title: "Start",
      description: "Set reviewer metadata, then work through the guided review pages.",
      cards: []
    },
    {
      id: "disclosures",
      title: "Disclosures",
      description: "Answer inventor-only public disclosure, sale, demo, and confidentiality questions.",
      cards: []
    },
    {
      id: "claims",
      title: "Claims",
      description: "Read the exact independent claim text before marking scope/support issues.",
      cards: independentClaims.map(claim => ({
        id: claim.id,
        tag: claim.id,
        title: claim.title,
        prompt: "Does this claim text match your intended invention and the implementation facts?",
        sourceLabel: claim.source,
        exactText: claim.exactText,
        evidence: [
          "Check support in the specification and embodiments.",
          "Check every negative limitation or excluded behavior against the disclosed implementation.",
          "Check that implementation examples do not narrow the claim unintentionally."
        ],
        notePrompt: "Scope/support/code-consistency notes for this claim:"
      }))
    },
    {
      id: "ids",
      title: "IDS & Dates",
      description: "Review exact reference text and public-date evidence before practitioner IDS review.",
      cards: references.map(ref => ({
        id: ref.id,
        tag: ref.id,
        title: ref.id,
        prompt: "Should this exact reference remain in the IDS candidate set?",
        sourceLabel: ref.source,
        exactText: ref.exactText || ref.citation,
        evidence: dateEvidenceFor(ref, dateVerification),
        notePrompt: "Citation, date, materiality, or omission rationale:"
      }))
    },
    {
      id: "figures",
      title: "Figures",
      description: "Review exact figure transcription before marking drawing issues.",
      cards: figures.map(fig => ({
        id: fig.id,
        tag: fig.id,
        title: fig.title,
        prompt: "Does this figure transcription match the drawing and the specification?",
        sourceLabel: fig.source,
        exactText: fig.exactText || fig.title,
        evidence: [
          "Check reference numerals, leader lines, labels, scale, and consistency with written description.",
          "Confirm no text overlaps and no missing necessary arrows/connections."
        ],
        notePrompt: "Drawing/transcription issue notes:"
      }))
    },
    {
      id: "filing",
      title: "Filing",
      description: "Final mechanical and human-only filing readiness checks.",
      cards: [
        ...preflight.map((item, i) => ({
          id: `preflight-${i + 1}`,
          tag: item.status,
          title: item.text.split(" - ")[0] || item.text,
          prompt: "Is this preflight item acceptable for practitioner handoff?",
          sourceLabel: "assembled/PREFLIGHT.md",
          exactText: item.text,
          evidence: [],
          notePrompt: "Filing-readiness notes:"
        })),
        {
          id: "ads",
          tag: "ADS",
          title: "Application Data Sheet",
          prompt: "Has ADS data been checked against the intended filing?",
          sourceLabel: "human input",
          exactText: "ADS has inventor residence, mailing address, correspondence data, entity status, and priority/benefit data verified.",
          evidence: ["This is a human-only filing fact."],
          notePrompt: "ADS notes:"
        },
        {
          id: "final-pdf",
          tag: "PDF",
          title: "Final PDF/DOCX visual review",
          prompt: "Have the final filing documents been opened page by page?",
          sourceLabel: "human input",
          exactText: "Final specification and drawing PDFs/DOCX are opened page by page in a normal viewer before filing.",
          evidence: ["Visual review is required even when mechanical validators pass."],
          notePrompt: "Final document review notes:"
        }
      ]
    },
    {
      id: "agent",
      title: "Agent",
      description: "Queue focused requests for agent follow-up.",
      cards: []
    },
    {
      id: "checklist",
      title: "Checklist",
      description: "Full legacy checklist and APA command snapshot.",
      cards: []
    }
  ];
}

function main() {
  const args = parseArgs(process.argv);
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = dirname(scriptPath);
  const skillDir = dirname(scriptDir);
  const templatePath = args.template ? resolve(args.template) : join(skillDir, "assets", "review-form-template.html");
  if (!existsSync(args.matter)) throw new Error(`matter directory not found: ${args.matter}`);
  if (!existsSync(templatePath)) throw new Error(`template not found: ${templatePath}`);

  const manifest = parsePatentManifest(readMaybe(join(args.matter, "PATENT.md")));
  const claims = parseClaims(readMaybe(join(args.matter, "logic", "claims.md")));
  const references = parseIds(readMaybe(join(args.matter, "assembled", "IDS_SB08.md")));
  const figures = parseFigures(readMaybe(join(args.matter, "evidence", "README.md")), args.matter);
  const preflight = parsePreflight(readMaybe(join(args.matter, "assembled", "PREFLIGHT.md")));
  const dateVerification = parseDateVerification(readMaybe(join(args.matter, "assembled", "date_verification.json")));
  const apaCommands = args.runApa ? runApaCommands(args.matter, args.apaKit) : [];

  const data = {
    title: manifest.title,
    docket: manifest.docket,
    jurisdiction: manifest.jurisdiction,
    entityStatus: manifest.entityStatus,
    status: manifest.status,
    matterId: manifest.docket || manifest.title,
    generator: {
      name: "apa-review-form",
      version: GENERATOR_VERSION
    },
    generatedAt: new Date().toISOString(),
    claims,
    references,
    figures,
    preflight,
    dateVerification,
    questionQueues: buildQuestionQueues({ references, figures, dateVerification }),
    reviewPages: buildReviewPages({ claims, references, figures, preflight, dateVerification }),
    sections: checklistSections({ claims, references, figures, preflight, dateVerification }),
    apaCommands
  };

  const json = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
  const html = readFileSync(templatePath, "utf8").replace("__REVIEW_DATA__", json);
  atomicWriteFile(args.out, html);
  console.log(`wrote ${args.out}`);
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  usage();
  process.exit(1);
}
