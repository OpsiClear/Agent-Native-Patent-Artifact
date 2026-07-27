#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { atomicWriteFile, atomicWriteJson, readJsonFile } from "./review_io.mjs";
import { buildReviewTargetFingerprint } from "./review_fingerprint.mjs";

function usage() {
  console.error([
    "usage: node ask_review_questions.mjs --matter <matter_dir> [--topic disclosures|ids|dates|figures|all] [--mode interactive|markdown|json|agent] [--limit N] [--queue <json>] [--answers <json>] [--prompt <md>] [--record <answer_text>]",
    "",
    "Creates or runs numbered human-review questions for Codex, Claude CLI, or a normal terminal."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { topic: "disclosures", mode: "interactive", limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") args.matter = argv[++i];
    else if (a === "--topic") args.topic = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i] || 0);
    else if (a === "--queue") args.queue = argv[++i];
    else if (a === "--answers") args.answers = argv[++i];
    else if (a === "--prompt") args.prompt = argv[++i];
    else if (a === "--record") args.record = argv[++i];
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.matter) throw new Error("--matter is required");
  if (!["disclosures", "ids", "dates", "figures", "all"].includes(args.topic)) {
    throw new Error("--topic must be disclosures, ids, dates, figures, or all");
  }
  if (!["interactive", "markdown", "json", "agent"].includes(args.mode)) {
    throw new Error("--mode must be interactive, markdown, json, or agent");
  }
  if (!Number.isInteger(args.limit) || args.limit < 0) {
    throw new Error("--limit must be a non-negative integer");
  }
  args.matter = resolve(args.matter);
  const assembled = join(args.matter, "assembled");
  args.queue = args.queue ? resolve(args.queue) : join(assembled, "agent_question_queue.json");
  args.answers = args.answers ? resolve(args.answers) : join(assembled, "agent_question_answers.json");
  args.prompt = args.prompt ? resolve(args.prompt) : join(assembled, "agent_question_prompt.md");
  return args;
}

function readMaybe(path) {
  try { return readFileSync(path, "utf8"); } catch { return ""; }
}

function readJsonMaybe(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function firstMatch(text, re, fallback = "") {
  const m = text.match(re);
  return m ? (m[1] || "").trim().replace(/^["']|["']$/g, "") : fallback;
}

function parsePatentManifest(text) {
  return {
    title: firstMatch(text, /^title:\s*(.+)$/m, "Untitled APA Matter"),
    docket: firstMatch(text, /^matter_docket:\s*(.+)$/m)
  };
}

function parseIds(text) {
  const refs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\d+\.\s+\[(PA\d+)\]\s+(.+?)(?:\s+\*\*\[UNVERIFIED|\s*$)/);
    if (m) refs.push({ id: m[1], citation: normalizeWhitespace(m[2]) });
  }
  return refs;
}

function parseFigures(text) {
  const figures = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(FIG\d+)\s*\|\s*([^|]+)\|/);
    if (m) figures.push({ id: m[1], title: normalizeWhitespace(m[2]) });
  }
  return figures;
}

function question(id, category, prompt, choices, opts = {}) {
  return {
    id,
    category,
    prompt,
    choices,
    why: opts.why || "",
    notePrompt: opts.notePrompt || "Optional notes, dates, URLs, file paths, or evidence:",
    source: opts.source || "",
    requiredForReadiness: ["disclosures", "dates"].includes(category)
  };
}

function choices(items) {
  return items.map(([value, label, effect]) => ({ value, label, effect }));
}

