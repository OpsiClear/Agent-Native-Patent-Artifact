# USPTO Filing & Fees — Procedural References

> **Public-domain notice.** The materials summarized here are works of the U.S. Government
> (USPTO web pages, federal regulations, and statutes). They are not subject to copyright and
> are free to reproduce. This file paraphrases or quotes operative requirements and links to the
> authoritative source for each item.
>
> **Compiled:** 2026-06-15. **Fee figures effective date:** USPTO fee schedule effective
> **January 19, 2025** (page last revised June 1, 2026). Always re-verify dollar amounts against
> the live fee schedule before relying on them — fees change by rulemaking.

---

## 1. Current USPTO Fee Schedule (Large Entity)

**Source:** USPTO Fee Schedule —
<https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule>
**Effective:** January 19, 2025 (page last revised June 1, 2026).

All amounts below are the **large (undiscounted) entity** amounts. Apply the entity multipliers
in §1.7 to derive small- and micro-entity amounts.

### 1.1 Utility application — basic filing / search / examination (37 CFR 1.16(a), (k), (o))

| Fee | Large entity | Fee code |
|---|---|---|
| Utility application filing fee (basic) | **$350.00** | 1011 |
| Utility search fee | **$770.00** | 1111 |
| Utility examination fee | **$880.00** | 1311 |

> Combined large-entity "basic" cost of filing a utility nonprovisional (filing + search + exam)
> ≈ **$2,000.00** before any claims/size/surcharge fees.

### 1.2 Excess claim fees (37 CFR 1.16(h), (i), (j))

| Fee | Large entity | Fee code |
|---|---|---|
| Each independent claim in excess of 3 | **$600.00** | 1201 |
| Each claim (total) in excess of 20 | **$200.00** | 1202 |
| Multiple dependent claim (per application, if any present) | **$925.00** | 1203 |

### 1.3 Application size fee (37 CFR 1.16(s))

| Fee | Large entity | Fee code |
|---|---|---|
| Application size fee — for each additional 50 sheets (or fraction) of specification & drawings over 100 sheets | **$450.00** | 1081 |

### 1.4 Non-DOCX filing surcharge (37 CFR 1.16(u))

| Fee | Large entity | Fee code |
|---|---|---|
| Surcharge for filing the specification, claims, and/or abstract of a utility nonprovisional in a **non-DOCX** format | **$430.00** | 1054 |

> Operative point: filing the specification/claims/abstract in DOCX avoids this surcharge.
> Filing those parts as PDF (or otherwise non-DOCX) triggers the surcharge.

### 1.5 Extension of time fees — 37 CFR 1.17(a)

| Extension | Large entity | Fee code |
|---|---|---|
| 1 month | **$235.00** | 1251 |
| 2 months | **$690.00** | 1252 |
| 3 months | **$1,590.00** | 1253 |
| 4 months | **$2,495.00** | 1254 |
| 5 months | **$3,395.00** | 1255 |

> These are the standard extension-of-time fees used to extend a shortened statutory period for
> reply (e.g., responding to an Office action). The fee is for the **total** extension length, not
> additive per month.

### 1.6 Late filing surcharge (oath/declaration or basic fee filed after filing date)

**Source:** USPTO utility-patent guide —
<https://www.uspto.gov/patents/basics/apply/utility-patent>

| Fee | Large entity |
|---|---|
| Surcharge — late filing fee or oath/declaration (37 CFR 1.16(f)) | **$170.00** (small $68 / micro $34) *(verify against live schedule)* |
| Non-electronic (paper) filing fee — utility (37 CFR 1.16(t)) | **$400.00** (small/micro $200) *(verify against live schedule)* |

### 1.7 Entity discount multipliers

**Source:** USPTO Fee Schedule (same page above); statutory basis 35 U.S.C. 41(h).

- **Small entity:** multiply the large-entity amount by **0.40** (60% reduction).
- **Micro entity:** multiply the large-entity amount by **0.20** (80% reduction).

Worked examples (from the schedule):

| Fee | Large | Small (0.40x) | Micro (0.20x) |
|---|---|---|---|
| Filing fee | $350 | $140 | $70 |
| Search fee | $770 | $308 | $154 |
| Examination fee | $880 | $352 | $176 |
| Indep. claim > 3 | $600 | $240 | $120 |
| Claim > 20 | $200 | $80 | $40 |
| Multiple-dependent claim | $925 | $370 | $185 |
| Application size (per 50 sheets) | $450 | $180 | $90 |
| Non-DOCX surcharge | $430 | $172 | $86 |
| EOT 1 mo | $235 | $94 | $47 |
| EOT 2 mo | $690 | $276 | $138 |
| EOT 3 mo | $1,590 | $636 | $318 |
| EOT 4 mo | $2,495 | $998 | $499 |
| EOT 5 mo | $3,395 | $1,358 | $679 |

---

## 2. Patent Center (filing portal)

**Sources:**
- Patent Center landing — <https://patentcenter.uspto.gov/>
- USPTO Patent Center info page — <https://www.uspto.gov/patents/apply/patent-center>

