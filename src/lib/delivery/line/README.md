# LINE Delivery Adapter

Transport only. **No medical logic lives here** — see `docs/LINE-ADAPTER-SPEC.md`
(§2) for why. `message.text` is delivered verbatim or not at all.

## Status

| Piece | State |
| --- | --- |
| `Delivery` types (`../types.ts`) | ✅ **Ray's version kept** (scaffold copy discarded at merge, 2026-07-28). Shapes are structurally identical to spec §4; the adapter also unions Ray's `containsLink()` into its own link guard (see validate.ts) |
| `handleInbound` stub (`../inbound.ts`) | ✅ scaffold stub kept — Ray's version did not exist at merge time (spec §9 create-if-missing). Ray: replace freely; the adapter only calls `handleInbound(msg)` |
| Webhook signature verification (raw body, HMAC-SHA256, timing-safe) | ✅ implemented + tested |
| Webhook parsing: text/audio only, everything else dropped with 200 | ✅ implemented + tested |
| Idempotency on `providerMessageId` | ✅ in-memory LRU (⚠️ per-instance on serverless — TODO shared storage before launch) |
| §6.5 subject guard, §6.1 elder-link guard, text limit | ✅ implemented + tested (link detector is a conservative starter — harden per TODO) |
| **Push to Messaging API** | ✅ implemented + tested — verbatim delivery (character-exact test), failure mapping (401/403 · 4xx · 429 · 5xx · network), one request per send, never throws, never auto-retries |
| **Inbound audio content download (api-data host)** | ✅ implemented + tested (`content.ts`) — Bearer GET on api-data, bytes untouched, format from Content-Type, event-duration precedence; failure (incl. 202 still-preparing) → log, 200, drop; `external` contentProvider → drop (not retrievable) |
| **Audio out: hosting (`AudioStore`) + m4a transcode** | ❌ DEFERRED to merge time — hosting needs a repo-level decision (Vercel Blob vs serving route, both need approval); stubs fail loudly; todos 4–5 remain `it.todo` |
| `LIMITS` values in `config.ts` | ✅ verified 2026-07-28 (see drift log; `maxAudioDurationMs` is a deliberate adapter-level cap — LINE docs set none) |

## Decisions taken (revisit freely)

- Webhook logic lives in `webhook.ts`, not the route, so `npm test` runs with
  no framework and no network (spec §8). The route is a thin shell.
- `send()` is **push-only** for now: the `Delivery` interface carries no reply
  token. Seam + question logged below.
- Dedupe marks the id **before** `handleInbound` runs; if upstream failures
  should be replayed via LINE's retry, this ordering must change.
- `InboundMessage` is exported from `../inbound.ts` next to its consumer so
  Ray never imports from `delivery/line/**`.
- Inbound audio download requires status exactly **200** (202 = binary still
  being prepared, per current docs) and drops audio whose
  `contentProvider.type` isn't `"line"` (bytes not retrievable via api-data).
- The webhook event's `message.duration` takes precedence over anything the
  content fetch layer reports (the event field is "not always included").

## Drift vs spec §7

All items verified 2026-07-28 against the official Messaging API reference
(https://developers.line.biz/en/reference/messaging-api/). Confirmed as
spec-described unless marked **DRIFT** or **NEW**:

- **Push endpoint** — confirmed: `POST https://api.line.me/v2/bot/message/push`,
  headers `Authorization: Bearer {token}` + `Content-Type: application/json`,
  body `{ "to": <userId>, "messages": [...] }`, max **5** messages per push.
  (An optional `X-Line-Retry-Key` idempotency header exists — noted only; the
  adapter never auto-retries, §6.2.)
- **Text message** — confirmed `{ "type": "text", "text": ... }`, max **5000**
  characters, counted in **UTF-16 code units** — identical to JS `.length`, so
  `checkTextLimit` counts the same way LINE does.
- **Audio message** — field names confirmed (`originalContentUrl`, `duration`
  in ms). **DRIFT:** docs accept **mp3 or m4a** (spec assumed m4a-only →
  mp3 transcoding may be unnecessary; wav still needs transcoding). URL must
  be HTTPS (TLS 1.2+), ≤ 2000 chars. Max file size **200 MB**
  (`LIMITS.maxAudioFileBytes`). **DRIFT:** docs specify **no maximum
  duration** — 60000 ms is only an example value, so
  `LIMITS.maxAudioDurationMs = 60000` is retained as a deliberate
  adapter-level conservative cap, not a LINE limit.
- **Inbound content download** — confirmed:
  `GET https://api-data.line.me/v2/bot/message/{messageId}/content`, Bearer
  auth, api-data host, raw bytes with format in the response `Content-Type`.
  **NEW:** large audio may return **202** while the binary is still being
  prepared (treated as a download failure: log, 200, drop). **NEW:** content
  is only retrievable when the webhook's `contentProvider.type` is `"line"`;
  `"external"` audio cannot be downloaded via this endpoint.
- **Webhook audio `duration`** — exists but is documented "Not always
  included" → the event value is preferred, with the fetch layer as fallback.
- **Signature** — confirmed unchanged: `x-line-signature`, base64 of
  HMAC-SHA256 over the raw body with the channel secret.
- **Push success response** — confirmed `{ "sentMessages": [{ "id", ... }] }`.
  ⚠️ The `id` is documented as type Number but the doc's own example shows a
  JSON **string** (`"461230966842064897"`) — the adapter accepts both and
  normalises with `String()` (also avoids precision loss at 2^53).
- **Error semantics** — 429 = rate limit (2000 req/s on push) or monthly quota
  exhausted. **No `Retry-After` header is documented** (response headers are
  `X-Line-Request-Id` / `X-Line-Accepted-Request-Id` only). 400 = bad
  request/invalid message object; 401 = invalid token; 403 = not authorized.
- **Reply endpoint** — confirmed to exist
  (`POST https://api.line.me/v2/bot/message/reply`, `replyToken` single-use,
  must be used within ~1 minute). We stay **push-only** (question 1 for Ray).

## Merge-time checks (completed 2026-07-28)

This module was built in a standalone scaffold folder, then merged. Outcomes:

- [x] `src/lib/delivery/types.ts` — **Ray's existed → kept**; scaffold copy
      discarded. Structurally identical to spec §4, so no adapter changes were
      needed. Bonus: the adapter's link guard now unions Ray's
      `containsLink()` so future hardening on his side is picked up.
- [x] `src/lib/delivery/inbound.ts` — Ray's did **not** exist → scaffold stub
      kept per spec §9 create-if-missing.
- [x] `.env.example` — did not exist in the repo → created with the LINE
      block only.
- [x] Repo tsconfig has `@/*`; vitest picks up `__tests__/**/*.test.ts`.
- [x] Scaffold harness files (package.json/tsconfig/vitest.config/.git) were
      NOT copied.

## Open questions for Ray

1. Reply vs push: should `Delivery` grow a reply-token field, or is push-only
   acceptable for the demo?
2. Dedupe replay semantics when `handleInbound` throws (see above).
3. Audio hosting: OK to add Vercel Blob (signed, short-lived URLs — the audio
   is health information), or do you prefer something else?
4. `InboundMessage` location (`../inbound.ts`) OK?
