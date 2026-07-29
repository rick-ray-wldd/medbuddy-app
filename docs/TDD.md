# MedBuddy — Technical Design Document

本文件描述 MedBuddy 的技術事實、目標設計與尚未解決的風險。產品需求以
`docs/PRD.md` 為準。本次程式行為盤點基準為 2026-07-29 的 `de4784f`；其後的
`24e6f72` 只修改文件，沒有改變這份技術基準。

本專案是 review prototype，不是 production-ready 醫療系統。未完成的認證、
授權、資料生命週期、交易一致性與供應商治理，不得用「Demo」一詞略過。

開發與驗證命令：

```bash
npm install
npm run dev
npm test
npm run verify
```

`npm run verify` 目前只執行 typecheck、test 與 production build；它**不包含**
`npm run lint`，也不是安全、隱私或端到端驗收的證明。測試數量以執行當下輸出
為準，本文件不固定數字。

---

## 0. 文件語意：Current 與 Target 必須分開

本文件使用以下狀態，避免把方向寫成已完成：

| 標記 | 定義 |
| --- | --- |
| **Current** | 目前 HEAD 可由程式碼或測試證實的行為 |
| **Prototype** | 已有可展示路徑，但仍依賴 seed、人工觸發或 demo-only 設定 |
| **Partial** | 只有部分資料流接通；不得宣稱端到端完成 |
| **Target** | 已決定的下一版 interface／invariant，尚未全部實作 |
| **Open** | 產品理由或風險取捨尚未決定，實作前必須回答 |

技術設計採用以下一致詞彙：

- **Module**：有 interface 與 implementation 的功能集合。
- **Interface**：caller 正確使用 module 必須知道的全部內容，包含型別、前置條件、
  invariant、設定、錯誤與效能特性，不只 TypeScript 型別。
- **Seam**：行為可被替換而不需修改 caller 的位置。
- **Adapter**：在 seam 上滿足 interface 的具體實作。
- **Deep module**：caller 學習很小的 interface，卻取得大量一致行為；目標是提高
  leverage 與 locality。

---

## 1. 產品技術目標與範圍

### 1.1 核心使用流程

MedBuddy 要讓家庭帶進診間的資訊，比單一處方紀錄更完整，但不替醫療專業人員
做處方決定。核心流程為：

1. **自然語言觀察 → 結構化紀錄 → clinician summary**
   照顧者用自己的話描述症狀、自行用藥、飲酒或漏服；系統只分段與分類，保留
   原文，最後與用藥快照一起形成診間摘要。
2. **藥袋 OCR → 人工 review → check snapshot**
   視覺模型只轉錄照片中可見文字。照顧者確認或修正後，資料必須走與手動輸入
   相同的 grounding、rule、verdict、snapshot 路徑。
3. **schedule → bounded deterministic text + Serin demo voice**
   Target 是讓照顧者設定時間，並由已確認資料產生長者版本文字，再選擇性使用
   Fish Audio 的 Serin demo voice 播放。Current 仍讀取 seeded cupboard，且 fallback
   validation fail-open；因此只能稱為有界的 deterministic text，不能稱為 verified。
4. **同一 LINE 帳號可重新選擇角色；臨床對象不隨角色切換**
   角色是介面權限與文案投影，不是 subject selector。這是 Target；目前明確配置的
   two-account allowlist 與 elder-terminal 規則尚未完全符合，見 §7。

### 1.2 不做的臨床行為

- 不判定「安全」或「可以繼續吃」。
- 不建議停藥、換藥、增減劑量或替代醫囑。
- 不把「查不到」改寫成推測。
- 不從藥品外觀、適應症或相鄰列推測藥名。
- 不由系統推論服用時段、飯前飯後、劑量或順序。
- 不要求或評分長者回報是否服藥，不做 streak 或 adherence score。

### 1.3 狀態矩陣

| Capability | Current | Target | 主要證據／缺口 |
| --- | --- | --- | --- |
| TFDA grounding | **Current** | 保持 deterministic；改善 canonical ambiguity | `src/lib/grounding/**`, committed TFDA tables |
| STOPP／TFDA warning evaluation | **Current** | 完整 schema 與 reference validation；擴充 coverage | `src/lib/rules/**`, `config/rules/**` |
| Typed medication check | **Current** | 集中成單一 deep `ClinicalCheck` module | `/api/check`, `buildVerdict`, `narrate` |
| Observation segmentation | **Current** | 區分 observer、reporter、question；驗證完整性 | `/api/observation`, caregiver LINE text |
| Observation → summary | **Current with attribution defect** | 只把 caregiver observations 放進該區塊 | elder question 目前混入 `Observation[]` |
| OCR transcription | **Partial / bounded** | provider timeout、quota、review audit；建立可驗證 provenance | value 只和模型自報 evidence 比對，沒有和影像像素比對 |
| OCR review → check | **Partial** | 明確逐列確認後一次寫入 snapshot | 主頁能加到 textarea；`rx` 目前變成 `unknown` |
| OCR intake → snapshot | **Prototype** | 真正 confirmation route 寫入 `intake[]` | HEAD 只有型別、讀取與 seed script；一般 `/api/check` 不寫 intake |
| Elder 「我的藥」／web preview | **Partial / critical safety regression** | 只投影 validated narration 或另建同等驗證的 elder interface | warm frame 遺失 purpose/coverage/items；現有 focused tests 未涵蓋 preservation/provenance/mapping |
| Clinician summary | **Current, publicly exposed** | authenticated caregiver view；短效 clinician grant | direct `/summary/[subjectId]` 無認證 |
| Web signed QR share | **Current, incomplete protection** | 授權 mint、可撤銷、retention/deletion | data-URL QR + HMAC 8h；payload 未加密；direct route bypass |
| LINE-hosted QR image | **Partial / likely broken** | 修正 private Blob lookup 並做 deployed probe | proxy 用 `get(found.url)`；相同 Blob 問題在 role store 已改用 pathname；route 未測 |
| LINE webhook | **Current** | shared idempotency、queue、可重試處理 | HMAC 驗證；per-process dedupe、先 mark 後處理 |
| LINE role reselect | **Partial / contradictory** | 同帳號可重選角色，不改 subject | explicit pair 要求不同帳號；elder 預設不能切換 |
| Reminder slot CRUD | **Current, anonymous** | authenticated caregiver + fixed subject guard | `/api/schedule` 可操作任一 seeded subject |
| Reminder delivery | **Prototype** | subject-safe、latest confirmed regimen、可靠分鐘級 tick | 目前人工觸發最可靠；daily cron 與 10 分鐘 grace 不相容 |
| Serin voice | **Prototype** | 建立 AI persona disclosure、可驗證 consent、timeout | repository 將 Serin 定義為 demo persona；目前 outbound 未明示 AI／非家人 |
| Authentication／authorization | **Not built** | 所有 read/write/egress/spend endpoint 有 caller claim | `ROLE_ACTIONS` 只保護 LINE postback |
| Transactional persistence | **Not built** | transaction + audit + retention | Blob whole-document overwrite |

---

## 2. System context 與資料流

### 2.1 Context

```text
照顧者 Web / LINE                    長者 LINE                    Clinician browser
        │                                │                               │
        └────────────── HTTP / webhook ──┴────────── signed QR URL ──────┘
                                      │
                               Next.js application
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
          committed data        Vercel Blob           external providers
        TFDA + rule files     log/role/schedule/       LINE / Gemini /
                              audio/QR                 Anthropic / Fish
```

Runtime clinical evaluation uses committed TFDA tables and rule files; it does not fetch regulatory
data during a request. Remote providers sit behind explicit seams, but their privacy and failure
properties differ and are listed in §6.

### 2.2 Flow A — natural-language observation → structured log → summary

```text
Web POST /api/observation           caregiver LINE text
              │                              │
              └──────────────┬───────────────┘
                             ▼
                  parseObservations(text, extractor)
                       │ Gemini adapter when keyed
                       │ null/failure → whole paragraph as `other`
                       ▼
        whitespace-normalised containment + kind validation
        accepted spans kept; rejected or uncovered siblings may be lost
                             ▼
                 LogStore.appendObservations(batch)
                             ▼
                       SubjectLog
                             ▼
        buildClinicianSummary(latest verdict + all observations)
```

