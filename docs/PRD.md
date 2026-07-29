# MedBuddy — Product Requirements Document

**Primary wedge:** turn a caregiver's ordinary-language observations into an
attributed longitudinal record and a clinician-scannable follow-up sheet.

Ping-Juei (Ray) Tsai · AI Fund Engineer in Residence Build Challenge

Live: https://medbuddy-app.vercel.app · Source: this repository · Reviewed
against `de4784f` on 2026-07-29

---

## Document purpose and status language

This document separates the intended product from the current prototype. A
feature appearing in a design is not evidence that it works, and a working demo
is not evidence that it improves health outcomes.

| Status | Meaning |
| --- | --- |
| **Built** | The end-to-end path exists under its stated configuration and has repository test evidence for its safety-critical boundary. |
| **Partial** | A meaningful path exists, but a named requirement, integration, validation, or deployment condition is missing. |
| **Not built** | Product direction only; the current interface must not imply that it is available. |

Status is about capability, not demo account topology. Environment variables,
test recipients, and seeded records belong in the demo runbook rather than in
the product definition.

---

## 1. Problem, evidence, and hypotheses

### 1.1 The care-information gap

The source case is the founder's experience accompanying his father to
follow-up appointments. At home, a caregiver may notice details such as missed
doses, pain that led to taking an old or over-the-counter medicine, changes in
alcohol use, or symptoms that do not come up during the appointment. When asked
in the room, the older adult may give a short answer such as 「還好，都差不多」.
If the caregiver cannot attend, those observations may not reach the clinician.

Medication context is fragmented as well. A prescription list does not by
itself describe everything physically used at home: over-the-counter products,
supplements, and leftovers may be known only to the family. MedBuddy therefore
captures the **source as declared by the caregiver**; it does not claim to have
verified whether an item appears in a national prescription record.

The product problem is narrower than “older adults forget medicine”:

> A caregiver needs a low-friction way to record what they noticed when it
> happens, preserve their exact words over time, and carry that context into a
> short follow-up visit even when they cannot attend.

### 1.2 What is evidence today

| Evidence | What it supports | What it does not support |
| --- | --- | --- |
| First-person observation in one family | The information gap exists in this household and is costly enough to motivate a prototype. | Prevalence across families, willingness to pay, or clinical outcome improvement. |
| Working prototype and automated tests | The listed Built paths and bounded safety checks can be demonstrated. | Usability, accessibility, clinical usefulness, or real-world reliability. |
| TFDA open-data snapshots and selected published criteria | Product-name grounding, source quotation, and a deliberately narrow set of safety signals. | A complete medication reconciliation or comprehensive interaction checker. |

The repository contains no documented clinician, pharmacist, caregiver-cohort,
or older-adult-cohort validation of the complete workflow. The buyer is also
unknown; “adult child pays” is a hypothesis, not a requirement.

### 1.3 Research hypotheses

| ID | Hypothesis | Evidence needed |
| --- | --- | --- |
| H1 | A caregiver is more likely to capture a useful observation when they can type one natural paragraph instead of completing a medical form. | Compare completion, time, abandonment, and correction rates for prose versus a structured form. |
| H2 | Preserving the caregiver's exact wording while adding a small category and timestamp gives clinicians useful specificity without turning the product into the author. | Clinician review of paired raw notes and MedBuddy summaries; measure misinterpretation and scan time. |
| H3 | A short, attributed longitudinal sheet lets a clinician find medication changes and home observations during a brief visit. | Task-based study with clinicians or pharmacists using realistic cases. |
| H4 | Text plus an explicitly disclosed AI voice in a warm, granddaughter-style register improves attention or comprehension for some older adults compared with text alone. | Older-adult comprehension, trust, annoyance, and opt-out study. Do not use message opens as a proxy for comprehension. |
| H5 | A consented, calibrated familiar voice and Taiwanese or other low-resource languages may improve comfort and accessibility. | Speaker consent, intelligibility, dialect review, and comparison against a neutral voice. |
| H6 | A consented long-term companion memory may improve continuity across care episodes. | Longitudinal study of recall usefulness, correction, deletion, and perceived surveillance. |

MedBuddy **does not claim to prevent, slow, or treat memory decline**. H4–H6 are
interaction and continuity hypotheses, not cognitive-health claims.

---

## 2. Personas and jobs to be done

### 2.1 Caregiver — primary contributor

