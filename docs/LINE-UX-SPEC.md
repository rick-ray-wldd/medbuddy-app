# LINE UX — Specification

> Third of three LINE documents. `LINE-ADAPTER-SPEC.md` governs transport,
> `VOICE-DELIVERY-SPEC.md` governs what is spoken; this one governs what the
> two people see and can touch.
>
> Status: current code contract; live use still requires LINE/Vercel environment
> variables, registered rich menus, and a configured Official Account. The role
> card, webhook, persistence, fixed routing, and both 2×2 rich menus are built.
> A web-only, review-required medication-bag transcription draft is built and
> the caregiver menu links to it. Promotion into the medication log, inbound
> LINE-image OCR, a real dosing schedule/reminder, quick replies, caregiver
> message Flex layouts, LINE voice STT, and LIFF are future work. The setup role
> card itself is the one built Flex message.

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
observations, typed medicine-name questions, clinician summary, and QR delivery
all use the same `subj-father` record. The caregiver dashboard is a separate web
surface, not a rich-menu destination in the current 2×2 menu, but it reads and
writes the same `LogStore` for that subject.

There is no subject switcher, pairing code, roster administration, multi-elder
support, or multi-caregiver permission model in this demo. Those are future
product scope. When `BLOB_READ_WRITE_TOKEN` is configured, Vercel Blob persists
the two role records for the prototype; otherwise the code falls back to process
memory. Blob's cross-instance consistency is not strong enough to make it the
production authorization store.

---

## 0. Future quick replies, and the trap in LINE's own components

The current bot sends no quick replies. If they are added later, the following
constraint applies.

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

When someone adds the bot without a stored binding, the bot shows the role card.
With the fixed allowlist, each of the two configured phones may confirm only its
assigned role. A later `follow` event restores the already-bound phone's rich
menu instead of asking again. The visible `切換身分` menu action can show the
card again, but it does not override that per-phone assignment.

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

### It is a persisted, allowlisted binding, not a session mode

The answer stores a server-side `RoleBinding` and links the matching rich menu.
Under the current fixed-pair contract:

- the configured elder phone can bind only as `elder`;
- the configured caregiver phone can bind only as `caregiver`;
- a third phone cannot claim either role; and
- `切換身分` only reopens the card so the phone can reconfirm its configured
  role. A cross-role selection is refused, so this is not a true role switch.

`follow` relinks the stored role's menu. Stale bindings can be inspected and
cleared with the operator scripts (`npm run roles:ls` and
`npm run roles:unbind`); self-service pairing and recovery are future work.

Postback actions carry the choice, so the answer does not appear in the thread
as a message he has to see or scroll past.

### Two people, two phones, one caregiver-led setup

The in-person setup in §4 assumes the caregiver can help with the elder's phone.
The card is answered during setup on each device: 長輩 on phone A and 照顧者 on
phone B. The choice immediately writes the binding and links that account's
menu. It can be shown again for reconfirmation or after an operator reset.

---

## 1b. One bot, two rich menus

LINE assigns a rich menu **per user**, so the same channel presents a different
interface to each role. That is how "one record, three projections" is
expressed here — and the clinician, who is not a LINE participant at all, is
simply absent.

The menus belong to two *people*, not two sections of one person's interface.
Both display `切換身分`, but in this fixed-pair build it only reopens the role
card: the account allowlist still confines each phone to its assigned role.
Operator unbind is the actual recovery path.

### Elder — a 2×2 menu, four large targets

Everything on it **gives him something**. Nothing on it asks him for anything.

```
┌─────────────────────┬─────────────────────┐
│                     │                     │
│      我的藥          │     產生回診單        │
│  (照顧者記錄的用藥)    │    (帶去給醫師掃)     │
│                     │                     │
├─────────────────────┼─────────────────────┤
│                     │                     │
│     用藥提醒         │      切換身分         │
│ (什麼時候吃、飯前飯後) │      (重新選擇)       │
│                     │                     │
└─────────────────────┴─────────────────────┘
```

Four rather than six, because six 1000×540 targets are small on a phone held at
arm's length. Each cell is roughly a thumb.

**我的藥 is built.** It re-narrates the most recent shared medication snapshot
for the elder role. When an exact pre-rendered speech match exists, the same
push also includes audio; otherwise it is text-only.

**產生回診單 is built.** It mints a short-lived signed summary link, renders it
as a QR image, sends the image to the elder, and sends the caregiver a copy when
that account is configured.

**用藥提醒 is a future placeholder.** The current handler says that timing data
does not exist and refuses to invent a schedule. OCR/dose extraction and actual
reminders are not implemented.

**切換身分 is reconfirmation, not switching.** It displays the role card; the
fixed phone allowlist refuses the other role.

There is no 「我吃藥了」 button. The elder may type a single medicine name in
the chat at any time, but general natural-language questions and voice STT are
not implemented.

