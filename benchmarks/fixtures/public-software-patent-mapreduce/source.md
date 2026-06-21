---
schema: apa-public-patent-source-v1
case_id: public-software-patent-mapreduce
source_class: public_patent
public_source_url: https://patents.google.com/patent/US8190610B2/en
patent_or_publication_number: US8190610
title: MapReduce for distributed database processing
retrieved_at: 2026-06-21
source_sha256: see expected.json source_hash
extraction_confidence: medium
---

# Bibliographic Data

- Patent number: US8190610.
- Public source: Google Patents public patent page.
- Assignee: Yahoo! Inc.
- Inventors: Ali Dasdan, Hung-Chih Yang, Ruey-Lung Hsiao.
- Filed: October 5, 2006.
- Issued: May 29, 2012.
- Extraction note: Justia `apa-safe fetch` and Playwright Chromium attempts reached Cloudflare verification pages. Playwright Chromium loaded the Google Patents visible text without challenge; this advisory fixture was assembled from that public page text and normalized to ASCII.

# Abstract And Field

The public page describes an input data set treated as grouped sets of key/value pairs. The grouping lets map processing occur independently on related but possibly heterogeneous datasets, such as datasets sharing a common primary key.

The page states that intermediate map results for a particular key can be processed together in a single reduce function by applying different iterators to intermediate values for each group.

# Technical Improvement Excerpts

TI01: The baseline problem is that conventional MapReduce implementations do not have a facility to efficiently process data from heterogeneous sources.

TI02: The disclosed mechanism groups input data by data group and key/value schema, maps heterogeneous groups independently, and gives each group identifiable intermediate data.

TI03: The reduce stage applies group-specific iterators to process intermediate values for the same key, enabling distributed relational database operations such as joins across different schemas.

TI04: The public page includes example map and reduce pseudocode for employee and department groups and notes that metadata may travel with iterators.

# Representative Claims

Claim 1 is represented as a method of processing data over a distributed system by partitioning grouped key/value data, mapping heterogeneous schemas into identifiable intermediate data having a key in common, and reducing the intermediate data into output data by processing each data group in a corresponding manner.

Claim 17 is represented as a computer system with processors and memory configured to perform the grouped MapReduce operations.

# Figure / Architecture Notes

Figures include conventional MapReduce architecture, an improved architecture with input groups, and a join over relational tables with different schemas.

# Public Domain Notes

This benchmark treats the public patent text only as a source for skill-quality evaluation. It does not infer conception history, legal validity, eligibility, infringement, enforceability, or freedom to operate.