**Job:** “When I notice something relevant at home, let me say it naturally and
trust that my words will still be there when the next appointment happens.”

Needs:

- one low-effort capture action, 「記一件事」;
- a clear distinction between what they said and what the system inferred;
- correction, review, and control over what is shared;
- medication capture that never silently promotes OCR output into the record;
- a quick way to prepare and share the follow-up sheet.

### 2.2 Older adult — care subject and direct user

**Job:** “When I want to see my medicines or receive a family-configured
reminder, explain it clearly without testing me, grading me, or pretending to be
someone I know.”

Needs:

- large, stable LINE actions and a text fallback for audio;
- uncertainty stated rather than guessed;
- no adherence score, streak, shame, or demand to confirm whether a dose was
  taken;
- visibility into, and a way to contest, information shared about them. This
  last requirement is **not built**.

### 2.3 Clinician or pharmacist — time-constrained reader

**Job:** “During a short visit, let me scan what changed, what the caregiver
observed, what the household says is being used, and what remains uncertain.”

The reader should need no MedBuddy account or app for a family-authorized,
short-lived shared view. “Clinician-scannable” is a target to test, not a claim
that the current page fits one printed page or a three-minute workflow.

### 2.4 Role is not subject

- A **role** selects the elder or caregiver LINE experience.
- A **subject** is the person whose care record is being viewed.
- The same LINE account can use 「切換身分」 to re-open role selection when the
  deployment enables `MEDBUDDY_ALLOW_ROLE_SWITCH` and its claim gate permits
  that account to select both roles. Explicit per-role recipient IDs still pin
  each account to its configured role.
- Switching role does **not** switch the subject. Subject selection and a
  multi-person roster are not built.
- Role selection is interface state, not sufficient production authorization.

---

## 3. Product promise and scope

### 3.1 Core promise

> **Capture what the caregiver noticed, keep their words, and make the care
> context scannable at the next visit.**

The primary value chain is:

```text
caregiver prose
  → validated segmentation + verbatim observations
  → attributed longitudinal record
  → medication context + change since last check
  → short-lived clinician follow-up sheet
```

Medication capture and elder delivery support that wedge:

```text
bag photo/upload → evidence-only OCR draft → human review → medication check
                 → snapshot → 我的藥 / follow-up sheet

caregiver schedule → bounded reminder text → optional disclosed Serin AI audio
                   → elder LINE
```

### 3.2 Product principles

1. **One fact, explicit provenance.** Caregiver words, printed bag text,
   registry text, rule output, and product-authored interface copy must remain
   distinguishable.
2. **Human confirmation before clinical projection.** OCR is evidence capture,
   never authority.
3. **Uncertainty is an output.** Unresolved and ambiguous items remain visible.
4. **Same safety pipeline, not necessarily same data.** All medication
   explanations should use grounding → rules → verdict → narration, but the
   current input sources are not yet unified.
5. **The clinician decides.** The product prepares information and questions;
   it does not diagnose, prescribe, or recommend stopping or changing a drug.
6. **Warmth must not become impersonation or advice.** Serin is an AI-generated
   demo voice in a granddaughter-style register, not the older adult's actual
   granddaughter.

---

## 4. Domain model

| Term | Product meaning | Current limitation |
| --- | --- | --- |
| `Subject` | Person whose care record is represented. | Seeded prototype subject; no subject picker or roster. |
| `RoleBinding` | A LINE user’s selected `elder` or `caregiver` projection for one subject. | Feature-flagged re-selection; not full identity, consent, or authorization. |
| `Observation` | Caregiver-attributed verbatim note with category and recorded time. | `observedAt` is receipt time, not necessarily when the event happened; no edit/delete workflow. |
| `ElderQuestion` | A medicine question asked by the older adult. | **Not modeled.** The demo stores it as an observation with the sentinel `elder-asked`, which can be misattributed in the summary. |
| `RegimenSnapshot` | Result of one medication-check request, including input, verdict, and creation time. | It is not “verified”: there is no reviewer or confirmation status. |
| `GroundedItem` | A caregiver-entered name resolved or explicitly unresolved against loaded registries. | Exact/contained-name matching is not medication identity verification. |
| `Finding` | A selected rule signal with quote, provenance, limits, and escalation target. | Only a small subset of possible medication risks is implemented. |
| `SubjectSchedule` | Up to four caregiver-configured clock times. | Not linked to individual medicines, doses, or meal timing. |
| `ClinicianSummary` | Projection of the latest check plus longitudinal observations and changes. | Current wording and filtering contain known attribution issues. |

