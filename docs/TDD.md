# MedBuddy — Technical Design

Ping-Juei (Ray) Tsai · AI Fund Engineer in Residence Build Challenge

Run: `npm install && npm run dev` · Tests: `npm test` · All three: `npm run verify`
Live: https://medbuddy-app.vercel.app

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Vitest · deployed on Vercel.
96 tests. No database, no authentication, no external API calls at request time.

---

## 0. The shape, and the one rule that produces it

```
input (photo | text | speech)
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
delivery/    web today, LINE behind the same interface
```

> **Clinical judgement ends at the verdict object.**

Everything downstream is presentation. The verdict does carry register-derived
fields — ingredients, indications, a product's approved warning — because
narration has to be able to say what a medicine is for. What narration cannot do
is *look anything up*. It has no access to the registers or the rule sets, so it
cannot introduce a medicine, a criterion, or a warning the verdict did not
already contain.

That is what makes the model layer testable rather than reviewable: its input is
a fixed object, so its output can be asserted against that object.

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

**Current state: an accessible form, not a conversation.** Traditional Chinese,
17px base type chosen for presbyopia rather than density, one field, one button,
no jargon. There is no conversational turn and no speech in or out. Of the four
required behaviours this is the weakest, and calling it otherwise would be the
kind of overclaim §5 exists to catch.

### Why LINE, and why not a phone call

The elder this was designed around uses LINE daily and is comfortable holding to
record a voice message. He also **taps links without checking**, which is one of
the few concrete facts available about him and which rules out sending him any
link at all: a voice message has to be self-contained.

Delivery sits behind an interface (`src/lib/delivery/types.ts`) with two rules
that are enforced rather than documented: the adapter carries **no medical
logic**, and text is sent **verbatim** — an adapter that cannot send a message
as-is fails rather than alters it, because a medication explanation that arrives
altered is worse than one that does not arrive.

**Outbound cloned-voice calls were designed and rejected.** I have shipped
emotional voice cloning before, and it was the first thing I reached for.
Cloned family voices are the live fraud vector against older adults; a product
that teaches my father to trust my voice arriving by phone dismantles the
instinct protecting him. A LINE voice message from a family account is
different in kind — it uses a trust pattern that already exists rather than
minting a new one — and it is what the roadmap extends. A deceased relative's
voice, which is the most emotionally effective version, cannot be consented to
and is excluded permanently.

**Planned, cheap, not done:** browser `SpeechRecognition` (`zh-TW`) for input
and `speechSynthesis` for read-aloud. Roughly thirty lines, no external
dependency, no fraud surface — deferred behind persistence and this document.

---

## 3. Structured logs

**Not built. This is the honest gap**, and it is the keystone: it is a required
behaviour, and it is also what would make LINE and the web view the same record
rather than two products.

The model is designed (`docs/DATA-MODEL.md`) and the types it needs already
exist:

```
Subject           the person; conditions[] drive the drug-condition criteria
Carer
CareRelationship  many-to-many — two siblings splitting appointments,
                  one carer holding twelve residents across a shift
MedicationItem    inputText verbatim, source, resolved, ingredient, provenance
Observation       kind: symptom | self_medication | alcohol | missed_dose
                  reportedByCarerId — never the subject
RegimenSnapshot   change between consecutive snapshots is the signal
```

Two decisions in there matter more than the schema.

**Observations are reported by carers, never by the subject.** The product never
asks the older adult to confirm or deny anything, so a channel built on his
admissions would collect silence.

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

**Clinician:** one page — the complete list including what is not a
prescription, what changed since last time, what the family observed, and the
questions they want to ask. **Not built.**

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
violations are carried out rather than swallowed, because a template narrator
failing its own checks is a defect in this repository, not a runtime state.

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
`consult_physician`. There is no third, no "safe", no "no action needed", and a
test asserts no other value can appear on a finding.

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
reviewed. `npm test` runs 96 tests offline on a clean clone.

Layered:

- **Normalisation** — 15 tests. Matching is where a grounding system goes wrong
  quietly, so it was tested first.
- **Resolution** against a readable fixture, and again against all 23,211 real
  permits, where names collide and strengths repeat.
- **Rules** — the encoded criteria against the case the product came from, plus
  the boundaries: only two severities, every finding bound to a subject, an
  unknown predicate throws rather than passing silently, output is
  byte-identical across runs.
- **Narration** — the eight checks, each with an example that must be rejected,
  and the fallback across four verdict shapes × two audiences.

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

**Nothing is stored.** The check is stateless: a request produces a verdict and
returns it. No database, no accounts, no telemetry, no third-party calls at
request time — the registers are files in the repository, so a medication list
never leaves the process that received it.

All data in the repository is **synthetic**. The three seeded people are
constructed; no real patient data is present.

Health information does not reach a model today, because no model is wired up.
When one is, the boundary is already the right shape: the narrator receives the
verdict, which contains medicines and conditions — so that is the payload to
reason about, and it is the smallest one that could do the job.

For a real deployment the decisions are named rather than solved: audio
containing health information needs signed, short-lived URLs rather than public
ones; a LINE userId is an identifier and must not become the primary key; and
Taiwan's 個人資料保護法 treats medical data as sensitive, which constrains
retention and cross-border processing. None of that is implemented, and a
48-hour prototype claiming compliance would be the least credible thing in this
document.

---

## 9. Failure modes

| Failure | Behaviour |
| --- | --- |
| Item in no register | `no_match`, kept in the record, counted against coverage, named on screen |
| Name ambiguous | candidates offered, nothing chosen |
| Named but no ingredients | `matched_without_ingredients`; no rule runs against it |
| **Nothing identifiable at all** | `nothing_checkable` — distinct from "checked, no findings". Zero findings because nothing was recognised is not reassurance, and the surface must not render it as such |
| Rule set outside its age scope | skipped, with version and reason recorded |
| Model unreachable, slow, or unparseable | deterministic narration, marked as a fallback |
| Model output fails validation | discarded; violations reported alongside |
| **Fallback itself fails validation** | carried out in `fallbackViolations` — a defect here, not a runtime state |
| Unknown predicate in a rule file | **throws**; a shape the engine does not understand must not pass silently |
| Register or rule file missing | process fails at startup rather than serving unchecked answers |

The design bias throughout: **fail loudly, never silently, and never substitute
a comfortable answer for a missing one.** A medication explanation that does not
arrive is recoverable. A wrong one is not.

---

## 10. What I would do next, in order

1. **Persistence.** The missing requirement, and the keystone: it is what makes
   LINE and the web view one record instead of two products.
2. **The clinician page.** The output the whole product is pointed at.
3. **Speech in and out** in the browser — thirty lines, and it closes the
   weakest of the four required behaviours.
4. **Encode the rest of STOPP**, mechanical rather than conceptual, plus
   START — what is missing matters as much as what should not be there.
5. **Measure the false-positive rate**, because permissive matching without that
   number is a claim rather than a design.
