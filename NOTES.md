# Build log — MedBuddy

Running notes kept during the 48-hour build. Raw material for the four
disclosure lines the submission template asks for:

- What I personally built
- What I reused
- What the AI wrote, and what I rewrote or rejected
- What broke and how I debugged it

Append as it happens. Do not reconstruct at the end.

---

## Prior work (predates the 48-hour clock)

Research completed **before** the Build Challenge prompt arrived (2026-07-26
20:25 PT), in a separate private planning repo. Timestamps are in that repo's
git history.

- **Licensing verification of geriatric prescribing rule sets** — established
  that STOPP/START v3 is CC BY 4.0 (adaptation + commercial use permitted),
  PIM-Taiwan 2019 is CC BY-NC 4.0, and the AGS Beers Criteria requires written
  permission and bars electronic redistribution, so Beers is not used here.
- **Taiwan open-data sources** — TFDA drug permit dataset and the 健康食品
  dataset (which carries officially approved 警語 / 注意事項 text) under the
  Taiwan Government Open Data Licence.
- **Found that NLM retired the RxNav drug-interaction API on 2024-01-02**, so
  code and tutorials still referencing it do not work.
- **Design principles derived from cognitive-aging research** (Alan Castel,
  UCLA), each tagged by evidence level.

Carried into this repo under `docs/` at the start of the build.

## Reused patterns

- **ScanSaver** (Hack-Nation "The Negotiator" project I worked on —
  github.com/changshoufeng0609-cmd/scansaver): config-driven rule engine
  shape, document-intake-that-refuses-rather-than-hallucinates, honesty rules
  rendered from config into prompts. Patterns re-implemented here in
  TypeScript for medication safety; no code copied.

---

## Log

### H0 — scaffold
- `create-next-app` (Next 16.2.12, React 19, TS, Tailwind 4) + Vitest.
- Chose a fresh repo rather than reusing my private planning repo, which
  contains a third party's personal contact details and notes from an
  NDA-covered dinner. Kept private during the build to avoid leaking
  something while tired; flipped to public at submission.
- Test harness went in before any logic, because the brief requires an exact
  test command reviewers will execute.

**Broke / debugged — deployment URL was behind a login wall.**
Deployed the scaffold in the first hour specifically to find deployment
problems early rather than at hour 47. Checked the result the way a reviewer
would, with an anonymous request rather than my own browser:

```
curl -s -o /dev/null -w "%{http_code}" https://medbuddy-kel6soeie-…vercel.app
→ 302
curl -sI … | grep location
→ location: https://vercel.com/sso-api?url=…
```

Vercel Deployment Protection was redirecting anonymous visitors to SSO. Traced
it by checking each alias separately and found the split: protection applies to
the deployment-specific URL, while the production alias is public.

```
https://medbuddy-kel6soeie-…vercel.app   302  (protected)
https://medbuddy-app.vercel.app          200  (public)
```

Fix: publish the production alias, never the deployment URL. Had I pasted the
URL the deploy command printed into the submission, reviewers would have hit a
login page.

Also checked `medbuddy.vercel.app` — already taken by an unrelated project
(`<title>React App</title>`), so the project name is `medbuddy-app`.

### H1–H3 — grilled myself on the source experience

Interviewed myself hard before writing any product argument, because the PRD's
opening claim has to survive being questioned in the interview.

I initially agreed with an example scenario put to me — doctor reduced the
painkiller, ordered a liver panel — and then retracted it. It was a plausible
reconstruction, not something I remember. The PRD now claims only what I can
attest to: the information gap itself, not any outcome that followed from it.
The argument does not need the outcome. If I do not speak, nobody speaks.

What is actually first-hand:

- My father has impaired liver function. I go to his follow-up appointments —
  about three hours of waiting for a few minutes in the room. I am in the room.
- Asked how he has been, he says 「還好,都差不多」.
- I am the one who says he sometimes misses a dose; that when his back or
  shoulder keeps him up he takes a painkiller from the cupboard, usually an
  NSAID; that he has been drinking more lately.
