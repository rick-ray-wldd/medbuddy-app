# MedBuddy — Technical Design

Ping-Juei (Ray) Tsai · AI Fund Engineer in Residence Build Challenge

Run: `npm install && npm run dev` · Tests: `npm test` · All three: `npm run verify`
Live: https://medbuddy-app.vercel.app

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Vitest · deployed on Vercel.
Run `npm test` for the current exact test count. No authentication; Vercel Blob
is the demo persistence layer, while LINE, Anthropic medication-bag
transcription, Gemini observation extraction, and optional Fish Audio are
explicit external boundaries (§2, §8).

---

## Demo deployment contract — two phones, one subject

This is the authoritative scope for the review prototype:

```text
DemoCarePair
  subjectId           = subj-father (code constant; not environment-configurable)
  elderLineUserId     = LINE_DEMO_ELDER_USER_ID
  caregiverLineUserId = LINE_DEMO_CAREGIVER_USER_ID

RoleBinding(elderLineUserId)     -> elder     -> subjectId
RoleBinding(caregiverLineUserId) -> caregiver -> subjectId
```

`src/lib/delivery/line/demo-pair.ts` owns recipient resolution and the fixed
subject. A role-card postback is validated, persisted through `RoleStore`, and
links the corresponding per-user rich menu. When both account ids are
configured, the role claim is allowlisted and a third phone is rejected. The
legacy `LINE_ELDER_USER_ID` remains an elder-only migration fallback.

The browser has no subject selector. `/api/line/deliver`, clinician-summary QR
delivery, and all current rich-menu actions resolve through this same pair.
Legacy `reach_family` and caregiver-roster postback handlers do as well, though
neither is exposed by the current 2×2 menus.
The server-rendered web hub reads role-link states and log counts without
returning either opaque LINE User ID to the client. It is a read-only projection
of `RoleStore` and `LogStore`, not an independent clinical database.
Other synthetic subjects remain fixtures for grounding/rule tests; they are not
part of the public demo. Dynamic claims cannot safely allocate “the first elder
slot” through Vercel Blob because Blob is not transactional, so the two LINE
User IDs are deployment configuration rather than discovered by race-prone
first-write logic.

Out of scope: pairing codes, account administration, multi-elder switching,
multi-caregiver permissions, facility rosters, and clinician accounts. The
target many-to-many model remains in `docs/DATA-MODEL.md`.

---

## 0. The shape, and the one rule that produces it

```
input (typed text | browser dictation)
      │
      ▼
grounding/   resolve free text against the TFDA registers
      │      not knowing is a result, never a guess
      ▼
rules/       deterministic evaluation against versioned rule sets
      │      pure functions; no I/O, no model calls, no clock
      ▼
verdict/     the single object carrying every clinical judgement
      │
      ▼
narration/   translate a verdict into language — receives only the verdict
      │
      ▼
surfaces/    web renders API results; LINE sends through the Delivery adapter
```

The separate `/bag` route is a built, web-only transcription draft:

```text
photo → Claude vision transcription → evidence validator → review-only draft
                                                        ↛ LogStore
```

It deliberately has no write edge into grounding or the longitudinal log yet.
Caregiver confirmation/correction and promotion into the ordinary typed check
path, plus inbound LINE-image handling, remain future work. Browser dictation
only fills the same text input and does not bypass grounding or the rule engine.

> **Clinical judgement ends at the verdict object.**

Everything downstream is presentation. The verdict does carry register-derived
fields — ingredients, indications, a product's approved warning — because
narration has to be able to say what a medicine is for. What narration cannot do
is *look anything up*: it is handed a verdict and nothing else, so it cannot
fetch a criterion or a warning that was not already decided upstream.

Its input being a fixed object is what makes checking possible. **Checking is
not proof** — the checks in §5 are structural and lexical, and the section says
plainly where that stops.

**One inversion is deliberate and worth naming.** The narrator may not reach the
registers; the *validator* may, and must. Detecting an invented medicine
requires exactly the knowledge the narrator is denied, so it lives on the other
side of the seam (§5).

---

## 1. Medication-data grounding — the depth area

### Sources and licences

Licences were read before code was written, because they determine what can be
built rather than decorating it afterwards.