**Current guarantee:** every persisted model-produced `note` must be contained in the caregiver input
after whitespace normalization. The stored candidate may therefore differ in whitespace from the
input. If the extractor is absent, throws, or yields zero accepted candidates, the entire paragraph
is retained as one `other` observation.

**Limit:** if at least one candidate is accepted, rejected siblings and source text the model omitted
are not preserved by this call. The validator does not prove correct classification, non-overlap, or
complete coverage, so a partially valid extraction can silently lose detail. Target stores the source
paragraph alongside derived spans and verifies span coverage. An elder's typed question is also stored in this collection with
`reportedByCarerId: "elder-asked"`; the summary currently labels it as family observation and
「家屬原話」. Target introduces a separate `Question` contract or filters it before summary.

### 2.3 Flow B — OCR → review → check snapshot

```text
image
  → POST /api/ocr/bag
  → Anthropic MedicationBagExtractor adapter
  → validateExtraction(value appears in model-provided evidence; invalid fields blanked)
  → review-only draft in browser
  → caregiver adds readable names to textarea
  → POST /api/check
  → Resolver → rules → Verdict → two Narrations
  → LogStore.appendSnapshot
```

**Current breaks in the flow:**

- Both `value` and `evidence` come from the same model response. Their containment check catches
  ordinary self-inconsistency but cannot prove either string is visible in the image; a model that
  fabricates both passes. Unconditional human review is therefore the safety gate.
- `BagCapture.toLine()` appends `| rx`, but `CheckClient.parseLines()` recognises only
  `prescription | otc | supplement | leftover | unknown`; therefore OCR-derived prescription rows
  become `source: "unknown"`.
- The main workbench has a handoff through the shared textarea, while the standalone `/bag` page is
  still display-only. They must not be described as the same capability.
- `RegimenSnapshot.intake` and an elder-facing intake reader exist, but normal OCR confirmation does
  not persist dose/timing into a snapshot. `scripts/seed-demo-snapshot.mts` creates a synthetic demo
  snapshot in that target shape and is not evidence of an end-to-end write path. The old
  `frameMyMeds` remains broadly covered by tests, but production 「我的藥」 now uses
  `frameMyMedsWarm`. Its new tests cover only warning-language selection, not the safety contract
  described below.
- Pressing 「開始用藥核對」 is the present coarse review act; there is no per-row confirmation,
  correction audit, or reviewer identity.

### 2.4 Flow C — schedule → text + optional Serin voice

```text
caregiver PUT /api/schedule or LINE postback
  → ScheduleStore.put(SubjectSchedule)
  → cron/manual tick
  → dueNow(Asia/Taipei; grace 10 min)
  → runScheduledDeliveries
  → deliverExplanationToElder
       Resolver → rules → Verdict → elder Narration
       → frameReminder
       → optional Fish synthesis with defaultVoice()
       → LINE Delivery adapter (text always; audio when available)
```

Current schedule slots are generic times, not medication-specific orders. The runner feeds each
seeded subject's `cupboard` to the pipeline; it does **not** use the latest confirmed snapshot and
does not associate a slot with a medicine, dose, meal relation, or prescriber instruction.
The caregiver LINE `send_explanation` action also feeds `subject.cupboard`; only 「我的藥」 and the
elder preview replay the latest stored verdict. These surfaces therefore do not yet share one regimen
source of truth.

`vercel.json` runs `0 1 * * *`, which is 09:00 Asia/Taipei once per day. `dueNow` only sends inside
`[slot, slot + 10 minutes]`; therefore arbitrary slots do not work operationally unless the endpoint
is invoked manually near each slot. The current route comments explicitly treat manual invocation as
the demo mechanism.

### 2.5 Flow D — 「我的藥」 and elder preview (critical regression)

```text
latest snapshot + generic schedule
  → narrate(latest.verdict, elder) + validateNarration
  → only use narration.trim() as a non-empty gate
  → frameMyMedsWarm(reconstructed items, finding.verbatim, slots, conditions)
  → LINE 「我的藥」 / web preview text
```

At `de4784f`, these two read surfaces are aligned to each other, but they no longer display the
validated narration. `frameMyMedsWarm` reconstructs a different message after validation and that
message crosses no narration validator. The scheduled cron path still uses `frameReminder`; this
specific regression affects 「我的藥」, repeat, and the web elder preview.

Current consequences:

- `latest.intake ?? resolved verdict items` treats a partial `intake` array as the entire medicine
  list. The seeded snapshot has two intake rows and three verdict items, so 紅麴 disappears from the
  spoken medication list.
- unresolved items, coverage disclosure, indication/purpose, actions, finding limits and escalation
  wording are dropped. This contradicts the elder-purpose requirement and can turn partial coverage
  into an apparently complete list.
- only `finding.verbatim` is passed to the frame; `officialText`, finding identity, count, limits and
  severity are not. Chinese strings are spoken as-is. If warnings are non-Chinese, any number and any
  severity collapse to the singular 「有一項想請藥師幫忙看一下」, so multiple findings and a
  `consult_physician` finding can be misrepresented as one pharmacist question.
- `nextSlotLine` takes the first meal relation found across all items and applies it to one generic
  schedule slot, then labels slot position as 「第 N 包」 although the schedule has no medicine-to-slot
  or packet mapping. At the exact scheduled minute it searches with `>` and skips to the next slot (or
  says tomorrow). These are invented and potentially wrong instructions.
- the frame adds 「記得配溫開水喝」, retains the movement aside, asks 「今天還好嗎？」 in the
  morning, and invites symptom/questions even though ordinary elder text is interpreted as a medicine
  name. These statements are not grounded in the verdict or handled by an appropriate response flow.
- `spokenName` truncates strength/form without checking that the shortened name is unique; its regex
  does not handle the full-width digits its comment implies.
- the preview returns original narration `segments` beside a different warm `text`, so the displayed
  provenance legend does not describe the message on screen.
- focused tests now cover suppressing one English warning, speaking one Chinese warning, and the
  no-warning case. They do not cover item preservation, unresolved coverage, purpose, count/severity,
  `officialText` provenance, item-slot mapping, exact-minute behavior, name uniqueness, or preview
  segment agreement. `nextSlotLine` and `spokenName` remain untested directly.

This path is fail-closed work, not a copy refinement: either display the validated narration, or give
the warm projection its own deep interface with explicit inputs, association invariants, provenance,
and tests before sending it.

### 2.6 Flow E — clinician summary and QR

```text
latest RegimenSnapshot + SubjectLog
  → buildClinicianSummary
  ├─ direct /summary/[subjectId]               (anonymous, no token)
  └─ POST /api/summary/share → HMAC token 8h
       → /summary/s/[token]
       → optional QR PNG in private Blob
       → /api/summary/qr/[token].png → LINE image
```

The web share endpoint renders and returns a QR data URL without Blob, and its token behavior has
direct tests. The LINE path is separate: it stores a private PNG and the proxy route lists the blob,
then calls `get(found.url, { access: "private" })`. The same URL-versus-pathname lookup shape had
already failed for role blobs and was corrected there to `get(blob.pathname, ...)`. The QR proxy has
no route test, so LINE-hosted QR delivery is **Partial / likely broken** until the pathname is fixed
and a deployed fetch probe passes.

The token authenticates integrity and expiry; it is **signed, not encrypted**. Anyone holding it can
decode `subjectId` and `expiresAt`, and it cannot be revoked before expiry. Expiry prevents route
access after the deadline but does not delete stored QR objects.

The signed path is not the current privacy gate for the overall system because the direct
`/summary/[subjectId]` route reads the same full log anonymously.

### 2.7 Flow F — LINE role selection

```text
LINE follow/rebind
  → role card
  → signed LINE webhook envelope
  → parseRoleFromPostback (client input)
  → canClaimDemoRole
  → bindRole / RoleStore
  → link role rich menu
  → every later postback checked by ROLE_ACTIONS[storedRole]
```

`ROLE_ACTIONS` is an authorization interface only for LINE postbacks. It does not protect browser
pages or other HTTP endpoints.

