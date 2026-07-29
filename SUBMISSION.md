# AI Fund submission — MedBuddy

Copy the block below into the reply to the Build Challenge email. Do not paste
API keys or the contents of `.env.local` into the email.

```text
PRD:
https://github.com/rick-ray-wldd/medbuddy-app/blob/main/docs/PRD.md

TDD:
https://github.com/rick-ray-wldd/medbuddy-app/blob/main/docs/TDD.md

Prototype:
Web: https://medbuddy-app.vercel.app
LINE bot: https://line.me/R/ti/p/@134cwbvt
Local run: npm install && npm run dev
Tests: npm test
Full verification: npm run verify

Source code:
https://github.com/rick-ray-wldd/medbuddy-app

Access notes / credentials:
The web prototype requires no login. Add MedBuddy on LINE at
https://line.me/R/ti/p/@134cwbvt. The LINE walkthrough uses one Official
Account and two dedicated demo phones: one older-adult account and one
caregiver account. Provider credentials are configured server-side and are
not included in the repository. No API key is required from the reviewer.
Please use only synthetic or de-identified data in the prototype.

What I personally built:
I defined the product wedge, PRD, TDD, safety boundaries, and the older-adult,
caregiver, and clinician workflows. I built the medication-data grounding,
deterministic rule and verdict pipeline, validated narration, structured
medication and observation history, caregiver web workflow, review-only
medication-bag OCR flow, clinician summary, and the two-phone LINE product
design. I specified, integrated, reviewed, and tested the collaborator's LINE
delivery adapter.

What I reused:
I entered the sprint with prior research on data sources, licences, and
cognitive-aging design principles, then turned that research into a runnable
product during the 48 hours. I used Next.js, React, Tailwind CSS, Vitest,
Vercel Blob, Taiwan FDA open data, and a licensed subset of STOPP v3. I
reimplemented architectural patterns from my earlier ScanSaver project without
copying its code. Shou-Feng Chang's LINE delivery, audio, and reminder
contributions remain separately attributed in the full Git history.

What the AI wrote, and what I rewrote or rejected:
I used Claude Code to help implement some late-stage role, rich-menu, OCR, and
integration work; those commits are explicitly co-authored in the Git history.
I used Codex and review agents to audit the code, tests, and documents. I
inspected the diffs and ran the verification suite. I rewrote or rejected
unsupported medical claims, autonomous OCR imports, unvalidated narration,
deceased-person voice cloning, and product claims that were not enforced by
the code. The repository keeps the full commit history so the work can be
audited.

What broke and how I debugged it:
A deployment-specific Vercel URL redirected anonymous reviewers to SSO, so I
tested aliases anonymously and submitted the public production alias instead.
The clinician summary initially lost history because Next.js bundled separate
copies of a module-scoped store, so I reproduced the full route-to-page flow
and moved the shared registry to globalThis. Reviews also exposed unsafe
reverse-substring medication matching, an OCR validator that discarded valid
Chinese drug names, and a Vercel Hobby cron schedule that blocked deployment.
I kept the concrete failures as regression tests and documented the remaining
limits in the PRD and TDD.
```
