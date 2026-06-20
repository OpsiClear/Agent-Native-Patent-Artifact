#!/usr/bin/env node
/**
 * Deterministic skill quality and trigger-fixture checker.
 *
 * This is not a model router. It is an offline regression guard for the skill pack:
 * - every committed skill has concise, command-oriented frontmatter;
 * - every skill has positive and negative trigger fixtures;
 * - fixture prompts route by explicit command/keywords, not broad legal-advice wording.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILLS_DIR = join(ROOT, "skills");
export const DESCRIPTION_MAX_CHARS = 1024;

const FORBIDDEN_DESCRIPTION_PATTERNS = [
  /\blegal advice\b/i,
  /\bguarantee(?:s|d)? patentability\b/i,
  /\bguarantee(?:s|d)? clearance\b/i,
  /\bready to file\b/i,
  /\bwill file\b/i,
  /\bwill sign\b/i,
  /\bwill certify\b/i,
];

export const LEGAL_ADVICE_NON_TRIGGER_PROMPTS = [
  "Tell me whether my startup will definitely get a patent and whether I should file today.",
  "Guarantee this invention is patentable and cleared for launch.",
  "Act as my lawyer and decide which art I must cite to the USPTO.",
];

export function parseFrontmatter(src) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/.exec(src);
  if (!m) return {};
  const out = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\r$/, "");
    if (/^\s/.test(line)) continue;
    const mm = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!mm) continue;
    let value = mm[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    try {
      if (mm[1] === "description" && /^".*"$/.test(mm[2].trim())) value = JSON.parse(mm[2].trim());
    } catch {
      // Fall back to the quote-stripped value above; this checker reports quality, not YAML syntax.
    }
    out[mm[1]] = value;
  }
  return out;
}

export function discoverSkillDirs(skillsDir = SKILLS_DIR) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

export function loadSkillDefinitions(skillsDir = SKILLS_DIR) {
  return discoverSkillDirs(skillsDir).map((dirName) => {
    const dir = join(skillsDir, dirName);
    const skillPath = join(dir, "SKILL.md");
    const frontmatter = parseFrontmatter(readFileSync(skillPath, "utf8"));
    const triggerPath = join(dir, "trigger-tests.json");
    const triggerTests = existsSync(triggerPath)
      ? JSON.parse(readFileSync(triggerPath, "utf8"))
      : null;
    return {
      dirName,
      dir,
      skillPath,
      triggerPath,
      name: frontmatter.name || dirName,
      description: String(frontmatter.description || "").replace(/\s+/g, " ").trim(),
      frontmatter,
      triggerTests,
    };
  });
}

export function scorePrompt(prompt, skill) {
  const lower = String(prompt || "").toLowerCase();
  const trigger = skill.triggerTests || {};
  const command = String(trigger.command || "").toLowerCase();
  const keywords = Array.isArray(trigger.keywords) ? trigger.keywords : [];
  let score = 0;
  const matched = [];
  if (command && lower.includes(command)) {
    score += 100;
    matched.push(command);
  }
  for (const raw of keywords) {
    const kw = String(raw || "").trim().toLowerCase();
    if (!kw) continue;
    if (lower.includes(kw)) {
      score += 2;
      matched.push(kw);
    }
  }
  return { skill: skill.dirName, score, matched };
}

export function rankSkillsForPrompt(prompt, skills) {
  return skills
    .map((skill) => scorePrompt(prompt, skill))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill));
}

export function validateSkillDescriptions(skills) {
  const errors = [];
  for (const skill of skills) {
    const desc = skill.description;
    if (!desc) errors.push(`${skill.dirName}: missing frontmatter description`);
    if (desc.length > DESCRIPTION_MAX_CHARS) {
      errors.push(`${skill.dirName}: description is ${desc.length} chars; max ${DESCRIPTION_MAX_CHARS}`);
    }
    if (!/Invoke as \/apa-|Invoke at .*\/apa-/i.test(desc)) {
      errors.push(`${skill.dirName}: description must include an explicit /apa-* invocation trigger`);
    }
    for (const pat of FORBIDDEN_DESCRIPTION_PATTERNS) {
      if (pat.test(desc)) errors.push(`${skill.dirName}: description contains overclaiming phrase ${pat}`);
    }
  }
  return errors;
}

export function validateTriggerFixtures(skills) {
  const errors = [];
  for (const skill of skills) {
    const tt = skill.triggerTests;
    if (!tt || typeof tt !== "object") {
      errors.push(`${skill.dirName}: missing trigger-tests.json`);
      continue;
    }
    if (!/^\/apa-[a-z0-9-]+$/.test(String(tt.command || ""))) {
      errors.push(`${skill.dirName}: trigger-tests.json command must be /apa-*`);
    }
    if (!Array.isArray(tt.keywords) || tt.keywords.length < 3) {
      errors.push(`${skill.dirName}: trigger-tests.json needs at least 3 keywords`);
    }
    for (const field of ["should_trigger", "should_not_trigger"]) {
      if (!Array.isArray(tt[field]) || tt[field].length < 3) {
        errors.push(`${skill.dirName}: ${field} needs at least 3 prompts`);
      } else if (tt[field].some((p) => typeof p !== "string" || !p.trim())) {
        errors.push(`${skill.dirName}: ${field} prompts must be non-empty strings`);
      }
    }
  }
  return errors;
}

export function validateTriggerRouting(skills) {
  const errors = [];
  for (const skill of skills) {
    const tt = skill.triggerTests;
    if (!tt) continue;
    for (const prompt of tt.should_trigger || []) {
      const ranked = rankSkillsForPrompt(prompt, skills);
      const top = ranked[0];
      if (!top || top.skill !== skill.dirName) {
        errors.push(`${skill.dirName}: should_trigger did not route to this skill: ${JSON.stringify(prompt)}; top=${top ? top.skill : "none"}`);
      }
      if (ranked[1] && ranked[1].score === top.score) {
        errors.push(`${skill.dirName}: should_trigger has tied top route: ${JSON.stringify(prompt)}`);
      }
    }
    for (const prompt of tt.should_not_trigger || []) {
      const own = scorePrompt(prompt, skill);
      if (own.score > 0) {
        errors.push(`${skill.dirName}: should_not_trigger still matched (${own.matched.join(", ")}): ${JSON.stringify(prompt)}`);
      }
    }
  }
  return errors;
}

export function validateLegalAdviceNonTriggers(skills, prompts = LEGAL_ADVICE_NON_TRIGGER_PROMPTS) {
  const errors = [];
  for (const prompt of prompts) {
    const ranked = rankSkillsForPrompt(prompt, skills);
    if (ranked.length) {
      errors.push(`legal-advice prompt unexpectedly matched ${ranked[0].skill}: ${JSON.stringify(prompt)}`);
    }
  }
  return errors;
}

export function checkSkills({ skillsDir = SKILLS_DIR } = {}) {
  const skills = loadSkillDefinitions(skillsDir);
  const errors = [
    ...validateSkillDescriptions(skills),
    ...validateTriggerFixtures(skills),
    ...validateTriggerRouting(skills),
    ...validateLegalAdviceNonTriggers(skills),
  ];
  const promptCount = skills.reduce((sum, s) => sum + (s.triggerTests?.should_trigger?.length || 0) + (s.triggerTests?.should_not_trigger?.length || 0), 0);
  return { ok: errors.length === 0, errors, skills, promptCount };
}

function main() {
  const result = checkSkills();
  if (!result.ok) {
    for (const e of result.errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log(`skill check passed (${result.skills.length} skill(s), ${result.promptCount} trigger prompt(s))`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
