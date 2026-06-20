# USPTO Authoritative References — Index & APA Cross-Reference

> **Public-domain notice.** Every reference file in this directory summarizes or quotes works of
> the U.S. Government — Title 35 of the U.S. Code, Title 37 of the Code of Federal Regulations, the
> Manual of Patent Examining Procedure (MPEP), and USPTO web pages and fee schedules. As works of
> the United States Government these are **not subject to copyright** (17 U.S.C. § 105) and are
> **free to reproduce**. Statutory/regulatory text for short "core" provisions is quoted verbatim;
> longer procedural material is faithfully summarized with a link to the authoritative source.
>
> **Retrieved:** 2026-06-15. Primary mirrors: Cornell Legal Information Institute
> (`law.cornell.edu`) for the U.S. Code and 37 CFR; `uspto.gov` for the MPEP, fee schedule, and
> filing guides. Dollar amounts are from the USPTO fee schedule **effective 2025-01-19** (page last
> revised 2026-06-01) — re-verify against the live schedule before relying on any figure.

These files exist so the APA project's **encoded** legal rules (resolver tokens, fee-schedule
fields, validator checks) can be cross-checked against an authoritative source. This directory is
**reference-only**: it backs the APA code, it is not imported by it.

---

## The four reference files

| File | Covers | Authoritative source |
|---|---|---|
| [`35-usc-core.md`](./35-usc-core.md) | Title 35 U.S.C. §§ 101, 102, 103, 112 (verbatim), plus 115, 116, 119, 120, 171, 184 (summarized) | `law.cornell.edu/uscode/text/35/<n>` |
| [`37-cfr-key-rules.md`](./37-cfr-key-rules.md) | 37 CFR Part 1 operative requirements: 1.16, 1.17, 1.29, 1.46, 1.52, 1.56, 1.63, 1.75, 1.76, 1.77, 1.84, 1.97, 1.98, 1.136 | `law.cornell.edu/cfr/text/37/<n>` |
| [`mpep-key-sections.md`](./mpep-key-sections.md) | MPEP operative tests: 608, 2106 (§101), 2131 (§102), 2141 & 2143 (§103/KSR), 2161/2163/2164 (§112(a)), 2173 (§112(b)), 2181 (§112(f)), 211–216 (benefit), Ch. 1500 (design), 2001 (candor) | `uspto.gov/web/offices/pac/mpep/` |
| [`uspto-filing-and-fees.md`](./uspto-filing-and-fees.md) | Fee schedule (large/small/micro), entity multipliers, EOT fees, Patent Center, provisional vs. nonprovisional components, oath/ADS/IDS forms | `uspto.gov` fee schedule + filing guides |

---

## Cross-reference table — APA artifact → authoritative source

Status legend: **matches** = APA value/text agrees with the source; **discrepancy** = APA disagrees
and should be fixed; **unverified** = APA value is correct or plausible but is flagged in-code as not
re-confirmed (or is a placeholder pending the schedule).

### A. Resolver tokens — `scripts/resolvers/legal-rules.mjs`

| APA artifact (symbol) | Authoritative source | Status |
|---|---|---|
| `claimFormatGuide()` — one sentence/claim, preamble + transitional phrase, dependent narrows one base | 37 CFR 1.75(a),(c),(i); MPEP 608.01 | matches |
| `claimFormatGuide()` — antecedent basis (`a/an` first, `the/said` back-ref) | MPEP 2173.05(e) (antecedent basis); 37 CFR 1.75 | matches |
| `claimFormatGuide()` — 112(f) nonce word (`means/module/mechanism/unit for`) requires corresponding structure or indefinite (112(b)) | 35 U.S.C. 112(f); MPEP 2181 (Williamson three-prong) | matches |
| `analysis101102103112()` — 101 Alice/Mayo two-step, practical application | 35 U.S.C. 101; MPEP 2106 (Step 1 / 2A Prong One+Two / 2B) | matches |
| `analysis101102103112()` — 102 anticipation = every limitation in ONE reference; statutory-bar / 1-yr grace screen | 35 U.S.C. 102(a),(b)(1); MPEP 2131 | matches |
| `analysis101102103112()` — 103 KSR rationale list + Graham factors + secondary considerations | 35 U.S.C. 103; MPEP 2141, 2143(A)–(G) | discrepancy (rationale list incomplete — see D-4) |
| `analysis101102103112()` — 112(a) written description/enablement, (b) terms of degree need objective bound, (f) MPF structure | 35 U.S.C. 112(a),(b),(f); MPEP 2161/2163/2164, 2173.05(b), 2181 | matches |
| `idsRequirements()` — 37 CFR 1.97/1.98, SB/08, continuing duty, Jan-2025 size fee | 37 CFR 1.56/1.97/1.98; 37 CFR 1.17(v); MPEP 2001 | matches |
| `drawingStandards()` — reference characters ≥ 0.32 cm (1/8 in) | 37 CFR 1.84(p)(3) | matches |
| `drawingStandards()` — drawing-sheet margins top 2.5cm / left 2.5cm / right 1.5cm / bottom 1.0cm, distinct from 1.52 spec margins | 37 CFR 1.84(g); contrast 37 CFR 1.52(b) | matches |
| `drawingStandards()` — every numeral in ≥1 figure & vice versa; color/photo needs petition | 37 CFR 1.83(a), 1.84(a)(2),(b) | matches |
| `rulesEffectiveDate = "2026-06-15"` | (project metadata; fee figures are eff. 2025-01-19) | matches (date is the encoding date, not a USPTO effective date) |

