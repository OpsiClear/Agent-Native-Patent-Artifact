// Host registry for the APA skills installer.
//
// MIRRORS hosts/index.mjs at the APA repo root (the canonical, typed source of
// truth). This package is standalone/publishable, so it carries its own copy of
// the host roots rather than importing the repo module. If a host's skillRoot
// changes in hosts/index.mjs, update it here too.
//
// Each host describes where a host agent expects skills to live, as a path
// relative to the user's home directory. The install layout we write is:
//   <home>/<skillRoot>/<prefix><skill-name>/SKILL.md (+ any files)

import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {Object} Host
 * @property {string} id         short host id ("claude")
 * @property {string} skillRoot  install root under the user's home (e.g. ".claude/skills")
 * @property {string} label      human-readable name
 */

/** @type {Host} */
export const claude = { id: "claude", skillRoot: ".claude/skills", label: "Claude Code" };

/** @type {Host} */
export const codex = { id: "codex", skillRoot: ".codex/skills", label: "Codex CLI" };

/** @type {Host} */
export const cursor = { id: "cursor", skillRoot: ".cursor/skills", label: "Cursor" };

/** @type {Host[]} */
export const ALL_HOSTS = [claude, codex, cursor];

/** Look up a host by id; throws on unknown id. */
export function getHost(id) {
  const h = ALL_HOSTS.find((x) => x.id === id);
  if (!h) {
    throw new Error(
      `unknown host '${id}' (known: ${ALL_HOSTS.map((x) => x.id).join(", ")})`
    );
  }
  return h;
}

/**
 * The top-level config directory for a host under the user's home,
 * e.g. host { skillRoot: ".claude/skills" } -> ".claude".
 */
function configDir(host) {
  // First path segment of skillRoot (handles both "/" and "\" separators).
  return host.skillRoot.split(/[\\/]/)[0];
}

/**
 * detectHosts(home): return the hosts whose top-level config dir (e.g. `.claude`)
 * exists under the given home directory. Pure w.r.t. the supplied `home`.
 */
export function detectHosts(home) {
  return ALL_HOSTS.filter((h) => {
    try {
      return fs.existsSync(path.join(home, configDir(h)));
    } catch {
      return false;
    }
  });
}
