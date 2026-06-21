---
schema: apa-public-patent-source-v1
case_id: public-software-patent-pagerank
source_class: public_patent
public_source_url: https://patents.google.com/patent/US6285999B1/en
patent_or_publication_number: US6285999
title: Method for node ranking in a linked database
retrieved_at: 2026-06-21
source_sha256: see expected.json source_hash
extraction_confidence: medium
---

# Bibliographic Data

- Patent number: US6285999.
- Public source: Google Patents public patent page.
- Assignee: The Board of Trustees of the Leland Stanford Junior University.
- Inventor: Lawrence Page.
- Filed: January 9, 1998.
- Issued: September 4, 2001.
- Extraction note: Justia `apa-safe fetch` and Playwright Chromium attempts reached Cloudflare verification pages. Playwright Chromium loaded the Google Patents visible text without challenge; this advisory fixture was assembled from that public page text and normalized to ASCII.

# Abstract And Field

The public page identifies the invention as a method for assigning importance ranks to nodes in a linked database such as the web or another hypermedia database. It states that the rank assigned to a document is calculated from ranks of documents citing it and from a constant representing the probability that a browser randomly jumps to the document.

The stated technical use is enhancing search engine result performance for hypermedia databases whose documents vary widely in quality.

# Technical Improvement Excerpts

TI01: The baseline problem is that search engines for large document databases often return many irrelevant or unwanted documents, and simple constraints or search terms are not always effective.

TI02: The disclosed mechanism uses the linked structure of the database to assign rank from extrinsic relationships between documents rather than only intrinsic document content or backlink anchor text.

TI03: The rank definition is recursive and may be calculated iteratively over a linked database; backlinks from higher-ranked pages are weighted more strongly than backlinks from lower-ranked pages.

# Representative Claims

Claim 1 is represented as a computer implemented method that obtains linked and linking documents, assigns a score to linked documents based on scores of linking documents, and processes linked documents according to their scores.

Claim 18 is represented as a computer-readable medium storing instructions for obtaining linked/linking documents, determining scores based on linking-document scores, and processing linked documents according to the scores.

# Figure / Architecture Notes

Figures include a three-document linked graph, a three-document web with ranks, and a flowchart for calculating an importance rank.

# Public Domain Notes

This benchmark treats the public patent text only as a source for skill-quality evaluation. It does not infer conception history, legal validity, eligibility, infringement, enforceability, or freedom to operate.
