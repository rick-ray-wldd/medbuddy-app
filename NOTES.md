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

<!-- append below, newest at the bottom -->