No surface may call a snapshot “verified,” an elder question a caregiver
observation, or a caregiver-declared source a verified prescription-record
fact.

---

## 5. End-to-end workflows

### 5.1 Primary wedge: 「記一件事」 to follow-up sheet

1. The caregiver taps 「記一件事」 and types one natural paragraph.
2. The system optionally asks Gemini to segment the paragraph into
   `symptom`, `self_medication`, `alcohol`, `missed_dose`, or `other`.
3. Every accepted note must be contained in the caregiver's input after
   whitespace normalization. If extraction is unavailable or no candidate is
   accepted, the complete paragraph is stored as `other`; the system does not
   rewrite it. When only some candidates are accepted, however, rejected or
   omitted sibling text is not retained separately. This is a known fidelity
   gap rather than an exact-verbatim guarantee.
4. All observations from one message are appended in one store operation so a
   stale read cannot discard sibling observations.
5. The longitudinal log retains recorded time, category, verbatim note, and
   reporter attribution.
6. The caregiver previews a follow-up sheet combining the latest medication
   check, changes since the previous snapshot, unresolved items, rule-derived
   questions, and observations.
7. The family creates a signed, short-lived QR/link for the clinician.

**Current status: Partial.** Natural-language capture, safe segmentation,
append-only persistence, summary projection, and signed sharing exist. Source
paragraph retention for partially accepted extraction, event time,
editing/deletion, date filtering, older-adult review/consent, clinician
validation, page-length control, and correct separation of elder questions are
missing.

### 5.2 Medication bag to 「我的藥」

1. A caregiver takes a photo or uploads JPEG, PNG, or WebP.
2. OCR transcribes only visible printed fields and returns per-field status,
   evidence, provenance, and review reasons. Missing text remains missing.
3. The result is visibly labeled as a draft.
4. In the embedded dashboard flow, the caregiver chooses to add readable names
   to the editable medication list and then explicitly runs the medication
   check.
5. The resolver and rule engine produce a snapshot; 「我的藥」 reads the most
   recent check snapshot.

**Current status: Partial.** Camera/upload and a model-response-bounded OCR draft
are built. The validator checks that a returned value appears in evidence that
the same model returned; it does not independently prove pixel correspondence
or validate every provenance field. Human comparison with the original image
therefore remains mandatory. The
standalone `/bag` flow opened from LINE remains draft-only and requires manual
re-entry. The embedded handoff emits the source token `rx`, while the medication
parser accepts `prescription`; it therefore degrades to `unknown`. The snapshot
schema and elder narration can carry intake fields, and the seed script writes
demo intake, but the ordinary caregiver-confirmed OCR flow does not write those
fields. Do not claim OCR-to-record completion until that writer and its
end-to-end tests land.

### 5.3 Caregiver-configured reminder and explanation

1. The caregiver configures up to four enabled clock-time slots, at least 60
   minutes apart.
2. At a due slot, the delivery path produces elder-facing text through the
   medication pipeline and may synthesize the same message with the
   repository-configured Serin demo profile.
3. LINE receives text even when audio generation or hosting fails.
4. The caregiver may also trigger an immediate explanation from LINE.

**Current status: Partial.** Schedule editing, bounds, due/late/idempotency
logic, text delivery, optional Fish Audio delivery, and a Serin profile carrying
a repository consent attestation exist. That attestation is not independent
identity or consent verification. The deployed Vercel Hobby cron runs once
daily, so it cannot
deliver arbitrary configured times on time; the demo manually drives the
endpoint. Scheduled and immediate LINE delivery currently use seeded cupboard
data rather than the latest snapshot. Slots are generic and cannot truthfully
answer which medicine, dose, or before/after-meal instruction belongs to a
time.

Serin must always be disclosed to the recipient as **AI-generated,
granddaughter-style audio**. It is not the recipient's family member; current
source comments and partial web copy are not a complete user-facing disclosure.

