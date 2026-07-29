# LINE UX — Specification

> Third of three LINE documents. `LINE-ADAPTER-SPEC.md` governs transport,
> `VOICE-DELIVERY-SPEC.md` governs what is spoken; this one governs what the
> two people see and can touch.
>
> Status: current demo contract. The role card, both rich menus, webhook,
> persistence, and menu actions are built. Quick replies, STT, and LIFF are not.

---

## Demo contract — exactly two LINE phones

The challenge demo uses one LINE Official Account and two different LINE user
accounts:

| Phone | Card choice | Persisted binding | Rich menu | Subject |
| --- | --- | --- | --- | --- |
| A | `我是長輩` | `elder` | `medbuddy-elder` | `subj-father` |
| B | `我是照顧者` | `caregiver` | `medbuddy-caregiver` | `subj-father` |

The choice is a server-side `RoleBinding`, not client-only UI state. The
deployment sets `LINE_DEMO_ELDER_USER_ID` and
`LINE_DEMO_CAREGIVER_USER_ID`; when both are configured, no third phone may
claim either role. Both ids must differ. The web dashboard, LINE messages,
observations, questions, clinician summary, `找家人`, and QR delivery all use
the same `subj-father` record.

There is no subject switcher, pairing code, roster administration, multi-elder
support, or multi-caregiver permission model in this demo. Those are future
product scope. Vercel Blob persists the two role records for the prototype, but
its cross-instance consistency is not strong enough to make it the production
authorization store.

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
│  請問您是?                             │
├───────────────────────────────────────┤
│                                       │
│   ┌─────────────────────────────┐     │
│   │  我是長輩                     │     │
│   │  看我自己在吃的藥              │     │
│   └─────────────────────────────┘     │
│                                       │
│   ┌─────────────────────────────┐     │
│   │  我是照顧者                   │     │
│   │  幫家人核對用藥、產生回診單     │     │
│   └─────────────────────────────┘     │
│                                       │
└───────────────────────────────────────┘
```

### The heading names the role; the line under it names the intention

**This is a reversal, and the earlier position is kept here rather than
deleted, because it is the one that should win eventually.**

The first version used intentions only — 「我要看我自己的藥」 rather than
「我是長輩」. Asking a 72-year-old to tap a button that categorises him as the
old person is a small humiliation at the first screen, and the first screen is
where products lose people.

That reasoning still holds for the product. It lost to a different reader. Someone
meeting this card for ninety seconds — a reviewer, an interviewer, anyone being
shown the thing rather than using it — has to see immediately that there are two
audiences and that the entire interface forks here. An intention-framed heading
is kinder and slower to parse, and slower to parse is fatal when the reader is
evaluating rather than living with it.

So the card carries both: the role as the heading a stranger reads at a glance,
the intention underneath as what is actually being chosen. **If this ships to
real families, the heading goes back to the intention** — the dignity argument
does not stop being true because a demo needed legibility.

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

### Two people, two phones, one caregiver-led setup

The in-person setup in §4 assumes the caregiver can help with the elder's phone.
The card is answered **once on each device**: 長輩 on phone A and 照顧者 on phone
B. The choice immediately writes the binding and links that account's menu.

---

## 1b. One bot, two rich menus

LINE assigns a rich menu **per user**, so the same channel presents a different
interface to each role. That is how "one record, three projections" is
expressed here — and the clinician, who is not a LINE participant at all, is
simply absent.

The menus belong to two *people*, not two sections of one person's interface.
The caregiver's 切換身分 action exists only as setup recovery; an elder binding
is terminal and cannot enter the caregiver surface.

### Elder — a 2×2 menu, four large targets

Everything on it **gives him something**. Nothing on it asks him for anything.

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│      我的藥          │     這顆是什麼       │
│   (今天在吃什麼)      │  (用說的或打字)      │
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│     再唸一次         │      找家人          │
│   (最近核對說明)      │  (通知固定照顧者)      │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

Four rather than six, because six 1000×540 targets are small on a phone held at
arm's length. Each cell is roughly a thumb.

**Why there is no 「我吃藥了」 button.** It would be the confirm/deny in a nicer
costume. If he wants to tell someone something, 找家人 lets him do it in his own
words, which is his choice rather than our question.

**Why 再唸一次 is its own button.** It re-narrates the most recent medication
snapshot for the elder role. When a pre-rendered speech match exists, the same
push also includes audio. It is not a byte-for-byte replay of the last chat
bubble, so the label must not promise that.

**Icons beside every label.** Health-account rich menus in Taiwan carry an icon
per cell, and the reason is not decoration: an icon is recognised faster than a
string, which matters most for the reader who is slowest at the string.

**There is no 回主選單 on the elder's menu** — a common pattern, and unnecessary
here because his menu has no second level to get lost in. Four cells, all at the
top. Depth is the thing to spend on a caregiver and refuse an elder.

### Caregiver — a 2×3 menu, and links are allowed

```
┌────────────┬────────────┬────────────┐
│  記一件事   │  產生回診單  │ 他問了什麼   │
├────────────┼────────────┼────────────┤
│  照顧對象   │   開啟網頁   │  切換身分    │
└────────────┴────────────┴────────────┘
```

`照顧對象` reports the one fixed father record and offers no switch. `開啟網頁`
opens the deployed caregiver dashboard in LINE's browser (not LIFF in this
build); rebuilding the full dashboard out of chat messages would be strictly
worse. **This asymmetry is intentional: `LINE-ADAPTER-SPEC`
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

For the review demo, setup is deliberately explicit and completed before the
walkthrough:

1. Put phone A and phone B's LINE User IDs into
   `LINE_DEMO_ELDER_USER_ID` and `LINE_DEMO_CAREGIVER_USER_ID` on the same
   Vercel project that serves the webhook.
2. Add the same LINE Official Account on both phones.
3. On phone A, tap **我是長輩**; verify the 2×2 elder menu appears.
4. On phone B, tap **我是照顧者**; verify the 2×3 caregiver menu appears.
5. Increase phone A's LINE/device font size and send one typed medicine-name
   test so the arriving text/audio pattern is familiar.
6. Open the web dashboard from phone B and run one medication check; both LINE
   phones and the clinician summary must now refer to 父親.

There is no pairing code in this build. The configured account allowlist plus
the role-card confirmation is the temporary demo setup; an operator-grade
pairing and recovery flow is future work.

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
長輩  ──  找家人  ──▶  固定通知送到照顧者手機
照顧者                     ◀── 「父親按了『找家人』,想找您。」
長輩                       ◀── 「好,我跟家人說了。」
```

