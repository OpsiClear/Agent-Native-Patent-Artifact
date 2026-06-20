---
name: filing-assembly
description: "Collate a matter into an assembly package draft - 1.77 specification (HTML print-to-PDF), ADS draft, SB/08 IDS seed, unsigned declaration, fee estimate, and a pre-filing go/no-go checklist. Enforces the inventorship-integrity gate and STOPS at the submit boundary (never signs or files). Invoke as /apa-assemble."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/filing-assembly/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# filing-assembly (`/apa-assemble`)

## Operating Posture
- APA is supervised drafting software, not a registered practitioner and not legal advice.
- A competent human must independently review every output; flags are not patentability, FTO, validity, infringement, or 112 conclusions.
- Only natural persons may be named as inventors; AI systems are tools and are never inventor names.
- APA never signs, certifies, asserts micro-entity status, or files; Patent Center submission remains a human act.
- For pro-se users, provide neutral education, options, and questions only; do not choose claim scope, filing timing, art to cite, or amendments.
- Do not add new matter: unsupported limitations, embodiments, advantages, or figure details stay marked as gaps.
- Before any external egress, use scan-at-sink on the exact bytes and block HIGH findings.

### Safety References
| Reference | Load when |
|---|---|
| [Legal guardrails](references/legal-guardrails.md) | Need detailed no-legal-advice, inventorship, pro-se, candor, or submit-boundary rules. |
| [USPTO rule pack](references/uspto-rule-pack.md) | Need claim form, 101/102/103/112, IDS, or dated USPTO rule anchors. |
| [Confidentiality sinks](references/confidentiality-sinks.md) | Any content may leave the local machine, including prior-art queries, cloud LLMs, fetches, npx, or filing exports. |
| [Drawing standards](references/drawing-standards.md) | Creating, upgrading, reviewing, exporting, or assembling patent drawings. |
| [Source registry](references/source-registry.md) | Prior-art search needs canonical source IDs, access modes, or human-verification requirements. |

## What this does
Collates the matter's drafted artifacts into an **assembly package draft** and runs the pre-filing gate. It
**collates**, it does not author (use the drafting skills first). Run:
`node packages/apa-assemble/cli.mjs --matter <matter> --write`.

It produces, under `<matter>/assembled/`:
- `specification.md` + `specification.html` - the 37 CFR 1.77 document. **PDF is the filing-faithful
  format**: open the HTML in a browser and **Print to PDF** (it carries the 1.52 print stylesheet).
  Schema-valid USPTO DOCX is deferred - the applicant owns the USPTO-rendered DOCX, so PDF is preferred.
- `ADS.md` - Application Data Sheet draft (controls inventor names + benefit/priority; complete the
  `[REQUIRED]` fields - a missing benefit/priority claim forfeits priority).
- `IDS_SB08.md` - IDS seed; every reference is **UNVERIFIED** until a human confirms it (1.97/1.98).
- `declaration_UNSIGNED.md` - the 1.63 oath template with a **[SIGNATURE REQUIRED]** placeholder.
- `FEE_WORKSHEET.md` - an **estimate** from a dated fee schedule (verify currency).
- `PREFLIGHT.md` + `upload_set/MANIFEST.txt` - the go/no-go checklist and the frozen authoritative set.
- `upload_manifest.json` - SHA-256 hashes for generated source files; separate human-produced upload
  PDF placeholders; ADS/IDS/declaration/fee-schedule metadata; fee schedule source hash/effective
  date; machine-readable IDS no-admission/no-search-completeness notes; PDF export verification fields;
  and `human_verified: false` flags for ADS completion, IDS verification, declaration signatures,
  fee/entity checks, and Patent Center upload.

### Information Disclosure Statement (37 CFR 1.97/1.98; SB/08)
- Seed the IDS from the `evidence/` index. Each reference must be HUMAN-VERIFIED (real title/venue/
  link) before listing — the hardened prior-art verification stage records discloses-vs-lacks.
- The duty is CONTINUING: newly-found material references must be disclosed within the 1.97 windows.
- As of Jan 2025 there is a size-based IDS fee; surface it from the dated fee schedule, do not hardcode.

## Hard gates (the tool enforces; do not override)
- **Inventorship-integrity gate:** assembly is **NO-GO** while any claim limitation is `ai-suggested` -
  a human must adopt each (-> `inventor`/`attorney`/`human-revised`) first.
- **>= 1 natural-person inventor**, none AI-named.
- **Mechanical validation** must pass (no errors); claim-form + numeral findings are surfaced.
- **Rigor review** (/apa-rigor, Phase 5) must reach File-Ready / File-With-Revisions before assembly.

### Scan-at-sink before sending (sink: filing)
Confidentiality of an unfiled invention is load-bearing. Before this content leaves the machine:
1. Write the EXACT bytes to be sent to a temp file.
2. Run the redaction guard on THAT file: `node packages/apa-redact/cli.mjs --from-file <tmp>`.
3. Branch on the exit code: **0** = clean, send the SAME file; **2** = MEDIUM findings — confirm
   each with the human (sterner if the destination is public) before sending; **3** = HIGH findings
   — **block**; do not send. Never scan a string then re-render a different payload.
4. For a cloud-LLM or foreign destination, confirm a zero-retention/no-training backend and obtain
   logged human acknowledgment first (35 USC 102 secrecy / 184 export).
The guard catches accidents and carelessness, not a determined leaker — it is a guardrail, not
airtight enforcement.

## Structural refusals (no override) - APA stops at the submit boundary
APA never signs or certifies a USPTO paper, never generates an executed/signed declaration, never
asserts micro-entity status, and never files. Patent Center has no public submission API and requires
an identity-verified human account; a human files. Rules as of 2026-06-15; verify currency.
Do not treat `upload_manifest.json` as proof of filing readiness; it is an audit checklist for the
human filing acts APA refuses to perform.

## Do NOT
- Mark the package "filed" or "ready to file" without human review, signature, and rigor sign-off.
- Treat the fee estimate as authoritative or assert micro-entity status.

