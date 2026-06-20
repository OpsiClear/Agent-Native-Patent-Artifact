/**
 * Cross-package INTEGRATION test for the Agent-Native Patent Artifact lifecycle.
 *
 * Each apa-* package is unit-tested in isolation elsewhere; this suite proves the WHOLE
 * lifecycle COMPOSES. It clones the existing minimal example into a fresh temp dir and drives
 * the phases IN ORDER, asserting at each step that (a) the package composes with the matter the
 * earlier steps produced and (b) the matter stays mechanically valid after every write.
 *
 * Offline / no network: the prior-art search runs against the deterministic 'mock' source and the
 * LLM-judge layer runs against a MockClient. Node built-ins only, ESM, zero dependencies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// --- shared parser + every package under test (exact exported names, read from source) ----------
import { iterEntitySections, extractBindingBlocks } from "../../lib/apa-parse.mjs";
import { validateMatter } from "../../packages/apa-validate/validate.mjs";
import { buildQueryFromClaims, runSearch } from "../../packages/apa-search/search.mjs";
import { updateClosestArtSelection, writeLandscape, writeSearchDossier } from "../../packages/apa-search/writers.mjs";
import { lintClaims } from "../../packages/apa-draft/claim-lint.mjs";
import { buildLegend } from "../../packages/apa-figure/numerals.mjs";
import { assembleMatter } from "../../packages/apa-assemble/assemble.mjs";
import { preflight } from "../../packages/apa-assemble/preflight.mjs";
import { computeFees } from "../../packages/apa-assemble/fees.mjs";
import { assembleAds } from "../../packages/apa-assemble/ads.mjs";
import { assembleIds } from "../../packages/apa-assemble/ids.mjs";
import { scaffoldReport } from "../../packages/apa-rigor/scaffold.mjs";
import { validateReport, computeVerdict, isFileable } from "../../packages/apa-rigor/verdict.mjs";
import { DIM_IDS } from "../../packages/apa-rigor/dimensions.mjs";
import { parseOfficeActionFile } from "../../packages/apa-prosecute/parse.mjs";
import { computeDeadlines } from "../../packages/apa-prosecute/deadlines.mjs";
import { scaffoldResponse } from "../../packages/apa-prosecute/respond.mjs";
import { MockClient } from "../../packages/apa-eval/client.mjs";
import { judgeClaim, judgeSpec } from "../../packages/apa-eval/judges.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const EXAMPLE = join(REPO_ROOT, "examples", "minimal-patent-artifact");

/** Re-validate the matter and assert it is still mechanically clean (0 errors). */
function assertZeroErrors(dir, label) {
  const v = validateMatter(dir);
  assert.equal(v.errors.length, 0, `${label}: validator errors -> ${JSON.stringify(v.errors)}`);
  return v;
}