Target interaction allows the same LINE account to reselect elder/caregiver presentation while
keeping `subjectId` fixed. Current explicit demo configuration requires two different user IDs,
`canClaimDemoRole` pins each to one role, and `bindRole` rejects elder → caregiver unless
`MEDBUDDY_ALLOW_ROLE_SWITCH=true`. This mismatch must be resolved as a product/security decision,
not hidden in copy.

---

## 3. Module interfaces, seams, and adapters

### 3.1 Current module map

| Module | Interface caller must know | Seam | Current adapters / implementation | Notes |
| --- | --- | --- | --- | --- |
| Grounding | `Resolver.resolveAll(items) → GroundingResult`; never guess; preserve input | in-process module interface | committed TFDA register implementation | One implementation; do not add a hypothetical adapter |
| Rule evaluation | `evaluateRules(subject, items, ruleSets, classes)`; pure; may throw on unknown shape | in-process module interface | deterministic engine | Rule-file validation is incomplete (§7) |
| Verdict building | `buildVerdict(...) → Verdict`; only resolved ingredients reach rules | in-process module interface | pure implementation | The clinical judgment object |
| Narration | `Narrator.narrate(verdict, audience) → Narration` | narrator seam | deterministic adapter; injected test narrators | Preferred model slot exists but no model narrator is wired |
| Narration validation | `validateNarration(narration, verdict, known)` | in-process module interface | lexical/structural implementation | Not semantic proof; fallback currently fail-open |
| Observation extraction | `ObservationExtractor.extract(text)` | external-provider seam | Gemini adapter; mocks; `null` fallback at caller | Provider output is revalidated |
| Bag extraction | `MedicationBagExtractor.extract(request)` | external-provider seam | Anthropic adapter; test adapters | Always returns draft; no direct log interface |
| Longitudinal log | `LogStore` append/read methods | persistence seam | `BlobLogStore`, `InMemoryLogStore` | Real seam: production/demo + local/test adapters |
| Role binding | `RoleStore.get/put/findByRole` | persistence seam | Blob, in-memory | Reverse lookup scans Blob prefix |
| Schedule | `ScheduleStore.get/put/remove/list` | persistence seam | Blob, in-memory | HTTP route bypasses adapter selection and always constructs Blob |
| Delivery | `Delivery.send(target, message)` | channel seam | `LineDelivery`, test adapters | Adapter must not rewrite clinical text |
| Voice | `VoiceProvider.synthesise(request)` and `VoiceCalibrator.calibrate(...)` | external-provider seam | Fish adapter, mocks | Browser speech is a separate client mechanism, not this adapter |
| Share grant | create/verify HMAC token | in-process module interface | Node crypto implementation | Stateless, short-lived, non-revocable |
| Scheduled orchestration | `runScheduledDeliveries(deps)` | clock/store/delivery seams | real adapters + in-memory test adapters | Recipient callback lacks `subjectId` |

### 3.2 Missing deep module: `ClinicalCheck`

Current callers independently compose `Resolver → buildVerdict → narrate`:

- `/api/check`
- `deliverExplanationToElder`
- elder text handling in `delivery/inbound.ts`
- menu replay from stored verdict

This duplication reduces locality: snapshot policy, narration fail-closed behavior, source mapping,
and provider metadata can diverge by caller. Target is one deep module with a small interface:

```ts
type RunClinicalCheck = (input: {
  subjectId: string;
  items: { text: string; source: ItemSource }[];
  audiences: NarrationAudience[];
  persist: false | { capturedBy: string; intake?: IntakeDetail[] };
}) => Promise<{
  verdict: Verdict;
  narrations: Record<string, Narration>;
  narrationMeta: Record<string, NarrationMeta>;
  snapshotId?: string;
}>;
```

The exact name is not important; the interface obligations are:

- subject resolution and allowed-subject claim happen before clinical work;
- one source vocabulary is accepted at every input;
- persistence is explicit, never an incidental side effect of preview;
- invalid fallback narration produces a typed failure, not displayable text;
- callers and tests cross the same seam.

### 3.3 Deepening the scheduled-delivery module

The scheduler already accepts store, clock and delivery dependencies. Its recipient interface is too
shallow because `elderRecipient: () => string | null` hides which subject is being resolved. Target:

```ts
recipientFor(subjectId: string): Promise<DeliveryTarget | null>
regimenFor(subjectId: string): Promise<ConfirmedRegimen | null>
```

This puts wrong-person prevention at the seam and lets tests exercise multiple schedules without
reaching implementation details.

---

## 4. Domain contracts

### 4.1 Current contracts

| Contract | Required meaning | Current limitation |
| --- | --- | --- |
| `Subject` | person whose conditions and medication record are evaluated | Three synthetic fixtures are addressable by many anonymous endpoints |
| `RoleBinding` | channel user, role, subject, time | Demo allowlist and role-switch policy conflict with same-account target |
| `GroundedItem` | original input + source + resolved or explicit unresolved reason | ambiguity key includes raw name/ingredient strings, not composition alone |
| `Verdict` | subject, all items, findings, coverage, provenance | Core clinical object is sound but composed in several callers |
| `Narration` | subject-tagged segments for one audience | `producedBy` includes Claude although no preferred narrator is wired |
| `RegimenSnapshot` | one captured check and reproducible verdict | optional `intake` exists; normal OCR confirmation cannot write it |
| `Observation` | caregiver-reported source-contained text span | whitespace may differ from input; elder questions misuse the same shape and sentinel reporter |
| `SubjectSchedule` | up to four generic daily slots | no medication/dose/meal relation; no timezone field because Taipei is implicit |
| `VoiceProfile` | provider id plus consent attestation | consent string presence is not identity/ownership verification |
| `ShareTokenPayload` | subject id + expiry, HMAC signed | readable payload; bearer grant; no revocation |

### 4.2 Grounding and provenance

Runtime sources are committed files created by `scripts/ingest-tfda.mts`:

- TFDA drug permits, with revoked permits and raw materials filtered by the ingest logic;
- TFDA health-food data;
- STOPP v3 criteria encoded under CC BY 4.0;
- TFDA health-food warnings.

PIM-Taiwan is excluded because its licence is non-commercial; AGS Beers is excluded because its
terms do not permit this form of redistribution. Provenance versions travel in `Verdict`.

Known data-quality limits:

- `Resolver.isAmbiguous` compares raw `nameZh + sorted ingredients`; formatting differences can
  produce ambiguity even when normalized product/composition is the same. The documentation must
  say **name-and-composition comparison**, not composition-only, until canonicalized.
- Health-food ingest keeps rows whose status contains 「核可」; the committed set still includes
  permits marked 「本證失效」. It must not be described as a list of all currently active products.
- A resolved product with no ingredients remains `matched_without_ingredients`; no rule runs.

### 4.3 Source vocabulary

The only current `ItemSource` values are:

```text
prescription | otc | supplement | leftover | unknown
```

Every UI, OCR handoff, endpoint, seed and persisted snapshot must use those exact values. `rx` is not
an alias today; producing it is a defect, not a second vocabulary.

The summary field `notInPrescriptionRecord` currently means
`source !== "prescription"`. MedBuddy has no integration with an official prescription record, so
the user-facing claim should be 「輸入時標記為非處方來源」, not proof that an item is absent from a
hospital or national prescription record.

### 4.4 Target observation and question contracts

Target keeps two different acts separate:

```ts
type Observation = {
  subjectId: string;
  reportedBy: { actorId: string; role: "caregiver" };
  kind: ObservationKind;
  verbatim: string;
  observedAt: string;
};

type ElderQuestion = {
  subjectId: string;
  askedBy: { actorId: string; role: "elder" };
  verbatim: string;
  askedAt: string;
};
```

Until migration, summary construction must filter the `elder-asked` sentinel from caregiver
observations and render it only in a clearly labelled question section.

### 4.5 Target confirmed regimen

A reminder must read a confirmed record rather than a fixture:

```ts
type ConfirmedMedication = {
  item: GroundedItem;
  intake?: {
    mealRelation?: string; // copied from bag
    dose?: string;         // copied from bag
    printedOrder?: number; // only when actually printed
  };
};
```

Absence remains absence: no default dose, order, timing, or frequency may be generated.

---

## 5. Endpoint trust matrix

“Anonymous” below means anyone who can reach the deployment can call it; knowing a seeded subject id
is not authentication. `ROLE_ACTIONS` does not apply to these routes.