function disclosureQuestions() {
  return [
    question(
      "DISC-001",
      "disclosures",
      "Before the intended filing date, was any implementation source code, package, example, or repository for the claimed work publicly accessible?",
      choices([
        ["no_known_public_code", "No known public code/repo", "No public-code date needs to be supplied now."],
        ["yes_public_code", "Yes, public code/repo existed", "Supply first public date, URL, and what was disclosed."],
        ["uncertain_public_code", "Uncertain / needs checking", "Flag for follow-up before filing."]
      ]),
      { why: "Inventor-only public code dates cannot be verified from prior-art metadata." }
    ),
    question(
      "DISC-002",
      "disclosures",
      "Before filing, were any docs, examples, blog posts, videos, talks, screenshots, demos, or public issue discussions available that described the claimed work?",
      choices([
        ["no_known_public_docs", "No known public docs/demos", "No public-doc date needs to be supplied now."],
        ["yes_public_docs", "Yes, public docs/demos existed", "Supply first public date, URL/archive, and disclosed subject matter."],
        ["uncertain_public_docs", "Uncertain / needs checking", "Flag for follow-up before filing."]
      ])
    ),
    question(
      "DISC-003",
      "disclosures",
      "Before filing, was the claimed work offered for sale, sold, licensed, used commercially, or shown in a customer/investor trial?",
      choices([
        ["no_sales_or_trials", "No sales/trials/offers", "No commercial-use date needs to be supplied now."],
        ["yes_sales_or_trials", "Yes, possible sale/trial/offer", "Supply dates, counterparties, and confidentiality status."],
        ["uncertain_sales_or_trials", "Uncertain / needs checking", "Flag for practitioner review."]
      ]),
      { why: "Offer-for-sale and commercial-use facts are usually not public metadata." }
    ),
    question(
      "DISC-004",
      "disclosures",
      "For any non-public demos, customer access, investor meetings, or collaborators, what was the confidentiality status?",
      choices([
        ["all_confidential", "All confidential / NDA-covered", "Record evidence of confidentiality."],
        ["some_non_confidential", "Some public or no NDA", "Supply dates and details for review."],
        ["unknown_confidentiality", "Unknown / mixed", "Flag for evidence gathering."]
      ])
    ),
    question(
      "DISC-005",
      "disclosures",
      "Is there any possible pre-filing disclosure outside the United States that should be checked for foreign-rights impact?",
      choices([
        ["no_foreign_disclosure", "No known foreign disclosure", "No foreign disclosure follow-up from this answer."],
        ["possible_foreign_disclosure", "Possible foreign disclosure", "Supply country, date, and public/confidential status."],
        ["uncertain_foreign_disclosure", "Uncertain / needs checking", "Flag for practitioner review."]
      ])
    )
  ];
}

function idsQuestions(refs) {
  return refs.map(ref => question(
    `IDS-${ref.id}`,
    "ids",
    `Should ${ref.id} be treated as an IDS candidate for human citation/materiality review? ${ref.citation}`,
    choices([
      ["include_candidate", "Include as IDS candidate", "Keep in the IDS review set."],
      ["omit_candidate", "Omit unless practitioner disagrees", "Record reason for possible omission."],
      ["unsure_candidate", "Unsure", "Flag for practitioner or inventor follow-up."]
    ]),
    {
      notePrompt: "Notes on materiality, citation quality, or why this reference should/should not be listed:"
    }
  ));
}