- The cupboard is a stock nobody counts, and leftovers from previous
  prescriptions are kept "in case they are useful next time".
- No list of his medications exists anywhere. It is in my head. The bags sit on
  the living-room table.
- He does not get angry when I say these things. He goes quiet and looks a
  little embarrassed, and does not quite confirm them.
- **He usually takes his prescriptions on time.** Reminders are not the
  bottleneck in my own family.

Design constraints that fall out of this, rather than out of the brief:

1. Never ask the elder to confirm or deny anything — he speaks to ask, never to
   answer. Embarrassment, not forgetfulness, is what closes that channel.
2. Intake is "photograph what is on the table", because the list does not exist.
3. Coverage must include everything that is not a prescription: OTC drugs,
   leftovers, alcohol.
4. The clinician one-pager is not only about a three-minute appointment. It
   means the son does not have to recite his father's shortfalls in front of
   him.
5. Do not build a reminder-led product.

### H3–H4 — voice: rejected the version I most wanted to build

I have shipped emotional voice cloning (Mirror, 718 organic signups), so the
first design I reached for was cloned-voice medication calls — including, as an
illustration, a late relative's voice.

Rejected the outbound-call and deceased-voice forms:

- Cloned family voices are the live attack against older adults; a product that
  teaches my father to trust my voice arriving by phone dismantles the instinct
  protecting him.
- A deceased person cannot consent, and an elder with any cognitive decline may
  not treat the voice as a recording.

Kept the part that survives scrutiny: **a grandson's consenting voice, in LINE,
carrying explanation rather than instruction, replying to something he
initiated.** LINE matters specifically because voice messages from family are
already ordinary there — it uses an existing trust pattern instead of minting a
new one. Outbound calling is roadmap, with the guardrails written down.

Also learned he **clicks links carelessly**, so nothing sent to the elder may
contain a link; a voice message has to be self-contained. That is now a hard
constraint in the delivery spec and an exported check in `delivery/types.ts`.

### H4 — delivery seam and collaborator spec

Split delivery behind an interface so LINE is one adapter and the web player is
another. Web delivery is the guaranteed demo; LINE is the upgrade and cannot be
allowed to destabilise the main path.

Wrote `docs/LINE-ADAPTER-SPEC.md` for a collaborator who knows LINE bots and is
building that adapter. The spec fixes a path boundary
(`src/lib/delivery/line/**` and the webhook route) so that authorship stays
unambiguous, states that the adapter carries no medical logic, and gives the
reason behind each safety constraint rather than just the rule.

### H24–H30 — reviewed, and it found real holes

Ran a two-axis review (repo standards, and the code against the brief) as
parallel sub-agents. Between them they found four things worth the time, all in
what the product claims hardest:

- **The fallback narration was never validated.** A docstring said the same
  checks run whichever narrator wrote the text; the code ran them only on the
  model's output. A concrete case failed — elder audience with nothing
  identifiable took an early return that skipped coverage disclosure. An
  invariant asserted in a comment and not enforced in code.
- **The dose check rejected the regulator's own words.** STOPP E4 reads
  "NSAID's if eGFR < 50 ml/min/1.73m2"; a faithful quote contains "50 ml".
- **Fluent prose was unchecked.** Validation looked at quoted segments and
  【】-marked names and nothing else, so a verdict holding only paracetamol
  accepted a sentence about aspirin and a bleeding risk nobody evaluated. The
  fix turned on a distinction I had missed: the narrator may not reach the
  registers, but the validator may — and must, because detecting invention
  needs exactly the knowledge the narrator is denied.
- **The resolver turned longer names into shorter ones.** 新理眠錠 → 理眠錠
  (NITRAZEPAM), fabricating a benzodiazepine finding with a real permit and a
  verbatim criterion attached. Reverse substring matching is now confined to
  health foods.

The sharpest finding was about a test rather than the code: an it.each over two
audiences that only ever built one verdict shape, so the failing branch was
never reached. That is the same lesson as the type error earlier — a green
suite says nothing about what the green covers.