| Surface | Current caller proof | Reads | Writes / egress / spend | Subject guard | Target |
| --- | --- | --- | --- | --- | --- |
| `POST /api/check` | Anonymous | registers, rules, subject | appends snapshot | any seeded subject | caregiver/session claim; fixed subject authorization; rate limit |
| `POST /api/observation` | Anonymous | subject | Gemini text egress; appends observations | any seeded subject | caregiver claim; content/rate limits |
| `POST /api/ocr/bag` | Anonymous | subject | full image to Anthropic; paid inference | any seeded subject | caregiver claim; quota, size, MIME and abuse controls |
| `GET /api/preview/elder` | Anonymous | latest log, schedule | none | any seeded subject | authenticated preview or synthetic-only fixture |
| `GET /api/schedule` | Anonymous | Blob schedule | none | any seeded subject | caregiver/elder read policy; fixed subject claim |
| `PUT /api/schedule` | Anonymous | prior Blob schedule | overwrite Blob | any seeded subject | caregiver-only write; CSRF/idempotency/audit |
| `DELETE /api/schedule` | Anonymous | none | delete Blob schedule | any seeded subject | caregiver-only write; audit/recovery |
| `POST /api/line/deliver` | Anonymous | registers/rules/subject | optional Fish, Blob audio, real LINE push | fixed demo subject only | authenticated caregiver action + rate/idempotency key |
| `POST /api/line/webhook` | LINE HMAC envelope | role/log/schedule | role/log/schedule writes; LINE/Fish | binding checked per action | queue + durable idempotency + least-privilege role policy |
| `GET /api/cron/deliver-scheduled` | `Bearer CRON_SECRET` | all schedules | writes attempts; Fish/LINE | **no fixed-subject filter** | scheduled internal principal; subject-scoped recipient lookup |
| `POST /api/summary/share` | Anonymous | subject | mints bearer token; renders QR | any seeded subject | authorized caregiver; audit and quota |
| `POST /api/summary/share/to-line` | Anonymous | role/subject | stores QR; LINE push; optional broadcast | fixed demo subject in module | caregiver action; broadcast removed or isolated |
| `GET /summary/[subjectId]` | Anonymous | full log | none; page can mint share | any seeded subject | remove public path or require caregiver session |
| `GET /summary/s/[token]` | HMAC bearer token | full log | none | token payload | retain short TTL; consider revocation and minimal disclosure |
| `GET /api/summary/qr/[token].png` | HMAC bearer token | attempts private QR Blob read | none | token payload; likely URL/pathname defect | fix lookup; add route/deployed test; delete expired objects |
| `GET /api/line/audio/[key]` | signed short-lived audio URL | private audio Blob | none | key/token only | retention, audience binding if required |
| `/`, `/bag` | Anonymous browser | public UI; hub reads log/role server-side | downstream calls above | demo subject in UI | synthetic demo mode or authenticated workspace |

Critical consequence: the signed QR token does not currently protect overall summary access because
`/summary/[subjectId]` is a separate anonymous read path.

`MEDBUDDY_DEMO_BROADCAST=true` can send a summary QR image to every friend of the LINE bot. It is not
listed in `.env.example` and contradicts addressed delivery. Target removes it; if retained solely for
an isolated synthetic demo channel, deployment checks must refuse it outside that environment.

---

## 6. Provider and privacy matrix

| Provider / mechanism | Data crossing the seam | Activation | Current timeout / retry | Validation / fallback | Unresolved privacy work |
| --- | --- | --- | --- | --- | --- |
| Local TFDA + rules | none; committed public data | always | local file read; throw on missing | deterministic | document data version and licence |
| Vercel Blob | medication logs, observations, role IDs, schedules, audio, QR | token/config or direct Blob store | SDK defaults; no app timeout; overwrite | mixed empty/null/throw semantics | retention, deletion, residency, transactionality, audit |
| LINE Messaging | user IDs, inbound text/audio metadata; outbound health text/audio/QR | LINE credentials | no app timeout; webhook provider retries | HMAC inbound; adapter checks elder links | provider retention, queue, durable dedupe, consent |
| Gemini | caregiver paragraph | `GEMINI_API_KEY` | no app timeout/retry; mutable `gemini-flash-latest` | kind + substring check; whole-text fallback | retention, region, model-version governance |
| Anthropic | original medication-bag image, which may visibly contain identifiers | `ANTHROPIC_API_KEY` and anonymous route call | no app timeout/retry | structured output + model-response self-consistency check; human review | pixel provenance, de-identification, quota, retention, consent, abuse prevention |
| Fish Audio | narration text; calibration samples if internal helper used | key + voice profile | no app timeout/retry | text-only fallback | voice ownership, consent evidence, provider retention/deletion |
| Browser Web Speech | microphone audio / spoken text may be processed by browser vendor | browser support and permission | browser-defined | unsupported control hidden | browser/vendor disclosure; offline is not guaranteed |
| Vercel Functions logs | LINE user IDs, message IDs, subject IDs, role, failures | runtime logging | platform-defined | code intends not to log note/audio bodies | log retention, access control, identifier minimization |

Only the optional preferred `Narrator` path has an application-level 8-second timeout. No preferred
model narrator is currently wired, so that timeout does **not** cover Gemini, Anthropic, Fish, LINE,
Blob, or content download calls. Each real external adapter needs an `AbortSignal`, bounded total
time, retry policy, and observable typed failure.

### 6.1 Voice identity and consent

The repository configures Serin as a **granddaughter-style AI demo persona**, not the elder's actual
family member or caregiver. Her Fish model is listed in `DEMO_VOICES` with a repository consent
statement. This fact is **not currently disclosed truthfully to the recipient**: LINE receives only
framed text/audio, while the web preview says 「Serin 的聲音…（孫女語氣）」 without saying AI-generated
or not-family. The reminder register uses 「阿公」, so disclosure must be implemented in onboarding
and the demo UI rather than relying on source comments.

Current limitations:

- a request-provided `voiceId` must match the catalogue;
- `defaultVoice()` accepts an arbitrary `MEDBUDDY_DEMO_VOICE_ID` by constructing `unknownVoice`, whose
  own consent record explicitly says the repository has none;
- `FishVoiceProvider.calibrate` checks only that a consent string is non-empty and that the provider
  model is private; it does not verify identity, ownership, scope, withdrawal, or subject match;
- there is no user-facing registration, disclosure, withdrawal, deletion, or re-consent flow.

Therefore the current claim is “operator-configured voice with an attestation,” not “verified consent.”

### 6.2 Audio cache integrity

`narrationHash(text)` keys cached audio by requested text and prevents a cache-key mix-up after text
changes. It does **not** prove that provider-returned bytes speak that text: no ASR, waveform check, or
human verification runs before bytes are stored. Duration may be estimated from 128 kbps byte length.
The correct guarantee is cache-address integrity, not semantic audio equivalence.

---

## 7. Invariants and known violations

### 7.1 Invariant ledger