The production 「我的藥」 warm projection added at `137f63b` is a separate P0
safety gap. It can omit unresolved items, medication purpose, coverage, finding
limits, and escalation; seeded `intake` rows replace rather than enrich all
verdict items. It also derives 「第 N 包」 from generic clock slots, applies the
first available meal relation to the next slot, shortens product names without
checking uniqueness, and adds 「配溫開水」 and walking advice outside the verdict.
The page's provenance segments describe the discarded narration rather than the
displayed warm text. The focused tests added at `de4784f` cover whether an
English warning is replaced and a Chinese warning is retained, but not item
preservation, provenance, timing association, name uniqueness, coverage, or
escalation. The non-Chinese fallback also collapses any number and severity of
findings into 「有一項…請藥師」, so physician escalation can be downgraded and
multiple findings miscounted. Warmth is a product requirement; invented
medication mapping or health advice is not. This projection must not be treated
as an accepted safety path until it preserves the full relevant verdict and
passes the same outbound validation.

### 5.4 Role re-selection

1. Either rich menu can offer 「切換身分」.
2. The action re-opens the role card; it must not silently invert the role.
3. The user selects elder or caregiver, and the server re-links the matching
   menu when role switching is enabled.
4. The bound subject remains unchanged.

**Current status: Partial, feature-flagged.** Re-selection, server-side action
allowlists, and binding checks exist. Cross-role re-selection works only when
the flag is on and the claim gate permits the selected role. Explicit elder and
caregiver recipient IDs pin each account to one role; open mode does not enforce
one account per role or automatically swap two mistaken bindings. This is demo
recovery, not a production consent or authorization model.

---

## 6. Functional requirements, status, and acceptance

| ID | Requirement and reason | Status | Acceptance and current evidence/gap |
| --- | --- | --- | --- |
| FR-01 | A caregiver can submit one ordinary-language observation from LINE or web, because capture must fit the moment it occurs. | **Partial, bounded** | Blank input is rejected and accepted spans must be whitespace-normalized substrings. If some spans are accepted, rejected or omitted sibling content may be lost because the source paragraph is not retained; classification and coverage are not verified. |
| FR-02 | Observations form an attributed longitudinal record rather than a disposable chat transcript. | **Partial** | Batch append and chronological storage exist. Acceptance additionally requires occurrence date, correction, deletion, period filtering, retention policy, and subject review/consent. |
| FR-03 | The follow-up sheet exposes latest medication context, change, uncertainty, and caregiver observations for rapid scan. | **Partial** | Current page renders these sections. It must stop calling caregiver-declared sources “not in the prescription record,” exclude `elder-asked` sentinels, remain usable with long histories, and pass clinician scan tests. |
| FR-04 | A family can share the sheet without requiring clinician installation. | **Built for web; LINE image Partial** | A signed, expiring token produces the shared view and browser data-URL QR. Its payload is base64-decodable and contains `subjectId`; signing provides integrity and expiry, not encryption or confidentiality. The LINE-hosted QR proxy uses an unverified Blob URL lookup and may return 404; the caregiver route is unauthenticated. |
| FR-05 | OCR transcribes medication-bag evidence without identifying a drug from appearance or filling missing fields. | **Partial, bounded** | Fields carry value/status/evidence and the API writes no log entry, but validation proves only self-consistency inside the model response, not correspondence to image pixels; provenance fields and the live route lack complete tests. |
| FR-06 | OCR content reaches 「我的藥」 only after caregiver review and the ordinary medication-check path. | **Partial** | Embedded draft → editable list → check exists, but `rx` currently becomes `unknown`; standalone `/bag` does not hand off. Seeded snapshots demonstrate intake rendering, but the normal OCR confirmation path does not persist intake details. |
| FR-07 | Medication names are grounded and uncertainty is retained before rules or narration. | **Built, bounded** | Resolution uses the loaded TFDA datasets; ambiguous/no-match items remain unresolved. This is name matching, not identity verification. |
| FR-08 | Findings preserve source, limits, and pharmacist-versus-physician escalation without prescribing. | **Verdict layer Built; elder projection Partial / P0** | The verdict implements 8 of 133 STOPP-derived rules and 3 TFDA health-food warning rules with structured provenance. The current warm elder projection discards source/limits/count/severity and may downgrade `consult_physician` to a generic pharmacist prompt; conditions are seeded and coverage is not comprehensive. |
| FR-09 | 「我的藥」 uses the most recent medication-check snapshot and a safe role-specific projection. | **Partial / P0** | The latest snapshot is read, but the new elder warm projection can drop unresolved items and safety context, substitute seeded intake for verdict items, infer packet/meal mapping, add ungrounded advice, and lose finding count/severity/escalation. Focused warning tests exist but do not cover those invariants. It must be called “latest check,” not “verified/current.” |
| FR-10 | A caregiver can add/remove bounded reminder times in LINE and web. | **Built** | Maximum four slots, valid `HH:mm`, at least 60 minutes apart, explicit empty schedule, and no invented default time. |
| FR-11 | A configured reminder reaches the elder once, near its configured time, as text plus optional Serin audio. | **Partial** | Due/idempotency and delivery are tested; production-frequency triggering, latest-snapshot input, end-to-end delivery monitoring, user-facing AI/non-family disclosure, and removal of unmodeled self-report prompts and ungrounded advice remain open. |
| FR-12 | The same LINE account can deliberately reselect elder/caregiver role without changing subject. | **Partial, feature-flagged** | 「切換身分」 re-opens selection and subject ID remains fixed. Explicit per-role recipient IDs prevent cross-role claims; open mode allows them but does not enforce one-per-role or auto-swap. Production authorization is not included. |
| FR-13 | A user can switch among multiple care subjects. | **Not built** | No subject roster, picker, relationship authorization, or per-subject consent exists. This is distinct from role switching. |
| FR-14 | The product uses a real relative's familiar voice through consented cloning/calibration. | **Not built** | Current audio uses a Serin demo profile with a repository consent attestation, not a family voice or independently verified consent workflow. Future acceptance requires speaker and recipient consent, disclosure, revocation, deletion, abuse controls, and intelligibility evaluation. |
| FR-15 | Taiwanese and other low-resource languages are first-class input/output options. | **Not built** | Acceptance requires dialect-specific transcription and synthesis evaluation with native speakers, a text fallback, and explicit handling of uncertainty. |
| FR-16 | A long-term companion memory carries consented context across care episodes. | **Not built** | Future memory must be inspectable, attributable, correctable, exportable, and deletable. It must not infer cognitive status or claim to prevent memory decline. |

