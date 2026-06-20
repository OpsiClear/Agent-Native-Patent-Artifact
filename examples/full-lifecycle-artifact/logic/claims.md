# Claims

> One section per claim. Prose above, machine-readable `binding` block below. Limitation IDs
> (`LIM##`) are globally unique. Antecedent basis is declared with `antecedent_of`: each `the/said`
> noun phrase listed in a limitation's `references` resolves to an *earlier* limitation (in this claim
> or an ancestor claim) whose single `introduces` value is that same phrase. Where one clause both
> introduces a noun and depends on an earlier noun, the clause is split into its own limitation so each
> referenced noun phrase has exactly one introducing limitation. This matter has **two independent
> claims of different statutory categories** - an apparatus claim (CLM01) and a method claim (CLM05) -
> plus dependents. Every limitation is `inventor:RMORALES` (assembly-ready; no `ai-suggested` blocker).

### CLM01 - Self-closing door hinge (independent, apparatus)

A self-closing door hinge comprising:
- a hinge body;
- a first leaf configured to be fixed to a door;
- a second leaf configured to be fixed to a door frame;
- the first leaf pivotally joined to the second leaf for rotation about an axis;
- the first leaf rotatable about the axis between an open position and a closed position;
- a pivot spindle extending along the axis within the hinge body and keyed to the first leaf;
- a closing spring coupled between the hinge body and the pivot spindle and biasing the first leaf
  toward the closed position;
- a hydraulic damper coupled to the pivot spindle; and
- the hydraulic damper configured to limit a closing speed of the first leaf as the closing spring
  biases the first leaf toward the closed position.

```binding
type: claim-independent
category: apparatus
distinguished_over: [PA01, PA02]
scope_set_at: [PH02]
provenance: inventor:RMORALES
limitations:
  - id: LIM01
    text: "a hinge body"
    introduces: "hinge body"
    supported_by: [SPEC0002]
    illustrated_by: [FIG01#10]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM01"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM02
    text: "a first leaf configured to be fixed to a door"
    introduces: "first leaf"
    supported_by: [SPEC0003]
    illustrated_by: [FIG01#12]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM02"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM03
    text: "a second leaf configured to be fixed to a door frame"
    introduces: "second leaf"
    supported_by: [SPEC0003]
    illustrated_by: [FIG01#14]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM03"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM04
    text: "the first leaf pivotally joined to the second leaf for rotation about an axis"
    introduces: "axis"
    references: ["first leaf", "second leaf"]
    antecedent_of: [LIM02, LIM03]
    supported_by: [SPEC0003]
    illustrated_by: [FIG01#16]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM04"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM05
    text: "the first leaf rotatable about the axis between an open position and a closed position"
    introduces: "closed position"
    references: ["first leaf", "axis"]
    antecedent_of: [LIM02, LIM04]
    supported_by: [SPEC0003]
    illustrated_by: [FIG01#12]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM05"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM06
    text: "a pivot spindle extending along the axis within the hinge body and keyed to the first leaf"
    introduces: "pivot spindle"
    references: ["axis", "hinge body", "first leaf"]
    antecedent_of: [LIM04, LIM01, LIM02]
    supported_by: [SPEC0004]
    illustrated_by: [FIG01#16]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM06"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM07
    text: "a closing spring coupled between the hinge body and the pivot spindle and biasing the first leaf toward the closed position"
    introduces: "closing spring"
    references: ["hinge body", "pivot spindle", "first leaf", "closed position"]
    antecedent_of: [LIM01, LIM06, LIM02, LIM05]
    supported_by: [SPEC0005]
    illustrated_by: [FIG01#18]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM07"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM08
    text: "a hydraulic damper coupled to the pivot spindle"
    introduces: "hydraulic damper"
    references: ["pivot spindle"]
    antecedent_of: [LIM06]
    supported_by: [SPEC0006]
    illustrated_by: [FIG01#20]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM08"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM09
    text: "the hydraulic damper configured to limit a closing speed of the first leaf as the closing spring biases the first leaf toward the closed position"
    introduces: "closing speed"
    references: ["hydraulic damper", "first leaf", "closing spring", "closed position"]
    antecedent_of: [LIM08, LIM02, LIM07, LIM05]
    supported_by: [SPEC0006]
    illustrated_by: [FIG01#20]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM09"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```

### CLM02 - Adjustable metering valve (dependent)

The self-closing door hinge of claim 1, wherein the hydraulic damper comprises an adjustable metering
valve defining a fluid passage, and an adjustment screw that sets a flow area of the fluid passage to
set the closing speed.

```binding
type: claim-dependent
depends_on: CLM01
category: apparatus
provenance: inventor:RMORALES
limitations:
  - id: LIM10
    text: "an adjustable metering valve"
    introduces: "adjustable metering valve"
    references: ["hydraulic damper"]
    antecedent_of: [LIM08]
    supported_by: [SPEC0007]
    illustrated_by: [FIG01#22]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM10"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM11
    text: "a fluid passage defined by the adjustable metering valve"
    introduces: "fluid passage"
    references: ["adjustable metering valve"]
    antecedent_of: [LIM10]
    supported_by: [SPEC0007]
    illustrated_by: [FIG01#22]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM11"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM12
    text: "an adjustment screw that sets a flow area of the fluid passage to set the closing speed"
    introduces: "adjustment screw"
    references: ["fluid passage", "closing speed"]
    antecedent_of: [LIM11, LIM09]
    supported_by: [SPEC0007]
    illustrated_by: [FIG01#28]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM12"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```