| Source | Size | Licence | Used |
| --- | --- | --- | --- |
| TFDA 全部藥品許可證 (data.gov.tw 9122) | 71,965 → **23,211** | 政府資料開放授權條款第1版 — commercial use permitted | ✅ |
| TFDA 健康食品 (data.gov.tw 6951) | 565 → **464** | same | ✅ |
| **STOPP v3** (O'Mahony 2023) | 133 criteria, **8 encoded** | **CC BY 4.0** — adaptation and commercial use with attribution | ✅ |
| PIM-Taiwan (Chang 2019) | 131 drugs + drug-disease table | **CC BY-NC 4.0** — no commercial use | ❌ deliberately |
| AGS Beers Criteria 2023 | — | All rights reserved; written permission required, **electronic redistribution barred** | ❌ cannot |

Beers is the criteria set most people would reach for. Its terms make it
unusable inside a product. STOPP was chosen because CC BY 4.0 permits exactly
what is needed.

The 133 STOPP criteria are in Appendix 1 of the supplementary information, not
in the paper. The paper quotes only three criteria — **and those three are the
ones the Delphi panel rejected**, so encoding them would have been an error.
PMC blocks direct binary fetches; Springer's static-content URL serves the PDF.

### Ingest

`scripts/ingest-tfda.mts`, run occasionally, never at build or request time.
The derived tables are committed, so a clean clone needs no network and any
change to what counts as a known medicine arrives as a reviewable diff.

Filtering: revoked permits removed (45,668 of them — two thirds of the file);
raw materials removed (3,086) because they never reach a patient as-is.
154 kept products carry no stated ingredients and are **kept, not dropped** — a
medicine we can name but cannot compose is precisely what has to be surfaced.

The endpoint is named `.../json` and serves a ZIP for the larger set, so the
reader sniffs the magic bytes rather than trusting the URL.

### Matching

Normalisation folds the differences between a printed bag and a register entry:
full-width digits, manufacturer quoting, 毫克/mg/公絲. It deliberately keeps
strengths distinct — a normaliser that collapsed 5 mg and 50 mg would be
actively dangerous, and a test holds that.

Three ways of not knowing, kept separate because they need different responses:

| Result | Meaning | What the surface does |
| --- | --- | --- |
| `no_match` | in neither register | ask the person |
| `ambiguous` | candidates differ in composition | offer the candidates |
| `matched_without_ingredients` | named but not composed | say so; no rule can run |

**Ambiguity is judged on composition, not paperwork.** The same product is often
registered under several permits — renewals, a second site — with identical
ingredients. Refusing to name a medicine over a licence number is pedantry
dressed as caution.

**Substring matching is asymmetric between the registers, and this was a bug
found in review.** Reverse matching — the input containing a register name —
let 新理眠錠 become 理眠錠 (NITRAZEPAM) and fabricate a benzodiazepine finding
carrying a real permit and a verbatim criterion. 1,252 registered names are four
characters or fewer and 169 sit inside a rule class.

Reverse matching is now confined to health foods:

- **Medicine names are copied off a printed bag**, so reverse matching buys
  little and costs a fabricated prescription finding.
- **A supplement is described from memory** — 「鄰居給的紅麴膠囊」 — the register
  is 464 products rather than 23,211, and none of them is a prescription
  medicine.

---

## 2. Voice and chat architecture

**Browser speech in and out.** `SpeechRecognition` (`zh-TW`) behind a
hold-to-talk button — holding rather than toggling because it is the gesture
already used to send a LINE voice message, so the person this was designed
around performs it without being taught. `speechSynthesis` reads the narration
back at 0.85 rate. MedBuddy makes no server-side speech-recognition request and
requires no application key for these browser APIs. Their availability,
processing location, and offline behaviour are browser/vendor dependent, so
offline recognition is not guaranteed. A browser without support shows no
button rather than a dead one.

The caregiver web dashboard has no adherence control for the elder. In LINE, a
bound elder may type a medicine name; the inbound seam grounds it, builds a
verdict, narrates for the elder audience, records the question, and replies.
Inbound LINE audio is downloaded transiently by the webhook, but the handler
logs message metadata only and discards the bytes. There is no persistence or
STT path, so it is not answered. This is an explicit failure boundary rather
than a substitute guess.

The register records dosing text, and **timing is not carried into the item
model** — so "explains purpose, timing and interactions" is true of purpose and
interactions, and not yet of timing.

### A caregiver's own voice, and why it is opt-in

A familiar voice is the difference between a technology-averse older adult
opening this and ignoring it, so cloning is built: `FishVoiceProvider`
registers a **private** model from samples the caregiver records, then
synthesises against it. The request shapes follow the ones already in
production in my own app.

The calibration helper enforces three constraints: a consent statement is
required, Fish model creation is always `visibility: private`, and a provider
response without a model id fails. There is no user-facing calibration or voice
registration flow in this build.

The demo outbound route can receive a `voiceId` or read
`MEDBUDDY_DEMO_VOICE_ID`, but a request-supplied id must match the server-side
demo voice catalogue; an unregistered id is rejected with HTTP 400. The only
committed entry is the consented Serin demo profile. Serin is a stand-in, not
the father's family member, and there is no user-facing registration flow.

Fish Audio is one of several explicit external boundaries described in §8. It
is opt-in through both a voice id and `FISH_AUDIO_API_KEY`; without them the
outbound path sends text only. A test asserts that without a key no Fish request
is made.

### Why LINE, and why not a phone call

The elder this was designed around uses LINE daily and is comfortable holding to
record a voice message. He also **taps links without checking**, which is one of
the few concrete facts available about him and which rules out sending him any
link at all: a voice message has to be self-contained.

LINE delivery sits behind an interface (`src/lib/delivery/types.ts`) carrying two
rules: the adapter holds **no medical logic**, and text is sent **verbatim** —
an adapter that cannot send a message as-is must fail rather than alter it.
The browser does not use that transport adapter: it renders the check API's
verdict/narration directly. Both surfaces still share the same grounding,
rules, verdict, narration, and `LogStore` layers.

**The LINE adapter exists** (`src/lib/delivery/line/**`), written by a
collaborator to `docs/LINE-ADAPTER-SPEC.md`. The spec fixed a path boundary so
authorship stays unambiguous, and it held: the merge touches nothing in
`grounding`, `rules`, `verdict` or `narration`. It implements signature
verification, idempotency, verbatim delivery, and the refusal to send a link to
an older adult.

The interface itself still cannot *prevent* an adapter from rewriting a string
— that is what review is for. What it does is make the obligation explicit and
testable, and `containsLink` is exported so the one mechanical check does not
have to be reinvented per adapter.

**Outbound cloned-voice calls were designed and rejected.** I have shipped
emotional voice cloning before, and it was the first thing I reached for.
Cloned family voices are the live fraud vector against older adults; a product
that teaches my father to trust my voice arriving by phone dismantles the
instinct protecting him. A LINE voice message from a family account is
different in kind — it uses a trust pattern that already exists rather than
minting a new one — and it is what the roadmap extends. A deceased relative's
voice, which is the most emotionally effective version, cannot be consented to
and is excluded permanently.

**Built:** browser `SpeechRecognition` (`zh-TW`) for hold-to-talk input and
`speechSynthesis` for read-aloud at a slower rate. Unsupported browsers hide the
control instead of showing a dead button. The web medication-bag transcription
draft is built; its confirmation-to-log handoff, LINE image intake, LINE voice
STT, and general natural-language question understanding remain future work.

---

## 3. Structured logs

**Built.** Each `/api/check` invocation builds one verdict, returns both
caregiver and elder narration projections, and appends exactly one snapshot.
The client switches between those already-returned projections locally, so a
tab change does not write history again. Observations are recorded in the
carer's words; the change between consecutive snapshots is computed rather than
stored. `LogStore` selects `BlobLogStore` whenever
`BLOB_READ_WRITE_TOKEN` exists, including local development, and otherwise
falls back to `InMemoryLogStore`.

Blob makes browser and LINE survive serverless process boundaries, but it is a
whole-document read-modify-write store: two concurrent writers can clobber one
another. That is acceptable only for the sequential one-family demo. Replacing
it with transactional Postgres stays behind the same interface.

`Carer` and many-to-many `CareRelationship` remain target-model concepts. This
demo instead persists two `RoleBinding` records pointing to one subject. Every
finding still names that subject.

The shape:

```
Subject           the person; conditions[] drive the drug-condition criteria
Carer
CareRelationship  many-to-many — two siblings splitting appointments,
                  one carer holding twelve residents across a shift
MedicationItem    inputText verbatim, source (including unknown), resolved,
                  ingredient, provenance
Observation       kind: symptom | self_medication | alcohol | missed_dose | other
                  reportedByCarerId — never the subject
RegimenSnapshot   change between consecutive snapshots is the signal
```

Two decisions in there matter more than the schema.

**Observations are reported by carers, never by the subject.** The product never
asks the older adult to confirm or deny anything, so a channel built on his
admissions would collect silence.

The current LINE implementation stores an elder's typed medicine-name question
in the same observation collection as `kind: "other"` with the sentinel
`reportedByCarerId: "elder-asked"`. This is a demo storage shortcut so the
caregiver can retrieve recent questions; it is not a claim that the elder made
an observation. A future schema should give questions their own entity.

**The signal is the change, not the state.** What a department added, what
quietly stopped, what nobody restarted after discharge. A single snapshot
answers "what is he taking"; the diff answers "what happened".

---

## 4. Summary generation

One verdict, three projections. `src/lib/narration/` produces segments tagged
`verified` / `explained` / `action` / `coverage`, and the surface renders them
differently — quoted text is set apart, labelled 原文引用 · 未經改寫, and
carries its attribution.

**Caregiver:** findings, the quoted source, the stated limit, coverage,
provenance. **Built.**

**Elder:** what each medicine is for, in the register's own words. Tests assert
his view contains no question mark and never mentions a missed dose. **Built.**

**Clinician:** `/summary/[subjectId]` — one page, leading with the count of
items absent from the prescription record, then the family's questions with the
source quoted whole, then everything being taken grouped by where it came from,
what could not be identified, the change since last time, and what the family
observed. **Built.**

It carries information, never a recommendation. The product does not tell a
physician what to prescribe, for the same reason it does not tell a family to
stop a medicine.

---

## 5. Safety boundaries, and how they are enforced

Eight deterministic checks run over every narration before anyone sees it. No
model judges another model.

| Rejected | Why |
| --- | --- |
| names a medicine the verdict does not contain | invention, the central risk |
| names a clinical outcome, or asserts certainty, in our own words | such a claim belongs in quoted text, where it must match a source |
| **names a medicine the registers know but this verdict lacks** | the same risk in unmarked prose |
| alters text marked as quoted | a paraphrased criterion is no longer the criterion |
| hides that items could not be identified | findings without coverage read as a complete picture |
| states a dose | the record holds what is present, not how much |
| tells someone to stop, halve or swap | a prescriber's decision |
| asserts what the person did | writes itself into a reconstructive memory |
| raises a finding with nowhere to take it | must end at a human |
| never says whose medicines these are | a carer may hold twelve people |

**A narration that fails is not shown.** The deterministic narrator is used
instead, and *it is validated too* — the fallback is not an error path, it is
what makes using a model here defensible. If the fallback itself fails, the
violations are returned by the API rather than swallowed, because a template
narrator failing its own checks is a defect in this repository, not a runtime
state.

### What these checks do not do

They are **structural and lexical, not semantic.** They cannot establish that an
arbitrary sentence is entailed by the verdict, and a review proved it: against an
empty verdict, 「父親吃這些藥一定會腎衰竭。」 once returned ok. That specific
shape is rejected now — naming a clinical outcome or asserting certainty in our
own words is a violation — but the general property does not hold for free prose,
and claiming otherwise would be the overclaim this section exists to catch.

Two things make the gap tolerable rather than fatal. The narrator shipping today
is assembled from verdict fields, so for it the property holds by construction.
And a model narrator, when one is wired, belongs behind a slot-filling contract
rather than free generation — that is where this ends, not a longer regex.

Two of these checks were opened by review with working exploits, and both are
worth stating because they are the kind of thing that hides:

- **Fluent prose was unchecked.** Validation looked at quoted segments and at
  【】-marked names and nothing else, so a verdict holding only paracetamol
  accepted a sentence about aspirin and a bleeding risk nobody had evaluated.
  Fixed by giving the validator the register index — the inversion in §0. The
  test keeps the exploit and asserts both halves: unguarded it passes, guarded
  it fails.
- **The dose check rejected the regulator's own words.** STOPP E4 reads
  *"NSAID's if eGFR < 50 ml/min/1.73m2"*; a faithful quote contains "50 ml".
  The dose, change and past-behaviour checks now police what we wrote, not what
  we quoted — quoted segments already face the stronger requirement of appearing
  in the verdict character for character.

---

## 6. Escalation

`Severity` is an enumeration of exactly two values: `consult_pharmacist` and
`consult_physician`. There is no third, no "safe", no "no action needed".

That was a type and a test over one fixture until a review showed the difference:
a rule *file* declaring `severity: "stop_now"` was copied onto a finding and out
to the surface. Rule sets are data, and data arriving from a file is where a type
stops helping. `assertRuleSetIsSafe` now runs over every rule set on evaluation
and **throws** rather than filtering — a rule set we do not understand must not
be partially applied, because half a safety check looks like a whole one.

Every finding carries the rule's `limits` — what this encoding cannot know —
and the limit is rendered next to the finding rather than kept in
documentation. STOPP L6 is conditional on 3 g of paracetamol per day; the
product cannot observe dose, so the finding says so.

Where a rule set does not apply, it is **skipped and the skip is reported with
its version**: criteria written for people aged 65 and over say nothing about a
40-year-old, and applying them anyway would produce findings the source does not
support.

---

## 7. Evaluation

**No LLM-as-judge anywhere.** Every check is a deterministic comparison against
the verdict, which is why the whole clinical layer can be asserted rather than
reviewed. `npm test` runs offline on a clean clone (after `npm install`); its
output is the source of truth for the count while the suite is changing.

Layered:

- **Normalisation** — 14 tests. Matching is where a grounding system goes wrong
  quietly, so it was tested first.
- **Resolution** against a readable fixture, and again against all 23,211 real
  permits, where names collide and strengths repeat.
- **Rules** — the encoded criteria against the case the product came from, plus
  the boundaries: only two severities, every finding bound to a subject, an
  unknown predicate throws rather than passing silently, output is
  byte-identical across runs.
- **Narration** — the checks, each with an example that must be rejected, and
  the fallback across four verdict shapes × two audiences.
- **Voice** — that no Fish request is made without a key, that the calibration
  helper requires a consent statement and creates private models, and that the
  outbound API rejects an unregistered request `voiceId` with HTTP 400.
- **LINE adapter** — signature verification, idempotency, verbatim delivery,
  refusal to send a link to an older adult, fixed demo-pair role claims,
  caregiver routing, and QR image payloads. Network calls are mocked so the
  suite runs offline.
- **Medication-bag transcription** — request size/type gates, tool-shaped
  provider output, evidence/value agreement, rejected-field blanking, and the
  always-review draft contract. The optional live photo test is skipped unless
  both a key and an explicit image path are supplied.

### What the tests did not catch, and what that changed

Three failures in this build came from testing, and each changed the design:

1. **A green suite on a broken `tsc`.** Vitest transpiles without typechecking,
   so 37 passing tests sat on top of a type error that shipped. Added
   `npm run verify` = typecheck && test && build, so the three checks are one
   command rather than three I can half-run.
2. **A test named for two audiences that only ever ran one.** `it.each` over
   caregiver and elder, both building the same verdict — so the elder branch
   that skipped coverage disclosure was never reached. Replaced by an
   enumeration of four verdict shapes.
3. **A test whose assumption was wrong, not the code.** I asserted that
   「鄰居給的紅麴膠囊」 would not resolve. It does: 紅麴 is a licensed health
   food, 54 are registered, and the warning the regulator approved for them says
   people with liver disease should not take them. That failure produced the
   second rule source.

**Not measured, and it should be:** false-positive rate at scale. Matching is
deliberately permissive, and alert fatigue is what kills clinical decision
support.

---

## 8. Privacy

The grounding registers and rules are local committed files. In a configured
demo deployment, health-related data can cross five explicit boundaries:

- medication snapshots, observations, role bindings, audio, and QR assets are
  stored in the deployment's Vercel Blob store;
- LINE receives text, optional audio, and QR images addressed to the two fixed
  demo accounts;
- Gemini receives a caregiver paragraph only when `GEMINI_API_KEY` is set, and
  its segmentation is checked as verbatim substrings before storage;
- Anthropic receives the selected medication-bag image only when
  `ANTHROPIC_API_KEY` is set. MedBuddy does not persist the image or provider
  response, and excludes patient-identifying text from its output shape, but
  the original photo can still contain identifiers visible to the provider;
  this demo therefore requires synthetic/de-identified photos and explicit
  review;
- Fish Audio receives narration only when a registered voice profile and key
  are configured. The committed Serin demo profile includes the repository's
  consent record; an unregistered request id is rejected. Browser speech uses
  browser APIs and MedBuddy sends it to no server of its own.

Without the relevant key, that provider is not called and the code takes a
deterministic/local fallback. The prototype has no user-facing consent or
retention administration, so it must use synthetic demo data and must not be
presented as production compliant.

**No real patient data is in this repository.** The three seeded people are
constructed. The registers and the criteria are real, and deliberately so —
they are public regulatory data and a CC BY paper, not anybody's record.

The narration boundary remains narrow: a narrator receives a verdict rather
than unrestricted register or log access. Observation extraction is a separate
span-classification boundary and cannot add text that was absent from the
caregiver's input.

LINE audio output already uses private Blob objects behind HMAC-signed,
short-lived URLs. What remains unsolved for a real deployment is broader: user
authentication and authorization, transactional data access, consent and
retention administration, deletion/audit workflows, and review of cross-border
processing. A LINE userId is an identifier and must not become the clinical
record's primary key. Taiwan's 個人資料保護法 treats medical data as sensitive;
this prototype does not claim production compliance.

---

## 9. Failure modes

| Failure | Behaviour |
| --- | --- |
| Item in no register | `no_match`, kept in the record, counted against coverage, named on screen |
| Name ambiguous | candidates offered, nothing chosen |
| Named but no ingredients | `matched_without_ingredients`; no rule runs against it |
| **Nothing identifiable at all** | `nothing_checkable` — distinct from "checked, no findings". Zero findings because nothing was recognised is not reassurance, and the surface must not render it as such |
| Rule set outside its age scope | skipped, with version and reason recorded |
| Model unreachable or unparseable | deterministic narration, marked as a fallback |
| **Model that never answers** | 8-second timeout, then the same fallback. `await` on a hanging promise is not slow, it is forever |
| Model output fails validation | discarded; `narrationRejected` returned by the API alongside the narration that replaced it |
| **Fallback itself fails validation** | returned in `fallbackViolations` — a defect here, not a runtime state |
| Rule set declaring a severity that is not an escalation | **throws** when the set is evaluated; rule files are data, and a type does not check data |
| Unknown predicate in a rule file | **throws**; a shape the engine does not understand must not pass silently |
| Register or rule file missing | throws on first use rather than serving unchecked answers — the read is lazy, so this is the first request, not process start |

The design bias throughout: **fail loudly, never silently, and never substitute
a comfortable answer for a missing one.** A medication explanation that does not
arrive is recoverable. A wrong one is not.

---

## 10. What I would do next, in order

1. **Authentication and operator-grade pairing.** Replace the fixed two-phone
   allowlist with verified accounts, explicit relationships, and recovery.
2. **Transactional persistence and lifecycle controls.** Move beyond Blob
   read-modify-write and add retention, deletion, and audit workflows.
3. **Complete the input gaps.** Add LINE voice STT and finish the medication-bag
   draft handoff: correction, explicit confirmation, grounding, and only then a
   log write. Add inbound LINE-image acquisition without moving OCR into the
   transport adapter.
4. **Carry timing and dose into the model.** Only then can reminders or
   before/after-meal answers be implemented without inventing a schedule.
5. **Encode more licensed criteria and measure false-positive rate at scale.**
   Permissive matching without that number is a claim rather than a design.
