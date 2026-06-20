# Drawing Quality Gallery

This gallery is a deterministic benchmark for utility-patent drawing quality. It exercises common
diagram classes that often look acceptable as raw SVG but not as professional patent drawings.

Run from the APA repository root:

```sh
node packages/apa-figure/cli.mjs render-dir examples/drawing-quality-gallery/src/drawing_src --out-dir examples/drawing-quality-gallery/evidence/drawings
node packages/apa-figure/cli.mjs review-dir examples/drawing-quality-gallery/src/drawing_src --svg-dir examples/drawing-quality-gallery/evidence/drawings --out examples/drawing-quality-gallery/reviews/round-01.json --min-score 88
```

The review command is a drafting aid, not a formal USPTO compliance certification.