**What it is.** Patent Center is the USPTO's official system for electronic filing and management
of patent applications. It unifies submission and application management in one web interface.

**Operative facts:**

- **No public submission/filing API.** There is **no public programmatic API for submitting or
  filing patent applications.** All applicant-facing filing is performed through the Patent Center
  **web UI** (drag-and-drop document upload; DOCX preferred for spec/claims/abstract/drawings,
  PDF also accepted with the non-DOCX surcharge of §1.4).
- **Identity-verified human account required.** A **USPTO.gov account is required** to file and to
  manage applications. As of **September 11, 2025, identity verification is mandatory for all
  Patent Center users** — guest/unregistered access was removed. Verification is done online via
  **ID.me** (no notary needed) or by mailing a Patent Electronic Verification form.
- **Authentication.** Email-based authentication was discontinued **July 31, 2025**; login now
  requires secure authentication with **multifactor authentication (MFA)**.
- **Workbench / status APIs exist for practitioners (not for public filing).** The USPTO references
  **Workbench/Applications APIs** (practitioners were directed to migrate V1 → V2 calls before
  **May 1, 2025**). These are read/management-oriented (view application data, status), **not** a
  public application-submission API. Programmatic *read* access to published application data is
  also available through the separate USPTO Open Data Portal / PatentsView ecosystem, but that is
  retrieval, not filing.

> Bottom line for an agent: a software agent **cannot file** a patent application via API. Filing
> requires an identity-verified human using the Patent Center web UI. An agent can assist with
> read/status workflows (Workbench/ODP) but a verified human must perform the actual submission.

---

## 3. Provisional vs. Nonprovisional — minimum filing components

### 3.1 Provisional application (35 U.S.C. 111(b); 37 CFR 1.53(c))

**Source:** <https://www.uspto.gov/patents/basics/apply/provisional-application>

**Minimum to obtain a filing date:**

1. **Written description** of the invention complying with **35 U.S.C. 112(a)**.
2. **Drawings** where necessary to understand the invention (**35 U.S.C. 113**).
3. **Cover Sheet** — **Form PTO/SB/16** identifying the application as provisional, the inventor(s)
   and residences, the title, correspondence address, etc.
4. **Filing fee** under **37 CFR 1.16(d)**.

**Not required for a provisional:** claims, an inventor's oath/declaration, an IDS.

**Operative consequences:**
- A provisional is **not examined** and **automatically expires 12 months** after filing; the
  **12-month pendency cannot be extended**.
- To preserve the benefit, a corresponding **nonprovisional must be filed within 12 months** and
  must contain a **specific reference** to the provisional to claim benefit under **35 U.S.C.
  119(e)**.

### 3.2 Nonprovisional utility application (35 U.S.C. 111(a); 37 CFR 1.53(b))

**Source:** <https://www.uspto.gov/patents/basics/apply/utility-patent>

**Complete application components:**

1. **Specification** — written description, **at least one claim**, and an abstract (37 CFR 1.71–1.75).
2. **Drawings** — when necessary to understand the invention (37 CFR 1.81).
3. **Inventor's oath or declaration** (37 CFR 1.63) — see §4.
4. **Application Data Sheet (ADS)** — Form **PTO/AIA/14** (37 CFR 1.76) — see §4.
5. **Filing, search, and examination fees** (37 CFR 1.16).
6. **Transmittal** — Form PTO/AIA/15 or a transmittal letter.

**Filing-date requirements (37 CFR 1.53(b)).** To secure a filing date the application needs a
**specification with at least one claim**, **identification of the inventor(s)**, and the
appropriate fees. Under the AIA, the **oath/declaration may be postponed** (and fees may be paid
later) — but late submission of the basic fee or oath/declaration incurs the **late surcharge**
(§1.6). Filing on paper instead of electronically adds the **non-electronic filing fee** (§1.6).

---

## 4. Inventor's oath/declaration (AIA forms) and the ADS

**Source:** USPTO patent application forms (AIA, on/after Sept 16, 2012) —
<https://www.uspto.gov/patents/apply/forms>

### 4.1 Inventor's oath or declaration (37 CFR 1.63; 35 U.S.C. 115)

Each inventor must execute an oath or declaration stating the application was made (or authorized)
by the inventor and that the inventor believes themselves to be the **original inventor** of a
claimed invention. Key AIA forms:

| Form | Title / use |
|---|---|
| **PTO/AIA/01** | Declaration (37 CFR 1.63) for Utility or Design Application **using an ADS**. Establishes inventorship. |
| **PTO/AIA/08** | Declaration (37 CFR 1.63) for Utility or Design Application — **non-ADS** (traditional) format. |
| **PTO/AIA/09** | Plant Patent (35 U.S.C. 161) Declaration (37 CFR 1.162). |
| **PTO/AIA/02** | **Substitute Statement** in lieu of an oath/declaration (37 CFR 1.64; 35 U.S.C. 115(d)) — used when an inventor cannot/won't sign (e.g., deceased, unavailable, refusing). |
| **PTO/AIA/10** | Supplemental sheet for declaration (overflow space). |