| ID | Invariant | Current enforcement | Known violation / gap | Target gate |
| --- | --- | --- | --- | --- |
| INV-01 | Every clinical fact and delivery is bound to one subject | `Verdict.subject`, `DeliveryTarget.subject`, role binding | schedule accepts other fixtures and reuses one elder recipient for all schedules | resolve recipient and confirmed regimen per `subjectId`; reject outside allowed subject |
| INV-02 | Role changes presentation, never subject | fixed `DEMO_SUBJECT_ID` in LINE binding | anonymous routes address mother/resident fixtures; same-account policy conflicts with pair allowlist | principal carries one authorized subject claim across every surface |
| INV-03 | A transport adapter does not compose clinical content | `Delivery.send` receives settled text | upstream warm frame composes water/meal/packet instructions after validation; schedule uses fixture cupboard | validate full outbound text, including frame, against an allowed furniture contract |
| INV-04 | Unknown medication is explicit; never guessed | `no_match`, `ambiguous`, `matched_without_ingredients` | ambiguity uses raw strings; permissive health-food contains matching | canonical resolution key; measured false-positive rate |
| INV-05 | Narration cannot add clinical judgment beyond `Verdict` | narrator receives verdict; lexical validator | fallback violations still render; warm path discards validated text and constructs unvalidated output | fallback violation and post-projection violation become typed fail-closed results |
| INV-06 | Caregiver observation remains source-contained | whitespace-normalised containment; batch append | candidate whitespace may differ; partial accepted extraction can drop omitted/rejected sibling text; elder question is misattributed | store source paragraph + derived spans; coverage check; separate `Question` |
| INV-07 | OCR output has no privilege over typed input | review draft enters textarea | model value/evidence can be jointly fabricated; `rx` maps to `unknown`; no per-row confirm; intake only seeded | human-confirmed command + shared source parser + snapshot transaction |
| INV-08 | Reminder content comes from confirmed record | same rule/narration pipeline | runner uses `subject.cupboard`, not latest snapshot; slots not medication-specific | confirmed-regimen lookup at scheduler seam |
| INV-09 | Reminder reaches the correct person exactly once at most | slot stamped before attempt | recipient resolved once from first listed schedule; Blob/dedupe are not cross-instance safe | transactional job/outbox keyed by subject/date/slot |
| INV-10 | Elder LINE text contains no tappable link | `LineDelivery` rejects links for elder targets | no known adapter bypass; a QR is deliberately an image, not text | retain adapter and route tests |
| INV-11 | Shared summary grant is short-lived and scoped | HMAC + expiry | token readable/non-revocable; direct path bypass; object remains after expiry | authorized mint, revocation/audit, retention job, remove bypass |
| INV-12 | Voice use is opt-in and consented | key + profile; Serin catalogue | env ID may be unknown; consent is unverified text | verified catalogue only; disclose persona; withdrawal/deletion |
| INV-13 | Duplicate LINE webhook does not duplicate effects | in-process `Set` | serverless instances do not share it; mark-before-handle can lose failed events | durable inbox with processing state |
| INV-14 | No ungrounded behavior or health advice | clinical narration checks | warm path runs after checks and says 「記得配溫開水喝」 plus movement advice; only movement is suppressed for `recurrent_falls` | remove advice, or establish rationale and validate full eligibility before projection |
| INV-15 | Bot does not solicit unsupported self-report | narrow forbidden-phrase check | 「今天還好嗎？」 and 「有不舒服…跟我說」 invite health input that elder text handling treats as a medicine name | remove questions or add an explicit, safe response contract |
| INV-16 | Health access and outbound delivery are authorized and addressed | LINE webhook HMAC/role checks and signed share paths protect only some surfaces | direct pages/routes are anonymous; demo broadcast sends to an audience rather than a resolved person | authenticate every endpoint; remove broadcast or isolate it to synthetic channel |
| INV-17 | Timing/meal/packet wording requires an explicit item-slot association | intake can carry per-item printed text; schedule carries only times | warm path applies first meal relation to a generic slot and invents 「第 N 包」; exact-minute lookup skips the due slot | model and validate item-to-slot/packet mapping, otherwise state time only |
| INV-18 | Elder projection preserves coverage, purpose, actions and provenance | validated deterministic narration contains these segments | warm path drops them, may hide items, and preview labels unrelated original segments | project from validated segments without loss; provenance must describe displayed text |

### 7.2 Critical current violations

#### P0 — wrong-subject scheduled delivery

`/api/schedule` accepts every `findSubject` fixture. `runScheduledDeliveries` looks up one elder using
the first listed schedule and reuses that recipient while iterating all schedules; each delivery uses
that schedule subject's seeded cupboard. An anonymous caller can create a schedule for another
fixture and cause its medication explanation to be sent to the demo elder.

Required correction: enforce allowed subject at write and tick time, change recipient lookup to
`recipientFor(subjectId)`, and test two schedules with distinct recipients before enabling automated
ticks.

#### P0 — anonymous health reads, writes, egress, and spend

The routes in §5 allow anonymous log writes, observation writes, schedule mutation, summary reads,
LINE pushes, share-token minting, QR pushes, and paid OCR inference. If any real LINE or health data
can enter this deployment, authentication/authorization is a release blocker, not roadmap polish.

#### P0 — narration fallback is fail-open

`verifiedFallback` returns deterministic narration together with violations. `/api/check` returns the
narration, the client ignores `narrationMeta`, and LINE delivery sends it. The truthful current
behavior is “surface the violation metadata while still using the fallback,” not “failed narration is
never shown.” Target must return no displayable narration when fallback validation fails.

#### P0 — 「我的藥」 rebuilds unsafe instructions after validation

`lastCheckNarration` and `/api/preview/elder` call `narrate`, but use its text only as a non-empty
gate. They then call `frameMyMedsWarm`, whose output bypasses narration validation. Its focused
warning tests do not exercise the end-to-end projection invariants. The function
can hide an intake-unlisted medication, omit unresolved coverage and medication purpose, detach raw
warning input from limits/escalation, collapse any number of non-Chinese warnings and even
`consult_physician` severity into singular 「有一項…問藥師」, apply one item's meal relation to an
unrelated generic slot, invent 「第 N 包」, skip the exact due minute, truncate names without
uniqueness checks, and add ungrounded warm-water/movement advice. The preview's provenance segments
describe the discarded narration rather than the displayed message.

Required correction: revert these surfaces to the validated narration, or stop delivery until a
tested elder-projection interface preserves full item/coverage/provenance data and accepts an explicit
medicine-to-slot association. Copy warmth cannot authorize new medication instructions.

#### P0 — cron cadence cannot implement configured times

The deployment ticks daily while the due window is ten minutes. This is a manual demo trigger, not an
operational reminder scheduler. Moving to minute-level cron, a durable delayed job, or a provider
scheduler is required; merely changing copy is not a fix.

### 7.3 Major current gaps

- Rule-file checks validate severity, non-empty verbatim text, and known predicate shapes, but not a
  complete JSON schema. Unknown class references can resolve to an empty token set and silently
  suppress a rule; duplicate IDs, citation shape, limits, age shape and reference integrity are not
  comprehensively checked. Unknown subject age currently does not exclude 65+ rules.
- Narration validation has nine violation codes while older prose described “eight checks” and listed
  ten rows. Quoted text matching removes whitespace and checks substring presence; it is not a
  character-for-character or attribution proof. Dose, behavior and outcome checks are finite regexes.
- `notInPrescriptionRecord` overstates what source labels prove (§4.3).
- Current rich menus are not both 2×2: elder has four cells; caregiver has six cells. Hidden legacy
  actions also remain routable. Menu shape is presentation, not authorization. The elder menu also
  promises 飯前飯後 information even though ordinary snapshots and generic schedule slots do not
  contain it; only the synthetic intake seed currently demonstrates those lines.
- Current furniture includes 「還沒有設定家人的帳號」 and 「還沒有設定長輩的 LINE」 paths.
  Product copy should report that delivery is unavailable without exposing setup-state wording the
  current product direction has removed.
- `MEDBUDDY_DEMO_BROADCAST` is an undocumented high-risk override (§5).

---

## 8. Storage and consistency

### 8.1 Store contracts

| Record | Key shape | Adapter selection | Consistency |
| --- | --- | --- | --- |
| `SubjectLog` | one JSON document per subject | registry chooses Blob when token exists, memory otherwise | whole-document read-modify-write; concurrent writes can clobber |
| `RoleBinding` | one JSON document per LINE user | registry chooses Blob/memory | in-process recent-write overlay only; cross-instance stale reads remain |
| `SubjectSchedule` | one JSON document per subject | most callers choose Blob/memory; `/api/schedule` always Blob | in-process overlay; list/get may be stale across instances |
| audio | private Blob keyed partly by text hash | Blob only | immutable-by-convention; no semantic content verification |
| QR PNG | private Blob keyed by share token | Blob only | proxy currently reads listed URL rather than pathname and may 404; expiry does not delete object |

`globalThis` keeps the registry shared across bundles inside one process. It does not create shared
state between Vercel instances.

### 8.2 Current inconsistency semantics

- `BlobLogStore.read`: missing `head` returns an empty log; after a successful head, a missing/non-200
  `get` also returns empty. A transient unreadable history can therefore look like a first visit.
  Corrupt JSON throws.
- `BlobRoleStore.get`: missing/non-200 can look unbound; parse errors throw. A warm-instance overlay
  narrows, but does not close, the stale-overwrite window.
