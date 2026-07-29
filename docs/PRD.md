# MedBuddy — Product Requirements

**Medication comprehension and care-team handoffs for older adults on several medications.**

Ping-Juei (Ray) Tsai · AI Fund Engineer in Residence Build Challenge · 48 hours

Live: https://medbuddy-app.vercel.app · Source: this repository · Tests: `npm test`

---

## 0. Current demo contract (July 29, 2026)

The review demo deliberately narrows the relationship model to one care pair:

| Demo participant | Device | Role selection | Record used |
| --- | --- | --- | --- |
| Older adult | LINE phone A | taps **我是長輩** once | `subj-father` |
| Caregiver | LINE phone B | taps **我是照顧者** once | the same `subj-father` |
| Clinician | no account | scans or opens the reviewable summary | the same `subj-father` |

The selected role is persisted as a `RoleBinding`, and LINE links the matching
per-user rich menu. The web dashboard is the caregiver workspace and exposes no
subject switcher. The two deployment recipients are configured as
`LINE_DEMO_ELDER_USER_ID` and `LINE_DEMO_CAREGIVER_USER_ID`; when both are set,
a third LINE account cannot claim either role.

The web hub status is a read-only projection of that same pair and shared log;
it exposes link states and activity counts, never the opaque LINE User IDs, and
is not a separate clinical database. One `/api/check` request appends exactly
one snapshot and returns both caregiver and elder narrations, so changing the
preview tab does not write another history entry.

This is a scope decision, not a claim that caregiving is one-to-one. Multi-elder,
multi-caregiver, facility rosters, self-service pairing, and role administration
remain the target model after the challenge. They are intentionally excluded
from the prototype so the evaluator can follow one medication record across two
phones, the web dashboard, and the clinician handoff without hidden switching.

---

## 1. Where this comes from

My father has impaired liver function. I go with him to his follow-up
appointments — about three hours of waiting for a few minutes in the room, and
I am in the room.

When the doctor asks how he has been, he says *"還好，都差不多"* — fine, about
the same.

I am the one who says he sometimes misses a dose. That when his back or
shoulder keeps him up at night he takes a painkiller from the cupboard at home,
usually an anti-inflammatory, from a stock nobody is counting — a stock that
also holds whatever was left from previous prescriptions, kept in case it is
useful next time. That he has been drinking more lately.

He does not get angry when I say these things. He goes quiet, looks a little
embarrassed, and does not quite confirm them.

**None of those three things is in any record the doctor can see.** Not in the
prescription history, not in the pharmacy system, not in the chart. They enter
the room only because someone who lives with him is standing there.

He cannot bring that person to every appointment. And that person should not
have to recite his father's shortfalls in front of him.

> I have not tracked what the doctor did with that information, so this document
> does not claim an outcome. The claim is the gap itself, and the gap does not
> need an outcome to be real: if I do not say it, nobody says it.

### What the product is, in one line

**Make every appointment as good as an accompanied one.**

---

## 2. Why comprehension and handoffs, and not reminders

### Reminders solve the smallest part of the problem

In my own family, reminders are not the bottleneck. My father usually takes his
prescriptions on time. I am the reminder mechanism, and I am unreliable — I do
it when I remember — and it still mostly works.

What does not work is that nobody knows what is in the cupboard, nobody records
the self-medication, and none of it reaches the doctor.

Non-adherence has many causes and forgetting is only one: not understanding why
a medicine is being taken, stopping it after a side effect and telling nobody,
believing that too many medicines damage the liver or kidneys and quietly
halving them, two departments prescribing overlapping things. A reminder
addresses the first cause and is blind to the rest.

### Coordination is the larger half, and the word the brief uses is *handoff*

A Taiwanese older adult with several conditions is typically seen by
cardiology, endocrinology, orthopaedics, perhaps a traditional Chinese medicine
practitioner, plus a community pharmacy, plus whatever a neighbour recommended.

**The complete list does not exist anywhere.** Not in one department's records,
not in the pharmacy's, and certainly not for the supplements. Building the first
place it exists is the wedge.