test("the patent lifecycle composes end-to-end across every package", async () => {
  // Clone the EXISTING minimal example into a fresh temp dir (rm in finally).
  const dir = mkdtempSync(join(tmpdir(), "apa-lifecycle-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });

    // ---------------------------------------------------------------------------------------------
    // 1. validate: the freshly-cloned matter is mechanically valid (0 errors) to start from.
    // ---------------------------------------------------------------------------------------------
    const v0 = assertZeroErrors(dir, "step1 baseline");
    assert.equal(v0.meta.application_type, "utility");
    assert.equal(v0.meta.claims, 2, "example starts with CLM01 + CLM02");

    // ---------------------------------------------------------------------------------------------
    // 2. prior-art: build a query from the claims, runSearch over the offline 'mock' source, get
    //    ranked refs, writeLandscape into the clone, and confirm the appended PA## blocks parse so
    //    the matter is STILL mechanically valid (0 errors).
    // ---------------------------------------------------------------------------------------------
    const query = buildQueryFromClaims(dir);
    assert.ok(query.keywords.includes("reservoir"), "query is seeded from claim limitations");
    assert.ok(query.keywords.includes("float"));

    const search = await runSearch({ query, sources: ["mock"] });
    assert.equal(search.blocked, false, "offline mock query must not be confidentiality-blocked");
    assert.ok(!search.needsConfirm, "no MEDIUM finding should require confirmation for this query");
    assert.ok(search.ranked.length >= 2, "mock source returns ranked refs (post-dedupe)");
    // Ranking is descending by keyword/CPC overlap score; the float-valve ref ranks first.
    for (let i = 1; i < search.ranked.length; i++) {
      assert.ok(
        search.ranked[i - 1].score >= search.ranked[i].score,
        "ranked refs are in non-increasing score order",
      );
    }
    assert.ok(search.ranked[0].score > 0, "top ref has positive relevance score");
    // The mock plants a comma-formatted duplicate of US-10000001-B2; dedupe must collapse it.
    const docKeys = search.ranked.map((r) =>
      String(r.docNumber).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    );
    assert.equal(new Set(docKeys).size, docKeys.length, "ranked refs are deduped by doc number");

    const { assigned } = writeLandscape(dir, search.ranked);
    const { path: searchDossierPath } = writeSearchDossier(dir, {
      query,
      result: search,
      assigned,
      generatedAt: "2026-06-20T00:00:00.000Z",
    });
    updateClosestArtSelection(searchDossierPath, {
      selectedPaIds: [assigned[0].paId],
      rationale: "integration-test closest art after deterministic mock search",
      reviewer: "integration-test",
      verifiedAt: "2026-06-20T00:00:00.000Z",
      checks: {
        title_verified: true,
        venue_verified: true,
        canonical_link_verified: true,
        relied_on_passage_verified: true,
      },
    });
    // The example already ships PA01, so the new blocks continue from PA02.
    assert.deepEqual(
      assigned.map((a) => a.paId),
      search.ranked.map((_, i) => `PA${String(i + 2).padStart(2, "0")}`),
      "writeLandscape numbers new refs continuing after the existing PA01",
    );
    const priorArtMd = readFileSync(join(dir, "logic", "prior_art.md"), "utf8");
    for (const a of assigned) {
      assert.match(priorArtMd, new RegExp(`### ${a.paId}\\b`), `${a.paId} section appended`);
      assert.ok(
        existsSync(join(dir, "evidence", "prior_art", `${a.paId.toLowerCase()}.md`)),
        `${a.paId} raw evidence record written`,
      );
    }
    // Every appended PA## block must parse as a binding (no malformed YAML).
    const paSections = iterEntitySections(priorArtMd).filter((s) => /^PA\d+$/.test(s.id));
    assert.ok(paSections.length >= assigned.length + 1, "PA01 + appended PA## all present as sections");
    for (const s of paSections) {
      const b = extractBindingBlocks(s.body)[0] || {};
      assert.ok(b.role, `${s.id} binding parsed (has a role)`);
    }
    // The whole point: appended PA## blocks keep the matter mechanically valid.
    assertZeroErrors(dir, "step2 after writeLandscape");

    // ---------------------------------------------------------------------------------------------
    // 3. claim-lint: the (now landscape-augmented) matter's claims pass the legal-FORM lint.
    // ---------------------------------------------------------------------------------------------
    const lint = lintClaims(dir);
    assert.equal(lint.claims, 2, "lint sees both claims");
    assert.equal(
      lint.findings.length,
      0,
      `step3 claim-lint findings -> ${JSON.stringify(lint.findings)}`,
    );

    // ---------------------------------------------------------------------------------------------
    // 4. figures: buildLegend reconciles all numerals (no flags) against the SPEC paragraphs.
    // ---------------------------------------------------------------------------------------------
    const legend = buildLegend(dir);
    assert.ok(legend.entries.length >= 4, "all FIG01 numerals collected (10/12/14/16)");
    assert.equal(legend.flags.length, 0, `step4 numeral flags -> ${JSON.stringify(legend.flags)}`);
    assert.ok(legend.briefDescription.length >= 1, "a Brief-Description-of-Drawings line per figure");

    // ---------------------------------------------------------------------------------------------
    // 5. assembly: assembleMatter collates a 1.77-ordered spec (claims + abstract present);
    //    preflight (with a synthesized File-Ready rigor report) returns GO (not blocked);
    //    computeFees returns a positive total. ADS/IDS are seeded too (they collate the same matter).
    // ---------------------------------------------------------------------------------------------
    const assembled = assembleMatter(dir, { legend });
    assert.equal(assembled.sections.claims.length, 2, "both claims collated, renumbered 1..N");
    assert.match(assembled.markdown, /## CLAIMS/, "spec markdown has a Claims section");
    assert.match(assembled.markdown, /## ABSTRACT/, "spec markdown has an Abstract section");
    // The abstract from PATENT.md frontmatter must flow into the assembled spec (not the MISSING stub).
    assert.match(assembled.sections.abstract, /float/i, "assembled abstract carries the matter's text");
    assert.ok(
      !/Not drafted/.test(assembled.sections.abstract),
      "abstract is real, not the '[Not drafted]' placeholder",
    );
    assert.match(assembled.markdown, /1\. A self-watering planter insert/, "claim 1 prose collated");

    // Write the assembled HTML so preflight's filing-document gate can see it.
    const assembledDir = join(dir, "assembled");
    mkdirSync(assembledDir, { recursive: true });
    writeFileSync(join(assembledDir, "specification.html"), assembled.html);
    writeFileSync(join(assembledDir, "specification.md"), assembled.markdown);

    // ADS + IDS seed from the same matter (cross-package compose; IDS counts the PA## landscape).
    const ads = assembleAds(dir);
    assert.match(ads.markdown, /Application Data Sheet/, "ADS drafted from frontmatter");
    const ids = assembleIds(dir);
    assert.equal(ids.count, paSections.length, "IDS seeds every PA## reference on file");
    assert.ok(ids.unverified >= 1, "newly-written references are UNVERIFIED until a human confirms");

    // Synthesize a File-Ready patent_rigor_report.json so the rigor-review gate computes GO.
    // (Step 6 builds the report the proper way; here we just need a fileable one on disk for preflight.)
    const fileReadyReport = makeRigorReport(scaffoldReport(dir, {
      evaluatedAt: "2026-06-20T00:00:00.000Z",
    }), {
      P1: 5,
      P2: 5,
      P5: 5,
      P6: 5,
    });
    const computedReady = computeVerdict(scoresOf(fileReadyReport), { priorArtState: fileReadyReport.prior_art_state });
    fileReadyReport.verdict = computedReady.verdict; // must equal the deterministic computation
    assert.ok(isFileable(computedReady.verdict), "synthesized report is File-Ready/File-With-Revisions");
    writeFileSync(
      join(dir, "patent_rigor_report.json"),
      JSON.stringify(fileReadyReport, null, 2),
    );

    const pf = preflight(dir, { assembledDir });
    assert.equal(pf.blocked, false, `step5 preflight blocked -> ${JSON.stringify(pf.gates)}`);
    assert.match(pf.goNoGo, /^GO/, "preflight verdict is GO (pending human review)");
    const rigorGate = pf.gates.find((g) => g.name === "rigor-review");
    assert.equal(rigorGate.status, "pass", "rigor-review gate passes on the File-Ready report");
    const filingGate = pf.gates.find((g) => g.name === "filing-document");
    assert.equal(filingGate.status, "pass", "filing-document gate sees the assembled specification.html");

    const fees = computeFees(dir, { repoRoot: REPO_ROOT });
    assert.ok(fees.total > 0, "fee worksheet computes a positive total");
    // 2 claims (1 independent, 0 excess) -> the base utility trio only.
    assert.ok(
      fees.lineItems.some((it) => it.code === "1011"),
      "fee worksheet includes the basic utility filing fee",
    );
    assert.ok(
      fees.notes.some((n) => /ESTIMATE ONLY/.test(n)),
      "fee worksheet carries the mandatory estimate caveat",
    );

    // ---------------------------------------------------------------------------------------------
    // 6. rigor: scaffoldReport runs Level-1 + prefills the mechanical dims; complete the judgment
    //    dims; validateReport recomputes a deterministic verdict in {File-Ready,File-With-Revisions}.
    // ---------------------------------------------------------------------------------------------
    const scaffold = scaffoldReport(dir);
    assert.equal(scaffold.level1.passed, true, "rigor Level-1 (mechanical) passed");
    assert.equal(scaffold.dimensions.P3.score, 5, "P3 (antecedent basis) prefilled from clean validator");
    assert.equal(scaffold.dimensions.P4.score, 5, "P4 (claim/spec/drawing support) prefilled");
    assert.equal(scaffold.dimensions.P1.score, null, "judgment dims (P1) left for semantic scoring");

    // Complete the judgment dimensions a practitioner/skill would score.
    const completed = makeRigorReport(scaffold, { P1: 4, P2: 4, P5: 4, P6: 4 });
    const { ok, errors, computed } = validateReport(completed);
    assert.equal(ok, true, `step6 rigor report invalid -> ${JSON.stringify(errors)}`);
    assert.ok(
      computed.verdict === "File-Ready" || computed.verdict === "File-With-Revisions",
      `step6 verdict must be fileable; got ${computed.verdict} (mean ${computed.mean})`,
    );
    assert.ok(isFileable(computed.verdict), "computed verdict is fileable");

    // ---------------------------------------------------------------------------------------------
    // 7. prosecution: write a small fixture Office Action (REJ01 102 of CLM01 citing a PA into the
    //    clone), parseOfficeAction -> rejections; computeDeadlines('2026-03-02') -> 3-month 2026-06-02;
    //    scaffoldResponse -> one section per rejection.
    // ---------------------------------------------------------------------------------------------
    const citedRef = assigned[0].paId; // a real PA## the landscape just wrote
    const prosDir = join(dir, "prosecution");
    mkdirSync(prosDir, { recursive: true });
    const oaPath = join(prosDir, "oa-01.md");
    writeFileSync(oaPath, officeActionFixture(citedRef));

    const oa = parseOfficeActionFile(oaPath);
    assert.equal(oa.header.action_type, "non-final", "OA header parsed");
    assert.equal(oa.rejections.length, 1, "one rejection parsed");
    assert.equal(oa.rejections[0].id, "REJ01");
    assert.equal(oa.rejections[0].ground, "102", "REJ01 is a 102 anticipation rejection");
    assert.deepEqual(oa.rejections[0].claims, ["CLM01"], "REJ01 rejects CLM01");
    assert.deepEqual(oa.rejections[0].references, [citedRef], "REJ01 cites the written PA##");

    const deadlines = computeDeadlines("2026-03-02", { repoRoot: REPO_ROOT });
    assert.equal(deadlines.mailingDate, "2026-03-02");
    assert.equal(deadlines.statutory3Month, "2026-06-02", "3-month shortened statutory period");
    assert.equal(deadlines.statutory6Month, "2026-09-02", "6-month statutory maximum");
    assert.equal(deadlines.extensions.length, 3, "1-3 month 1.136(a) extension rows");

    const response = scaffoldResponse(dir, oaPath);
    assert.equal(response.rejectionCount, 1, "response scaffolds one rejection");
    assert.equal(response.oaNumber, "01", "response derives the OA number from the filename");
    assert.match(response.markdown, /## REJ01\b/, "a response section per rejection");
    assert.match(response.markdown, /CLM01/, "the affected claim is named in the response");
    assert.match(response.markdown, /new-matter guard/i, "amendment block is under the new-matter guard");

    // ---------------------------------------------------------------------------------------------
    // 8. eval: judgeClaim / judgeSpec via a MockClient (NO network) -> scores in 1-5. The judges run
    //    a deterministic Level-1 pre-pass against the same (still valid) matter and only then "call"
    //    the (mock) LLM, proving the eval layer composes with the live matter the lifecycle produced.
    // ---------------------------------------------------------------------------------------------
    const client = new MockClient((_sys, _user, _schema) => ({
      score: 4,
      rationale: "mock verdict for the integration test (no network).",
      flags: [],
    }));
    const claimVerdict = await judgeClaim(client, dir);
    assert.equal(claimVerdict.dimension, "claim");
    assert.ok(
      Number.isInteger(claimVerdict.score) && claimVerdict.score >= 1 && claimVerdict.score <= 5,
      `judgeClaim score in 1-5; got ${claimVerdict.score}`,
    );
    assert.ok(!claimVerdict.skipped, "matter is structurally sound -> judge was actually consulted");

    const specVerdict = await judgeSpec(client, dir);
    assert.equal(specVerdict.dimension, "spec");
    assert.ok(
      Number.isInteger(specVerdict.score) && specVerdict.score >= 1 && specVerdict.score <= 5,
      `judgeSpec score in 1-5; got ${specVerdict.score}`,
    );
    assert.equal(client.calls.length, 2, "the MockClient was consulted once per judge (no network)");

    // ---------------------------------------------------------------------------------------------
    // Final invariant: after EVERY write the lifecycle made (landscape, assembled dir, rigor report,
    // office action, response), the matter is STILL mechanically valid with 0 errors.
    // ---------------------------------------------------------------------------------------------
    assertZeroErrors(dir, "final invariant after the full lifecycle");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------------------------

/** Pull the {P1..P6} score map out of a (completed) rigor report. */
function scoresOf(report) {
  const scores = {};
  for (const id of DIM_IDS) scores[id] = report.dimensions[id].score;
  return scores;
}

/**
 * Take a scaffolded report (P3/P4 already mechanically prefilled) and fill the judgment dimensions,
 * returning a structurally-complete report that validateReport accepts. The mechanical P3/P4 scores
 * are preserved; only the judgment dims passed in are set.
 */
function makeRigorReport(scaffold, judgmentScores) {
  const report = JSON.parse(JSON.stringify(scaffold));
  for (const [id, score] of Object.entries(judgmentScores)) {
    report.dimensions[id].score = score;
  }
  report.questions_for_inventor = report.questions_for_inventor || [];
  report.questions_for_attorney = report.questions_for_attorney || [];
  report.read_order = ["logic/claims.md", "src/embodiments.md", "logic/prior_art.md"];
  report.findings = report.findings || [];
  report.verdict = null; // validateReport recomputes; leaving null avoids a mismatch error
  return report;
}

/** A minimal protocol-format Office Action: file-level ```oa header + one REJ## 102 rejection. */
function officeActionFixture(citedPa) {
  return [
    "# Office Action 01 (fixture)",
    "",
    "```oa",
    "mailing_date: 2026-03-02",
    "examiner: Pat Examiner",
    "application_no: 99/000001",
    "action_type: non-final",
    "```",
    "",
    "### REJ01 - 102 anticipation of CLM01",
    "",
    "Claim 1 is rejected under 35 U.S.C. 102 as anticipated.",
    "",
    "```binding",
    "ground: \"102\"",
    "claims: [CLM01]",
    `references: [${citedPa}]`,
    "examiner_reasoning: \"The cited reference discloses a reservoir, a float, and a float-actuated valve.\"",
    "```",
    "",
  ].join("\n");
}
