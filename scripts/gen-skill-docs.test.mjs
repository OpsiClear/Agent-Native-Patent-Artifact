import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { renderReferences, renderSkill, resolveAll } from "./gen-skill-docs.mjs";
import { validateHosts } from "../hosts/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// claim-drafting uses {{CLAIM_LADDER_GUIDE}} (suppressed on cursor) and declares allowed-tools.
const TMPL = join(HERE, "..", "skills", "claim-drafting", "SKILL.md.tmpl");

test("host registry validates (no host suppresses a safety-critical resolver)", () => {
  assert.equal(validateHosts(), true);
});

test("claude keeps allowed-tools and the claim-ladder guide", () => {
  const out = renderSkill(TMPL, "claude");
  assert.match(out, /^allowed-tools:/m);
  assert.doesNotMatch(out, /^alwaysApply:/m);
  assert.match(out, /the dual lens/);                 // CLAIM_LADDER_GUIDE resolved
  assert.match(out, /AUTO-GENERATED for host 'claude'/);
});

test("codex drops allowed-tools (frontmatter transform)", () => {
  const out = renderSkill(TMPL, "codex");
  assert.doesNotMatch(out, /^allowed-tools:/m);
  assert.match(out, /the dual lens/);                 // codex does NOT suppress the guide
});

test("cursor drops allowed-tools, adds alwaysApply, and suppresses the claim-ladder guide", () => {
  const out = renderSkill(TMPL, "cursor");
  assert.doesNotMatch(out, /^allowed-tools:/m);
  assert.match(out, /^alwaysApply: false$/m);
  assert.doesNotMatch(out, /the dual lens/);          // CLAIM_LADDER_GUIDE suppressed for cursor
  assert.match(out, /Section omitted for this host/);
});

test("a host can never suppress a safety-critical resolver", () => {
  assert.throws(() => resolveAll("{{PATENT_PREAMBLE}}", { frontmatter: {} }, ["PATENT_PREAMBLE"]),
    /safety-critical/);
});

test("generated safety references are retained for every host", () => {
  for (const host of ["claude", "codex", "cursor"]) {
    const refs = renderReferences(TMPL, host);
    assert.deepEqual(refs.map((r) => r.path), [
      "references/legal-guardrails.md",
      "references/uspto-rule-pack.md",
      "references/confidentiality-sinks.md",
      "references/drawing-standards.md",
      "references/source-registry.md",
    ]);
    assert.match(refs.find((r) => r.path.endsWith("legal-guardrails.md")).content, /APA structurally refuses/);
    assert.match(refs.find((r) => r.path.endsWith("uspto-rule-pack.md")).content, /101\/102\/103\/112/);
    assert.match(refs.find((r) => r.path.endsWith("confidentiality-sinks.md")).content, /Scan-at-sink/);
    assert.match(refs.find((r) => r.path.endsWith("drawing-standards.md")).content, /37 CFR 1\.84/);
    assert.match(refs.find((r) => r.path.endsWith("source-registry.md")).content, /patentsview/);
  }
});

test("generated skills keep concise inline hard refusals and reference routing", () => {
  for (const { name, tmpl } of allSkillTemplates()) {
    const out = renderSkill(tmpl, "claude");
    assert.match(out, /## Operating Posture/, `${name}: missing hard-refusal heading`);
    assert.match(out, /not legal advice/, `${name}: missing no-legal-advice refusal`);
    assert.match(out, /AI systems are tools/, `${name}: missing no-AI-inventor refusal`);
    assert.match(out, /Patent Center submission remains a human act/, `${name}: missing submit-boundary refusal`);
    assert.match(out, /\[Legal guardrails\]\(references\/legal-guardrails\.md\)/, `${name}: missing legal reference route`);
    assert.match(out, /\[Confidentiality sinks\]\(references\/confidentiality-sinks\.md\)/, `${name}: missing sink reference route`);
    assert.match(out, /\[Source registry\]\(references\/source-registry\.md\)/, `${name}: missing source-registry route`);
    assert.ok(out.split(/\r?\n/).length < 500, `${name}: generated skill exceeds 500 lines`);
  }
});

function allSkillTemplates() {
  const dir = join(HERE, "..", "skills");
  return readdirSync(dir)
    .sort()
    .map((name) => ({ name, tmpl: join(dir, name, "SKILL.md.tmpl") }))
    .filter((x) => existsSync(x.tmpl));
}
