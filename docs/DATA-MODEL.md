# Data model

One shared record, three role-scoped projections. The **target product** needs
a many-to-many relationship because the shapes that matter are:

- a father with two adult children who split the appointments
- a facility carer responsible for twelve residents across a shift
- someone caring for both parents at once

A foreign key would make the first case wrong and the other two impossible.
The current challenge demo intentionally does not implement that relationship;
it proves one end-to-end care pair first.

## Current demo projection

```text
DemoCarePair
  subjectId            subj-father
  elderLineUserId      deployment configuration
  caregiverLineUserId  deployment configuration

RoleBinding
  channelUserId
  role                  elder | caregiver
  subjectId             always DemoCarePair.subjectId
  boundAt
```

Exactly two LINE accounts project the same synthetic subject. Role selection
writes a `RoleBinding` and links the per-user rich menu; the caregiver web
dashboard has no subject selector. This projection is authoritative for the
demo and must not be described as multi-elder or multi-caregiver support.

`DemoCarePair` is deployment configuration, not the future persistence schema.
The later migration replaces it with `Carer` + `CareRelationship` and a
transactional authorization store without changing medication, verdict, or log
ownership.

---

## Entities and value shapes

`Subject`, grounded medication items, observations, snapshots, and verdicts are
current code. `Carer` and `CareRelationship` below are explicitly target-model
entities; the demo has `RoleBinding` instead.

```
Subject                 the person the medications belong to
  id
  displayName           what appears on every surface that shows a verdict
  conditions[]          e.g. hepatic impairment — rules condition on these

Carer                  target only
  id
  displayName

CareRelationship        target-only join — never a foreign key on Subject
  subjectId
  carerId
  relation              "family" | "facility_staff"
  canReceiveEscalations bool

MedicationItem          one line of what the subject actually takes
                        stored inside a RegimenSnapshot, which owns subjectId
  inputText             verbatim, as written on the bag or spoken
  source                "prescription" | "otc" | "supplement" | "leftover" | "unknown"
  resolved              false is a first-class outcome, never a guess
  if resolved           register, permit, nameZh, ingredients[], indications?,
                        officialWarning?, officialPrecautions?, matchedBy
  if unresolved         reason, candidates?

Observation             what the family knows and the record does not
  id, subjectId, observedAt
  kind                  "symptom" | "self_medication" | "alcohol" | "missed_dose" | "other"
  note                  free text as reported
  reportedByCarerId     never the subject — see §Constraints

RegimenSnapshot         a point-in-time set of MedicationItems
  id, subjectId, capturedAt, capturedByCarerId
  items[], verdict
                        change between consecutive snapshots is the signal

Verdict                 the output of the rule engine; see src/lib/verdict
  subject               { id, displayName, ageYears?, conditions[] }
  items[]               every grounded item, including unresolved ones
  findings[]
  coverage              { itemsSubmitted, itemsResolved, itemsUnresolved,
                          nothingChecked }
  provenance            register versions plus used/skipped rule-set versions

MedicationBagExtraction transient review draft; never part of SubjectLog
  requestId
  rows[]                printed fields, each with value/status/evidence/locationHint
  provenance            visible institution/department/dispensing date only
  needsHumanReview      always true in the current slice
                        the current route returns this to the browser and does
                        not persist or promote it into MedicationItem
```

LINE identity is deliberately separate from `Subject` and `Carer`. In the
current demo it lives in `RoleBinding`; the target model needs an authenticated
channel/account mapping attached to a `CareRelationship`, not a LINE user id on
the clinical entity itself.

---

## Constraints

### 1. A verdict without a subject cannot exist, and cannot be rendered anonymously

A carer looking after twelve residents will, sooner or later, be shown a finding
about the wrong person. In a single-parent household that is nearly impossible;
across a shift it is the most likely serious error in the whole product.

So:

- `Verdict.subject.id` is required because the complete subject is embedded in
  the verdict
- every surface that renders a finding renders `Subject.displayName` with it
- there is a test asserting a verdict cannot be rendered without its subject

This is the failure mode that multi-subject support introduces, and it is
handled at the model rather than in review.

### 2. Observations are reported by carers, never by the subject

`Observation.reportedByCarerId` is required. The product never asks the older
adult to confirm or deny anything — he goes quiet when a shortfall is raised,
and a channel built on his admissions would collect silence.

He does ask questions, and questions cost him nothing. Conceptually those are
not observations. The current LINE path nevertheless stores a typed
medicine-name question in the observation collection as `kind: "other"` with
`reportedByCarerId: "elder-asked"`, solely as a demo retrieval shortcut. A
future `ElderQuestion` entity should replace that sentinel.

### 3. `resolved: false` is a value, not an error

An unrecognised item stays in the record as unrecognised, is counted in
`Verdict.coverage.itemsUnresolved`, and is surfaced. Coverage is reported
honestly rather than implied by absence.

### 4. Rule set versions are recorded on every verdict

Rules are versioned files in `config/rules/`; their versions are recorded in
`Verdict.provenance.ruleSets`, with skipped sets recorded separately. A check
from last month must be reproducible against the rules as they were then.

---

## The three projections

| | Elder | Carer | Clinician |
| --- | --- | --- | --- |
| Sees | explanation of their own medications | full picture, findings, history | one page, ~20 seconds |
| Channel | LINE, voice, no links | LINE + web | printed sheet or read-only link |
| Can act | ask questions | log, capture, generate | nothing — it is information |
| Account | allowlisted LINE `RoleBinding` in this demo | allowlisted LINE `RoleBinding`; web has no authentication yet | **none** |

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

What does not: **the familiar-voice advantage.** The target family experience
may use a consenting caregiver's own voice. The current demo only supports
optional configured speech and uses the consented Serin profile as a stand-in;
it does not claim to use an elder relative's voice. Facility value comes from
continuity across shifts and from a defensible record, which is a different
pitch to a different buyer.

Worth stating plainly rather than assuming the moat travels.