An accompanied appointment is a handoff. So is a shift change in a care
facility. The product is the same engine in both.

### The blind spot has a shape, and it is legally defined

Prescriptions are visible. Everything else is not:

| What a person takes | Who can see it |
| --- | --- |
| Prescriptions | The prescriber, and the national record |
| Bought over the counter | Nobody |
| Left over from an earlier course | Nobody |
| Licensed health foods (健康食品) | Nobody, but they are at least registered |
| Ordinary supplements | Nobody, and no register exists |

In Taiwan, **健康食品 is a legal category**, not a synonym for supplement. A
product carries the label only after review. 464 are registered. The fish oil
someone buys at a warehouse store is ordinary food and appears in no register at
all.

That is why the blind spot persists, and it is why the product must be able to
say *"I could not identify this"* rather than presenting a tidy list.

---

## 3. The three workflows

One record, three role-scoped projections. The **current demo** is exactly one
older adult and one caregiver attached to `subj-father`; both LINE phones and
the web dashboard read and write that record. The broader many-to-many model —
two siblings splitting appointments, a facility carer responsible for twelve
residents, or one person caring for both parents — remains documented in
`docs/DATA-MODEL.md` as the post-demo target. Every finding still carries its
subject, and nothing renders without the name.

### 3.1 The caregiver — the first user, and the one who pays

The adult child is the buyer because they are the one who is already doing this
work, badly, in their head.

| What they do today | In MedBuddy |
| --- | --- |
| Keep the list in their head | Type or dictate what is on the living-room table |
| Notice things and forget them | Record an observation when it happens |
| Realise at the appointment they cannot remember | Bring one page |
| Say the difficult parts out loud in front of their parent | Hand over a sheet |

**Built:** a fixed-subject medical dashboard, free-text intake with a source per line
(prescription / over the counter / leftover / supplement), the check, findings
with the quoted source and its stated limits, coverage, provenance.

**Built as a safe draft, not as a medication record:** `/bag` lets the caregiver
take or select a medication-bag photo. Claude Sonnet transcribes visible fields
with an evidence quote and explicit missing/partial/conflicting states; a local
validator blanks unsupported claims. The image and draft are not persisted.
The caregiver LINE `紀錄用藥` action links to this page on the deployment that
received the webhook.

**Not built:** correction/confirmation that promotes that draft into the typed
medication list or longitudinal log, and OCR from an inbound LINE image. Until
that handoff exists, formal medication checks still start from typed text or
browser dictation and require a stated source.

### 3.2 The older adult — speaks to ask, never to answer

This is the constraint the whole elder-facing design turns on.

When a shortfall is raised with my father he does not get angry; he goes quiet
and looks embarrassed. Embarrassment, not forgetfulness, is what closes that
channel. A product that asks *"did you take it today?"* collects silence, and
teaches him that opening it costs something.

So he is **never asked to confirm or deny anything**. He asks; asking costs
nothing. What he gets back is what a medicine is for, in the register's own
words, in large type.

**Built:** the elder projection, with tests asserting it contains no question
mark and never mentions a missed dose. Coverage is disclosed to him as well —
*"there is one I could not identify"* is the system admitting its own limit, not
asking him to admit anything.

**Built:** browser hold-to-talk for medication intake and on-device read-aloud;
in LINE, a bound elder can type a medicine name and receive a grounded elder
narration. The elder rich menu contains no adherence confirmation control.

**Not built:** speech-to-text for an inbound LINE voice message. The webhook
downloads the audio bytes, logs message metadata only, and then discards the
bytes; it deliberately sends no answer rather than guessing.

### 3.3 The clinician — a page, not a channel

**The clinician is deliberately not a participant.** A hospital outpatient
doctor in Taiwan sees forty to sixty patients in a session at roughly three
minutes each, has no route to adopting a consumer channel per patient, and
would inherit a support burden by being reachable. Any design that requires the
physician to install something does not happen.

