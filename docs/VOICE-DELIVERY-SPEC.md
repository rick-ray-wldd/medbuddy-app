# Voice Delivery — Specification

> For the collaborator wiring Fish Audio into LINE delivery. Works alongside
> `docs/LINE-ADAPTER-SPEC.md`; that one governs transport, this one governs
> what gets spoken and in whose voice.
>
> Status: the synthesis provider (`src/lib/voice/fish.ts`) and the delivery
> route (`src/app/api/line/deliver/route.ts`) both exist and are wired. What
> this document fixes is the **rules** they operate under, and the one rule that
> is easy to get wrong.

---

## 1. The rule that everything else follows from

> ## A voice persona shapes how it sounds. It never shapes what is said.

This is not a stylistic preference. The entire submission rests on one claim:
that what reaches a person is either text quoted from a regulator or a
published criterion, or narration that has been checked against a verdict. A
persona that rewrites, warms up, shortens or "makes friendlier" the narration
breaks that claim at the last possible moment — after every check has passed.

So:

| Persona may change | Persona may never change |
| --- | --- |
| which voice model speaks | the words |
| speed, and pauses between segments | the order of the segments |
| which language the synthesiser is told to use | whether a coverage or action segment appears |

**Concretely:** `POST /api/line/deliver` re-runs the pipeline server-side and
passes `narration.segments` straight to synthesis. Do not add a prompt, a
rewrite step, or a "make it sound natural" pass anywhere between the verdict
and the audio. If the wording sounds stiff, fix it in
`src/lib/narration/deterministic.ts`, where it is still subject to the eight
validation checks.

---

## 2. The voice we are using, and its consent

```
provider        Fish Audio (s2-pro)
reference_id    b340fd7c23504a1c9917bcb5284a968e
speaker         Serin
origin          voice model built for Mirror (my own app), 2026-05-16
consent         Serin has given consent for use in MedBuddy — recorded 2026-07-29
```

Verified working for Traditional Chinese on 2026-07-29:

```
HTTP 200 · 140,851 bytes · MPEG layer III, 128 kbps, 44.1 kHz, mono
```

### Why the consent line matters more than it looks

The product's whole voice design is a consent argument: a caregiver may clone
**their own** voice, there is no route to anyone else's, and a deceased
person's is excluded permanently because consent is impossible. A demo that
quietly used a real person's voice without asking would undercut the argument
the documents make.

So the consent is recorded as a fact with a date, and `VoiceProfile.consent`
carries a statement rather than a boolean. If anyone asks in review whose voice
this is, the answer is in the repository.

**This is a demo voice, not a product voice.** In the product, the voice
belongs to the caregiver — the grandson whose voice the older adult already
knows. Serin's stands in so the demo has something to play.

---

## 3. The synthesis call

Already implemented in `src/lib/voice/fish.ts`. Reproduced here so you do not
have to read it:

```
POST https://api.fish.audio/v1/tts
  Authorization: Bearer ${FISH_AUDIO_API_KEY}
  Content-Type:  application/json
  model:         s2-pro          ← header, not body

  {
    "text":         "<narration segments joined>",
    "format":       "mp3",
    "mp3_bitrate":  128,
    "latency":      "balanced",
    "chunk_length": 200,
    "reference_id": "b340fd7c23504a1c9917bcb5284a968e",
    "language":     "zh"
  }
```

Invoke it through `FishVoiceProvider`, never with a bare `fetch` — the provider
is where the failure taxonomy lives (`retryable` vs not), and where the "no key
configured, so make no request at all" guarantee is tested.

### Four things Mirror's production runs taught us

Carried over because they cost real time to find:

1. **A clip ending in `？` gets its final syllable clipped.** Mirror tail-pads
   short questions with `。`. Our narration rarely ends in a question, but the
   elder projection can — check before assuming it does not apply.
2. **Mixed CJK and Latin in one sentence** (`Mirror`, `App Store`) sometimes
   reads badly. Our text contains drug names in Latin script. If one sounds
   wrong, the fix is a different phrasing upstream, **not** a phonetic hack in
   the adapter.
3. **Digits are unreliable.** `5/23` had to become 「5 月 23 號」. Our narration
   deliberately contains no doses, so this is mostly moot — but permit numbers
   and counts do appear. Prefer not sending them to speech at all.
4. **Fish returns 128 kbps CBR mp3**, so duration ≈ `bytes / 16` ms. The
   deliver route already computes it that way. Do not guess a duration; LINE
   requires an accurate one.

---

## 4. What the adapter does with the audio

```
narration.segments
      │  joined, verbatim
      ▼
FishVoiceProvider.synthesise()      → mp3 bytes
      │
      ▼
AudioStore.put()                    → private Blob + signed short-lived URL
      │
      ▼
LineDelivery.send(target, { text, speech })
      │
      ▼
POST https://api.line.me/v2/bot/message/push
  { to, messages: [ {type:"text",…}, {type:"audio", originalContentUrl, duration} ] }
```

**Text always accompanies audio.** Never audio alone: the older adult may be
somewhere he cannot play it, and a message he cannot read is a message he
cannot act on.

**The URL must expire.** The audio contains a medication explanation, which is
health information about a named person. A permanent public URL for that is not
acceptable — the signed short-lived URL you built is the right shape.

---

## 5. Failure behaviour

| Situation | Required behaviour |
| --- | --- |
| `FISH_AUDIO_API_KEY` unset | **No request at all.** Deliver text only, and say so in the response. There is a test asserting no fetch occurs. |
| Synthesis fails or rate-limits | Degrade to text-only, report it in the response. Never retry silently, never substitute a different message. |
| Audio hosting fails | Same: text-only, reported. |
| Audio exceeds LINE's duration limit | Refuse the whole send. Do not truncate speech mid-sentence. |
| Narration is empty | Send nothing. There is no default message. |

The rule underneath all of these: **a medication explanation that does not
arrive is recoverable; a wrong or truncated one is not.**

---

## 6. Which surfaces use which voice

| Surface | Voice | Why |
| --- | --- | --- |
| Caregiver, in the browser | `speechSynthesis` on the device | Nothing leaves; he is reading anyway |
| Elder, in the browser | `speechSynthesis` on the device | Same |
| **Elder, via LINE** | **Fish, cloned** | This is the one that has to overcome refusing to use technology, and a familiar voice is what does that |

Cloned voice is **opt-in per delivery**: no `voiceId` in the request body means
text only. That is deliberate — synthesising through Fish is the single place
in this product where health information leaves the process, and it should
never happen by default.

---

## 7. What is still open

- **Serin's voice is a stand-in.** The product design is the caregiver's own
  voice. A calibration UI (record samples → private model → profile with a
  consent statement) exists as `FishVoiceProvider.calibrate` and has no screen.
- **No auth on `/api/line/deliver`.** Flagged in that route's own header.
  Fine for a demo, not for anything public-facing.
- **Elder → LINE binding** is not implemented: `to` currently falls back to
  `LINE_ELDER_USER_ID`. Until a subject carries its own `channelUserId`, this
  demo speaks to exactly one account.
