---
schema: apa-public-patent-source-v1
case_id: public-software-patent-ood-vehicle
source_class: public_patent
public_source_url: https://patents.google.com/patent/US11603119B2/en
patent_or_publication_number: US11603119
title: Method and apparatus for out-of-distribution detection
retrieved_at: 2026-06-21
source_sha256: see expected.json source_hash
extraction_confidence: medium
---

# Bibliographic Data

- Patent number: US11603119.
- Public source: Google Patents public patent page.
- Assignee: Great Wall Motor Company Limited.
- Inventors: Alexander Stimpson, Sham Sundar Narasinga Rao, Kishor Kumar.
- Filed: October 12, 2020.
- Issued: March 14, 2023.
- Extraction note: Justia `apa-safe fetch` and Playwright Chromium attempts reached Cloudflare verification pages. Playwright Chromium loaded the Google Patents visible text without challenge; this advisory fixture was assembled from that public page text and normalized to ASCII.

# Abstract And Field

The public page describes methods and systems for out-of-distribution detection in autonomous driving systems. It identifies feature-vector filtering, cluster assignment, classification-model determination, vehicle-control-system storage, sensor image detection, classification, and vehicle action.

The technical field is detecting out-of-distribution sensor data in safety-critical autonomous driving systems.

# Technical Improvement Excerpts

TI01: The baseline problem is that neural networks may work well when training/test data are from the same distribution but can fail under distributional shift in unfamiliar environments, producing over-confident misclassification that compromises safety-critical functionality.

TI02: The disclosed mechanism processes images through a neural network to obtain feature vectors, filters feature vectors into clusters, assigns images to clusters, applies an Euclidean-distance threshold, rejects above-threshold images, and uses a second filter to determine a classification model.

TI03: The disclosed deployment stores the classification model on a vehicle control system, detects images using vehicle sensors, classifies detected images, and performs vehicle actions based on the classified image.

TI04: The specification gives concrete AI/ML details: k-means clustering, softmax threshold, backpropagation, CNN architectures such as Xception/Inception/ResNet50, and NMI-based cluster evaluation.

# Representative Claims

Claim 1 is represented as a method for an autonomous driving system that obtains OOD and non-OOD images, processes images using a neural network to feature vectors, filters into clusters, assigns images to clusters, applies an Euclidean-distance threshold, rejects above-threshold images, filters below-threshold images to determine a classification model, stores that model on a vehicle control system, detects a sensor image, classifies the image, and performs a vehicle action.

Claim 16 is represented as a related method that filters feature vectors using a first filter to obtain clusters, assigns images to clusters, filters a subset using a second filter, stores a classification model on a vehicle control system, detects an image, classifies it, and performs a vehicle action.

# Figure / Architecture Notes

Figures include a vehicle, vehicle control systems, an OOD detection flow diagram, a detection architecture, and NMI scoring graphs for feature-vector output layers.

# Public Domain Notes

This benchmark treats the public patent text only as a source for skill-quality evaluation. It does not infer conception history, legal validity, eligibility, infringement, enforceability, or freedom to operate.
