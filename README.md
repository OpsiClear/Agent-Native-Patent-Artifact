# Agent-Native Patent Artifact (APA)

> A protocol + full-stack toolkit that recasts a patent matter from a pile of lossy documents into a
> **machine-executable patent knowledge package** an agent can navigate, validate, and extend — wrapped
> in a production substrate of skills, a mechanical validator, a viewer, and a confidentiality guard.
>
> **APA is assistive software, not legal advice and not a registered practitioner.** A human reviews,
> signs, and files. See [docs/legal-guardrails.md](docs/legal-guardrails.md).

It fuses two ideas: the **artifact protocol** of [ARA](third_party/Agent-Native-Research-Artifact)
(a four-layer, cross-linked, machine-executable knowledge package) and the **full-stack agent
substrate** of [gstack](third_party/gstack) (template-generated skills, a confidentiality guard, a
test harness, an installer) — re-roled onto the USPTO patent-prep lifecycle. The full architecture is
in **[DESIGN.md](DESIGN.md)** (11 sections, including a 3-critic adversarial review and features
mined from a real worked patent package).

## Status — built, hardened, and green

The full lifecycle from invention disclosure through filing-prep is implemented end-to-end (the five
phases below), **plus** a post-filing office-action extension, an LLM-judge eval harness, multi-host skill
generation, CI, and an end-to-end integration test. The suite is **323 tests, all passing** (`bash
build.sh`), and the parser, validator, and confidentiality/injection surfaces have been through a
multi-round adversarial hardening audit (malformed-input robustness, prototype-pollution, prior-art-content
injection, bounded parser recursion). Node-only, zero-dependency.

- **Phase 1 — capture & protocol** (fully local, fully confidential): capture/compile an invention into
  a validated artifact, view it, guard confidentiality.
- **Phase 2 — prior-art search**: API-first (PatentsView PatentSearch API); every query scanned at the sink first.
- **Phase 3 — drafting**: claims, spec, figures, patentability skills + a claim legal-form lint + an SVG figure generator.
- **Phase 4 — filing assembly**: 1.77 spec (HTML print-to-PDF), ADS, SB/08 IDS, unsigned declaration,
  dated-schedule fee estimate, and a pre-filing go/no-go gate that **stops at the submit boundary**.
- **Phase 5 — rigor review**: a six-dimension Level-2 audit with a deterministic File-Ready..Do-Not-File
  verdict (a single weak dimension caps it), an adversarial examiner-critique loop, and the verdict wired
  back into the filing gate.

Beyond the core lifecycle: an **npx installer** + **`/apa-autoprep`** orchestrator, an **LLM-judge eval
harness** (Tier-3 drafting-quality scoring), an optional **post-filing office-action** extension,
**multi-host** skill generation (Claude / Codex / Cursor), and a **zero-install drop-in**
(`scripts/dropin.mjs`, see below) that wires the toolkit into any project for Claude Code / Codex.

