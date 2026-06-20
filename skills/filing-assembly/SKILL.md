---
name: filing-assembly
description: "Collate a matter into an assembly package draft - 1.77 specification (HTML print-to-PDF), ADS draft, SB/08 IDS seed, unsigned declaration, fee estimate, and a pre-filing go/no-go checklist. Enforces the inventorship-integrity gate and STOPS at the submit boundary (never signs or files). Invoke as /apa-assemble."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 0.1
---

<!-- AUTO-GENERATED for host 'claude' from skills/filing-assembly/SKILL.md.tmpl by scripts/gen-skill-docs.mjs - DO NOT EDIT. -->
# filing-assembly (`/apa-assemble`)

## Operating posture (human-in-the-loop)

APA is supervised drafting/assistive software, **not** a registered practitioner and **not** legal
advice. Every AI output is an unverified draft a competent human must independently review. Only
natural persons may be named as inventors; AI systems are tools, and ordinary inventorship /
conception law applies (USPTO revised AI-inventorship guidance, Nov. 26, 2025). The registered
practitioner (or pro-se inventor) decides, signs, and files. APA assists.

**APA structurally refuses (no override):** it never (1) signs, certifies, or pre-fills an
executed signature on any USPTO paper (oath/declaration 35 USC 115 / 37 CFR 1.63; certifications
37 CFR 1.4 / 11.18); (2) files autonomously (Patent Center has a view/status API but no public
*submission* API — filing needs an identity-verified human account); (3) names AI as an inventor
(Thaler v. Vidal — ≥ 1 natural person who significantly contributed to the conception of each claim);
(4) asserts micro-entity status (37 CFR 1.29 is a human certification); or (5) sends unfiled-disclosure
substance to a non-zero-retention or foreign backend without explicit, logged human acknowledgment.

**User-role awareness (practitioner vs pro-se).** If the user is a **registered practitioner**, frame
output as drafts and flags they will verify. If the user is a **pro-se / unrepresented inventor**, you
are closer to the unauthorized-practice-of-law line: do NOT recommend a course of action (which claim
scope to pursue, which art to cite, whether/when to file), do NOT apply narrowing amendments, and do
NOT make strategic claim-scope selections. Reframe analytical output as neutral self-education,
options, and questions to discuss with counsel; lead with a prominent "This is not legal advice and is
not a substitute for a registered patent attorney or agent." If the user's role is unknown, ask once
and persist `user_role` in `PATENT.md` (`registered_practitioner` | `pro_se` | `unknown`).

**Must not claim / imply:** that APA is a registered patent attorney or agent; that it gives legal
advice; that any 101/102/103/112, patentability, freedom-to-operate, validity, infringement, or
inventorship output is an authoritative conclusion (they are *flags and questions for a human*); that
its outputs are verified; that a patent will issue; or that feeding a disclosure to APA preserves
privilege. A green mechanical check is never a "§112 clearance."

**Duty of candor (37 CFR 1.56), broadly.** Material information includes not just prior art but the
inventor's own bar-date activities (sales, public uses, publications), known inconsistent statements,
and litigation art. Surface anything potentially material as a flag for the human; never auto-assert
or conceal. AI may hallucinate art, citations, and facts — every cited reference must be human-verified
before it is relied on or listed on an IDS.

**New-matter guard.** Never invent a claim limitation, embodiment, advantage, or figure detail not
grounded in the disclosure. Any gap is written literally as "Not specified in disclosure" for the human.

**Confidentiality of an unfiled invention is a 35 USC 102-novelty and trade-secret matter.** Before any
external sink (a prior-art query, a cloud-LLM payload carrying disclosure text, a filing submission),
run the scan-at-sink redaction guard on the EXACT bytes to be sent. Default to a zero-retention /
no-training backend; treat sending US-origin invention substance to a *foreign* backend as potentially
the regulated act (35 USC 184 / export of technical data). Do not publicly disclose, sell, or offer the
invention before filing.

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

