/**
 * Typed per-agent host configs (gstack hosts/ pattern). A HostConfig describes how a generated skill
 * is shaped/installed for one AI agent. MVP ships the primary `claude` host; more hosts (codex,
 * cursor, ...) are pure-data additions later. See DESIGN.md §6.
 *
 * @typedef {Object} HostConfig
 * @property {string} id                 short host id ("claude")
 * @property {string} skillRoot          install root under the user's home (e.g. ".claude/skills")
 * @property {(fm: object) => object} [frontmatterTransform]  per-host frontmatter rewrite
 * @property {string[]} [suppressedResolvers]  non-safety resolver tokens to omit for this host
 */

/**
 * Safety-critical resolvers a host may NEVER suppress — the legal preamble, the scan-at-sink
 * confidentiality block, and the 101/102/103/112 framing. gen-skill-docs throws if a host lists one.
 */
export const NON_SUPPRESSIBLE = ["PATENT_PREAMBLE", "REDACT_INVOCATION_BLOCK", "ANALYSIS_101_102_103_112"];

const dropAllowedTools = (fm) => { const { "allowed-tools": _omit, ...rest } = fm; return rest; };

/** @type {HostConfig} — Claude Code: keeps `allowed-tools`; canonical output lives in skills/<name>/SKILL.md */
export const claude = {
  id: "claude",
  skillRoot: ".claude/skills",
  frontmatterTransform: (fm) => fm,
  suppressedResolvers: [],
};

/** @type {HostConfig} — Codex: its skill frontmatter does not use `allowed-tools`, so drop it. */
export const codex = {
  id: "codex",
  skillRoot: ".codex/skills",
  frontmatterTransform: (fm) => dropAllowedTools(fm),
  suppressedResolvers: [],
};

/** @type {HostConfig} — Cursor rules: no `allowed-tools`, add `alwaysApply: false`, and its terser
 *  rule format omits the long claim-ladder guide (a non-safety resolver). */
export const cursor = {
  id: "cursor",
  skillRoot: ".cursor/skills",
  frontmatterTransform: (fm) => ({ ...dropAllowedTools(fm), alwaysApply: false }),
  suppressedResolvers: ["CLAIM_LADDER_GUIDE"],
};

/** @type {HostConfig[]} */
export const ALL_HOSTS = [claude, codex, cursor];

export function getHost(id) {
  const h = ALL_HOSTS.find((x) => x.id === id);
  if (!h) throw new Error(`unknown host '${id}' (known: ${ALL_HOSTS.map((x) => x.id).join(", ")})`);
  return h;
}

export function validateHosts() {
  const seen = new Set();
  for (const h of ALL_HOSTS) {
    if (!h.id || !h.skillRoot) throw new Error(`host missing id/skillRoot: ${JSON.stringify(h)}`);
    if (seen.has(h.id)) throw new Error(`duplicate host id: ${h.id}`);
    seen.add(h.id);
    for (const tok of h.suppressedResolvers || []) {
      if (NON_SUPPRESSIBLE.includes(tok)) throw new Error(`host '${h.id}' cannot suppress safety-critical resolver '${tok}'`);
    }
  }
  return true;
}