function dateQuestions(dateReport) {
  const refs = Array.isArray(dateReport?.references) ? dateReport.references : [];
  const needsReview = refs.filter(r => r.status !== "public_metadata_fetched");
  const questions = [
    question(
      "DATE-OWN-001",
      "dates",
      "Can you provide the earliest known public disclosure date for your own claimed implementation, if any?",
      choices([
        ["no_known_public_disclosure", "No known public disclosure", "Record as inventor belief, still subject to review."],
        ["provide_public_disclosure_date", "Yes, I can provide a date", "Supply date, source, and disclosed subject matter."],
        ["unknown_public_disclosure_date", "Unknown / needs search", "Flag for follow-up."]
      ]),
      { notePrompt: "Date, URL/archive/file path, and what was disclosed:" }
    ),
    question(
      "DATE-OWN-002",
      "dates",
      "Can you provide the earliest offer-for-sale, sale, commercial-use, or customer-trial date, if any?",
      choices([
        ["no_known_commercial_event", "No known commercial event", "Record as inventor belief, still subject to review."],
        ["provide_commercial_event_date", "Yes, I can provide a date", "Supply date, event type, counterparty, and confidentiality status."],
        ["unknown_commercial_event_date", "Unknown / needs search", "Flag for follow-up."]
      ]),
      { notePrompt: "Date, event type, counterparty, confidentiality status, and evidence:" }
    )
  ];
  for (const ref of needsReview) {
    questions.push(question(
      `DATE-${ref.id}`,
      "dates",
      `${ref.id} has automated date status "${ref.status}". Can you confirm an IDS-ready public-availability date? ${ref.summary || ""}`,
      choices([
        ["confirmed_public_date", "Confirmed exact public date", "Record date/source for citation review."],
        ["not_confirmed_public_date", "Not confirmed", "Keep as manual follow-up."],
        ["not_material_or_omit", "Likely omit / not material", "Record rationale for practitioner review."]
      ]),
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
    choices([
      ["figure_ready", "Ready", "No figure action from this answer."],
      ["figure_needs_fix", "Needs fix", "Record specific visual or logic issue."],
      ["figure_unsure", "Unsure", "Flag for visual/practitioner review."]
    ]),
    {
      notePrompt: "Issue, page/sheet, reference numerals, overlap, missing leader, or spec mismatch:"
    }
  ));
}

function buildQueue(args) {
  const manifest = parsePatentManifest(readMaybe(join(args.matter, "PATENT.md")));
  const refs = parseIds(readMaybe(join(args.matter, "assembled", "IDS_SB08.md")));
  const figures = parseFigures(readMaybe(join(args.matter, "evidence", "README.md")));
  const dateReport = readJsonMaybe(join(args.matter, "assembled", "date_verification.json"));
  const groups = {
    disclosures: disclosureQuestions(),
    ids: idsQuestions(refs),
    dates: dateQuestions(dateReport),
    figures: figureQuestions(figures)
  };
  let questions = args.topic === "all"
    ? [...groups.disclosures, ...groups.dates, ...groups.ids, ...groups.figures]
    : groups[args.topic];
  if (args.limit) questions = questions.slice(0, args.limit);
  return {
    schema: "apa-agent-question-queue-v2",
    generatedAt: new Date().toISOString(),
    matterId: manifest.docket || manifest.title,
    title: manifest.title,
    docket: manifest.docket,
    topic: args.topic,
    targetFingerprint: buildReviewTargetFingerprint(args.matter),
    questionCount: questions.length,
    questions
  };
}

function renderMarkdown(queue) {
  const lines = [
    "# Agent Review Questions",
    "",
    `Matter: ${queue.title}`,
    queue.docket ? `Docket: ${queue.docket}` : "",
    `Topic: ${queue.topic}`,
    "",
    "Reply with the option number for each question. Add dates, URLs, or notes after the option when useful.",
    "Example: `Q1=2; first public GitHub repo was 2026-05-10, URL ...`",
    ""
  ].filter(Boolean);
  queue.questions.forEach((q, idx) => {
    lines.push(`## Q${idx + 1}. ${q.id}`);
    lines.push("");
    lines.push(q.prompt);
    if (q.why) lines.push("", `Why this is asked: ${q.why}`);
    if (q.source) lines.push("", `Source: ${q.source}`);
    lines.push("");
    q.choices.forEach((choice, i) => {
      lines.push(`${i + 1}. ${choice.label} - ${choice.effect}`);
    });
    lines.push("", q.notePrompt, "");
  });
  return lines.join("\n");
}

function renderAgentQuestion(queue, answerDoc) {
  const answered = new Set((answerDoc.answers || []).map(a => a.id));
  const idx = queue.questions.findIndex(q => !answered.has(q.id));
  if (idx < 0) {
    return [
      "No unanswered questions remain in this queue.",
      `Answered: ${(answerDoc.answers || []).length}/${queue.questions.length}`,
      `Answers file: ${answerDoc._answersPath || ""}`
    ].join("\n");
  }
  const q = queue.questions[idx];
  const lines = [
    `AGENT_QUESTION ${q.id}`,
    `Question ${idx + 1} of ${queue.questions.length}`,
    "",
    q.prompt
  ];
  if (q.why) lines.push("", `Why: ${q.why}`);
  if (q.source) lines.push("", `Source: ${q.source}`);
  lines.push("");
  q.choices.forEach((choice, i) => {
    lines.push(`${i + 1}. ${choice.label}`);
    lines.push(`   ${choice.effect}`);
  });
  lines.push("");
  lines.push(`Reply format: Q${idx + 1}=<1-${q.choices.length}>; optional notes`);
  lines.push(`Alternative: ${q.id}=<1-${q.choices.length}>; optional notes`);
  lines.push("");
  lines.push(q.notePrompt);
  return lines.join("\n");
}

function loadAnswers(path, queue) {
  const existing = readJsonFile(path, null);
  if (
    existing?.schema === "apa-agent-question-answers-v2"
    && Array.isArray(existing.answers)
  ) {
    if (
      existing.answers.length > 0
      && existing.targetFingerprint?.sha256 !== queue.targetFingerprint.sha256
    ) {
      throw new Error(
        "existing questionnaire answers are stale for the current review targets; archive or clear the answers file before recording new answers",
      );
    }
    existing.matterId = existing.matterId || queue.matterId;
    existing.queueGeneratedAt = queue.generatedAt;
    existing.targetFingerprint = queue.targetFingerprint;
    delete existing.matterPath;
    existing._answersPath = path;
    return existing;
  }
  if (
    existing?.schema === "apa-agent-question-answers-v1"
    && Array.isArray(existing.answers)
    && existing.answers.length > 0
  ) {
    throw new Error(
      "legacy questionnaire answers have no target fingerprint; archive or clear the answers file before recording new answers",
    );
  }
  const answerDoc = {
    schema: "apa-agent-question-answers-v2",
    matterId: queue.matterId,
    queueGeneratedAt: queue.generatedAt,
    targetFingerprint: queue.targetFingerprint,
    updatedAt: new Date().toISOString(),
    answers: []
  };
  answerDoc._answersPath = path;
  return answerDoc;
}

function upsertAnswer(answerDoc, answer) {
  const idx = answerDoc.answers.findIndex(a => a.id === answer.id);
  if (idx >= 0) answerDoc.answers[idx] = answer;
  else answerDoc.answers.push(answer);
  answerDoc.updatedAt = new Date().toISOString();
}

function saveJson(path, value) {
  const clean = { ...value };
  delete clean._answersPath;
  atomicWriteJson(path, clean);
}

function parseRecord(recordText, queue) {
  const records = [];
  const lines = String(recordText || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^(?:Q(\d+)|([A-Z]+-[A-Z0-9-]+))\s*[:=]\s*(\d+)(?:\s*[;,]\s*(.*))?$/i);
    if (!m) continue;
    const q = m[1] ? queue.questions[Number(m[1]) - 1] : queue.questions.find(item => item.id.toLowerCase() === m[2].toLowerCase());
    if (!q) continue;
    const choiceIndex = Number(m[3]) - 1;
    const choice = q.choices[choiceIndex];
    if (!choice) continue;
    records.push({
      id: q.id,
      category: q.category,
      prompt: q.prompt,
      choice: choice.value,
      choiceLabel: choice.label,
      note: (m[4] || "").trim(),
      answeredAt: new Date().toISOString()
    });
  }
  return records;
}