- `BlobScheduleStore.get`: missing/non-200 or corrupt JSON returns `null`, which is indistinguishable
  from “not configured.”
- `appendObservations` batches one paragraph to reduce self-clobbering, but concurrent requests can
  still overwrite one another.
- `ScheduleStore` behavior differs by caller when `BLOB_READ_WRITE_TOKEN` is absent; the HTTP route
  constructs Blob directly while preview/menu callers may use memory.

Target store interfaces return explicit typed states:

```text
not_found | available(value, version) | unavailable(reason) | corrupt(reason)
```

Writes require optimistic version checks or a transaction. A schedule attempt and its outbox event
must commit atomically; role selection must be strongly consistent; log snapshots and observations
must be append-safe. Postgres is the intended adapter, but the storage product remains an Open
decision until retention, region, cost and operations are agreed.

### 8.3 Retention and deletion

Current signed URL expiry is access expiry, not data deletion. Target must specify separate retention
for logs, observations, role bindings, provider voice models, audio cache, QR images, application logs
and provider copies. It also needs deletion propagation, consent withdrawal, access audit, and backup
policy before real patient data is allowed.

---

## 9. Failure modes

| Failure | Current behavior | Risk | Target behavior |
| --- | --- | --- | --- |
| item not in register | retain `no_match`; disclose coverage | correct conservative result | keep |
| ambiguous item | return candidates; no selection | formatting may create false ambiguity | canonicalize and require human select |
| matched product without ingredients | retain unresolved; no rule | no interaction check possible | keep and explain |
| nothing checkable | `nothingChecked=true` | surface could still be misread | explicit non-reassuring UI test |
| rule file missing | throw on first lazy use | request fails | startup/deploy validation + health check |
| malformed rule reference | some shapes throw; class typo may silently match nothing | false negative | JSON schema + reference integrity |
| preferred narrator hangs | 8-second fallback | applies only to unused preferred narrator seam | provider-specific timeout budget |
| fallback narration invalid | violations returned but text still used | unsafe fail-open | no send/render; incident signal |
| Gemini fails | whole paragraph stored as `other` | structure lost, text preserved | expose fallback state to caregiver |
| Gemini returns some valid and some rejected/omitted spans | accepted spans stored; source remainder not checked or retained | caregiver detail can be silently lost | persist source paragraph and require coverage/accounting |
| Anthropic fails/hangs | 4xx/5xx on explicit failure; no timeout | request/cost can hang | timeout, cancel, quota, retry guidance |
| Anthropic fabricates matching value + evidence | self-consistency check passes | false transcription appears plausible | mandatory human confirmation; investigate pixel-grounded evidence |
| Fish fails | text-only | acceptable if text is safe | keep, with bounded timeout and telemetry |
| LINE send fails/hangs | failure result when response arrives; no timeout | request may hang | bounded timeout; explicit retry policy |
| inbound audio fetch fails | event already marked; log and drop; HTTP 200 | retry is lost | durable processing state; retryable fetch |
| duplicate webhook on another instance | may process twice | duplicate writes/pushes | shared inbox unique key |
| Blob unavailable/corrupt | empty/null/throw varies by store | false “no history/no schedule” | typed unavailable; do not render empty state |
| concurrent log/schedule write | last writer wins | lost observations/schedules | transaction/version check |
| cron runs after 10-minute grace | slot marked skipped late | most daily slots never sent | minute-level durable scheduling |
| schedule for wrong subject | may send its cupboard to demo elder | worst-person error | guard at HTTP, store and delivery seams |
| partial intake exists | warm projection uses intake instead of the full verdict list | medicines absent from intake disappear | merge by stable item identity; disclose unmatched rows |
| warm next-slot projection | first meal relation + generic slot becomes 「第 N 包」; exact-minute uses `>` | wrong meal/packet/time instruction | require explicit association; otherwise state no inferred instruction |
| non-Chinese findings | all counts/severities collapse to singular pharmacist sentence | multiple or physician-level escalation is misrepresented | carry structured findings/count/severity through the interface |
| warm projection drops validated segments | purpose, coverage, actions and provenance disappear | incomplete output appears complete | projection must preserve required segment contract and be revalidated |
| OCR emits `rx` | parser stores source `unknown` | wrong summary grouping/count | single source parser / use `prescription` |
| direct summary guessed | full latest log rendered | privacy disclosure | authenticated route or removal |
| token screenshot leaks | holder can read until expiry | bearer grant; payload readable | minimize payload, audit, revocation if required |
| LINE QR proxy reads Blob by URL | route may return 404 despite stored PNG | appointment handoff image is absent | read by pathname; route test + deployed fetch probe |
| role reselect exposes caregiver material | target same-account role may gain caregiver view | elder/privacy model conflict | decide allowed disclosure before implementation |
| movement aside is inappropriate | only fall-history suppresses | ungrounded health advice | remove or clinically govern eligibility |

---

## 10. Tests, traceability, and evidence limits

### 10.1 Verification commands

| Command | What it establishes | What it does not establish |
| --- | --- | --- |
| `npm test` | current Vitest assertions; default suite can run with provider calls mocked/disabled | live providers, auth, privacy, deployment cadence |
| `npm run typecheck` | TypeScript consistency | runtime behavior |
| `npm run build` | Next.js production build succeeds | deployed environment or route authorization |
| `npm run verify` | the three commands above in sequence | lint, E2E, security, accessibility, retention |
| `npm run lint` | ESLint rules | currently not part of `verify` |

Live LINE send and medication-bag photo tests are conditional and skip without explicit secrets/files.
“All network calls are mocked” applies only to the default offline suite, not those opt-in tests.

### 10.2 Requirement traceability

| Requirement | Current evidence | Missing acceptance evidence |
| --- | --- | --- |
| OBS-01 source-contained observation spans | `src/lib/observations/parse.test.ts` | full-source preservation/coverage; route + Blob + summary E2E; elder-question separation |
| OCR-01 model-response-bounded transcription draft | `src/lib/ocr/validate.test.ts`, Claude adapter tests | pixel provenance; authenticated route, timeout, real review audit |
| OCR-02 review then snapshot | `BagCapture` + `/api/check` tests | `rx` regression test; intake persistence; per-row confirmation |
| CLIN-01 deterministic grounding/rules | grounding, rule, verdict tests | false-positive benchmark at dataset scale |
| NAR-01 narration constrained by verdict | narration tests | fallback fail-closed route/LINE tests; semantic limits |
| ELDER-01 warm 「我的藥」 projection | focused tests for English/Chinese/no-warning branches | item/coverage/purpose preservation, count/severity, official provenance, association, exact-minute, name uniqueness, segment agreement |
| LOG-01 longitudinal snapshot diff | log/diff tests | `BlobLogStore` contract and concurrent-write tests |
| SUM-01 clinician one-page projection | summary pure-module use | direct-route auth, observation attribution, browser E2E |
| SHARE-01 short-lived grant | token and QR pathname pure tests | LINE proxy route/pathname fix, deployed image fetch, bypass removal, revocation/retention, auth-to-mint |
| LINE-01 signed normalized inbound | signature/adapter/inbound tests | multi-instance dedupe, queue/retry, provider timeout |
| ROLE-01 role action enforcement | inbound role tests | same-account reselect policy and privacy acceptance |
| SCH-01 slot validation | schedule pure tests | deployed cadence, Blob adapter, wrong-subject test |
| SCH-02 text + optional voice | injected schedule/delivery tests | latest confirmed regimen, Serin disclosure, timeout |
| PRIV-01 no anonymous health access | none; current implementation violates it | endpoint security tests for every row in §5 |

### 10.3 Current coverage gaps

- no direct contract tests for `BlobLogStore`, `BlobRoleStore`, or `BlobScheduleStore`;
- no route tests for observation, OCR, schedule, cron, preview, direct/shared summary pages, QR image,
  or audio route;
- no browser E2E covering OCR review → check → summary;
- no deployed test proving a configured slot fires at its intended Taipei time;
- no two-subject scheduler test proving recipient isolation;
- no test asserting an invalid deterministic fallback produces no visible/sent text;
- no warm-projection contract test covering full item preservation, required narration segments,
  structured escalation, schedule association, exact-minute behavior, or preview provenance;
