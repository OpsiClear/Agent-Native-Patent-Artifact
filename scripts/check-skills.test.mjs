import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSkill } from "./gen-skill-docs.mjs";
import {
  checkSkills,
  DESCRIPTION_MAX_CHARS,
  LEGAL_ADVICE_NON_TRIGGER_PROMPTS,
  loadSkillDefinitions,
  parseFrontmatter,
  rankSkillsForPrompt,
  validateLegalAdviceNonTriggers,
} from "./check-skills.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SKILLS_DIR = join(ROOT, "skills");

test("skill trigger fixtures and descriptions pass the offline checker", () => {
  const result = checkSkills();
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.skills.length, 16);
  assert.equal(result.promptCount, 96);
});

test("every skill has committed trigger fixtures with at least three positive and negative prompts", () => {
  for (const dirName of skillDirs()) {
    const path = join(SKILLS_DIR, dirName, "trigger-tests.json");
    assert.equal(existsSync(path), true, `${dirName}: missing trigger-tests.json`);
  }
});

test("explicit slash-command prompts route to the intended skill", () => {
  const skills = loadSkillDefinitions();
  for (const skill of skills) {
    const prompt = `${skill.triggerTests.command} please run the appropriate APA workflow.`;
    const ranked = rankSkillsForPrompt(prompt, skills);
    assert.equal(ranked[0]?.skill, skill.dirName, `${skill.dirName}: command prompt routed to ${ranked[0]?.skill}`);
    assert.equal(ranked[0].score, 100);
  }
});

test("pure legal-advice prompts do not route to any skill accidentally", () => {
  const skills = loadSkillDefinitions();
  assert.deepEqual(validateLegalAdviceNonTriggers(skills), []);
  for (const prompt of LEGAL_ADVICE_NON_TRIGGER_PROMPTS) {
    assert.deepEqual(rankSkillsForPrompt(prompt, skills), [], prompt);
  }
});

test("host-rendered frontmatter keeps concise descriptions and invocation triggers", () => {
  for (const host of ["claude", "codex", "cursor"]) {
    for (const dirName of skillDirs()) {
      const out = renderSkill(join(SKILLS_DIR, dirName, "SKILL.md.tmpl"), host);
      const fm = parseFrontmatter(out);
      assert.ok(fm.description, `${host}/${dirName}: missing description`);
      assert.ok(fm.description.length <= DESCRIPTION_MAX_CHARS, `${host}/${dirName}: description too long`);
      assert.match(fm.description, /Invoke as \/apa-|Invoke at .*\/apa-/i, `${host}/${dirName}: missing invocation trigger`);
      if (host === "claude") assert.match(out, /^allowed-tools:/m, `${host}/${dirName}: expected allowed-tools`);
      else assert.doesNotMatch(out, /^allowed-tools:/m, `${host}/${dirName}: allowed-tools should be host-stripped`);
    }
  }
});

function skillDirs() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, "SKILL.md.tmpl")))
    .map((e) => e.name)
    .sort();
}