| Component | What it does | State |
|---|---|---|
| `docs/protocol.md` | The canonical on-disk artifact format (manifest + four layers + binding blocks) | ✅ |
| `docs/rule-packs/` + `packages/apa-rules/` | Dated rule-pack metadata; USPTO is the only active v0.1 jurisdiction and non-USPTO matters fail loud | ✅ tested |
| `docs/source-registry.md` | Prior-art source IDs, access modes, and human-verification requirements | ✅ |
| `examples/minimal-patent-artifact/` | A worked (fictional) artifact that exercises the protocol | ✅ |
| `packages/apa-validate/` | Level-1 **mechanical** validator (antecedent basis, claim deps, edge resolution, type-aware core) | ✅ tested |
| `packages/apa-viewer/` | Static, claims-first viewer + manifest builder with read-only review panels (unresolved §112-support edges shown, never dropped) | ✅ tested |
| `packages/apa-redact/` | Scan-at-sink confidentiality/PII guard (3-tier, patent-extended) | ✅ tested |
| `packages/apa-safe/` | Guarded external-sink wrappers (`send`, `fetch`, `npx`): exact-byte scan, MEDIUM approval, runlog sink hashes, untrusted fetch envelope | ✅ tested |
| `packages/apa-reports/` | Shared semantic report schemas for claims, patentability, examiner-adversary, and office-action reports | ✅ tested |
| `packages/apa-trace/` | Runlog and autoprep-state helpers for audit logs, resumable stages, checkpoint records, and examiner-loop caps | ✅ tested |
| `packages/apa-search/` | **(Phase 2)** API-first prior-art search (PatentsView PatentSearch API); scan-at-sink, dedupe/rank, files PA## + reference matrix | ✅ tested |
| `packages/apa-draft/` | **(Phase 3)** claim legal-form lint (single-sentence, transitional phrase, numbering, multi-dependent, 112(f) nonce) | ✅ tested |
| `packages/apa-figure/` | **(Phase 3)** zero-dep SVG patent-figure generator (numbered parts, lead lines, arrows) + numeral reconciliation | ✅ tested |
| `packages/apa-assemble/` | **(Phase 4)** collate 1.77 spec (HTML print-to-PDF) + ADS + SB/08 IDS + unsigned declaration + fee worksheet + pre-filing gate | ✅ tested |
| `docs/fee-schedule.2026-06-15.json` | **(Phase 4)** dated USPTO fee schedule (2025 amounts; verify currency) driving the fee estimate | ✅ |
| `packages/apa-rigor/` | **(Phase 5)** six-dimension rubric + **deterministic** verdict engine (mean + per-dimension floor; Do-Not-File cap) + report scaffold/schema | ✅ tested |
| `packages/apa-skills/` | npx installer (`@apa/patent-skills`) — bundles the skills, detects hosts (claude/codex/cursor), installs `apa-*` with a lockfile + uninstall | ✅ tested |
| `packages/apa-eval/` | LLM-judge eval harness (raw-`fetch` Anthropic client, forced-tool verdicts, deterministic pre-pass, budget-regression gate; `--mock` offline) | ✅ tested |
| `packages/apa-prosecute/` | **(post-filing extension)** parse an Office Action, compute response deadlines (estimate), scaffold a response — never files | ✅ tested |
| `benchmarks/` + `scripts/benchmark.mjs` | Offline deterministic benchmark fixtures for public-patent compile, public Office Action, and synthetic disclosure-to-assembly regressions | ✅ tested |
| `skills/office-action/` | **(post-filing)** `/apa-office-action` — map rejections to claims, deadlines, response scaffold (flags, not conclusions) | ✅ |
| `skills/disclosure-capture/` | `/apa-disclose` — capture a disclosure into the artifact (file-I/O only) | ✅ |
| `skills/compiler/` | `/apa-compile <path>` — lift an existing patent/publication into a validated artifact | ✅ |
| `skills/prior-art-search/` | **(Phase 2)** `/apa-priorart` — search prior-art DBs, file references + a reference matrix | ✅ |
| `skills/claim-drafting/` | **(Phase 3)** `/apa-claims` — dual-lens claim ladder, antecedent basis, spec-support binding | ✅ |
| `skills/specification-drafting/` | **(Phase 3)** `/apa-spec` — 1.77 sections, grounding discipline, writing rubric | ✅ |
| `skills/figure-generation/` | **(Phase 3)** `/apa-figures` — author + render numbered figures, reconcile numerals | ✅ |
| `skills/patent-svg-upgrader/` | **(Phase 3)** `/apa-svg-upgrader` — normalize rough generated SVGs into professional utility-patent drawing candidates | ✅ |
| `skills/patent-drawing-quality/` | **(Phase 3)** `/apa-drawing-quality` — review drawings for professional draftsperson quality, formal-risk precheck, and HTML/SVG/PDF export choices | ✅ |
| `skills/patentability-analysis/` | **(Phase 3)** `/apa-analyze` — claim charts + 101/102/103/112 flags (never conclusions) | ✅ |
| `skills/filing-assembly/` | **(Phase 4)** `/apa-assemble` — assemble the filing package + pre-filing gate; stops at submit boundary | ✅ |
| `skills/rigor-review/` | **(Phase 5)** `/apa-rigor` — read-only six-dimension audit → `patent_rigor_report.json` verdict | ✅ |
| `skills/examiner-adversary/` | **(Phase 5)** `/apa-examiner` — role-play the examiner; critique→fix loop into the prosecution rationale | ✅ |
| `skills/autoprep/` | `/apa-autoprep` — orchestrates the whole lifecycle, enforcing the gates and human checkpoints between phases | ✅ |
| `scripts/` + `hosts/` | The `.tmpl → SKILL.md` generator + dated legal-rule resolvers + host config (claude / codex / cursor) | ✅ |

## Quickstart (Node >= 21; no install step, zero dependencies)