### CLM03 - Bounded closing speed (dependent)

The self-closing door hinge of claim 2, wherein the adjustment screw is adjustable over a range in
which the closing speed yields a full-close interval of between 3 seconds and 12 seconds for a 90-degree
swing.

```binding
type: claim-dependent
depends_on: CLM02
category: apparatus
provenance: inventor:RMORALES
limitations:
  - id: LIM13
    text: "the adjustment screw is adjustable over a range in which the closing speed yields a full-close interval of between 3 seconds and 12 seconds for a 90-degree swing"
    references: ["adjustment screw", "closing speed"]
    antecedent_of: [LIM12, LIM09]
    supported_by: [SPEC0007]
    illustrated_by: [FIG01#28]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM13"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```

### CLM04 - Hold-open detent (dependent)

The self-closing door hinge of claim 1, further comprising a hold-open detent having a spring-biased
follower and a cam fixed for rotation with the pivot spindle, the cam defining a recess at a hold-open
angle in which the spring-biased follower seats to retain the first leaf against the closing spring.

```binding
type: claim-dependent
depends_on: CLM01
category: apparatus
provenance: inventor:RMORALES
limitations:
  - id: LIM14
    text: "a hold-open detent having a spring-biased follower and a cam fixed for rotation with the pivot spindle"
    introduces: "hold-open detent"
    references: ["pivot spindle"]
    antecedent_of: [LIM06]
    supported_by: [SPEC0008]
    illustrated_by: [FIG01#24]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM14"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM15
    text: "the cam defining a recess at a hold-open angle in which a spring-biased follower of the hold-open detent seats to retain the first leaf against the closing spring"
    introduces: "cam"
    references: ["hold-open detent", "first leaf", "closing spring"]
    antecedent_of: [LIM14, LIM02, LIM07]
    supported_by: [SPEC0008]
    illustrated_by: [FIG01#26]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM15"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```

### CLM05 - Method of damped door closing (independent, method)

A method of closing a door comprising:
- providing a closing spring coupled to a door;
- moving the door toward an open position so as to store energy in the closing spring;
- releasing the door so that the closing spring drives the door from the open position toward a closed
  position; and
- displacing a working fluid through a hydraulic damper to limit a closing speed of the door as the door
  moves toward the closed position.

```binding
type: claim-independent
category: method
distinguished_over: [PA01, PA02]
scope_set_at: [PH02]
provenance: inventor:RMORALES
limitations:
  - id: LIM16
    text: "providing a closing spring coupled to a door"
    introduces: "closing spring"
    supported_by: [SPEC0009]
    illustrated_by: [FIG02#30]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM16"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM17
    text: "providing a door coupled to the closing spring"
    introduces: "door"
    references: ["closing spring"]
    antecedent_of: [LIM16]
    supported_by: [SPEC0009]
    illustrated_by: [FIG02#30]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM17"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM18
    text: "moving the door toward an open position so as to store energy in the closing spring"
    introduces: "open position"
    references: ["door", "closing spring"]
    antecedent_of: [LIM17, LIM16]
    supported_by: [SPEC0009]
    illustrated_by: [FIG02#30]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM18"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM19
    text: "releasing the door so that the closing spring drives the door from the open position toward a closed position"
    introduces: "closed position"
    references: ["door", "closing spring", "open position"]
    antecedent_of: [LIM17, LIM16, LIM18]
    supported_by: [SPEC0009]
    illustrated_by: [FIG02#32]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM19"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM20
    text: "displacing a working fluid through a hydraulic damper to limit a closing speed of the door as the door moves toward the closed position"
    introduces: "working fluid"
    references: ["door", "closed position"]
    antecedent_of: [LIM17, LIM19]
    supported_by: [SPEC0009]
    illustrated_by: [FIG02#34]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM20"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```

### CLM06 - Method with hold-open step (dependent)

The method of claim 5, further comprising holding the door at a hold-open angle by seating a
spring-biased follower in a recess of a cam, and resuming damped closing of the door when a user-applied
torque exceeds a release torque.

```binding
type: claim-dependent
depends_on: CLM05
category: method
provenance: inventor:RMORALES
limitations:
  - id: LIM21
    text: "holding the door at a hold-open angle by seating a spring-biased follower in a recess of a cam"
    introduces: "hold-open angle"
    references: ["door"]
    antecedent_of: [LIM17]
    supported_by: [SPEC0008]
    illustrated_by: [FIG02#36]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM21"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  - id: LIM22
    text: "resuming damped closing of the door when a user-applied torque exceeds a release torque"
    introduces: "release torque"
    references: ["door"]
    antecedent_of: [LIM17]
    supported_by: [SPEC0009]
    illustrated_by: [FIG02#36]
    provenance: inventor:RMORALES
    source: inventor-confirmation
    source_span: "demo-full:claims:LIM22"
    source_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
```
