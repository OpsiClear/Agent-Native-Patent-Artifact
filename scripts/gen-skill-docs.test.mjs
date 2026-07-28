import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  prepareTemplatedHostDirectory,
  prepareHostOutputRoot,
  renderReferences,
  renderSkill,
  resolveAll,
} from "./gen-skill-docs.mjs";
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
  assert.match(out, /^compatibility: "Requires Node\.js 21\+ and an Agent-Native-Patent-Artifact checkout/m);
  assert.match(out, /the dual lens/);                 // codex does NOT suppress the guide
});

test("cursor drops allowed-tools and legacy alwaysApply while suppressing the claim-ladder guide", () => {
  const out = renderSkill(TMPL, "cursor");
  assert.doesNotMatch(out, /^allowed-tools:/m);
  assert.doesNotMatch(out, /^alwaysApply:/m);
  assert.doesNotMatch(out, /the dual lens/);          // CLAIM_LADDER_GUIDE suppressed for cursor
  assert.match(out, /Section omitted for this host/);
});

test("direct apa-form-fill variants preserve identity, compatibility, and native invocation guidance", () => {
  const skill = join(HERE, "..", "skills", "apa-form-fill", "SKILL.md");
  for (const host of ["claude", "codex", "cursor"]) {
    const out = renderSkill(skill, host);
    assert.match(out, /^name: apa-form-fill$/m);
    assert.match(out, /^compatibility:/m);
    assert.match(out, /\/apa-form-fill/);
    assert.match(out, /\$apa-form-fill/);
    assert.match(out, /@apa-form-fill/);
    if (host === "claude") assert.match(out, /^allowed-tools:/m);
    else assert.doesNotMatch(out, /^allowed-tools:/m);
    if (host === "cursor") assert.doesNotMatch(out, /^alwaysApply:/m);
  }
});

test("templated non-Claude staging retains committed support files for generated outputs", () => {
  const source = join(HERE, "..", "skills", "tldraw-patent-drawing");
  const temp = mkdtempSync(join(tmpdir(), "apa-host-support-"));
  const out = join(temp, "tldraw-patent-drawing");
  try {
    prepareTemplatedHostDirectory(source, out);
    assert.equal(existsSync(join(out, "SKILL.md")), false);
    assert.equal(existsSync(join(out, "SKILL.md.tmpl")), false);
    assert.equal(existsSync(join(out, "fixtures", "minimal-export.svg")), true);
    assert.equal(existsSync(join(out, "tldraw-fixture.test.mjs")), true);
    assert.match(
      readFileSync(join(out, "fixtures", "minimal-snapshot.json"), "utf8"),
      /tldraw/i,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("non-Claude generation prunes stale renamed skill directories before rebuilding", () => {
  const temp = mkdtempSync(join(tmpdir(), "apa-host-prune-"));
  try {
    const stale = join(temp, "dist", "codex", "patent-form-fill");
    const sibling = join(temp, "dist", "cursor", "preserve-me");
    mkdirSync(stale, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(stale, "SKILL.md"), "# stale\n");
    writeFileSync(join(sibling, "marker.txt"), "preserve\n");

    const output = prepareHostOutputRoot("codex", temp);

    assert.equal(output, join(temp, "dist", "codex"));
    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(output), true);
    assert.equal(readFileSync(join(sibling, "marker.txt"), "utf8"), "preserve\n");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
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
    assert.match(refs.find((r) => r.path.endsWith("uspto-rule-pack.md")).content, /Rule pack: uspto-v1/);
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
