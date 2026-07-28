// Skill discovery: scan a bundled skills directory for <name>/SKILL.md and
// parse the minimal frontmatter we need (name, description).

import fs from "node:fs";
import path from "node:path";

/**
 * Parse the YAML-ish frontmatter at the top of a SKILL.md file.
 * Intentionally minimal — a simple line parse for top-level `key: value`
 * pairs. We only need `name` and `description`. Values may be quoted.
 *
 * @param {string} src  full file contents
 * @returns {Record<string,string>}
 */
function parseFrontmatter(src) {
  if (!src.startsWith("---")) return {};
  const end = src.indexOf("\n---", 3);
  if (end < 0) return {};
  const body = src.slice(3, end);

  const out = {};
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\r$/, "");
    // Only treat lines with no leading whitespace as top-level keys.
    if (/^\s/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Strip a single pair of surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * discoverSkills(bundledSkillsDir): list each immediate sub-directory that
 * contains a SKILL.md. Returns [{ name, identity, dir, description }] sorted by name.
 *
 * `name` comes from the SKILL.md frontmatter `name:` (falls back to the
 * directory name). `identity` comes from the APA `skill.yaml` id when present,
 * because it is also the advertised slash-command name. `dir` is the absolute
 * path to the skill source directory.
 */
export function discoverSkills(bundledSkillsDir) {
  if (!fs.existsSync(bundledSkillsDir)) {
    throw new Error(`skills directory not found: ${bundledSkillsDir}`);
  }
  const out = [];
  for (const entry of fs.readdirSync(bundledSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(bundledSkillsDir, entry.name);
    const skillMd = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;

    const fm = parseFrontmatter(fs.readFileSync(skillMd, "utf8"));
    const name = fm.name || entry.name;
    const description = (fm.description || "").replace(/\s+/g, " ").trim();
    const metadataPath = path.join(dir, "skill.yaml");
    let identity = null;
    if (fs.existsSync(metadataPath)) {
      const metadata = fs.readFileSync(metadataPath, "utf8");
      const ids = [...metadata.matchAll(/^id:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)];
      const commands = [...metadata.matchAll(/^command:\s*(\/[a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)];
      if (ids.length !== 1 || commands.length !== 1) {
        throw new Error(`skill metadata must declare exactly one simple id and command: ${metadataPath}`);
      }
      identity = ids[0][1];
      if (commands[0][1] !== `/${identity}`) {
        throw new Error(`skill metadata command must match id for ${metadataPath}`);
      }
    }
    out.push({ name, identity, dir, description });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
