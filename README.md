# MedBuddy

Medication comprehension and care-team handoffs for older adults on multiple
medications.

> An older adult who goes to an appointment alone and one who goes with an
> adult child receive different care — not because of the medicine, but
> because of the information in the room. Symptoms get reported honestly,
> someone has organised them, and someone asks the right questions. Adult
> children cannot take time off for every appointment.
>
> **MedBuddy closes that gap.**

## Run it

**Live:** https://medbuddy-app.vercel.app

Locally:

```bash
npm install
npm run dev          # http://localhost:3000
```

## Run the tests

```bash
npm test
```

Also available: `npm run typecheck`, `npm run build`.

## How it is put together

```
input (photo | text | speech)
      ↓
grounding/   resolve free text to known drugs / supplements / ingredients
      ↓      unresolved is a first-class result, never a guess
rules/       deterministic evaluation against versioned rule sets
      ↓      pure functions; no I/O, no model calls
verdict/     the single object carrying every clinical judgement
      ↓
narration/   translate a verdict into plain language —
             receives ONLY the verdict; cannot query the registers
```

**Clinical judgement ends at the verdict object.** The verdict carries the
register fields narration needs to say what a medicine is for, but narration
cannot look anything up — so it cannot introduce a medicine, a criterion or a
warning the verdict did not already contain. Its input is a fixed object, so
its output is asserted against that object in tests.

Rule sets are committed JSON under `config/rules/`, not database rows, so every
change to a medication-safety rule is diffable and reviewable.

## Documents

| | |
| --- | --- |
| [`docs/PRD.md`](./docs/PRD.md) | Where this comes from, why comprehension and handoffs are the wedge, the three workflows, what is not built |
| [`docs/TDD.md`](./docs/TDD.md) | Grounding, chat architecture, logs, summaries, safety boundaries, escalation, evaluation, privacy, failure modes |
| [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md) | Entities and the constraints they enforce |
| [`docs/LINE-ADAPTER-SPEC.md`](./docs/LINE-ADAPTER-SPEC.md) | Spec a collaborator builds the LINE adapter from |
| [`src/lib/README.md`](./src/lib/README.md) | Module seams |
| [`NOTES.md`](./NOTES.md) | Build log — what broke, what the AI wrote and what I rejected |

## Status

Work in progress — built for the AI Fund Engineer in Residence Build Challenge.