**Icons beside every label.** Health-account rich menus in Taiwan carry an icon
per cell, and the reason is not decoration: an icon is recognised faster than a
string, which matters most for the reader who is slowest at the string.

**There is no 回主選單 on the elder's menu** — a common pattern, and unnecessary
here because his menu has no second level to get lost in. Four cells, all at the
top. Depth is the thing to spend on a caregiver and refuse an elder.

### Caregiver — a 2×2 menu

```
┌─────────────────────┬─────────────────────┐
│      記一件事         │      產生回診單       │
│    (打一段話就好)      │    (兩邊都收到 QR)    │
├─────────────────────┼─────────────────────┤
│      紀錄用藥         │      切換身分         │
│    (拍藥袋照片)        │      (重新選擇)       │
└─────────────────────┴─────────────────────┘
```

`記一件事` sends an instruction; the caregiver's next typed paragraph is stored
as one or more verbatim observations (Gemini segmentation is optional). The
same `產生回診單` path sends the QR to both configured phones. `紀錄用藥`
returns a caregiver-only link to the current deployment's `/bag` page. That
page transcribes visible fields into an unpersisted draft; it does not yet
confirm or write a medication record. `切換身分` has the same fixed-role
limitation described above.

The current rich menu has no `開啟網頁`, `照顧對象`, or `他問了什麼` cell. The
web dashboard is opened separately at the deployment URL; it is fixed to
`subj-father` and shares the same store with LINE. Older postback handlers for
roster/recent-question text may remain in code, but they are not current visible
menu features.

---

## 2. The elder's message, shaped

```
父親好,這是您現在在吃的藥。

【普拿疼膜衣錠500毫克】
退燒、止痛(緩解頭痛、牙痛、咽喉痛…)

另外有 1 項我認不出來,家人會幫忙看。

──────────────
🔊 [語音訊息 0:12]  (only when configured/pre-rendered)
```

**Plain text, not Flex.** A Flex bubble gives layout control and loses the
reader's own font size — and font size is the accessibility feature that
actually matters here. LINE renders plain text at whatever size the device is
set to, so a phone configured for presbyopia gets large text for free, and a
Flex layout would override that.

That has a consequence worth stating plainly: **we cannot make the text large
from our side.** It is a device setting, and setting it is part of the one-time
in-person onboarding (§4), not something the product can do later.

**Text is required; audio is optional and never replaces it.** Audio is attached
only when an exact pre-rendered match exists or the caregiver-initiated web path
successfully synthesises a configured Fish voice. Missing configuration or a
synthesis failure produces text-only delivery.

**Future message shaping:** one idea per bubble remains the desired UX, because
a long medication explanation is a wall on a small screen. The current adapter
sends the joined narration as one text message (plus optional audio/image); it
does not yet split narration into multiple text bubbles.

### Future caregiver Flex layout

The caregiver's summary has something the elder's does not: **the seam between
quoted source text and our own explanation.** On the web that is a green rule
and a 原文引用 label. In LINE that needs a Flex bubble with a separator and a
smaller attributed footer, because plain text cannot carry it and losing it
would be losing the point. That caregiver clinical-message Flex layout is not
implemented; current clinical delivery is plain text. The role-selection card
is a separate, already-built Flex message.

---

## 3. What the bot must never do

Every one of these follows from a decision already made elsewhere, and each is
easy to add by accident because LINE makes it convenient.

| Never | Why |
| --- | --- |
| Ask him whether he took something | Embarrassment closes the channel |
| Send him a link, in any component | He taps links without checking |
| Push an unrequested or scheduled message | Scheduling is not implemented; the only sanctioned proactive explanation is initiated by the caregiver from the web |
| Use a streak, a badge, or 「連續 7 天!」 | Breaking a streak produces shame, and shame ends use |
| Say what he did — "您昨天沒吃" | Memory for one's own routine is reconstructive; the system would write itself into it |
| Use 疊字 or 「囉」「喔」 | A product that treats him as declining may make that true |
| Guess an answer to a message it does not understand | An unbound/unmapped sender receives the role card but no clinical answer; an unknown postback action is logged and receives no reply |
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
4. On phone B, tap **我是照顧者**; verify the 2×2 caregiver menu appears.
5. Increase phone A's LINE/device font size and send one typed medicine-name
   test. Text is the required result; audio appears only if optional speech is
   configured and available.
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
                                      (STT not wired: bytes discarded, not answered)
長輩  ──  或打字「普拿疼」               ──▶
                                     ◀──  說明文字 + 可選語音
```

Voice in is the gesture he already performs. Until transcription lands, a voice
message is downloaded transiently, logged by metadata, discarded, and **not
answered** — never answered wrongly. Quick replies are future work. Typed input
is currently treated as exactly one medicine name, not a general question.

### The caregiver sends an explanation

```
子女  ──  網頁核對 → 按「傳到 LINE」  ──▶  後端重跑 pipeline
                                          ▼
