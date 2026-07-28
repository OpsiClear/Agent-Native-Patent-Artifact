import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleMatter } from "../assemble.mjs";
import { assemblyProfile } from "../profiles.mjs";
import { preflight } from "../preflight.mjs";
import { buildUploadManifest } from "../upload-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
const SNAPSHOT = JSON.parse(readFileSync(join(HERE, "snapshots", "application-profiles.json"), "utf8"));

function cloneAs(type) {
  const dir = mkdtempSync(join(tmpdir(), `apa-${type}-profile-`));
  cpSync(EXAMPLE, dir, { recursive: true });
  const patent = join(dir, "PATENT.md");
  writeFileSync(
    patent,
    readFileSync(patent, "utf8").replace('application_type: "utility"', `application_type: "${type}"`),
  );
  if (type === "design") {
    const claims = join(dir, "logic", "claims.md");
    writeFileSync(claims, readFileSync(claims, "utf8").replace(/\n### CLM02[\s\S]*$/, "\n"));
  }
  return dir;
}

function snapshot(result) {
  return {
    profile: {
      id: result.profile.id,
      implementation_status: result.profile.implementation_status,
      review_status: result.profile.review_status,
      claims_required: result.profile.claims_required,
    },
    markdown_headings: [...result.markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]),
    html_headings: [...result.html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((match) => match[1]),
    has_candidate_banner: /assembly candidate only/i.test(result.markdown),
    has_claims_heading: /^## CLAIMS$/m.test(result.markdown),
    has_single_claim_heading: /^## CLAIM$/m.test(result.markdown),
    has_abstract_heading: /^## ABSTRACT$/m.test(result.markdown),
  };
}

for (const type of ["utility", "provisional", "design"]) {
  test(`${type} assembly profile matches its checked-in artifact snapshot`, () => {
    const dir = cloneAs(type);
    try {
      const result = assembleMatter(dir);
      assert.deepEqual(snapshot(result), SNAPSHOT[type]);
      assert.equal(assemblyProfile(type).filing_authority, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("filing profiles classify completeness, exclusions, deferred acts, and upload sets by application type", () => {
  const provisional = assemblyProfile("provisional");
  assert.ok(provisional.filing_date_material.includes("description-that-enables-the-invention"));
  assert.ok(provisional.completeness_material.includes("cover-sheet-or-qualifying-ads-route"));
  assert.deepEqual(
    provisional.excluded_ordinary_requirements,
    ["claims", "inventor-oath-or-declaration", "information-disclosure-statement"],
  );
  assert.ok(provisional.deferred_human_acts.includes("patent-center-upload-payment-and-submission"));
  assert.equal(provisional.upload_set.some((entry) => /declaration|IDS/i.test(entry)), false);

  const utility = assemblyProfile("utility");
  assert.ok(utility.completeness_material.includes("filing-search-examination-fees"));
  assert.ok(utility.completeness_material.includes("docx-surcharge-review"));
  assert.ok(utility.optional_papers.includes("information-disclosure-statement-if-used"));
  assert.ok(utility.upload_set.some((entry) => /declaration/i.test(entry)));
  assert.ok(utility.upload_set.some((entry) => /IDS/i.test(entry)));
});

for (const type of ["utility", "provisional", "design"]) {
  test(`${type} preflight and upload manifest do not leak another profile's forms or actions`, () => {
    const dir = cloneAs(type);
    try {
      const assembledDir = join(dir, "assembled");
      const result = preflight(dir, { assembledDir, now: "2031-02-04T12:00:00.000Z" });
      assert.deepEqual(result.uploadSet, assemblyProfile(type).upload_set);
      const manifest = buildUploadManifest(dir, assembledDir, result, {
        generatedAt: "2031-02-04T12:00:00.000Z",
      });
      assert.equal(manifest.application_type, type);
      const uploadText = manifest.intended_upload_set.map((entry) => entry.document).join("\n");
      const actionIds = manifest.deferred_human_actions.map((action) => action.id);
      if (type === "provisional") {
        assert.equal("ids" in manifest.forms, false);
        assert.equal("declaration_template" in manifest.forms, false);
        assert.equal(/IDS|declaration/i.test(uploadText), false);
        assert.equal(actionIds.includes("verify-ids-references"), false);
        assert.equal(actionIds.includes("execute-inventor-declaration"), false);
        assert.ok(actionIds.includes("complete-provisional-cover-route"));
      } else if (type === "design") {
        assert.equal("ids" in manifest.forms, false);
        assert.equal(/IDS/i.test(uploadText), false);
        assert.equal(actionIds.includes("verify-ids-references"), false);
        assert.ok(actionIds.includes("execute-inventor-declaration"));
      } else {
        assert.ok("ids" in manifest.forms);
        assert.ok("declaration_template" in manifest.forms);
        assert.match(uploadText, /IDS/);
        assert.ok(actionIds.includes("verify-ids-references"));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