**What broke, end to end.** The clinician summary reported no history at all
after two checks had been recorded. Next bundles route handlers and server
components separately, so the module-scoped registry singleton was instantiated
twice and each copy got its own store. Moved it onto globalThis. The registers
being loaded twice would have cost only memory; the log being two logs makes a
feature look built when it is not — and only walking the flow the way a user
does would have caught it.

### A third review, this time of the documents against the code

Pointed a second agent at the PRD and TDD with one question: where do these
claim something the code does not do? That failure mode had already caught me
once — a README saying narration could not reach the drug data, which was false.

It found twelve. The ones that mattered:

- **The two-value severity guarantee was not true at runtime.** It was a type
  and a test over one fixture. A rule *file* declaring `severity: "stop_now"`
  was copied onto a finding and out to the surface. Rule sets are data, and data
  from a file is where a type stops helping. There is now a check that throws.
- **"Clinical judgement ends at the verdict" was not an enforced semantic
  boundary.** Against an empty verdict, 「父親吃這些藥一定會腎衰竭。」 returned
  ok — every check was lexical and none asked whether an assertion was
  traceable. That shape is rejected now, and more importantly the documents no
  longer claim the strong property. They say structural and lexical, and they
  say where that stops.
- **The elder projection was not role-scoped in the UI.** The observation form
  rendered beside both views and offered him 漏服 to tick — the exact admission
  the product promises never to ask him for. The narration was tested; the page
  around it was not.
- **A model that never resolves is not slow, it is forever.** No timeout.
- **The API dropped the violations** the design document said were reported, so
  two failure modes were false at the only place anyone could observe them.
- Test count stale, the health-food warning claim wrong (417 of 464 carry 警語,
  not all), timing not built, delivery rules stated rather than enforced,
  many-to-many designed rather than implemented.

The pattern across all three reviews is the same one, and it is worth naming
because it is the thing to watch for rather than any individual bug: **the
documentation drifts optimistic.** Every false claim was a true statement about
what I intended, written before or instead of checking what the code did.

<!-- append below, newest at the bottom -->

### H33–H35 — the role card, and two rules that stopped being prose

Built the first-contact card and both rich menus. The interesting part was not
the Flex JSON; it was noticing that two constraints written in the spec were
only being honoured by *not drawing a button*, which is not the same as
enforcing them.

**A postback is client input.** LINE signs the webhook envelope, so a valid
signature proves the events came from LINE — not that the user pressed
something we drew. The elder's menu has no 「切換身分」 cell, but
`action=bind&role=caregiver` is a string anybody can send. If it were honoured,
he would land on the surface that shows what his family reported about him,
in their words, about him, without his having been asked. That surface existing
at all depends on his never reaching it. So `bindRole` refuses the transition
server-side and logs it loudly, because nothing legitimate can produce it.

The rule is asymmetric on purpose: caregiver → elder stays open. Setup has one
person holding two phones and getting them the wrong way round is the obvious
mistake, so the recoverable direction stays recoverable. That leaves a real
hole — a caregiver who binds their own phone as elder cannot undo it from LINE,
and there is no operator surface in this build. It is the correct side to fail
on, and it is written down rather than hidden.

**A menu cell is a link nailed to the wall.** §6.1 already refused to send an
elder a link. `assertNoLinksForElder` now throws if his menu ever gains a `uri`
action, and a test adds one to prove it fires.

Two smaller things worth recording:

- **Icons were drawn by grid position**, so the caregiver's menu came out with
  a pill beside 記一件事 and a magnifier beside 產生回診單. The justification for
  having icons at all is that they are read faster than the label; one that
  contradicts its label costs more than no icon. Now keyed by name.
- **`resolveDeps` built the LINE client eagerly**, on paths that only needed the
  role store. Two of 守豐's tests went red — and the way they failed was the
  dangerous kind: the throw landed in the outer catch and looked like a message
  that had simply produced no reply. Split into two lazy getters.

Left off the menu on purpose: 拍藥袋. Bag OCR is specified and not built, and a
cell that does nothing reads to an older adult as though *he* did it wrong.