---

## 7. Non-functional requirements, status, and acceptance

| ID | Requirement | Status | Acceptance and current gap |
| --- | --- | --- | --- |
| NFR-01 | **Clinical safety:** product-authored text must not diagnose, prescribe, change dose, recommend stopping a medicine, solicit an unmodeled health self-report, or add health/behavior advice. | **Partial / P0** | Medication verdicts are bounded, but fallback validation is fail-open and the current warm projection invents packet/meal mapping, warm-water and movement advice after validation. Verified source quotations may contain dosing text; the system must not author new dosing instructions. |
| NFR-02 | **Provenance:** every medication projection identifies dataset/rule versions and distinguishes quote, caregiver report, OCR evidence, and product copy. | **Partial** | Verdict provenance exists, but OCR `rx` degradation, summary source wording, warm finding simplification, and preview segments that describe discarded rather than displayed text violate the requirement. |
| NFR-03 | **Access control:** only authorized participants can read/write a subject's health data. | **Partial / not suitable for real data** | Signed clinician links expire and resist tampering, but their payload is not confidential. Direct `/summary/[subjectId]` and health-data write/share routes have no user authentication; role binding is not authorization. |
| NFR-04 | **Privacy and consent:** collection, third-party processing, retention, sharing, correction, and deletion are explained and controlled. | **Not built** | OCR images are processed by Anthropic even when the app does not persist them; caregiver prose may be processed by Gemini; narration may be sent to Fish Audio. There is no end-user consent, retention, deletion, or data-subject review flow. |
| NFR-05 | **Reliability:** one user action produces one durable write; scheduled delivery is at-most-once and observable. | **Partial** | Batch observation append, one-snapshot-per-check behavior, and slot idempotency have tests. Provider failures, deployment timing, eventual consistency, retry policy, and operator recovery are not end-to-end validated. |
| NFR-06 | **Accessibility:** older-adult tasks work with large targets, readable text, text alternatives, keyboard/screen reader, and supported speech fallback. | **Partial** | LINE uses stable menu actions and audio has text fallback. No WCAG audit, screen-reader study, contrast/tap-target measurement, or supported-browser matrix exists; LINE speech-to-text is not built. |
| NFR-07 | **Performance:** capture and summary interactions remain usable on a mobile connection. | **Not measured** | Establish p50/p95 budgets for note acknowledgement, OCR draft, medication check, summary load, audio delivery, and provider timeout behavior before claiming performance. |
| NFR-08 | **Auditability:** safety-relevant outputs can be reproduced from input, source versions, rules, and configuration. | **Partial** | Verdict provenance and deterministic fallback help; provider/model versioning, user corrections, consent events, and delivery receipts need durable audit records. |

