# LINE UX — Specification

> Third of three LINE documents. `LINE-ADAPTER-SPEC.md` governs transport,
> `VOICE-DELIVERY-SPEC.md` governs what is spoken; this one governs what the
> two people see and can touch.
>
> Status: design. The message plumbing exists; none of the rich menus, quick
> replies or LIFF described here are built.

---

## 0. The trap in LINE's own components

LINE's most convenient interaction is the Quick Reply — tappable bubbles under
a message. Its most natural use here would be:

> 「今天的藥吃了嗎?」 `[吃了]` `[還沒]` `[不記得]`

**That is precisely what this product promises never to do.** The older adult
it was designed around goes quiet and looks embarrassed when a shortfall is
raised; three buttons do not make him more willing to answer, they teach him
that opening the conversation costs something.

> ### Quick replies may only offer questions he might want to ask.
> ### They may never offer answers about himself.

```
✅  [這顆白色的是什麼]  [飯前還是飯後]  [再唸一次]
❌  [吃了]  [沒吃]  [不記得]
```

The same rule kills every "adherence check-in" pattern, which is most of what a
medication bot would normally do. It is the constraint, not an omission.

---

## 1. First contact: who is holding this phone

When someone adds the bot we do not know which of the two people they are, and
the whole interface depends on the answer. So it is asked exactly once, and
then never again.

```
┌───────────────────────────────────────┐
│  MedBuddy                             │
│  幫忙看懂家裡的藥                        │
├───────────────────────────────────────┤
│                                       │
│   ┌─────────────────────────────┐     │
│   │  💊  我要看我自己的藥         │     │
│   └─────────────────────────────┘     │
│                                       │
│   ┌─────────────────────────────┐     │
│   │  👨‍👩‍👧  我要幫家人看藥          │     │
│   └─────────────────────────────┘     │
│                                       │
└───────────────────────────────────────┘
```

### Framed by what they want, not by who they are

**「我要看我自己的藥」, not 「我是長輩」.** Asking a 72-year-old to tap a button
that categorises him as the old person is a small humiliation at the first
screen, and the first screen is where products lose people. Both options
describe an intention, which everyone can answer without conceding anything.

### It is a binding, not a mode

The answer sets that LINE user's rich menu **permanently**. It is a property of
the person, not of the session:

- The elder is never asked again, and cannot switch. He should not have to
  identify himself repeatedly, and he must not be able to tap into a surface
  showing what his family reported about him.
- The caregiver can change it later from their own menu — they may be setting
  up a parent's phone and their own.

Postback actions carry the choice, so the answer does not appear in the thread
as a message he has to see or scroll past.

### Two people, one phone

The in-person setup in §4 assumes the caregiver is holding the elder's phone.
So the caregiver will answer this card **twice** — once on each device — and
the elder may never see it at all. That is the intended path, not a
workaround: he cannot onboard himself, and the design says so rather than
hoping.

---

## 1b. One bot, two rich menus

LINE assigns a rich menu **per user**, so the same channel presents a different
interface to each role. That is how "one record, three projections" is
expressed here — and the clinician, who is not a LINE participant at all, is
simply absent.

Switching between them uses the same mechanism LINE bots already use for a
副選單 — the pattern is well-trodden; what is unusual here is that the two
menus belong to two *people* rather than two sections.

### Elder — a 2×2 menu, four large targets

Everything on it **gives him something**. Nothing on it asks him for anything.

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│      我的藥          │     這顆是什麼       │
│   (今天在吃什麼)      │  (拍照或用說的)      │
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│     再唸一次         │      找家人          │
│   (剛剛那則語音)      │  (傳個訊息給小明)     │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

Four rather than six, because six 1000×540 targets are small on a phone held at
arm's length. Each cell is roughly a thumb.

**Why there is no 「我吃藥了」 button.** It would be the confirm/deny in a nicer
costume. If he wants to tell someone something, 找家人 lets him do it in his own
words, which is his choice rather than our question.

**Why 再唸一次 is its own button.** The reply arrives as text plus audio. Audio
in LINE has to be tapped to play, and a tap that misses scrolls the thread
instead. A permanent button that replays the last explanation removes the need
to find the bubble again.

**Icons beside every label.** Health-account rich menus in Taiwan carry an icon
per cell, and the reason is not decoration: an icon is recognised faster than a
string, which matters most for the reader who is slowest at the string.

**There is no 回主選單 on the elder's menu** — a common pattern, and unnecessary
here because his menu has no second level to get lost in. Four cells, all at the
top. Depth is the thing to spend on a caregiver and refuse an elder.

### Caregiver — a 2×3 menu, and links are allowed

```
┌────────────┬────────────┬────────────┐
│  拍藥袋     │  記一件事   │  產生回診單  │
├────────────┼────────────┼────────────┤
│ 爸問了什麼  │  傳說明給他  │   開啟網頁   │
└────────────┴────────────┴────────────┘
```

`開啟網頁` opens the full web surface in a LIFF webview — the caregiver already
has a complete interface on the web, and rebuilding it out of LINE messages
would be strictly worse. **This asymmetry is not laziness: `LINE-ADAPTER-SPEC`
§6.1 forbids sending the older adult a link because he taps links without
checking. The caregiver does not have that constraint, so he gets the webview
and the elder never does.**

---

## 2. The elder's message, shaped

```
父親好,這是您現在在吃的藥。

【普拿疼膜衣錠500毫克】
退燒、止痛(緩解頭痛、牙痛、咽喉痛…)

另外有 1 項我認不出來,家人會幫忙看。

──────────────
🔊 [語音訊息 0:12]
```

