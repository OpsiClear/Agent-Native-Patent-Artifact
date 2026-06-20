# Evidence index (IDS / claim-chart seed)

> Every prior-art reference and every drawing, mapped to the claims it bears on. This index seeds an
> Information Disclosure Statement (SB/08) and the claim chart. It is **not** an FTO opinion. All
> references and drawings below are **fictional**, created for the demonstration matter.

## Prior-art references
| ID | Reference | Role | Bears on | Raw record |
|---|---|---|---|---|
| PA01 | Adjustable spring-return barrel hinge (fictional) | prior-art-for-patentability | CLM01, CLM05 (`distinguished_over`) | `prior_art/pa01.md` |
| PA02 | Overhead hydraulic door closer with speed valve (fictional) | prior-art-for-patentability | CLM01, CLM05 (`distinguished_over`) | `prior_art/pa02.md` |

## Drawings
| ID | Title | Representative | Numerals | Source | Transcription |
|---|---|---|---|---|---|
| FIG01 | Sectional structural view of the hinge | yes | 10 hinge body, 12 first leaf, 14 second leaf, 16 pivot spindle, 18 closing spring, 20 hydraulic damper, 22 metering valve, 24 hold-open detent, 26 cam profile, 28 adjustment screw | `../src/drawing_src/fig01.json` | `drawings/fig01.md` |
| FIG02 | Flowchart of the method of operation | no | 30 store energy, 32 release, 34 damp, 36 hold open | `../src/drawing_src/fig02.json` | `drawings/fig02.md` |

## Claim-chart seed (which evidence reads on which claim)
| Claim | Category | Distinguished over | Illustrated by |
|---|---|---|---|
| CLM01 | apparatus (independent) | PA01, PA02 | FIG01 (10-20) |
| CLM02 | apparatus (dependent of 1) | — | FIG01 (22, 28) |
| CLM03 | apparatus (dependent of 2) | — | FIG01 (28) |
| CLM04 | apparatus (dependent of 1) | — | FIG01 (24, 26) |
| CLM05 | method (independent) | PA01, PA02 | FIG02 (30-34) |
| CLM06 | method (dependent of 5) | — | FIG02 (36) |