Until NFR-03 and NFR-04 are met, the public prototype may use only synthetic or
appropriately de-identified data and must not promise confidentiality for real
patient information.

---

## 8. Safety and privacy boundaries

### 8.1 Medication boundary

- Grounding recognizes names against loaded registry snapshots; it does not
  confirm that the physical product is what the name suggests.
- Unresolved items stay unresolved and are included in coverage statements.
- Rules generate selected safety signals and questions, not a comprehensive
  interaction review. Absence of a finding is not evidence of safety.
- The validator checks structural and lexical constraints; it is not a general
  semantic-entailment proof.
- Medication names, quotes, coverage, limits, and escalation must come from the
  verdict. Product-authored framing may add interface guidance and disclosed
  emotional tone, but no medication, health, exercise, diet, or adherence
  recommendation.
- The clinician or pharmacist remains responsible for interpretation and care
  decisions.

Current repository data coverage, retrieved 2026-07-28:

- 23,211 TFDA drug-license rows;
- 464 TFDA health-food registration rows, including 10 permits marked
  「本證失效」; 417 warning and 460 precaution entries are present in the
  snapshot;
- 8 implemented STOPP-derived rules out of 133 criteria, plus 3 selected
  health-food warning rules.

These counts describe the repository snapshot, not clinical completeness.

### 8.2 OCR boundary

- OCR transcribes visible printed evidence only.
- No confidence score may auto-approve a row.
- Every row requires human review; unreadable fields remain blank.
- The app must say “not stored by MedBuddy” separately from “processed by a
  third-party provider.” It must not imply that the image never left the
  device.
- No OCR draft reaches the longitudinal record until a caregiver explicitly
  confirms the medication list and runs the ordinary check.

### 8.3 Voice boundary

- Audio is optional; text is the canonical fallback.
- The interface identifies Serin audio as AI-generated and granddaughter-style
  rather than claiming it is a relative.
- A future familiar voice requires consent from both speaker and recipient,
  revocation, deletion, visible disclosure, and misuse prevention.
- Tone may be warm but must never claim the elder took or missed a dose, ask for
  compliance proof, solicit a health report that the product cannot represent,
  imitate a family member deceptively, or introduce health advice outside
  grounded content.

### 8.4 Information sharing and older-adult agency

The follow-up sheet labels caregiver observations as caregiver reports. A
future real deployment must let the care subject understand what is collected,
see what will be shared when appropriate, request correction, and revoke
sharing. Avoiding an embarrassing conversation is not sufficient consent to
create a hidden report about someone.

---

## 9. Metrics and evaluation plan

No target below has been achieved yet unless explicitly stated. Initial targets
are decision thresholds to validate, not reported results.

| Outcome | Initial metric | Proposed acceptance target |
| --- | --- | --- |
| Low-friction observation capture | Completion time and abandonment from opening 「記一件事」 to durable acknowledgement. | Median under 60 seconds and at least 90% task completion in a moderated caregiver study. |
| Fidelity | Percentage of stored observation text present verbatim in input; lost siblings from a multi-observation paragraph. | 100% verbatim containment and zero lost accepted observations in the evaluation set. |
| Longitudinal usefulness | Caregiver can find, correct, and select the relevant visit period. | At least 90% complete without facilitator help after correction/filter features exist. |
| Clinician scan | Time and accuracy finding changed medicines, unresolved items, and the highest-priority home observation. | At least 80% of clinicians find all three within 30 seconds; validate or revise the threshold with participants. |
| OCR safety | Invented-field rate, readable-name transcription accuracy, and human-confirmation bypasses. | Zero invented fields and zero path to persistence without explicit review; measure transcription accuracy on a consented Taiwanese bag set. |
| Reminder reliability | On-time and duplicate delivery rate. | At least 99% within ±2 minutes and zero duplicates in a staged reliability test before calling reminders production-ready. |
| Elder comprehension and trust | Correct paraphrase of what the message says, disclosure recognition, annoyance, and opt-out success. | Better than text-only or neutral-voice baseline without lower disclosure recognition; no cognitive-decline outcome claim. |
| Privacy readiness | Authentication, consent, retention/deletion, and subject-access review. | All completed before real identifiable health data is permitted. |

Evaluation sequence:

1. Five caregiver usability sessions on note capture, correction, and medication
   bag review.
2. Five clinician/pharmacist scan tests on realistic, de-identified summaries.
3. Older-adult comprehension and trust sessions comparing text, Serin AI audio,
   and a neutral voice.
4. Only after the above, a consented longitudinal pilot measuring continuity and
   correction—not memory decline.

---

## 10. Non-goals for the current product

- Diagnosing disease or providing medication, dose, diet, exercise, or
  treatment recommendations.
- Proving that an item is absent from a prescription record.
- Comprehensive drug–drug, drug–condition, or supplement interaction checking.
- Monitoring ingestion, scoring adherence, or asking the older adult to prove a
  dose was taken.
- Preventing or slowing memory decline.
- Impersonating an actual family member.
- Switching among multiple care subjects, facility rosters, or complex care
  teams.
- EHR integration, autonomous clinician messaging, or clinician account
  management.
- Use of real identifiable health data before authentication, consent,
  retention, and deletion requirements are met.
- Claiming an unaccompanied visit has the same outcome as an accompanied one.

---

## 11. Roadmap

### P0 — Make the primary wedge truthful and safe

1. Separate `ElderQuestion` from caregiver `Observation` and exclude sentinels
   from caregiver summary sections.
2. Rename summary source claims to “caregiver-declared non-prescription source.”
3. Fix OCR `rx` → `prescription`, make the ordinary reviewed OCR flow write its
   confirmed intake fields to the snapshot, and add an end-to-end test. The
   seed-only intake path is evidence of rendering, not of capture.
4. Make latest confirmed/check snapshot the single regimen source for
   「我的藥」, immediate send, reminders, and the follow-up sheet.
5. Replace the current warm projection with a verdict-preserving interface:
   retain unresolved items, coverage, limits, escalation and all recorded
   medicines; remove invented packet/meal mapping, name truncation without an
   identity check, warm-water guidance, and movement/health advice; validate
   and test the exact outbound text.
6. Add authentication to direct summary and write/share routes; define consent,
   retention, correction, deletion, and subject visibility.
7. Replace the once-daily demo trigger with a scheduler that can meet the stated
   delivery SLO, or label reminders as manual demo behavior.

### P1 — Validate and improve the handoff wedge

1. Capture event occurrence time separately from receipt time.
2. Add caregiver correction/deletion and visit-period selection.
3. Bound long summaries and design print behavior from clinician scan studies.
4. Evaluate note capture with caregivers and summary scan with clinicians or
   pharmacists; revise the information hierarchy from evidence.
5. Add delivery receipts, failure recovery, and operator-visible audit events.

### P2 — Voice and language research

1. Compare disclosed Serin AI audio, neutral audio, and text-only output.
2. Prototype familiar-voice cloning/calibration only with speaker and recipient
   consent, revocation, deletion, and anti-impersonation controls.
3. Evaluate Taiwanese and other low-resource languages with native speakers;
   preserve text fallback and uncertainty.

### P3 — Consented long-term continuity

1. Design an inspectable, attributable, correctable, exportable, and deletable
   memory layer.
2. Evaluate whether it improves continuity across visits without inferring
   cognitive status or making prevention claims.
3. Add multi-subject and multi-caregiver relationships only after authorization
   and consent semantics are defined.

---

## 12. Challenge rubric traceability

The repository does not contain the challenge's original prompt or scoring
rubric. This is a provisional mapping to the requirements paraphrased in the
earlier PRD; the original rubric must be attached before claiming complete
coverage.

| Paraphrased requirement | User job | Current implementation evidence | Status and limitation | Next acceptance evidence |
| --- | --- | --- | --- | --- |
| Voice/chat support | Older adult can receive or request a clear explanation; caregiver can record naturally. | Browser speech controls, LINE text flows, optional Fish Audio, Serin demo profile. | **Partial:** no LINE speech-to-text, no accessibility study, and Serin is not a family voice. | Supported-device matrix, elder comprehension/disclosure study, audio failure test. |
| Personalized medication purpose, timing, and interactions | Family understands the recorded medicines and knows what to ask a professional. | TFDA grounding, selected rules, role-specific narration, generic caregiver schedule. | **Partial:** timing is not medication-specific; rules are 8/133 STOPP plus 3 health-food signals, not comprehensive interactions. | Gold-set grounding/rule evaluation; no false completeness language; medication-specific timing only from confirmed printed evidence. |
| Structured medication, symptom, and adherence log | Caregiver can preserve home context across visits. | Snapshots, categorized observations, batch append, change diff. | **Partial:** no per-dose adherence event, occurrence time, correction/deletion, retention, or subject review. | End-to-end longitudinal task test and data lifecycle acceptance. |
| Physician-ready summary | Clinician can scan relevant context without installing an app. | Latest-check projection, changes, uncertainties, observations, source quotes, signed QR. | **Partial:** source and elder-question attribution bugs, unbounded length, no documented clinician-validation evidence in the repo, and direct route lacks auth. | Clinician scan study, print/length test, corrected labels/filtering, authenticated caregiver access. |

