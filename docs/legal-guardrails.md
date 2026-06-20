# Legal guardrails (read this first)

APA is **drafting / assistive software**. It is **not** a law firm, **not** a registered patent
attorney or agent, and it does **not** give legal advice. Every output is an unverified draft that a
competent human must independently review. These guardrails are enforced structurally and surfaced in
every skill via the generated preamble (`scripts/resolvers/preamble.mjs`). Rules are encoded as of the
`rules_effective_date` stamped in each artifact and in skill output — **verify currency**.

## Acts APA structurally refuses (no override)
1. **Signing / certifying any USPTO paper**, or generating an oath/declaration with a pre-filled
   executed signature (35 USC 115; 37 CFR 1.63, 1.4, 11.18).
2. **Filing autonomously.** Patent Center exposes a view/status API (Workbench XML, since Apr 2025)
   but **no public submission API**; filing requires an identity-verified human account. Assembly stops
   at the submit boundary and emits a checklist.
3. **Naming AI as an inventor.** At least one natural person must be named, and the conception of each
   claim must be attested by listed natural-person inventors (Thaler v. Vidal; 35 USC 100(f), 115,
   116). The USPTO revised AI-inventorship guidance published November 26, 2025 rescinded the February
   2024 guidance: AI systems are tools, not inventors, and ordinary inventorship law applies regardless
   of AI assistance.
4. **Asserting micro-entity status** (37 CFR 1.29 is a human certification).
5. **Sending unfiled-disclosure substance to a non-zero-retention or foreign backend** without
   explicit, logged human acknowledgment.

## Must not claim / imply
That APA is a registered practitioner; that it gives legal advice; that any 101/102/103/112,
patentability, freedom-to-operate, validity, infringement, or inventorship output is an authoritative
conclusion (they are flags and questions); that outputs are verified; that a patent will issue; or that
inputting a disclosure preserves privilege. A green mechanical-validation check is **not** a "§112
clearance" — the validator proves mechanical facts only; sufficiency and the statutory merits are left
to a human.

## Human-in-the-loop gates
- **Inventorship-integrity gate:** assembly-package generation is blocked while any claim limitation is
  `ai-suggested`; a human must adopt each limitation (promoting it to `inventor`/`attorney`/`human-revised`).
- **Rigor gate (later phase):** assembly requires a File-Ready / File-With-Revisions verdict; Do-Not-File blocks.
- **Confidentiality gate:** every external sink passes the scan-at-sink redaction guard
  (`packages/apa-redact`), on the exact bytes to be sent.

## Target users (v1)
Both **registered practitioners** and **pro-se / unrepresented inventors** are supported. Persist the
role as `user_role` in `PATENT.md` (`registered_practitioner` | `pro_se` | `unknown`). For the pro-se
path APA sits closer to the unauthorized-practice-of-law line: it does **not** recommend a course of
action (claim scope, which art to cite, file/don't-file timing), does **not** apply narrowing
amendments, reframes analytical output as neutral self-education/options/questions, and surfaces a
prominent "this is not legal advice; consult a registered patent attorney or agent" banner. (A
registered-practitioner-only configuration is the more conservative posture; pro-se support is gated by
these stricter constraints.)

## Confidentiality, disclosure bars, export control
An unfiled invention's secrecy is a 35 USC 102-novelty and trade-secret matter. Do not publicly
disclose, sell, or offer the invention before filing (US one-year grace; absolute novelty abroad).
Transmitting US-origin invention data abroad may implicate export control / a foreign-filing license
(35 USC 184); APA flags timing/clearance for counsel and cannot enforce it.

Persist the workflow posture as `confidential_workflow_mode` in `PATENT.md`:
`ordinary_local`, `counsel_controlled`, or `shareable_redacted`. This mode is not a privilege claim.
It makes the risk posture visible to validators, reports, skills, and manifests. In
`shareable_redacted` mode, sensitive critique artifacts such as patentability, examiner-adversary,
rigor, prosecution-rationale, and Office Action reports are excluded from shareable exports by default
and require redaction-guard review plus explicit human approval before external sharing.

## Duty of candor (37 CFR 1.56)
Broader than the IDS: material information includes the inventor's own bar-date activities, known
inconsistent statements, and litigation art. APA surfaces potentially-material information as flags for
the human and never conceals or auto-asserts it; the duty is continuing after filing.