> Operative test (37 CFR 1.63): the oath/declaration must (a) identify the inventor, (b) identify
> the application, and (c) contain the statements that the person believes themselves to be the
> original inventor and that the application was made/authorized by them, executed under the
> warning that willful false statements are punishable.

### 4.2 Application Data Sheet — PTO/AIA/14 (37 CFR 1.76)

**Form PTO/AIA/14 — "Application Data Sheet (37 CFR 1.76)."** A structured cover document that
provides the bibliographic data of the application: inventor information, applicant information,
correspondence/representative information, domestic benefit (continuity), foreign priority, and
applicant classification. Under 37 CFR 1.76 the ADS lets applicants supply this information in one
structured submission rather than scattered across other papers; an ADS is generally **required to
make domestic-benefit and foreign-priority claims** and is what allows the oath/declaration to be
postponed.

---

## 5. Information Disclosure Statement (IDS) — Form PTO/SB/08

**Source:** USPTO patent application forms —
<https://www.uspto.gov/patents/apply/forms>
**Duty basis:** 37 CFR 1.56; submission rules 37 CFR 1.97; content rules 37 CFR 1.98.

**Forms:**

| Form | Title / use |
|---|---|
| **PTO/SB/08** (Patent Center auto-load version) | "Information Disclosure Statement by Applicant." Lists prior-art references (patents, publications, other) the applicant submits to satisfy the duty to disclose. |
| **PTO/SB/08a & /08b** | Traditional two-page IDS layout for listing U.S. patents/publications and foreign/non-patent literature. |

**Operative requirement.** Each individual associated with the filing and prosecution of the
application (inventors, attorneys/agents, others substantively involved) has a **duty of candor and
good faith** to disclose to the USPTO **all information known to be material to patentability**
(37 CFR 1.56). The IDS (PTO/SB/08) is the mechanism for that disclosure:

- **Timing (37 CFR 1.97):** an IDS is considered without fee/statement if filed within 3 months of
  filing (or before first Office action); later submissions require a fee and/or a 1.97(e)
  statement, and after allowance/issue-fee payment additional requirements apply.
- **Content (37 CFR 1.98):** the IDS must include a list of the references, a legible copy of each
  non-U.S.-patent reference (and concise explanations / English-language translations where
  applicable).

> Note: there is **no duty to search** for prior art, but there **is** a duty to disclose material
> information that is **known**. Failure to comply can render a patent unenforceable for inequitable
> conduct.

---

## 6. Pro Se Assistance Program / Patent Pro Bono Program

**Source:** <https://www.uspto.gov/patents/basics/using-legal-services/pro-se-assistance-program>

### 6.1 Pro Se Assistance Program (USPTO-run)

For independent inventors and small businesses filing **without** a patent attorney/agent.
Provides outreach, education, and one-on-one help (video conference, phone, or in person at USPTO
HQ in Alexandria, VA): help with form completion and pre-filing questions, claim-drafting and
provisional-application videos, and monthly "Inventor Info Chat" webinars.

- **Phone:** 1-866-767-3848 (toll-free)
- **Email:** ProSeAssistanceCenter@uspto.gov
- **Hours:** 8:30 a.m.–5:00 p.m. ET, Mon–Fri
- **Eligibility:** no formal income threshold stated for the Pro Se Assistance Program.

### 6.2 Patent Pro Bono Program

A **nationwide network of independently operated regional programs** (academic/nonprofit) that
match volunteer patent practitioners with **financially under-resourced** inventors and small
businesses for **free** help preparing and filing applications.

- **Eligibility:** applicants must meet qualifying criteria, **including certain income/financial
  thresholds** (commonly tied to a multiple of the federal poverty guidelines) plus knowledge-of-
  the-system and invention-readiness requirements; each regional program sets and administers its
  own specific criteria.

---

## Source URL index

| # | Item | URL |
|---|---|---|
| 1 | USPTO Fee Schedule (large/small/micro amounts; eff. 2025-01-19) | <https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule> |
| 2 | Patent Center portal | <https://patentcenter.uspto.gov/> |
| 3 | Patent Center info / account & verification | <https://www.uspto.gov/patents/apply/patent-center> |
| 4 | Provisional application | <https://www.uspto.gov/patents/basics/apply/provisional-application> |
| 5 | Nonprovisional utility application | <https://www.uspto.gov/patents/basics/apply/utility-patent> |
| 6 | AIA forms (oath/declaration, ADS, IDS) | <https://www.uspto.gov/patents/apply/forms> |
| 7 | Pro Se / Pro Bono assistance | <https://www.uspto.gov/patents/basics/using-legal-services/pro-se-assistance-program> |

> **Verification flags:** The late-filing surcharge ($170/$68/$34) and non-electronic filing fee
> ($400/$200) in §1.6 came from the USPTO utility-patent guide narrative rather than directly from
> the fee-schedule table — **verify against the live fee schedule.** The IDS timing/content summary
> (§5) is paraphrased from 37 CFR 1.97/1.98 (the dedicated USPTO "duty to disclose" web page
> returned HTTP 404 at fetch time) — **verify against 37 CFR 1.56/1.97/1.98.**
