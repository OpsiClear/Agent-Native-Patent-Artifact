import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSkill, resolveAll } from "./gen-skill-docs.mjs";
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