**Plain text, not Flex.** A Flex bubble gives layout control and loses the
reader's own font size — and font size is the accessibility feature that
actually matters here. LINE renders plain text at whatever size the device is
set to, so a phone configured for presbyopia gets large text for free, and a
Flex layout would override that.

That has a consequence worth stating plainly: **we cannot make the text large
from our side.** It is a device setting, and setting it is part of the one-time
in-person onboarding (§4), not something the product can do later.

**Audio always accompanies text, never replaces it.** He may be somewhere he
cannot play it, and a message he cannot read is a message he cannot act on.

**One idea per message.** LINE threads are read one bubble at a time on a small
screen; a message carrying three medicines and a coverage note is a wall. Send
the greeting and the medicines together, then the coverage note as its own
bubble — that also lets 再唸一次 replay the part he wants.

### The caregiver's message may use Flex

The caregiver's summary has something the elder's does not: **the seam between
quoted source text and our own explanation.** On the web that is a green rule
and a 原文引用 label. In LINE that needs a Flex bubble with a separator and a
smaller attributed footer, because plain text cannot carry it and losing it
would be losing the point.

---

## 3. What the bot must never do

Every one of these follows from a decision already made elsewhere, and each is
easy to add by accident because LINE makes it convenient.

| Never | Why |
| --- | --- |
| Ask him whether he took something | Embarrassment closes the channel |
| Send him a link, in any component | He taps links without checking |
| Push an unrequested message, except the one scheduled explanation his caregiver configured | He must never be surprised by audio |
| Use a streak, a badge, or 「連續 7 天!」 | Breaking a streak produces shame, and shame ends use |
| Say what he did — "您昨天沒吃" | Memory for one's own routine is reconstructive; the system would write itself into it |
| Use 疊字 or 「囉」「喔」 | A product that treats him as declining may make that true |
| Reply to a message it does not understand | Silence beats a guessed answer. An unmapped sender gets nothing at all |
| Show him another person's information | A carer may hold twelve residents |
| Ask him to pick his symptoms from a list | Selecting from a symptom grid is reporting on himself; other health bots lead with it, and it is the same trap as an adherence check-in wearing a different hat. He asks; the caregiver reports |

---

## 4. Setup happens in person, once

He cannot onboard himself, and pretending otherwise is how these products die
at the first screen. The flow assumes the caregiver is holding his phone:

1. Caregiver adds the bot on **their own** phone, gets a pairing code
2. Caregiver picks up the elder's phone, scans the QR, enters the code
3. Caregiver sets the device font size while holding it — the one accessibility
   change that matters and the one moment it will ever get made
4. Caregiver sends one test message so the elder sees what an arriving
   explanation looks like

Recording this in the product rather than in an onboarding email is the point:
step 3 is the difference between a readable product and an unused one, and
nobody does it later.

---

## 5. Sequences

### He asks

```
長輩  ──  按住說「這顆白色的是幹嘛的」  ──▶
                                          (STT not wired: recorded, not answered)
長輩  ──  或打字「普拿疼」               ──▶
                                     ◀──  說明 + 語音
                                          [這顆什麼時候吃] [再唸一次]
```

Voice in is the gesture he already performs. Until transcription lands, a voice
message is **recorded and not answered** — never answered wrongly.

### The caregiver sends an explanation

```
子女  ──  網頁核對 → 按「傳到 LINE」  ──▶  後端重跑 pipeline
                                          ▼
長輩                                 ◀──  說明 + 語音(孫子的聲音)
```

The backend re-runs the pipeline rather than accepting text from the client, so
what reaches his phone can only be rule-produced narration.

### He presses 找家人

```
長輩  ──  找家人  ──▶  「要跟小明說什麼?按住說就好」
長輩  ──  語音/文字 ──▶  轉給照顧者,原文不動
```

Passed through verbatim. This is the one path where the older adult originates
content, and editing it would defeat the purpose.

---

## 6. What is built, and what this document is

**Built:** inbound text → pipeline → reply; outbound caregiver-initiated
delivery; audio hosting; signature, dedupe, verbatim delivery, link refusal.
**The role card and both rich menus** — `follow` sends the card, a postback
binds the role and links that role's menu, and the binding is stored
(`src/lib/roles/`). Every cell on both menus is wired to an implemented action.

**Not built:** the pairing flow (§4 step 2); STT for inbound voice; quick
replies; the LIFF webview — 開啟網頁 currently opens the plain web surface.
拍藥袋 is absent from the caregiver's menu **on purpose**: bag OCR is specified
in `docs/MEDICATION-BAG-OCR-MIGRATION.md` and not implemented, and a menu cell
that does nothing reads to an older adult as *he* did something wrong.

**Two rules moved from prose into code**, which is the part of this worth
reading:

- `assertNoLinksForElder` (`rich-menu.ts`) throws if the elder's menu ever
  gains a `uri` action. §6.1 refused to send him a link; a menu cell is a link
  that is permanently on screen.
- `bindRole` (`roles/bind.ts`) refuses any postback moving a user from `elder`
  to `caregiver`. Postback data is client input — LINE signs the webhook
  envelope, not the intent inside it — so omitting the button is not the same
  as preventing the transition. The caregiver surface holds what the family
  wrote about him; that surface existing at all depends on his never reaching
  it.

**Account verification is a prerequisite, not a polish item.** An unverified
LINE official account displays a banner above every conversation warning the
user to be careful about providing personal information. On an account whose
users are older adults — the population most targeted by fraud, and whose trust
this product spends real design effort earning — that banner argues against us
in our own thread. Verification has to happen before anyone real is invited.

This is a design specification, not a description of the product. Everything in
it follows from constraints established in `docs/PRD.md` §3.2 and
`docs/DESIGN-PRINCIPLES` — the value here is that those constraints have been
carried through to the level of individual buttons, where they are easiest to
lose.