```bash
node scripts/gen-skill-docs.mjs                                   # generate the skills from templates
node packages/apa-validate/validate.mjs examples/minimal-patent-artifact   # mechanical validation
node packages/apa-viewer/build_manifest.mjs examples/minimal-patent-artifact --out examples/minimal-patent-artifact/manifest.json
# then open packages/apa-viewer/index.html (it loads a sibling manifest.json, or ?manifest=<path>)
node --test "packages/**/*.test.mjs" "lib/**/*.test.mjs" "scripts/**/*.test.mjs" "hosts/**/*.test.mjs" "test/**/*.test.mjs"   # the whole suite (or just: bash build.sh)
npm run syntax                                                   # parse-check first-party JS/MJS
npm run coverage                                                 # V8 first-party function coverage summary
npm run smoke                                                    # cross-package CLI smoke checks
node packages/apa-search/cli.mjs --query "self-watering planter float valve" --source mock   # offline prior-art demo
node packages/apa-safe/cli.mjs npx @shibayama/pdgkit@0.1.0 --dry-run -- --help   # guarded network-tool demo
node packages/apa-reports/cli.mjs scaffold claims --matter examples/minimal-patent-artifact   # semantic report schema demo
node scripts/setup.mjs --install                                  # optional: copy skills into ~/.claude/skills/apa-*
node packages/apa-skills/bin/apa-skills.mjs list                  # the npx installer (also: install [--host] / uninstall)
node packages/apa-eval/cli.mjs --matter examples/minimal-patent-artifact --mock   # LLM-judge eval, offline
node scripts/gen-skill-docs.mjs --all-hosts                       # generate per-host skills into dist/ (claude/codex/cursor)
```

Live USPTO prior-art search uses source id `patentsview` (PatentsView PatentSearch API) and needs
`export PATENTSVIEW_API_KEY=...`; see [docs/source-registry.md](docs/source-registry.md), then run
`node packages/apa-search/cli.mjs --matter <matter> --source patentsview --write`.

## Use it in your own project (zero-install drop-in)

Want patent prep available inside an existing codebase or research-article repo, triggered by a
plain-English ask in **Claude Code** or **Codex** — with no install step? Drop the kit in and wire a pointer:

```bash
# 1. copy this whole folder into your project, e.g. as ./apa/
# 2. from YOUR project root, wire the pointer (idempotent; re-run any time):
node apa/scripts/dropin.mjs                       # or: node apa/scripts/dropin.mjs --project /path/to/project
```

`dropin.mjs` adds one idempotent **APA pointer block** to your project's `CLAUDE.md` (Claude Code) **and**
`AGENTS.md` (Codex) — preserving anything already there — so the agent self-orients. Then open the project
in your agent and just say *"use the APA toolkit to capture a disclosure for my invention"* or *"run
autoprep for this idea"*. No skill registration, no daemon: the CLIs are pure `node` (zero dependencies),
so they run the moment the folder exists; the agent reads `apa/skills/<name>/SKILL.md` on demand. Your
patent **matter** lives in your project (e.g. `./patent/`) and should be **gitignored** — an unfiled
disclosure is a confidential 102 / trade-secret asset.

> Prefer skills to auto-register across *every* project instead of a per-project pointer? Use the installer
> (`node packages/apa-skills/bin/apa-skills.mjs install` / `node scripts/setup.mjs --install`).

## The artifact, in one diagram

```
<matter>/
  PATENT.md            # manifest: matter header + per-layer index (the ~200-token relevance gate)
  logic/               # what is claimed & why it's patentable (problem, claims, concepts, patentability, prior_art)
  src/                 # how it works (embodiments / spec support paragraphs)
  trace/               # the prosecution/decision DAG (dead ends preserved)
  evidence/            # prior-art references + drawings, indexed back to claims
```

A typed cross-layer ID spine (`CLM##`/`LIM##`/`SPEC##`/`FIG##`/`PA##`/`TERM##`/`INV##`) makes §112
support, antecedent basis, figure-numeral consistency, and per-claim inventorship **mechanically
checkable**. The validator proves only the mechanical facts; §112 sufficiency and the 101/102/103
merits are surfaced as **flags and questions for a human**, never a clearance.

## References & worked examples

- **`docs/walkthrough.md`** — the full lifecycle as ordered commands (skill + CLI per step, and the gate each must clear).
- **`examples/minimal-patent-artifact/`** and **`examples/full-lifecycle-artifact/`** — two fictional worked artifacts (a self-watering planter and a self-closing door hinge with apparatus + method claims, 2 figures); both validate CLEAN and drive every package.
- **`test/integration/lifecycle.test.mjs`** — proves the whole pipeline composes across packages (offline).
- **`.github/workflows/`** — CI: `gate.yml` (blocking, free, Ubuntu + Windows — freshness, multi-host gen, the full offline test suite, example validation) and `periodic-evals.yml` (weekly, paid `apa-eval` LLM-judge, skips without a key).
- **`third_party/uspto-references/`** — the authoritative **public-domain** sources APA's encoded rules are checked against: 35 USC (101/102/103/112/…), 37 CFR (the filing/format/candor/claims/ADS/drawings/IDS/extension rules), key MPEP sections, and the USPTO filing & fee schedule. The dated fee schedule (`docs/fee-schedule.*.json`) and the legal-rule resolvers cite these; figures/multipliers carry an effective date and "verify currency."

## License
[MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance, upstream license
notices, and public-domain reference material. Contribution terms and patent-domain guardrails are in
[CONTRIBUTING.md](CONTRIBUTING.md).