- no security test enumerating anonymous read/write/egress/spend endpoints;
- no lint step in the main verification command;
- no provider timeout, retention, deletion or consent-withdrawal tests.

The interface is the preferred test surface. When the target `ClinicalCheck` and subject-aware
scheduler interfaces exist, tests should exercise observable outcomes through them instead of
layering more tests over each current shallow caller.

---

## 11. Target implementation order

1. **Close wrong-person and anonymous access paths.** Guard every endpoint, remove or authenticate
   direct summaries, restrict schedule records to the authorized subject, remove broadcast outside an
   isolated synthetic channel.
2. **Make every elder projection fail closed.** Restore 「我的藥」/preview to validated narration or
   stop delivery until a tested projection preserves items, purpose, coverage, provenance and
   structured escalation without inventing meal/packet advice. Invalid fallback narration must not
   be returned, rendered, synthesized or sent.
3. **Repair the LINE QR handoff.** Read the private Blob by pathname, add a route test, then prove the
   stored image URL is fetchable in the deployed environment before relying on it in a visit.
4. **Resolve the LINE identity decision.** Implement same-account role reselect only after deciding
   what caregiver-only information that account may see; keep subject immutable.
5. **Deepen clinical check composition.** One interface owns source parsing, grounding, verdict,
   narration outcome and optional snapshot persistence.
6. **Complete OCR confirmation.** Use `prescription`, support correction, persist intake only when
   copied and confirmed, and record reviewer/time without keeping the source image unnecessarily.
7. **Replace reminder prototype mechanics.** Read latest confirmed regimen, resolve recipient per
   subject, use durable minute-level scheduling/outbox, and make the schedule model explicit about
   whether it is generic or medication-specific.
8. **Add provider resilience and governance.** AbortSignal, budgets, retry rules, redacted telemetry,
   consent/retention/deletion for Gemini, Anthropic, Fish, LINE and Blob.
9. **Move consistency-critical records behind a transactional adapter.** Migrate log, role, schedule,
   job attempts and audit records with versioned writes.
10. **Expand evidence.** Route security tests, Blob contract tests, browser E2E, deployed scheduler
   probe, grounding false-positive benchmark, and lint in `verify`.

---

## 12. Open decisions and questions for product clarification

These questions block honest Target claims. Each asks not only what to build, but why the capability
is needed and which risk it is allowed to introduce.

1. **Same-account role reselect:** What review/demo problem requires one account to enter both roles?
   May that account see caregiver-only observations about the elder, or is role switching only a
   visual walkthrough with synthetic data? This decides whether role is authorization or presentation.
2. **Data class:** Is the public Vercel deployment contractually synthetic-only, or may real LINE users,
   medication names, photos, observations, or voice samples enter it? If real data is possible,
   endpoint authentication is a release blocker.
3. **Reminder purpose:** Is a slot a general “review today's medicines” prompt, or a medication-specific
   instruction? What outcome defines success: delivered message, heard audio, or medication taken?
   MedBuddy currently cannot and should not infer the last one.
4. **Reminder source of truth:** Should reminders use the latest caregiver-confirmed snapshot, a
   clinician-authored regimen, or a caregiver-maintained schedule? Why is seeded `cupboard` acceptable
   for the current demo, and must it be impossible outside it?
5. **Cron reliability:** Is manual endpoint invocation acceptable only for a live demo, or must the
   deployed URL remind at arbitrary configured times? This determines cron plan versus durable jobs.
6. **Serin persona:** Where must the elder be told that Serin is an AI demo voice styled like a
   granddaughter and not an actual family member? Is consent for the voice owner enough, or is elder
   consent to receive cloned speech also required?
7. **Movement advice:** Why should medication playback say 「起來走一走」? Which user need or evidence
   justifies it, and which conditions beyond known recurrent falls make it unsafe? Default recommendation
   is removal until the answer is testable.
8. **Greeting question:** Is 「今天還好嗎？」 intended to invite a reply? If so, what should the elder's
   answer become; if not, should the system avoid asking a question it cannot reliably handle?
9. **Observation authorship:** Should elder questions appear in clinician summary, caregiver recent
   questions, both, or neither? What label prevents them being mistaken for caregiver observations?
10. **Prescription wording:** Does any trusted prescription record exist, or is source always
    self-reported? If only self-reported, approve the narrower label proposed in §4.3.
11. **Summary distribution:** Why is an anonymous direct caregiver route needed once QR sharing exists?
    Should clinician access be bearer-only for eight hours, and does the product require early
    revocation?
12. **Voice consent:** Is an operator attestation sufficient for demo voices, or must every accepted
    `MEDBUDDY_DEMO_VOICE_ID` have a repository/database consent record? How is withdrawal propagated to
    Fish and cached audio?
13. **Provider governance:** Which regions, retention terms and model versions are acceptable for
    Gemini, Anthropic, Fish, LINE and Vercel? The code cannot derive those policy answers.
14. **Retention:** How long should snapshots, observations, questions, schedules, role bindings, QR,
    audio and logs live, and who may delete/export them?
15. **Safety policy:** On invalid deterministic narration, should the UI show a non-clinical error and
    stop, or is there an approved minimal message? Current behavior silently chooses unsafe continuity.
16. **Elder explanation contract:** Must 「我的藥」 explain each medicine's purpose, or is a name-only
    list intentional? If a generic clock slot has no medication/packet association, what product
    evidence permits saying meal timing or 「第 N 包」? Default is to omit those instructions and the
    warm-water advice until explicit source data and a testable rationale exist.

---

## Appendix A — deployment configuration gaps

Current documented variables include LINE credentials and demo IDs, Blob, Fish, Gemini, Anthropic,
audio signing and summary signing. The code also depends on `CRON_SECRET`, but `.env.example` does not
list it. The code recognizes `MEDBUDDY_DEMO_BROADCAST`, but that flag should be removed or explicitly
classified as synthetic-channel-only rather than normalized through documentation.

Startup validation should reject partial or contradictory configuration before serving traffic:

- only one of the explicit LINE pair IDs set;
- identical pair IDs under the current two-account implementation;
- Fish voice ID without key, or unknown voice without a consent record;
- audio base URL without signing secret;
- share features without `SUMMARY_SHARE_SECRET`;
- cron route without `CRON_SECRET`;
- deployed persistence routes without Blob/database configuration;
- broadcast enabled outside a named isolated demo environment.

## Appendix B — safety statement

MedBuddy currently provides deterministic medication-data grounding, limited encoded criteria,
structured family context, and a clinician-facing summary for a synthetic review prototype. It does
not provide diagnosis, prescribing, adherence verification, complete medication coverage, secure
multi-user account management, or production-grade medical-data governance. A zero-finding result is
only “no encoded finding among resolved items,” never “safe.”

---

## Appendix C — Implementation map

Paths are relative to the repository root. Every feature below can be read
end to end by following its row. This appendix is a navigation aid, not a list
of guarantees; Current status and known violations remain authoritative in
§1–§10.

### C.1 The medical core

| Concern | Path | Responsibility / known limit |
| --- | --- | --- |
| Name normalisation | `src/lib/grounding/normalize.ts` | Tested strength tokens remain distinct; this is not physical-product identity verification |
| Resolution | `src/lib/grounding/resolve.ts` | Three unresolved kinds; canonical ambiguity limits are in §4.2 |
| Rule evaluation | `src/lib/rules/engine.ts` | Deterministic evaluation; runtime schema/reference validation is incomplete (§7.3) |
| Rule shapes | `src/lib/rules/types.ts` | Finding provenance fields; warm projection currently discards part of this contract |
| The verdict | `src/lib/verdict/build.ts`, `.../types.ts` | `outcomeOf` separates "checked, nothing found" from "nothing checkable" |
| Narration | `src/lib/narration/narrate.ts` | Receives a verdict; the elder warm path later replaces its output (§2.5) |
| Narration validation | `src/lib/narration/validate.ts` | Structural and lexical — **not** semantic; fail-open gap in §7 |
| Committed rule sets | `config/rules/stopp-v3.json`, `.../tfda-health-food-warnings.json`, `.../drug-classes.json` | Diffable; every safety change is a reviewable commit |
| Registers | `data/tfda-drugs.json`, `data/tfda-health-foods.json` | Repository snapshots; health-food rows include permits marked expired (§4.2) |

