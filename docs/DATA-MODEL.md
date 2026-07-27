# Data model

One shared record, three role-scoped projections. The relationship between
people is many-to-many from the start, because the shapes that matter are:

- a father with two adult children who split the appointments
- a facility carer responsible for twelve residents across a shift
- someone caring for both parents at once

A foreign key would have made the first case wrong and the other two
impossible.

---

## Entities

```
Subject                 the person the medications belong to
  id
  displayName           what appears on every surface that shows a verdict
  conditions[]          e.g. hepatic impairment — rules condition on these
  channelUserId?        LINE userId, once bound

Carer
  id
  displayName
  channelUserId?

CareRelationship        the join — never a foreign key on Subject
  subjectId
  carerId
  relation              "family" | "facility_staff"
  canReceiveEscalations bool

MedicationItem          one line of what the subject actually takes
  id, subjectId
  inputText             verbatim, as written on the bag or spoken
  source                "prescription" | "otc" | "supplement" | "leftover"
  resolved              false is a first-class outcome, never a guess
  ingredient?, atc?     present only when resolved
  provenance?           hospital / department / dispensed date, read off the bag

Observation             what the family knows and the record does not
  id, subjectId, observedAt
  kind                  "symptom" | "self_medication" | "alcohol" | "missed_dose"
  note                  free text as reported
  reportedByCarerId     never the subject — see §Constraints

RegimenSnapshot         a point-in-time set of MedicationItems
  id, subjectId, capturedAt
                        change between consecutive snapshots is the signal

Verdict                 the output of the rule engine; see src/lib/verdict
  id, subjectId         ← mandatory, no exceptions
  rulesetVersions       so any past check can be reproduced
  findings[], unresolvedCount
```

---

## Constraints

### 1. A verdict without a subject cannot exist, and cannot be rendered anonymously

A carer looking after twelve residents will, sooner or later, be shown a finding
about the wrong person. In a single-parent household that is nearly impossible;
across a shift it is the most likely serious error in the whole product.

So:

- `Verdict.subjectId` is required at the type level
- every surface that renders a finding renders `Subject.displayName` with it
- there is a test asserting a verdict cannot be rendered without its subject

This is the failure mode that multi-subject support introduces, and it is
handled at the model rather than in review.

### 2. Observations are reported by carers, never by the subject

`Observation.reportedByCarerId` is required. The product never asks the older
adult to confirm or deny anything — he goes quiet when a shortfall is raised,
and a channel built on his admissions would collect silence.

He does ask questions, and questions cost him nothing. Those are not
observations.

### 3. `resolved: false` is a value, not an error

An unrecognised item stays in the record as unrecognised, is counted in
`unresolvedCount`, and is surfaced. Coverage is reported honestly rather than
implied by absence.

### 4. Rule set versions are recorded on every verdict

Rules are versioned files in `config/rules/`. A check from last month must be
reproducible against the rules as they were then.

---

## The three projections

| | Elder | Carer | Clinician |
| --- | --- | --- | --- |
| Sees | explanation of their own medications | full picture, findings, history | one page, ~20 seconds |
| Channel | LINE, voice, no links | LINE + web | printed sheet or read-only link |
| Can act | ask questions | log, capture, generate | nothing — it is information |
| Account | bound once, in person, by the carer | yes | **none** |

The clinician is deliberately not a participant. A hospital outpatient doctor
sees forty to sixty patients a session at roughly three minutes each and has no
route to adopting a consumer channel per patient. The brief asks for a summary
that is *clinician-reviewable*, which a single page satisfies without requiring
anyone to install anything.

There is a second reason. When the son says out loud, in front of his father,
that the doses get missed and the drinking has increased, the father goes quiet
and looks embarrassed. Handing over a sheet delivers the same information
without staging that moment.

---

## Family and facility are the same engine, not the same product

The wedge is the family: an adult child who cannot attend every appointment.
The path is the facility, where the gap is the shift handoff rather than the
absent child.

What transfers: the grounding, the rule engine, the verdict, the summary.

What does not: **the familiar-voice advantage.** A grandson's voice is the
reason a technology-averse older adult engages at all, and a facility has no
grandson. Facility value comes from continuity across shifts and from a
defensible record, which is a different pitch to a different buyer.

Worth stating plainly rather than assuming the moat travels.
