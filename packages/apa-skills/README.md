# @apa/patent-skills

One-command installer for the **Agent-Native Patent Artifact (APA)** agent skills.
It copies APA's skills into your coding agent's skill directory. Standalone,
zero runtime dependencies (Node built-ins only), Node >= 21.

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
apa-skills install   [--host <id>] [--prefix <p>] [--dry-run]
apa-skills uninstall [--host <id>] [--prefix <p>] [--dry-run]
apa-skills list
```

- `install` is **non-interactive**. With no `--host` it targets **all detected**
  hosts; `--host <id>` (repeatable) narrows the targets.
- `--prefix` changes the installed directory prefix (default `apa-`), so the
  `compiler` skill installs as `apa-compiler/`.
- `--dry-run` reports what would change without touching disk.

## Host detection

A host is "detected" when its top-level config directory exists under your home.

| Host   | Config dir  | Skill root         |
|--------|-------------|--------------------|
| claude | `~/.claude` | `~/.claude/skills` |
| codex  | `~/.codex`  | `~/.codex/skills`  |
| cursor | `~/.cursor` | `~/.cursor/skills` |

These roots mirror `hosts/index.mjs` at the APA repo root (the canonical source
of truth). This package carries its own copy because it is standalone/publishable.

## Layout & lockfile

Each skill installs to `<skill-root>/<prefix><name>/` (e.g.
`~/.claude/skills/apa-compiler/SKILL.md`, plus any `references/`). A small
`.apa-skills.json` lockfile is written next to them recording the version,
prefix, timestamp, and installed skill dirs so `uninstall` can clean up exactly
what was added. `uninstall` also defensively removes any `<prefix>*` dirs found
on disk.

## Self-contained bundling

The skills live at the APA repo root under `skills/`. On `npm pack` / `npm
publish`, the `prepack` script (`scripts/bundle-skills.mjs`) copies that
directory into this package's `skills/` so the published tarball is
self-contained. At runtime the CLI prefers the bundled `skills/`, falling back
to the repo-root `../../skills/` in dev.

Edit skills at the repo root — never the bundled copy, which is regenerated.

## Development

```bash
cd packages/apa-skills
node scripts/bundle-skills.mjs   # populate ./skills from ../../skills
node bin/apa-skills.mjs list
node --test                      # run the test suite
```
