# MedBuddy — Product Requirements

**Medication comprehension and care-team handoffs for older adults on several medications.**

Ping-Juei (Ray) Tsai · AI Fund Engineer in Residence Build Challenge · 48 hours

Live: https://medbuddy-app.vercel.app · Source: this repository · Tests: `npm test`

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

One record, three role-scoped projections. The relationship between people is
many-to-many from the start, because the shapes that matter are a father with
two adult children who split the appointments, a facility carer responsible for
twelve residents across a shift, and someone caring for both parents at once.

### 3.1 The caregiver — the first user, and the one who pays

The adult child is the buyer because they are the one who is already doing this
work, badly, in their head.

| What they do today | In MedBuddy |
| --- | --- |
| Keep the list in their head | Photograph or type what is on the living-room table |
| Notice things and forget them | Record an observation when it happens |
| Realise at the appointment they cannot remember | Bring one page |
| Say the difficult parts out loud in front of their parent | Hand over a sheet |

**Built:** subject selection, free-text intake with a source per line
(prescription / over the counter / leftover / supplement), the check, findings
with the quoted source and its stated limits, coverage, provenance.

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

**Not built:** a conversational turn, and speech in or out. See §5.

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

**Not built.** The generator is the next thing after persistence. §5.

---

## 4. What makes the answers trustworthy

The depth area is **medication-data grounding**, and the argument is that the
product never says anything a regulator or a published criterion did not.

- **23,211 dispensable medicines** from the Taiwan FDA permit register, with
  ingredients parsed and indications quoted. 71,965 records filtered down:
  revoked permits and raw materials removed.
- **464 licensed health foods**, each carrying the 警語 and 注意事項 text the
  regulator approved for that specific product.
- **STOPP version 3** (O'Mahony et al. 2023, CC BY 4.0), 8 criteria encoded of
  133, each quoted word for word.
- Both registers and both rule sets are **committed to this repository**, so a
  change to what the product considers risky arrives as a reviewable diff, and a
  reviewer needs no network access to run it.

Three properties do most of the work:

1. **Clinical judgement ends at the verdict object.** Narration cannot look
   anything up, so it cannot introduce a medicine, criterion or warning the
   verdict did not already contain — and because its input is a fixed object,
   its output is checked against that object before anyone sees it.
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
| Voice-friendly **or highly accessible chat** interaction | **Partial.** Large type, Traditional Chinese, a single form, no jargon — but no conversational turn and no speech. This is the weakest of the four. |
| Explains purpose, timing and interactions with grounded data and clear limits | **Built**, and it is the strongest. |
| Structured medication / symptom / adherence log over time | **Not built.** The check is stateless: nothing is persisted. |
| Clinician- or caregiver-reviewable summary, escalating rather than deciding | **Half.** Escalation and the caregiver view are built; the clinician page is not. |

Also declared: a LINE delivery adapter is **specified and interfaced but not
implemented** (`docs/LINE-ADAPTER-SPEC.md`). A collaborator who knows the LINE
Messaging API is building it to that spec; the path boundary is fixed so
authorship stays unambiguous. If it does not land it ships as a documented,
tested, unwired module — which is why delivery was put behind an interface in
the first hour.

**Persistence is the keystone.** It is the missing requirement, and it is also
what would let LINE and the web view be the same record rather than two products
— because they would read the same log.

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
   moat: a grandson's voice is why a technology-averse older adult engages at
   all, and a facility has no grandson. Facility value is continuity across
   shifts and a defensible record — a different pitch, a different buyer, the
   same rules and registers underneath.
4. **Taiwan → elsewhere.** Rule sets are files. STOPP is European and already
   carries a commercial licence; PIM-Taiwan exists for local practice; Beers is
   the American equivalent. Adding a market is adding a register and a rule
   file, not a rewrite. The intake layer is what is local, and it is small.

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