async function runInteractive(queue, args) {
  const rl = readline.createInterface({ input, output });
  const answerDoc = loadAnswers(args.answers, queue);
  try {
    console.log(`\n${queue.title}`);
    console.log(`Topic: ${queue.topic}. Questions: ${queue.questionCount}.`);
    console.log("Enter 1/2/3, s to skip, or q to quit.\n");
    for (let idx = 0; idx < queue.questions.length; idx++) {
      const q = queue.questions[idx];
      console.log(`Q${idx + 1}/${queue.questions.length} ${q.id}`);
      console.log(q.prompt);
      if (q.why) console.log(`Why: ${q.why}`);
      q.choices.forEach((choice, i) => {
        console.log(`  ${i + 1}. ${choice.label}`);
        console.log(`     ${choice.effect}`);
      });
      let selected = "";
      while (!selected) {
        const raw = (await rl.question("Select: ")).trim().toLowerCase();
        if (raw === "q" || raw === "quit") {
          saveJson(args.answers, answerDoc);
          console.log(`wrote ${args.answers}`);
          return;
        }
        if (raw === "s" || raw === "skip") {
          selected = "skip";
          break;
        }
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1 && n <= q.choices.length) selected = String(n);
        else console.log(`Please enter 1-${q.choices.length}, s, or q.`);
      }
      if (selected !== "skip") {
        const choice = q.choices[Number(selected) - 1];
        const note = await rl.question(`${q.notePrompt} `);
        upsertAnswer(answerDoc, {
          id: q.id,
          category: q.category,
          prompt: q.prompt,
          choice: choice.value,
          choiceLabel: choice.label,
          note: note.trim(),
          answeredAt: new Date().toISOString()
        });
        saveJson(args.answers, answerDoc);
        console.log(`Saved ${q.id}.\n`);
      } else {
        console.log(`Skipped ${q.id}.\n`);
      }
    }
    saveJson(args.answers, answerDoc);
    console.log(`wrote ${args.answers}`);
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.matter)) throw new Error(`matter directory not found: ${args.matter}`);
  const queue = buildQueue(args);
  saveJson(args.queue, queue);
  if (args.mode === "agent") {
    const answerDoc = loadAnswers(args.answers, queue);
    if (args.record) {
      const records = parseRecord(args.record, queue);
      if (!records.length) {
        throw new Error("could not parse --record. Use Q1=2; notes or DISC-001=2; notes");
      }
      for (const record of records) upsertAnswer(answerDoc, record);
      saveJson(args.answers, answerDoc);
      console.error(`recorded ${records.length} answer(s) to ${args.answers}`);
    }
    console.log(renderAgentQuestion(queue, answerDoc));
    console.error(`queue ${args.queue}`);
    console.error(`answers ${args.answers}`);
    return;
  }
  if (args.mode === "json") {
    console.log(JSON.stringify(queue, null, 2));
    console.error(`wrote ${args.queue}`);
    return;
  }
  if (args.mode === "markdown") {
    const md = renderMarkdown(queue);
    atomicWriteFile(args.prompt, md);
    console.log(md);
    console.error(`wrote ${args.queue}`);
    console.error(`wrote ${args.prompt}`);
    return;
  }
  await runInteractive(queue, args);
}

try {
  await main();
} catch (err) {
  console.error(`error: ${err.message}`);
  usage();
  process.exit(1);
}
