# LINE Adapter — Specification

> **For the collaborator building the LINE bot.** You should be able to work from
> this file alone. You do not need to read the rest of the codebase.
>
> Status: **spec ready, not yet implemented.** Last updated H4 of a 48-hour build.
> Owner of this seam: the collaborator. Owner of everything upstream: Ray.

---

## 1. What MedBuddy is, in five lines

An older adult on several medications, and the adult child who takes him to his
appointments. The child is the only one who knows he sometimes skips a dose,
that he takes NSAIDs out of the cupboard at night, and that he has been
drinking more. None of that is in any medical record.

MedBuddy captures what the family knows, checks it against real prescribing
rule sets, and produces something the family can hand to a clinician.

**The wedge is comprehension and handoff — not reminders.**

---

## 2. Where your part plugs in

```
photo / text  →  grounding  →  rules  →  VERDICT  →  narration  →  ┌ WebDelivery
                                          ▲                        └ LineDelivery  ← you
                                          │
                              all clinical judgement
                              happens here and stops here
```

### The single most important rule

> ## The LINE adapter contains no medical logic. None.

It is **transport**. It receives text that has already been produced upstream and
delivers it. It never decides what is safe, never composes clinical wording,
never calls an LLM, never reads the drug data.

If you find yourself writing an `if` statement about a medication, you are in the
wrong module — raise it instead.

---

## 3. Ownership boundary (this also determines attribution)

| Yours | Ray's |
| --- | --- |
| `src/lib/delivery/line/**` | everything else |
| `src/app/api/line/webhook/route.ts` | `src/lib/{grounding,rules,verdict,narration}/**` |
| LINE channel setup, tokens, webhook registration | the verdict schema and safety boundaries |
| audio encoding / hosting for LINE | the text that goes into the audio |

Please keep your commits inside those paths. The submission has to state who
built what, and a clean path boundary makes that honest and effortless.

---

## 4. The interface you implement

Ray provides this type. Implement it; do not change its shape without asking.

```ts
// src/lib/delivery/types.ts   (Ray owns this file)

export type DeliveryTarget = {
  /** opaque id for the recipient; for LINE this is the userId */
  channelUserId: string;
  /** "elder" changes nothing about content — content is decided upstream —
   *  but it does gate which constraints the adapter must enforce (§6) */
  role: "elder" | "caregiver";
};

export type DeliveryMessage = {
  /** plain text, already written for the recipient. Send verbatim. */
  text: string;
  /** when present, also deliver as speech */
  speech?: {
    /** audio bytes, already synthesised upstream */
    audio: Uint8Array;
    /** container format of `audio` as produced upstream */
    format: "mp3" | "wav" | "m4a";
    /** duration in milliseconds; LINE requires this and will not compute it */
    durationMs: number;
  };
};

export interface Delivery {
  send(target: DeliveryTarget, message: DeliveryMessage): Promise<DeliveryResult>;
}

export type DeliveryResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; reason: string; retryable: boolean };
```

You implement:

```ts
// src/lib/delivery/line/LineDelivery.ts
export class LineDelivery implements Delivery { … }
```

**Do not modify `message.text`.** Not to add a greeting, not to add an emoji, not
to append a link, not to truncate. If it does not fit LINE's limits, return
`{ ok: false, reason: "…", retryable: false }` and Ray will fix it upstream.

---

## 5. Inbound — what comes back from LINE

Webhook endpoint: `POST /api/line/webhook`

Handle exactly two inbound message types. Everything else: acknowledge and drop.

| LINE message type | What you do |
| --- | --- |
| `text` | normalise to `InboundMessage` and hand off |
| `audio` | download the content, hand off the bytes — **do not transcribe** |
| anything else | 200 OK, no action |

```ts
// you produce this; Ray consumes it
export type InboundMessage = {
  channelUserId: string;
  receivedAt: string;              // ISO 8601
  providerMessageId: string;       // for idempotency
  body:
    | { kind: "text"; text: string }
    | { kind: "audio"; audio: Uint8Array; format: string; durationMs?: number };
};
```

Hand it to `handleInbound(msg: InboundMessage)`, exported from
`src/lib/delivery/inbound.ts` (Ray owns that file; it will exist before you need
it — if it does not yet, stub it and carry on).

**Transcription is upstream.** The elder's voice message is Mandarin, possibly
with Taiwanese mixed in, and how that is handled is a product decision, not a
transport one.

### Idempotency

LINE retries on non-2xx. Dedupe on `providerMessageId` — a duplicate must not
produce a duplicate reply. Return 200 quickly and do the work after; LINE's
webhook timeout is short.

---

## 6. Hard constraints — non-negotiable, and the reason for each

These come from the product's design record. They are not stylistic.

### 6.1 🚫 Never send a link to an `elder` target

The user we designed for **clicks links carelessly** — it is one of the few
concrete facts we have about him. Any message that trains him to tap links in
chat is building the on-ramp for the next phishing attempt.