The brief asks for a summary that is *clinician-reviewable*. A single page
satisfies that without requiring anyone to install anything, and it can be
handed over by the family, which is the only distribution channel that actually
exists.

There is a second reason, and it came out of the interview rather than the
market. When the son says out loud, in front of his father, that doses get
missed and the drinking has increased, the father goes quiet. **A sheet delivers
the same information without staging that moment.**

**Built.** `/summary/[subjectId]` — it leads with the count of items absent
from the prescription record, then the family's questions with the source
quoted whole, then everything being taken grouped by where it came from, what
could not be identified, the change since last time, and what the family
observed. No recommendation anywhere on it.

---

## 4. What makes the answers trustworthy

The depth area is **medication-data grounding**, and the argument is that the
product never says anything a regulator or a published criterion did not.

- **23,211 dispensable medicines** from the Taiwan FDA permit register, with
  ingredients parsed and indications quoted. 71,965 records filtered down:
  revoked permits and raw materials removed.
- **464 licensed health foods**. 417 carry approved 警語 text and 460 carry
  注意事項; the fields are optional in the register and are treated as optional
  in code.
- **STOPP version 3** (O'Mahony et al. 2023, CC BY 4.0), 8 criteria encoded of
  133, each quoted word for word.
- Both registers and both rule sets are **committed to this repository**, so a
  change to what the product considers risky arrives as a reviewable diff, and a
  reviewer needs no network access to run it.

Three properties do most of the work:

1. **Clinical judgement ends at the verdict object.** Narration cannot look
   anything up, and what it writes is checked before anyone sees it: it may not
   name a medicine outside the verdict, alter quoted text, hide incomplete
   coverage, state a dose, instruct a change, assert what the person did, or
   name a clinical outcome in its own words. Those checks are structural and
   lexical, **not semantic** — see TDD §5 for what that does and does not
   buy.
2. **Not knowing is a result.** Three distinct kinds: nothing matched, the name
   is ambiguous, or the product is named but its composition is not recorded.
   Coverage travels with the findings everywhere they appear.
3. **The product never decides.** Severity is an enumeration of two values —
   consult a pharmacist, consult a physician — and there is a test asserting no
   third value can appear.

### The line the product will not cross

It raises questions. It does not answer them.

- No dose is ever stated, because the record holds what is present, not how much
  is taken.
- Nothing is ever stopped, halved or swapped; that is a prescriber's decision.
- No claim is made about what the person did. *"You missed it yesterday"* writes
  itself into a memory that is already reconstructive.
- A stated limit travels on every finding. STOPP L6 is conditional on 3 g per
  day, which cannot be observed, so it is raised as a question about dose rather
  than as a determination.

---

## 5. Honestly, what is not built

| Required by the brief | State |
| --- | --- |
| Voice-friendly **or highly accessible chat** interaction | **Partial but runnable.** Browser hold-to-talk and read-aloud are built; a LINE elder can type one medicine name and receive a grounded explanation. A caregiver can open a web medication-bag transcription draft from LINE. General natural-language questions and LINE voice STT are not built; inbound audio is discarded after metadata logging and receives no guessed answer. |
| Explains purpose, timing and interactions with grounded data and clear limits | **Purpose and interactions built; timing is not.** The register's dosing text is not carried into the item model. This is still the strongest of the four. |
| Structured medication / symptom / adherence log over time | **Built for the demo.** Snapshots and observations use Vercel Blob whenever `BLOB_READ_WRITE_TOKEN` is configured, including local development; otherwise they fall back to process memory. Blob is adequate for one sequential care pair, not concurrent facility writes; Postgres is the production migration. |
| Clinician- or caregiver-reviewable summary, escalating rather than deciding | **Built.** `/summary/[subjectId]` renders the page a family hands over; escalation is a two-value enumeration checked when rule sets load. |

The LINE delivery adapter is **implemented and offline-tested**
(`src/lib/delivery/line/**`): webhook signature verification, deduplication,
role binding, per-user rich menus, elder medicine-name messages, caregiver
observations, caregiver-initiated elder delivery, optional signed audio, and
clinician-summary QR image payloads. Browser and LINE write to the same
`LogStore`. These are code-level, offline-tested capabilities; production LINE
delivery still depends on the deployment variables and live channel setup.

What remains before a real rollout is authentication, transactional persistence,
consent/retention policy, STT for LINE voice input, and an operator-grade pairing
flow. Vercel Blob deliberately supports only this sequential two-phone demo;
concurrent writes and cross-instance role consistency require a database.

---

## 6. Path to a broader chronic-care product

**Widen what is captured, then who reads it.**

1. **Medication → symptom → measurement.** The log already has the shape for an
   observation with a time and a kind. Blood pressure and glucose readings are
   the same record with a value attached, and they make the drug-condition
   criteria — several of which are currently unfirable because they need a
   number nobody has entered — actually reachable.
2. **One appointment → a course of care.** Once regimen snapshots accumulate,
   the interesting object is the change between them: what a department added,
   what quietly stopped, what nobody restarted after discharge. Hospital
   discharge is the highest-risk handoff in the whole system and the one where a
   family is least equipped.
3. **Family → facility.** The engine transfers. What does not transfer is the
   potential familiar-voice advantage: a consenting caregiver's voice may help
   a technology-averse older adult engage, while a facility has no equivalent
   family relationship. The current demo's optional Serin voice is only a
   consented stand-in, not the elder's relative. Facility value is continuity
   across shifts and a defensible record — a different pitch, a different
   buyer, the same rules and registers underneath.
4. **Taiwan → elsewhere.** Rule sets are files, and the engine interprets
   shapes rather than holding medication knowledge, so a new criteria set is a
   new file. A new *register* is more than that: the two TFDA shapes are typed
   and the two rule files are named in `registry.ts`, so a second country needs
   a register adapter as well. Smaller than a rewrite, larger than a file.

---

## 7. Risks

**PIM-Taiwan is CC BY-NC.** The Taiwanese criteria are the strongest local
signal available and their licence forbids commercial use. This build does not
include them for that reason. A company would need a licence from the authors —
who are at NTU, which is at least a path.

**Beers is not usable as-is.** The American Geriatrics Society requires written
permission and its terms bar electronic redistribution. STOPP was chosen partly
because CC BY 4.0 permits adaptation and commercial use with attribution. That
choice was made by reading the licences, not by reputation.

**Permissive matching over-raises.** A false positive costs a question to a
pharmacist; a false negative costs a missed harm. The bias is deliberate, and it
is stated on the findings rather than hidden — but at scale, alert fatigue is
the failure mode that kills clinical decision support, and the honest answer is
that this needs measurement the build has not done.

**Coverage is the real limit, not correctness.** The check is only as good as
what it can identify, and the items it cannot are disproportionately the ones
that matter — unlicensed supplements are exactly the invisible category. The
product is built to say so rather than to look complete.

**Physician adoption is assumed, not tested.** The one-page handover is designed
around a doctor's three minutes, but no doctor has seen it.

---

## 8. Every button, and the problem it exists for

The interface is two rich menus. Each cell below is a product decision, not a
feature: it answers something a family actually hit, and several of them exist
in the shape they do because an obvious alternative was rejected.

### 8.1 The older adult — four cells, 2×2

| Cell | The problem | What it does | Why not the obvious thing |
| --- | --- | --- | --- |
| **我的藥** | He does not know what he is currently on. The bag is in a drawer, the names are 8pt, and asking his daughter costs him something. | Re-narrates the most recent verified snapshot for him, in his granddaughter's voice, with the times his family set. | Not a stored sentence. Narration is a function of (verdict, role); the same verdict says different things to him and to his daughter, so caching the output would freeze one audience. |
| **產生回診單** | His daughter cannot take the day off, and in the room he cannot recount three weeks of symptoms. | Mints a signed 8-hour token, renders a QR, sends it as an **image**. He holds it up; the doctor scans. | Not a link. `LINE-ADAPTER-SPEC` §6.1 refuses him one because he taps links without checking — and he is in the population most targeted by fraud. An image is not a link. |
| **用藥提醒** | "Before or after food" is the question that actually stops someone taking a pill. | Lists the times his caregiver configured. | Refuses to show a schedule when none is set. 「早上一顆、晚上一顆」 assembled from nothing is the product writing a prescription, and he would follow it. |
| **切換身分** | Setup is done by a caregiver holding two phones, and tapping the wrong card on the right phone left it unrecoverable from inside LINE. | Re-sends the role card. | Gated on `MEDBUDDY_ALLOW_ROLE_SWITCH`, default off. §8.4 explains why the rule it relaxes still stands for a real deployment. |

**Absent on purpose: 「我吃藥了」.** It is the adherence check-in in a nicer
costume. Being asked whether you took your medicine is being asked to confess,
and the source interview is explicit that a shortfall raised directly produces
silence, not information.

### 8.2 The caregiver — six cells, 3×2

| Cell | The problem | What it does |
| --- | --- | --- |
| **記一件事** | The detail that matters — 「自己拿櫃子裡的止痛藥吃,大概三四次」 — does not survive a form. A tired person types 「最近比較不舒服」 and the specificity is gone. | One free-text paragraph, segmented by a model into typed observations. **Every note must appear verbatim in what they typed or it is discarded.** |
| **紀錄用藥** | Typing eight columns off a pharmacy bag is the reason nobody keeps a medication list. | Photograph or upload; Claude Sonnet transcribes what is printed; the names walk the ordinary grounding path. |
| **產生回診單** | Same sheet, generated by the person who has the context. | Both phones receive it — image for him, image plus link and an expiry for her. |
| **服藥提醒** | A reminder at 08:00 has to arrive at 08:00, and a caregiver cannot be the alarm clock. | Up to four daily slots, ≥60 min apart, none in quiet hours. Content is always rule-produced narration. |
| **傳說明** | Sometimes the answer is needed now, not at the next slot. | Re-runs the pipeline server-side and pushes the result. |
| **切換身分** | Setup recovery. | Re-sends the role card. |

### 8.3 How the cells depend on each other

Nothing here is a standalone feature; the value is in the chain.

```
紀錄用藥 (bag OCR)
      │  drug names as ordinary text
      ▼
STEP 01 用藥核對  ──────────► verdict ──► 我的藥        (his answer)
      │                          │
      │                          └──────► 服藥提醒      (scheduled, same words)
      │                          └──────► 傳說明        (immediate, same words)
記一件事 (observations)
      │
      └──────────────────┬──► 產生回診單 ──► QR ──► the clinician's table
                         │
                    (both are on the sheet: what he takes, and what
                     the family noticed — the second is what a
                     three-minute appointment cannot otherwise get)
```

**The dependency that matters:** every path to the older adult's ear or screen
passes through the same verdict. 我的藥, 服藥提醒 and 傳說明 differ in *when*
they speak, never in *what* they may say.

### 8.4 Two constraints relaxed for the demo, recorded rather than hidden

| Constraint | Original argument | Why relaxed | Where it lives |
| --- | --- | --- | --- |
| An elder binding is terminal | The caregiver surface holds what the family wrote about him, in their words, without his being asked. That surface existing at all depends on his never reaching it. | `canClaimDemoRole` now refuses every phone but the two the deployment names, so the gate does the guarding and the rule was left stranding legitimate setup. | `src/lib/roles/bind.ts`, `MEDBUDDY_ALLOW_ROLE_SWITCH` |
| No 疊字, no 「囉」「喔」 | A product that treats him as declining may help make that true. | The register a family uses with each other is not the register a product should use. 「阿公」 from his granddaughter's actual voice is warmth; 「使用者您好」 is distance. | `src/lib/delivery/reminder-framing.ts` |

Both default off, and both keep the part that is about *him* rather than about
tone: no reminder asks whether he took anything, reports what he did, or counts
a streak. `assertNoSelfReport` makes that a throw rather than a comment.