### C.2 Inputs

| Input | Path | Guarantee |
| --- | --- | --- |
| Typed list | `src/app/api/check/route.ts`, `src/app/check-client.tsx` | — |
| Caregiver paragraph | `src/lib/observations/parse.ts` | Accepted spans are whitespace-normalized containment; partial extraction can lose sibling text |
| ↳ model boundary | `src/lib/observations/gemini.ts` | Injectable; tests run offline |
| Bag photograph | `src/lib/ocr/claude.ts` | Claude Sonnet transcribes; forced through a tool schema |
| ↳ the check | `src/lib/ocr/validate.ts` | Model-response self-consistency, not pixel provenance |
| ↳ field shapes | `src/lib/ocr/types.ts` | Status per field; **no confidence score** |
| ↳ intake API | `src/app/api/ocr/bag/route.ts` | Returns a draft, never writes a record |
| ↳ camera / upload UI | `src/app/bag-capture.tsx`, `src/app/bag/` | Appends to the same textarea as typing |
| Speech in | `src/app/speech.tsx` | Browser dictation, zh-TW |

### C.3 Storage

| Record | Path | Note |
| --- | --- | --- |
| Interfaces | `src/lib/log/types.ts`, `src/lib/roles/types.ts`, `src/lib/schedule/store.ts` | Persistence seams; migration still requires lifecycle and transaction design |
| Log | `src/lib/log/blob-store.ts`, `.../memory-store.ts` | `appendObservations` batches one paragraph; concurrent calls may still clobber |
| Diffing | `src/lib/log/diff.ts` | Computed from two snapshots, never stored |
| Role bindings | `src/lib/roles/stores.ts` | In-process overlay narrows a stale-read window it does not close |
| Binding rule | `src/lib/roles/bind.ts` | Elder-terminal, flagged |
| Schedules | `src/lib/schedule/store.ts`, `.../types.ts`, `.../due.ts` | ≤4 slots, ≥60 min apart, quiet hours |
| Wiring | `src/lib/registry.ts` | Held on `globalThis`; Blob when configured, memory otherwise |

### C.4 LINE

| Concern | Path |
| --- | --- |
| Signature over raw bytes | `src/lib/delivery/line/signature.ts` |
| Webhook core (framework-free) | `src/lib/delivery/line/webhook.ts` |
| Route shell | `src/app/api/line/webhook/route.ts` |
| Idempotency | `src/lib/delivery/line/dedupe.ts` |
| **Routing and authorisation** | `src/lib/delivery/inbound.ts` — `ROLE_ACTIONS` |
| Menu action handlers | `src/lib/delivery/menu-actions.ts` |
| Outbound content seam | `src/lib/delivery/line/LineDelivery.ts` |
| Link refusal | `src/lib/delivery/types.ts` — `containsLink` |
| Interface plumbing (not content) | `src/lib/delivery/line/setup-client.ts` |
| Menu definitions | `src/lib/delivery/line/rich-menu.ts` — `assertNoLinksForElder` |
| Menu images | `scripts/render-rich-menu.mts` → `public/rich-menu-*.png` |
| Registration | `scripts/register-rich-menus.mts` |
| Role card | `src/lib/delivery/line/role-card.ts` |
| Fixed demo pair | `src/lib/delivery/line/demo-pair.ts` |
| Demo broadcast | `src/lib/delivery/line/broadcast.ts` |
| Reminder cards | `src/lib/delivery/line/reminders-card.ts`, `.../reminder-settings.ts` |

### C.5 Voice

| Concern | Path |
| --- | --- |
| Provider | `src/lib/voice/fish.ts` |
| Voice profile attestations | `src/lib/voice/profiles.ts` |
| **Find-or-synthesise, keyed by text** | `src/lib/delivery/prerendered-speech.ts` — `speechFor` |
| **What is spoken** | `src/lib/delivery/reminder-framing.ts` |
| ↳ reminder framing | `frameReminder`, `assertNoSelfReport` |
| ↳ 我的藥 | `frameMyMedsWarm`, `spokenName`, `movementAsideFor` |
| Hosting (private blob) | `src/lib/delivery/line/blob-audio-store.ts` |
| Signed URLs | `src/lib/delivery/line/audio-url.ts` |
| Serving route | `src/app/api/line/audio/[key]/route.ts` |
| Offline pre-render | `scripts/prerender-elder-speech.mts` |

### C.6 Clinician handoff

| Concern | Path |
| --- | --- |
| Summary assembly | `src/lib/summary/clinician.ts` |
| The sheet (shared by both routes) | `src/app/summary/[subjectId]/sheet.tsx` |
| Observation table, ordered by prescribing relevance | same file — `ObservationTable` |
| Signed share token | `src/lib/summary/share-token.ts` |
| QR blob path | `src/lib/summary/qr-path.ts` |
| Mint + deliver | `src/lib/summary/deliver-qr-to-line.ts` |
| QR image route (checks the token) | `src/app/api/summary/qr/[token]/route.ts` |
| What the doctor sees | `src/app/summary/s/[token]/page.tsx` |
| Anonymous direct view (current bypass) | `src/app/summary/[subjectId]/page.tsx` |

### C.7 Scheduling

| Concern | Path |
| --- | --- |
| Slot model and limits | `src/lib/schedule/types.ts` |
| What is due | `src/lib/schedule/due.ts` |
| One tick | `src/lib/schedule/run.ts` |
| Cron target | `src/app/api/cron/deliver-scheduled/route.ts`, `vercel.json` |
| Caregiver UI | `src/app/schedule-card.tsx`, `src/app/api/schedule/route.ts` |
| Content path | `src/lib/delivery/deliver-explanation.ts` |

### C.8 Dashboard

| Concern | Path |
| --- | --- |
| Workspace | `src/app/page.tsx`, `src/app/check-client.tsx` |
| **The elder's phone, rendered** | `src/app/elder-preview.tsx`, `src/app/api/preview/elder/route.ts` |
| Pair status | `src/lib/hub/status.ts` |

### C.9 Operational scripts

Read-only unless marked. All take `--apply` or credentials explicitly.

| Script | Purpose |
| --- | --- |
| `scripts/list-roles.mts` | Who is bound as what |
| `scripts/unbind-role.mts` | **Destructive.** Removes a binding *and* unlinks the menu — both halves |
| `scripts/send-role-card.mts` | Push the card on demand (demo) |
| `scripts/list-rich-menus.mts` | What exists on the channel |
| `scripts/list-speech.mts` | Which clips are cached |
| `scripts/list-log.mts` | One person's record |
| `scripts/seed-demo-observations.mts` | **Destructive.** States a known demo state rather than deriving it |
| `scripts/seed-demo-snapshot.mts` | **Destructive.** A snapshot in the shape OCR will produce |
| `scripts/ingest-tfda.mts` | Rebuild the registers from data.gov.tw |
| `scripts/probe-role-store.mts`, `scripts/probe-terminal-rule.mts` | Reproduce the Blob consistency failures |

### C.10 Tests

Use `npm test` for the current count. Live-network probes self-skip without
credentials; a green default suite does not verify deployed providers or the
production integration paths listed in §10.3.

| The claim you want checked | File |
| --- | --- |
| Narration cannot introduce a drug | `src/lib/narration/narrate.test.ts` |
| Validator catches an unsupported claim | `src/lib/narration/narrate.test.ts` — the validator has no separate test file; its cases live with the narrator it guards |
| Observation containment and fallback behavior | `src/lib/observations/parse.test.ts` |
| OCR model-response consistency checks | `src/lib/ocr/validate.test.ts` |
| Elder-terminal, and the flag | `src/lib/roles/bind.test.ts` |
| A menu is not an authorisation boundary | `src/lib/delivery/__tests__/inbound-roles.test.ts` |
| Rich-menu and adapter link guards | `src/lib/delivery/line/rich-menu.test.ts`, `src/lib/delivery/line/__tests__/line-adapter.test.ts` |
| Reminder/warm framing branches (not full production safety) | `src/lib/delivery/reminder-framing.test.ts` |
| Four observations are stored as four | `src/lib/log/append-batch.test.ts` |
| QR delivery orchestration with injected adapters; proxy route remains untested | `src/lib/summary/deliver-qr-to-line.test.ts` |