長輩                                 ◀──  說明文字 + 可選的設定語音
```

The backend re-runs the pipeline rather than accepting text from the client, so
what reaches his phone can only be rule-produced narration. Voice is not
guaranteed: it requires Fish configuration and a voice id, and a synthesis
failure falls back to text-only. A request-supplied id must be in the server-side
demo voice catalogue or the API returns HTTP 400. The committed Serin profile
is a consented demo stand-in, not a grandson or other family member.

### Legacy `reach_family` postback (not on the current menu)

```
長輩  ──  找家人  ──▶  固定通知送到照顧者手機
照顧者                     ◀── 「父親按了『找家人』,想找您。」
長輩                       ◀── 「好,我跟家人說了。」
```

No typed or spoken clinical content is forwarded on this path. It is a fixed
call-for-contact notification to the one configured caregiver. The handler is
implemented, but `找家人` is not one of the current elder menu's four cells.

---

## 6. What is built, and what this document is

**Built:** elder typed medicine name → grounding/rules/narration → reply;
caregiver typed paragraph → verbatim observation log; caregiver-initiated web
delivery; clinician-summary QR image delivery to the elder and optional copy to
the caregiver; optional audio hosting/delivery; signature, dedupe, verbatim
delivery, link refusal; and fixed two-phone recipient routing. The web and LINE
surfaces share the `subj-father` log.

**The role card and both 2×2 rich menus are built.** An unbound `follow` sends
the card; a bound `follow` relinks the stored role's menu. A role postback writes
the binding and links the menu. Every visible cell has a handler. `用藥提醒`
honestly reports that no verified schedule exists; `紀錄用藥` opens the web
transcription draft, whose result cannot yet enter the medication record.

**Future:** dynamic pairing/account recovery; medication-bag draft confirmation
and LINE-image intake; dosing-time persistence, reminders, and scheduling; STT for inbound voice; general
natural-language elder questions; quick replies; caregiver clinical-message
Flex layouts; narration bubble splitting; and LIFF. The responsive web dashboard
exists, but the current LINE menu has no web link.

**Two rules moved from prose into code**, which is the part of this worth
reading:

- `assertNoLinksForElder` (`rich-menu.ts`) throws if the elder's menu ever
  gains a `uri` action. §6.1 refused to send him a link; a menu cell is a link
  that is permanently on screen.
- `canClaimDemoRole` (`demo-pair.ts`) refuses a role claim unless the sending
  account is the configured phone for that role. `bindRole` also keeps an elder
  binding terminal by default. Postback data is client input — LINE signs the
  webhook envelope, not the role assertion inside it — so the visible card is
  not the authorization boundary.

**Account verification is a prerequisite, not a polish item.** An unverified
LINE official account displays a banner above every conversation warning the
user to be careful about providing personal information. On an account whose
users are older adults — the population most targeted by fraud, and whose trust
this product spends real design effort earning — that banner argues against us
in our own thread. Verification has to happen before anyone real is invited.

### Demo acceptance checklist

1. Both phones add the same LINE Official Account and its webhook points to the
   current Vercel project's `/api/line/webhook`; runtime web/QR links derive
   from that request origin rather than an environment URL.
2. Phone A selects 長輩 and persists `elder -> subj-father`; phone B selects
   照顧者 and persists `caregiver -> subj-father`.
3. Each phone receives its own 2×2 per-user rich menu after selection.
4. With both demo User IDs configured, a third phone cannot claim either role.
5. The caregiver web dashboard displays only 父親 and has no subject switcher.
6. A web medication check is visible through the elder's 我的藥 action.
7. A caregiver LINE observation appears in the same clinician summary.
8. An elder's single typed medicine name is answered and persisted with the
   `elder-asked` marker; the current menu has no 他問了什麼 cell.
9. 用藥提醒 reports that no verified schedule exists. 紀錄用藥 opens the
   current project's `/bag` transcription draft; the draft visibly requires
   review and does not claim to have updated the medication record.
10. 產生回診單 sends a real LINE image message; the QR opens the signed summary
    for the same subject.
11. Caregiver-initiated web delivery sends elder narration as text and adds
    audio only when the optional voice path succeeds.
12. Text interaction is required for the walkthrough. Browser speech is
    demonstrated only on a supporting browser; LINE audio input is explicitly
    described as transiently downloaded and discarded without STT.
13. After changing rich-menu labels, run `npm run richmenu:render` and
    `npm run richmenu:register`, then update the two Vercel menu ID variables
    before the final walkthrough.

This document records the current demo contract and labels future UX explicitly.
Its constraints come from `docs/PRD.md` §3.2 and `docs/DESIGN-PRINCIPLES`; the
value is carrying them through to individual buttons without presenting
placeholders as completed features.
