import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleMatter } from "../assemble.mjs";
import { assemblyProfile } from "../profiles.mjs";

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