### B. Fee-schedule fields — `docs/fee-schedule.2026-06-15.json` + `packages/apa-assemble/fees.mjs`

| APA artifact (field / symbol) | Authoritative source | Status |
|---|---|---|
| `entityMultipliers.large = 1.0` | fee schedule §1.7 | matches |
| `entityMultipliers.small = 0.4` | fee schedule §1.7 (Unleashing American Innovators Act 2022 → 60% off) | matches (flagged `_unverified` in-file) |
| `entityMultipliers.micro = 0.2` | fee schedule §1.7 (→ 80% off) | matches (flagged `_unverified` in-file) |
| `fees.mjs` line 173 fallback default `{ small: 0.5, micro: 0.25 }` | fee schedule §1.7 (should be 0.40 / 0.20) | discrepancy (see D-2) |
| `utility.basicFiling = 350` (code 1011) | 37 CFR 1.16(a); fee schedule §1.1 | matches |
| `utility.search = 770` (code 1111) | 37 CFR 1.16(k); fee schedule §1.1 | matches |
| `utility.examination = 880` (code 1311) | 37 CFR 1.16(o); fee schedule §1.1 | matches |
| `utility.excessIndependentOver3 = 600` (code 1201) | 37 CFR 1.16(h); fee schedule §1.2 | matches |
| `utility.excessClaimsOver20 = 200` (code 1202) | 37 CFR 1.16(i); fee schedule §1.2 | matches |
| `utility.multipleDependentClaim = 925` (code 1203) | 37 CFR 1.16(j); fee schedule §1.2 | matches |
| `utility.applicationSizePer50SheetsOver100 = 450` (code 1081) | 37 CFR 1.16(s); fee schedule §1.3 | matches |
| `utility.nonDocxSurcharge = 430` (code 1054) | 37 CFR 1.16(u); fee schedule §1.4 | matches |
| `ids.tiers` 50→200 = $200 / $500 / $800 (codes 1832/1833/1834) | 37 CFR 1.17(v); fee schedule | unverified (flagged `_unverified` in-file; not in fetched fee table) |

### C. Prosecution extension fees — `packages/apa-prosecute/deadlines.mjs`

| APA artifact (symbol) | Authoritative source | Status |
|---|---|---|
| 3-month shortened statutory period, 6-month statutory maximum, month-by-month 1.136(a) extensions | 37 CFR 1.136(a); 35 U.S.C. 133 | matches |
| `PLACEHOLDER_EXTENSION_FEES = {1:220, 2:640, 3:1480}` | 37 CFR 1.17(a); fee schedule §1.5 (1mo $235 / 2mo $690 / 3mo $1,590; also 4mo $2,495 / 5mo $3,395) | discrepancy (see D-1; only 3 of 5 tiers, all wrong) |

### D. Validator checks & protocol rules — `docs/protocol.md`

| APA artifact (check / rule) | Authoritative source | Status |
|---|---|---|
| §5 broken antecedent basis = error | MPEP 2173.05(e); 37 CFR 1.75 | matches |
| §5 dependent claim must have `depends_on`; no cycles | 35 U.S.C. 112(c),(d),(e); 37 CFR 1.75(c) | matches |
| §5 `objective_bound: false` term-of-degree warning (112(b)) | 35 U.S.C. 112(b); MPEP 2173.05(b) | matches |
| §5 AI-named inventor / zero inventors = error | 35 U.S.C. 115, 116; 37 CFR 1.63 | matches |
| §5 `contributed_to` per-claim inventorship (35 USC 116) | 35 U.S.C. 116; MPEP (joint inventorship) | matches |
| §6 provisional needs spec + drawings, NOT claims/oath/IDS; 12-month clock | 35 U.S.C. 111(b), 119(e); 37 CFR 1.53(c); filing guide §3.1 | matches |
| §6 design = exactly one claim | 35 U.S.C. 171; MPEP Ch. 1500 (1502/1504) | matches |
| §6 plant/pct/cip not supported → fail loud | (scope decision; consistent with 35 U.S.C. 161, 371) | matches |
| §8 prosecution deadlines 3mo/6mo + escalating EOT fees | 37 CFR 1.136(a); 35 U.S.C. 133; 37 CFR 1.17(a) | matches (fee figures are the placeholders flagged in C → D-1) |

---

## How to apply fixes

This directory is read-only relative to APA. Discrepancies are reported for a human to apply to the
APA source files listed above. See the project's cross-check output (or the DISCREPANCIES list that
accompanies this index) for the concrete file/symbol, current value, source value, severity, and fix.
