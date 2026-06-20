# Claims

> One section per claim. Prose above, machine-readable `binding` block below. Limitation IDs
> (`LIM##`) are globally unique. Antecedent basis is declared with `antecedent_of`.

### CLM01 - Self-watering planter insert (independent, apparatus)

A self-watering planter insert comprising:
- a reservoir configured to hold water;
- a float disposed in the reservoir; and
- a valve coupled to the float and configured to close when the float rises to a selected level.

```binding
type: claim-independent
category: apparatus
distinguished_over: [PA01]
scope_set_at: [PH01]
provenance: inventor:AINVENTOR
limitations:
  - id: LIM01
    text: "a reservoir configured to hold water"
    introduces: "reservoir"
    supported_by: [SPEC0002]
    illustrated_by: [FIG01#10]
    provenance: inventor:AINVENTOR
  - id: LIM02
    text: "a float disposed in the reservoir"
    introduces: "float"
    references: ["reservoir"]
    antecedent_of: [LIM01]
    supported_by: [SPEC0003]
    illustrated_by: [FIG01#12]
    provenance: inventor:AINVENTOR
  - id: LIM03
    text: "a valve coupled to the float and configured to close when the float rises to a selected level"
    introduces: "valve"
    references: ["float"]
    antecedent_of: [LIM02]
    supported_by: [SPEC0004]
    illustrated_by: [FIG01#14]
    provenance: inventor:AINVENTOR
```

### CLM02 - Wick variant (dependent)

The self-watering planter insert of claim 1, further comprising a wick extending from the reservoir
to an exterior of the insert.

```binding
type: claim-dependent
depends_on: CLM01
category: apparatus
provenance: inventor:AINVENTOR
limitations:
  - id: LIM04
    text: "a wick extending from the reservoir to an exterior of the insert"
    introduces: "wick"
    references: ["reservoir"]
    antecedent_of: [LIM01]
    supported_by: [SPEC0005]
    illustrated_by: [FIG01#16]
    provenance: inventor:AINVENTOR
```