A voice message must be **self-contained**: he understands it by listening, and
there is nothing to tap. If a feature seems to need a link for the elder, it
needs a different design — raise it.

Links to a `caregiver` target are fine.

### 6.2 🚫 Never send anything the recipient did not initiate, except the one
scheduled explanation the caregiver has configured

No outbound calls. No unsolicited bursts. The elder is never surprised by audio.

### 6.3 🚫 The bot never asks the elder to confirm or deny anything

`"您今天吃藥了嗎?"` is forbidden, and so is every variant. Observed behaviour is
reported by the caregiver, never extracted from the elder.

The reason is specific: when this is raised with him in person he does not get
angry — he goes quiet and looks embarrassed. Asking a question costs him nothing;
being asked to admit a failure costs him something real. **He speaks to ask,
never to answer.**

Content upstream already respects this. Your job is to not introduce a violation
in a template, a fallback, or an error message.

### 6.4 🚫 The bot never asks for anything

No identifiers, no payment, no personal details, ever — including in error paths.
"MedBuddy will never ask you for anything" has to stay literally true, because it
is the line that makes an impersonation obvious.

### 6.5 ✅ Fail loudly, never silently

If delivery fails, return `ok: false`. Do not substitute a generic message. A
missing medication explanation is safe; a wrong one is not.

---

## 7. LINE technical notes

> ⚠️ **Verify every item in this section against current LINE docs before you
> rely on it.** These are the shapes as understood at time of writing, not
> quotations. Fix in place if they have drifted, and note the drift.

- **Webhook signature** — `X-Line-Signature`, HMAC-SHA256 over the raw request
  body using the channel secret, base64. Verify against the **raw** body; do not
  let a JSON parser touch it first. Reject mismatches with 401.
- **Reply vs push** — reply tokens are single-use and short-lived. Scheduled
  explanations are pushes; answers to an inbound message are replies.
- **Audio out** — LINE audio messages reference a publicly reachable HTTPS URL
  rather than accepting bytes inline, and require an explicit duration. So you
  will need somewhere to host the synthesised audio. Prefer a signed,
  short-lived URL; the audio contains health information. `m4a` is the format to
  target — if upstream hands you `mp3`, transcode in the adapter.
- **Audio in** — the message body carries a `messageId`; the bytes come from a
  separate content endpoint on the `api-data` host.
- **Limits** — text length and audio duration both have caps. Enforce them and
  return `ok: false` rather than truncating.

### Environment variables

Add to `.env.example` (never commit real values):

```
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_ELDER_USER_ID=          # test recipient during development
AUDIO_PUBLIC_BASE_URL=       # where synthesised audio is served from
```

---

## 8. Testing

Test command for the whole repo: `npm test` (Vitest).

Put your tests in `src/lib/delivery/line/__tests__/`. **Mock the LINE API** — the
suite must pass offline with no credentials, because reviewers run `npm test` on
a clean clone.

Cover at least:

- [ ] valid signature accepted, invalid signature → 401
- [ ] duplicate `providerMessageId` → exactly one downstream call
- [ ] `text` inbound → correct `InboundMessage`
- [ ] `audio` inbound → bytes fetched, **no transcription attempted**
- [ ] `message.text` delivered **verbatim** — a test that fails if anything is appended
- [ ] a message containing a URL to an `elder` target → rejected (§6.1)
- [ ] oversized text/audio → `ok: false, retryable: false`, nothing sent
- [ ] unsupported inbound type → 200, no downstream call

---

## 9. Status and what is blocking

| | |
| --- | --- |
| Repo | `rick-ray-wldd/medbuddy-app` (private — ask Ray for access) |
| Live | https://medbuddy-app.vercel.app |
| Run | `npm install && npm run dev` |
| Test | `npm test` |
| Stack | Next.js 16 App Router · TypeScript · Tailwind 4 · Vitest · deployed on Vercel |

**Done:** scaffold, test harness, deploy pipeline, module seams.
**In progress (Ray):** medication-data grounding, rule engine, verdict schema.
**Not started:** narration, web delivery, this adapter.

**Blocking you right now:** `DeliveryMessage` above is stable, so you can build
and test against it today with a fake upstream. `handleInbound` may not exist
yet — stub it.

**Deadline: 07/29 (Wed) 09:00 PT.** If the adapter is not wired by then it ships
as a documented, tested module that is not yet connected — which is a fine
outcome. **Do not let it destabilise the main path.** Web delivery is the
guaranteed demo; LINE is the upgrade.

---

## 10. Elder-facing constraints (context for anything you render)

Facts about the actual user this was designed around:

- Uses LINE daily, **comfortable with voice input** — presses and holds to send
  voice messages already
- **Clicks links carelessly** → §6.1
- **Presbyopia — text must be very large**
- Does not volunteer symptoms; goes quiet when a shortfall is raised
- Reads Traditional Chinese; speech may mix Mandarin and Taiwanese

Voice is not a gimmick for this user. It is the interaction he already performs
without help, in an app he already trusts, in a voice he already knows.