No typed or spoken clinical content is forwarded on this path. It is a fixed
call-for-contact notification to the one configured caregiver.

---

## 6. What is built, and what this document is

**Built:** inbound text → pipeline → reply; outbound caregiver-initiated
delivery; clinician-summary QR image delivery; audio hosting; signature,
dedupe, verbatim delivery, link refusal; and fixed two-phone recipient routing.
**The role card and both rich menus** — `follow` sends the card, a postback
binds the role and links that role's menu, and the binding is stored
(`src/lib/roles/`). Every cell on both menus is wired to an implemented action.

**Not built:** dynamic pairing/account recovery; STT for inbound voice; quick
replies; the LIFF webview — 開啟網頁 currently opens the responsive web surface.
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

### Demo acceptance checklist

1. Both phones add the same LINE Official Account and the webhook points to the
   same Vercel project as `NEXT_PUBLIC_BASE_URL`.
2. Phone A selects 長輩 and persists `elder -> subj-father`; phone B selects
   照顧者 and persists `caregiver -> subj-father`.
3. Each phone receives its own per-user rich menu after selection.
4. With both demo User IDs configured, a third phone cannot claim either role.
5. The caregiver web dashboard displays only 父親 and has no subject switcher.
6. A web medication check is visible through the elder's 我的藥 action.
7. A caregiver LINE observation appears in the same clinician summary.
8. An elder text medicine question is answered and appears under 他問了什麼.
9. 找家人 notifies only the configured caregiver account.
10. 產生回診單 sends a real LINE image message; the QR opens the signed summary
    for the same subject.
11. Text interaction is required for the walkthrough. Browser speech is
    demonstrated only on a supporting browser; LINE audio input is explicitly
    described as recorded-without-STT.
12. After changing rich-menu labels, run `npm run richmenu:render` and
    `npm run richmenu:register`, then update the two Vercel menu ID variables
    before the final walkthrough.

This is a design specification, not a description of the product. Everything in
it follows from constraints established in `docs/PRD.md` §3.2 and
`docs/DESIGN-PRINCIPLES` — the value here is that those constraints have been
carried through to the level of individual buttons, where they are easiest to
lose.
