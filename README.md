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
             receives ONLY the verdict, never the raw drug data
```

**Clinical judgement ends at the verdict object.** The model cannot reach the
drug data, so it cannot invent a finding; and because its input is a fixed
object, its output is asserted against that object in tests.

Rule sets are committed JSON under `config/rules/`, not database rows, so every
change to a medication-safety rule is diffable and reviewable.

See [`src/lib/README.md`](./src/lib/README.md) for the module seams and
[`NOTES.md`](./NOTES.md) for the build log.

## Status

Work in progress — built for the AI Fund Engineer in Residence Build Challenge.
