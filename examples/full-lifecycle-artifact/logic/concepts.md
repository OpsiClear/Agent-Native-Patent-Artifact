# Defined claim terms (lexicography)

> The antecedent-basis and definiteness source of truth. A term of degree must carry an objective bound
> (35 USC 112(b)). Each term below is given an explicit, structurally-measurable bound so it is not a
> subjective judgment.

### TERM01 - closing speed

The rate at which the first leaf rotates toward the closed position under the bias of the closing
spring while opposed by the hydraulic damper. It is made objective by expressing it as a full-close
interval - the elapsed time from release at the open position to the closed position for a 90-degree
swing (see SPEC0007). The disclosed range is 3 seconds to 12 seconds, and the hinge is configured so
that the interval is not less than 3 seconds at the most open flow setting. It is therefore a
measurable time interval, not a subjective sense of "fast" or "slow".

```binding
term: "closing speed"
objective_bound: true
provenance: attorney
```

### TERM02 - hold-open angle

The single angular position, measured between the first leaf and the second leaf, at which the
hold-open detent retains the door. It is fixed by the angular position of the recess in the cam profile
(see SPEC0008) and is selected within a range of 85 degrees to 110 degrees. It is an objective,
structurally-determined angle, not a subjective judgment about when the door "stays open".

```binding
term: "hold-open angle"
objective_bound: true
provenance: attorney
```

### TERM03 - release torque

The minimum user-applied torque, about the axis, required to unseat the spring-biased follower from the
recess so that damped closing resumes (see SPEC0008, SPEC0009). It is bounded by the geometry of the cam
profile and the preload of the follower spring, and is therefore an objective, measurable torque
threshold expressed in newton-metres rather than a subjective effort.

```binding
term: "release torque"
objective_bound: true
provenance: attorney
```
