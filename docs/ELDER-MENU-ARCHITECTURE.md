# The elder's four buttons — architecture

Four cells, and each one is a different *kind* of act. Reading them as four
menu items misses the design; the useful axis is **who originates the content
and who is allowed to shape it**.

| Button | He is… | Content comes from | May the product compose? |
| --- | --- | --- | --- |
| 我的藥 | asking for the current picture | `narrate(verdict)` | **No** |
| 這顆是什麼 | holding an unknown object | `narrate(verdict)`, after he names it | **No** |
| 再唸一次 | recovering something already said | the previously sent bytes | **No** — not even re-narrated |
| 找家人 | originating a message himself | **him** | **No** — passed through verbatim |

Nothing on this menu is composed prose about medication. Three of the four
carry no product-authored sentence at all; the fourth (`這顆是什麼`) carries an
instruction that names no medicine and would read identically to somebody
taking nothing.

---

## Shared spine

Every press walks the same path before it diverges:

```
LINE postback
  → webhook.ts          transport only; normalises, dedupes, decides nothing
  → inbound.ts          roleStore.get(userId) → binding {role, subjectId}
                        unbound → the role card, never an answer (§6.5)
  → menu-actions.ts     furniture ─────────────────┐
                        content → registry         │
                                   → buildVerdict  │
                                   → narrate ──────┤
  → prerendered-speech  hash(text) → Blob lookup   │
  → LineDelivery        verbatim, link-refusal ────┘
```

Two invariants hold across all four, and they are the reason this menu is safe
to give an older adult at all:

1. **Clinical judgement ends at the verdict.** Narration receives only the
   verdict object and cannot query the registers, so no button can introduce a
   medicine, criterion, or warning the rules did not already produce.
2. **The role is read before anything else happens.** A finding attached to the
   wrong person is the worst error available here, and an unbound sender never
   receives one.

---

## 我的藥 — the current picture

**The act:** he wants to know what he is on. Not a search — a state.

```
postback action=my_meds
  → logStore.read(subjectId).snapshots.at(-1)
  → narrate(snapshot.verdict, "elder", null, knownMedicines)
  → findPrerenderedSpeech(text)
  → send(text, speech?)
```

**Why re-narrated rather than replayed.** The snapshot stores a *verdict*, not a
sentence. The same verdict says different things to a man about himself and to
his daughter about her father, so storing the sentence would freeze one
audience. Narration is a function of (verdict, role); persisting its output
would be caching across an argument it depends on.

### What is missing

- **No "today".** It returns the latest snapshot whenever it was taken. A
  snapshot from March reads as though it were this morning. This needs a
  staleness boundary — past some number of days it should say when the check
  was made rather than presenting it as current. Silence about age is the kind
  of wrong that looks right.
- **No timing.** The brief asks the product to explain *timing*, and a snapshot
  has none: it is a list of what he holds, not when he takes it. Dosing times
  are what medication-bag OCR would supply
  (`docs/MEDICATION-BAG-OCR-MIGRATION.md`), and until that lands this button
  answers "what" and not "when".

---

## 這顆是什麼 — an unknown object in his hand

**The act:** there is a physical pill, right now, and he cannot read it.

```
postback action=how_to_ask
  → furniture: "直接打字說名字就好…認不出來我會說認不出來,不會亂猜"
  ── he then types ──
  → handleText, role=elder
  → resolver.resolveAll([{text, source:"unknown"}])
  → buildVerdict → narrate → speech → send
  → logStore.appendObservation({reportedByCarerId: "elder-asked"})
     ↑ so the caregiver's 他問了什麼 works — his question, never a report
       on what he did
```

**Why the furniture text is allowed.** It names no medicine and makes no claim.
The rule that matters is narrower than "never compose": the product must never
compose an *answer about medication*. An instruction is not an answer.

**Why it promises to fail out loud.** 「認不出來我會說認不出來,不會亂猜」 is
there because the resolver's three unresolved kinds are a feature he needs to
be told about. A person who has been guessed at once stops asking.

### What is missing — and this is the sharpest gap on the menu

