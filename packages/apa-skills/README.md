# @apa/patent-skills

One-command installer for the **Agent-Native Patent Artifact (APA)** agent skills.
It copies APA's skills into your coding agent's skill directory. The installer
itself is standalone and uses only Node built-ins on Node >= 21.

> APA is assistive, not legal advice; a human signs and files.

## Quick start

```bash
# install all APA skills into every detected host (Claude Code, Codex, Cursor)
npx @apa/patent-skills install

# install into one host only
npx @apa/patent-skills install --host claude

# preview without writing anything
npx @apa/patent-skills install --dry-run

# show available skills and which hosts are detected
npx @apa/patent-skills list

# remove the installed skills
npx @apa/patent-skills uninstall
```

## Commands

```
apa-skills install   [--host <id>] [--dry-run]
apa-skills uninstall [--host <id>] [--prefix <p>] [--dry-run]
apa-skills list
```

- `install` is **non-interactive**. With no `--host` it targets **all detected**
  hosts; `--host <id>` (repeatable) narrows the targets.
- Install uses each skill's canonical `skill.yaml` identity, so `compiler`
  installs as `apa-compile/` and its directory, frontmatter, and documented
  invocation agree. Custom install prefixes are refused because they would make
  those identities disagree. `uninstall --prefix` remains available only to
  remove a legacy custom-prefixed installation.
- `--dry-run` reports what would change without touching disk.

## Host detection

A host is "detected" when its top-level config directory exists under your home.

| Host   | Detection/config dir | Skill root         |
|--------|----------------------|--------------------|
| claude | `~/.claude`          | `~/.claude/skills` |
| codex  | `~/.codex`           | `~/.agents/skills` |
| cursor | `~/.cursor`          | `~/.cursor/skills` |

These roots mirror `hosts/index.mjs` at the APA repo root (the canonical source
of truth). This package carries its own copy because it is standalone/publishable.
ChatGPT does not expose a standard local skill root, so the installer does not
target it. ChatGPT desktop users can use
[**Settings > Import**](https://learn.chatgpt.com/docs/import) to import Skills
from another agent installation. An imported `apa-form-fill` skill can conduct
prompt-based intake, but it can create and verify a PDF only when the active
environment also provides the skill files, local filesystem access, and Node
command execution. This package does not claim ChatGPT web/plugin distribution.

## Layout & lockfile

Each skill installs to `<skill-root>/<canonical-id>/` (e.g.
`~/.claude/skills/apa-compile/SKILL.md`, plus any `references/`). The installer rewrites the copied
frontmatter `name` to the exact installed directory basename so every installed skill retains a valid
Agent Skills identity. A small
`.apa-skills.json` lockfile is written next to them recording the version,
prefix, timestamp, and installed skill dirs so `uninstall` can clean up exactly
what was added. Installation refuses to overwrite a destination not owned by
that lockfile, stages replacements before swapping them into place, and removes
obsolete directories only when the prior lockfile owns them. `uninstall`
preserves every unowned directory even when its name matches `<prefix>*`.
When Codex moves from the former `~/.codex/skills` installer root to
`~/.agents/skills`, install/uninstall migrates or removes only directories
recorded by the old root's ownership lock; unowned `.codex/skills` entries are
left untouched.

## Runtime scope

`apa-form-fill` is self-contained after installation: its hash-pinned profiles
and offline PDF engine travel with the skill. `apa-review-form` can generate its
basic local HTML review artifact from its bundled scripts, while its optional APA
CLI enrichment requires a checkout.

The remaining lifecycle skills are procedure specifications for an
Agent-Native-Patent-Artifact checkout. Their frontmatter states that requirement
because commands such as `node packages/apa-assemble/cli.mjs` are repository
gates, not runtime files bundled into this installer. The npm package is
therefore a standalone installer, not a standalone copy of the full APA
lifecycle runtime.

## Self-contained bundling

The skills live at the APA repo root under `skills/`. On `npm pack` / `npm
publish`, the prepack workflow generates Claude, Codex, and Cursor variants and
copies all three trees into this package's `skills/` so the published tarball is
self-contained. At runtime the CLI prefers these bundled host variants, falling
back to the repo-root `../../skills/` only in development before a bundle exists.

Edit skills at the repo root — never the bundled copy, which is regenerated.

## License and notices

The installer is distributed under [the MIT License](LICENSE). The bundled
`apa-form-fill` skill carries a pinned copy of pdf-lib 1.17.1; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and the complete upstream
license stored beside each bundled runtime.

## Development

```bash
cd packages/apa-skills
npm run prepack                  # generate host variants and populate ./skills
node bin/apa-skills.mjs list
node --test                      # run the test suite
```