### Required submission evidence

For each rubric row, submission material must link:

```text
requirement → user job → current surface → automated/manual evidence
            → known limitation → next validation
```

Do not upgrade a status based on a script, screenshot, or mocked provider alone.
The status changes only when the stated acceptance condition is demonstrated.

---

## 13. The path to a broader chronic-care product

The roadmap above lists what must be fixed. This section answers the different
question the challenge asks: **what does this become if it works?**

### 13.1 What the wedge actually buys

Medication comprehension is not the product. It is the only reason a family
will maintain a record at all.

Every chronic-care product needs a truthful picture of what is happening
between appointments, and every one of them fails at the same place: **nobody
keeps it up to date.** Symptom diaries are abandoned in a fortnight. Adherence
apps ask a question people do not want to answer. The record decays, and a
decayed record is worse than none because it is trusted.

MedBuddy asks for the two things a family already does:

| Already happens | What the product takes from it |
| --- | --- |
| A caregiver worries out loud after a visit | A typed observation, in their own words |
| Somebody photographs a medication bag | A regimen with dispensing dates |

Neither is a new habit. That is the whole bet: **the log is a by-product of
something with its own reason to exist, so it stays current.** What accumulates
is a longitudinal record of a person's medicines and their family's
observations — which is the substrate every chronic-care feature below needs
and none of them can bootstrap on their own.

### 13.2 Three expansions the existing architecture already admits

Each is a new rule set or a new reader over the same verdict. None requires
changing what narration may say.

**1. Condition-specific rule sets.** The engine holds no medication knowledge —
it interprets shapes in versioned JSON (`src/lib/rules/engine.ts`). A
heart-failure rule set, a CKD dosing set, or a diabetes hypoglycaemia set is a
new file with the same shape and the same severity ceiling. What does *not*
change: severity can still only escalate to a pharmacist or a physician.

**2. More readers of the same record.** The clinician sheet is one projection
of `SubjectLog`. A discharge summary, a pharmacist reconciliation view, and a
home-care nurse handover are three more — same data, different ordering, and
the ordering is where the product knowledge lives (§12.6 of the TDD orders the
observation table by what changes a prescription, not by time).

**3. Institutional care.** `RoleBinding` already separates *who is holding the
phone* from *whose medicines these are*. A carer holding twelve residents is
twelve bindings, and the constraint that made the demo safe — a finding must
never attach to the wrong person — is the constraint that makes the facility
case possible rather than a rewrite.

### 13.3 What must be true before any of that

In order, and none of them optional:

1. **A real database.** Blob has no read-your-writes guarantee and it has
   already produced four distinct failures (TDD §8). `LogStore`, `RoleStore`
   and `ScheduleStore` exist so this is one file each.
2. **Authentication and consent semantics.** Today any caller with a subject id
   can read a summary. Retention, correction, deletion and subject visibility
   are undefined, and they are prerequisites for holding a real person's record
   rather than features to add later.
3. **Evaluated grounding.** 8 of 133 STOPP criteria and three health-food
   signals is a demonstration, not coverage. A gold set and a measured
   false-negative rate come before any claim of completeness — and before
   adding a second condition, because a rule set nobody measured is a rule set
   nobody can trust.

### 13.4 What this deliberately never becomes

- **Not a diagnostic.** Clinical judgement ends at the verdict object and the
  verdict only ever escalates to a human. Adding a condition adds rules, never
  conclusions.
- **Not an adherence enforcer.** The product does not ask whether he took
  anything, and it will not, at any scale. Shame closes the channel that every
  other feature depends on.
- **Not a memory system about a person's decline.** P3's continuity layer must
  be inspectable, attributable, correctable and deletable *by him*, or it is a
  file kept on someone rather than a record kept for them.