- **Photo.** The natural act with a pill in your hand is to photograph it. The
  webhook drops `image` messages outright.
- **Voice.** He would say it. Audio arrives, is logged, and is dropped, because
  there is no STT and answering an un-transcribed voice message would mean
  guessing.

So the one button aimed at the moment of greatest need currently asks him to do
the single hardest thing available to him: type a drug name with presbyopia.
That is a real weakness and it is named here rather than hidden.

---

## 再唸一次 — recovering what was already said

**The act:** the audio scrolled away, or the tap missed and scrolled the thread
instead of playing. Spec §1b: a permanent button removes the need to find the
bubble again.

### ⚠️ Current implementation is wrong

`my_meds` and `repeat` fall through to the same handler
(`inbound.ts`), so this button re-derives the last *check* rather than
replaying the last *thing said*. Those differ whenever the last message was an
answer to a question he asked.

### Correct architecture

```
every outbound elder message writes:
  lastSpokenStore.put(channelUserId, {text, speechPathname, sentAt})

postback action=repeat
  → lastSpokenStore.get(userId)
  → none → furniture("還沒有可以再唸的訊息")
  → else → re-send the SAME text and the SAME audio bytes
```

**Why re-send rather than re-narrate.** 「再唸一次」 means *that one* again. If a
rule set changed in between, re-narrating would quietly answer the same button
with a different explanation — and he would have no way to know which of the
two was the one he half-heard. Byte-identical replay is the same discipline as
hashing audio by its text: the product may not change what it already said.

**Cost:** a `LastSpokenStore` (~40 lines, same shape as `RoleStore`) plus one
write on every elder-bound send path.

---

## 找家人 — the one path where he originates content

**The act:** he wants his family. Spec §5 is explicit: *passed through verbatim;
editing it would defeat the purpose.*

### Current implementation

Pings the caregiver — 「父親按了『找家人』,想找您。」 — and carries nothing from
him. Honest, and less than the spec asks for.

### Correct architecture

```
postback action=reach_family
  → pendingIntentStore.put(userId, {intent:"reach_family", expiresAt:+10min})
  → furniture("要跟家人說什麼?按住說就好,或直接打字")

next inbound from that user:
  → pendingIntent valid?
      YES → forward VERBATIM to the caregiver, then clear
              text  → text, unchanged, unsummarised
              audio → audio, forwarded as bytes
      NO  → normal pipeline
```

**The audio case is the interesting one.** Forwarding voice needs **no STT**,
because nothing is being interpreted — it is relayed. This is the single place
in the product where his voice works today, and it works precisely because the
product refuses to understand it.

**Why the expiry is load-bearing.** If he presses 找家人 and then three hours
later texts 「普拿疼」, that must not arrive at his daughter's phone as a
message. Without a TTL the intent is a mode he cannot see and cannot leave.

**Cost:** a `PendingIntentStore` (~50 lines), a branch in `handleText` and
`handleAudio`, and moving caregiver routing off
`LINE_SUBJECT_CAREGIVER_MAP` into a real store.

---

## What is deliberately absent

No 「我吃藥了」. It is the adherence check-in in a nicer costume, and §3 refuses
it: being asked whether you took your medicine is being asked to confess. If he
wants to tell someone, 找家人 lets him do it in his own words — his choice
rather than our question.

No 回主選單. Four cells, all at the top, no second level to get lost in. Depth
is a thing to spend on a caregiver and refuse an elder.

No link, in any cell. `assertNoLinksForElder` throws if one is ever added; a
menu cell is a link that is permanently on screen.

---

## Build order, if these are finished

1. **`再唸一次` correctness** — smallest, and it is currently a duplicate button,
   which is worse than a missing one.
2. **Staleness boundary on `我的藥`** — a few lines, removes a silent wrong.
3. **`找家人` verbatim passthrough** — the audio relay is the highest-value
   thing here, because it is the only path where his voice already works.
4. **Photo intake for `這顆是什麼`** — largest, needs the OCR contract, and it is
   where the button finally matches the moment it was designed for.
