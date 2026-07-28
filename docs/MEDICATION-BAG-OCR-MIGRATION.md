# Medication-bag OCR — annotation and LINE migration contract

> Audience: the Claude Code agent integrating medication-bag images into the
> existing LINE workflow.
>
> Status: **design and machine-readable output contract only**. This document
> does not claim that OCR is implemented in the application.

## 0. Evidence we actually have

The exploratory comparison used five real Taiwanese medication-bag JPGs from
`data/img/`. Claude Sonnet produced materially more complete and stable
structured drafts than Haiku. There was no independently transcribed gold set,
so there is **no defensible numerical accuracy score**. A sixth PNG was added
later and was not part of that comparison.

The correct product claim is:

> Sonnet is useful for pre-filling a reviewable draft. Its output is not a
> medication fact and must not enter grounding, rules, or the longitudinal log
> until a caregiver confirms the critical fields.

## 1. Safety invariant

> **The vision model transcribes visible evidence. It never identifies a drug
> from appearance, supplies missing instructions, interprets a prescription,
> or makes a clinical decision.**

Consequences:

- Preserve printed text verbatim in `value`; do not silently normalize it.
- Use `null` plus an explicit status when text is absent or unreadable.
- Never infer a drug name from pill colour, shape, indication, department, or
  neighbouring rows.
- Never infer dose, route, frequency, timing, duration, or quantity from common
  practice.
- Never use Claude's medical knowledge to fill a field.
- Never write model output directly to `RegimenSnapshot`.
- TFDA matching remains the responsibility of `src/lib/grounding/**` after
  caregiver confirmation.
- Verdict and escalation remain the responsibility of the existing rule and
  narration modules.

Anthropic's vision documentation likewise says vision output in high-risk and
sensitive use cases requires careful review and should not replace professional
medical judgment:
https://docs.anthropic.com/zh-CN/docs/build-with-claude/vision

## 2. The seam

Claude is a true external dependency. Put it behind one small interface and
test the interface with a deterministic fake adapter.

```ts
export type MedicationBagImage = {
  imageId: string;                 // internal opaque id, not the file name
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

export type MedicationBagExtractionRequest = {
  requestId: string;
  subjectId: string;               // resolved before OCR; never guessed by OCR
  submittedByCarerId: string;      // caregiver only in the first release
  images: MedicationBagImage[];
};

export interface MedicationBagExtractor {
  extract(
    request: MedicationBagExtractionRequest,
  ): Promise<MedicationBagExtractionResult>;
}
```

Production adapter: `ClaudeMedicationBagExtractor`.

Test adapter: an in-memory fake returning committed fixtures that conform to
`docs/MEDICATION-BAG-OCR-OUTPUT.schema.json`.

The interface is the test surface. Tests should assert the returned draft and
failure taxonomy, not Anthropic request internals.

### What does not belong in the adapter

- LINE event parsing or reply/push logic
- subject/user authorization
- TFDA lookups
- medical rules
- narration
- log writes
- caregiver confirmation state
- Flex Message or LIFF presentation

## 3. Placement in the current architecture

```text
LINE image event
      │
      ▼
LINE webhook adapter
  signature · idempotency · image-content download
      │
      ▼
Identity/CareRelationship lookup
  channelUserId → actor → allowed subject
      │
      ▼
MedicationBagExtractor interface
      │
      ├── ClaudeMedicationBagExtractor (production)
      └── FakeMedicationBagExtractor   (tests)
      │
      ▼
schema validation
      │
      ▼
PendingMedicationBagDraft
  NOT a RegimenSnapshot
      │
      ▼
caregiver review in LINE/LIFF/Web
      │ confirm or correct medicine name + strength + schedule
      ▼
existing Resolver.resolveAll()
      │
      ▼
existing verdict → narration → log pipeline
```

Current files to respect:

- `src/lib/delivery/line/webhook.ts` handles transport. It currently accepts
  text/audio only; image support belongs here only through normalized content
  download and hand-off.
- `src/lib/delivery/inbound.ts` is product orchestration. It must not contain a
  raw Anthropic `fetch` call.
- `src/lib/delivery/line/LineDelivery.ts` sends already-approved content. It
  must not inspect OCR fields.
- `src/lib/grounding/resolve.ts` remains the only path from a confirmed printed
  name to TFDA grounding.
- `src/lib/log/types.ts` remains confirmed longitudinal state, not a store for
  unreviewed model drafts.

## 4. Output contract

Every successful provider response must validate against:

`docs/MEDICATION-BAG-OCR-OUTPUT.schema.json`

A synthetic, de-identified example is in:

`docs/MEDICATION-BAG-OCR-OUTPUT.example.json`

### Field state, not fake confidence

Do not expose a model-generated percentage such as `confidence: 0.93`. It is
not calibrated and encourages unsafe thresholds. Each field instead carries:

| Field | Meaning |
| --- | --- |
| `value` | exact visible transcription, or `null` |
| `status` | `observed`, `partially_legible`, `not_visible`, or `conflicting` |
| `evidence` | the smallest exact quote supporting the value |
| `locationHint` | human-readable region/row hint; not a claimed pixel box |

Bounding boxes are deliberately not required. Claude vision is being used as a
transcription model, not a calibrated object detector. A fabricated precise
box is worse than a coarse truthful hint such as `medication table, row 2`.

### Critical fields

For each medication row, these fields are critical:

1. `printedName`
2. `strength`
3. `dosePerAdministration`
4. `frequency`
5. `route`
6. `timing`

`needsHumanReview` must be `true` for every OCR result in v1. It is additionally
flagged by a reason whenever a critical field is partial, conflicting, or not
visible. Human review is not bypassed even when every field is clear.

### Privacy fields

The output contract deliberately excludes patient name, national ID, medical
record number, address, telephone number, and date of birth. It reports only
`patientIdentifyingTextDetected: true|false`; it never returns the identifying
text.

Medication provenance that is useful for handoff may be returned when visible:

- institution name
- department
- prescription/dispensing date
- bag or prescription reference number only if the product later establishes
  a justified need; it is excluded from v1

## 5. Runtime extraction technique

### Step 1 — acquisition quality gate

Before any external request:

- accept only configured image MIME types;
- enforce byte and pixel limits;
- correct EXIF orientation locally;
- reject empty/corrupt files;
- prefer a crop containing the medication table;
- when practical, redact/crop patient identifiers before sending the image;
- create an opaque `imageId`; never use a patient name as an object key;
- never log base64, image bytes, signed image URLs, or provider raw output.

The runtime result records visible quality problems from this fixed vocabulary:

- `blur`
- `glare`
- `perspective`
- `cropped_text`
- `low_resolution`
- `handwriting`
- `overlap`
- `multiple_documents`

### Step 2 — row inventory

Count medication rows before extracting fields. Preserve top-to-bottom order.
Do not merge rows just because the model believes two medicines are equivalent.
Do not split one printed row merely because it wraps onto two visual lines.

### Step 3 — verbatim field transcription

For each row, transcribe only the text visibly associated with that row. Keep
Chinese and Latin drug names as printed. Keep original units and abbreviations
(`mg`, `毫克`, `PC`, `BID`) rather than translating or expanding them.

### Step 4 — coverage reconciliation

At the end of extraction, reconcile:

```text
visible medication rows
= returned medication rows
+ explicitly unreadable/unassigned regions
```

If the counts do not reconcile, set document status to `needs_better_image` or
add a review reason. Never quietly omit a row.

### Step 5 — local validation

Validate JSON locally before any product code sees it:

- exact schema version;
- no extra properties;
- unique `rowId` and `rowIndex`;
- row order is monotonic;
- `observed` requires non-empty `value` and `evidence`;
- `not_visible` requires `value: null`;
- all results require human review;
- empty medicine list is valid only for `no_medication_table` or
  `needs_better_image`.

Provider JSON that fails validation is a provider failure, not a partial
medication result.

## 6. Claude extraction instruction

Use a vision-capable Sonnet model selected through configuration. Do not hard
code a dated model identifier in product logic. Send image content through the
Anthropic Messages interface using a server-only `ANTHROPIC_API_KEY`. Prefer an
official schema-constrained mechanism when supported, and always run the same
local JSON Schema validation afterward.

Suggested system instruction:

```text
You are a transcription engine for Taiwanese printed medication bags.

Your only job is to copy visible text into the supplied JSON schema.
You are not a pharmacist and must not use medical knowledge to complete,
correct, translate, or normalize any field.

Rules:
1. Preserve each medication row and its original top-to-bottom order.
2. Copy text exactly as printed, including units and abbreviations.
3. If any character is unclear, use status partially_legible and transcribe
   only the visible portion. Do not guess the missing characters.
4. If a field is absent, return value null with status not_visible.
5. Do not infer medicine identity from colour, shape, indication, department,
   or neighbouring rows.
6. Do not infer dose, frequency, route, timing, duration, or quantity.
7. Do not return patient name, patient id, medical-record number, address,
   telephone number, or date of birth. Only mark whether identifying text was
   detected.
8. Every non-null value must include an exact evidence quote and a coarse
   location hint.
9. Every result requires caregiver review.
10. Return only data conforming to the supplied schema.
```

The request should also state the number of images and stable `imageId` values,
so evidence can refer to an image without exposing its original filename.

## 7. Gold annotation technique for evaluation

Runtime extraction and evaluation annotation are different jobs. A gold set is
human evidence, not another Claude run.

A template is provided at:

`docs/MEDICATION-BAG-OCR-GOLD.example.json`

For each evaluation image:

1. Annotator A transcribes every visible medication row and critical field.
2. Annotator B independently checks the image and Annotator A's transcription.
3. Disagreements are recorded and adjudicated; do not silently overwrite the
   first annotation.
4. The adjudicated value becomes `goldValue`.
5. Illegible source text is annotated `unreadable`, not guessed.
6. Patient identifiers are redacted from the annotation artifact.
7. Store only opaque image ids in committed fixtures; do not commit real
   medication-bag images unless explicitly approved and de-identified.

### Metrics

Report at least:

```text
row recall
  correctly returned medication rows / gold medication rows

row precision
  correctly returned medication rows / returned medication rows

critical-field exact match
  exact matches for name, strength, dose, frequency, route, timing
  / scorable gold critical fields

normalized-field match
  comparison after evaluation-only whitespace/full-width normalization

critical hallucination rate
  non-null critical values where the gold field is absent or unreadable
  / returned critical values

document review recall
  documents with a real critical ambiguity correctly flagged for review
  / documents with a real critical ambiguity
```

Never collapse these into one vague `OCR accuracy` number. For medication use,
a wrong strength is more important than a punctuation mismatch.

## 8. LINE behaviour

### First implementation: caregiver image only

The first safe slice is:

1. A mapped, authorized caregiver sends a medication-bag image.
2. LINE transport downloads it and hands normalized bytes upstream.
3. The subject is resolved from an explicit active-subject context. Never pick
   a subject from the patient name printed on the image.
4. Claude returns a schema-valid draft.
5. The draft is stored as pending review, not as medication history.
6. LINE returns a short coverage message and a caregiver-only LIFF/Web review
   link or structured review flow.
7. The caregiver confirms or edits every medication row.
8. Only confirmed `printedName + strength` text is handed to
   `Resolver.resolveAll(..., source: "prescription")`.
9. Only after confirmation may the application append a snapshot and build a
   verdict.

Example caregiver response:

```text
王阿姨｜藥袋辨識草稿

看見 4 列藥品。
3 列文字清楚，1 列需要人工確認。
尚未寫入王阿姨的用藥紀錄。

[檢查辨識結果]
```

### Elder image behaviour

Do not ask an elder to validate a medication transcription. In v1, an elder's
image can be queued for an authorized caregiver, but it must not create a
snapshot or produce a medicine-specific answer before review.

### Current LINE changes the agent will need

- Extend webhook parsing from text/audio to image without putting OCR inside
  `src/lib/delivery/line/**`.
- Generalize or add content download for image bytes while preserving signature
  verification, idempotency, content-provider checks, and logging rules.
- Add an image case to the normalized inbound interface.
- Add explicit actor role and active subject resolution before extraction.
- Persist a `PendingMedicationBagDraft` with expiry and audit fields.
- Add caregiver review presentation. The current generic `DeliveryMessage`
  supports text/speech only; do not inject raw Flex JSON into the medical core.
- Do not let image processing delay webhook acknowledgement; use `waitUntil`
  or a queue and durable idempotency for production.

## 9. Mapping into the existing domain

OCR fields are not the same as `GroundedItem` fields.

```text
OCR draft printedName + strength
       │ caregiver confirms
       ▼
RawInput.text for Resolver
       │ TFDA match
       ▼
GroundedItem
```

Dose and schedule fields currently have no canonical home in
`src/lib/grounding/types.ts`. Do not smuggle them into `GroundedItem` or let
rules consume them implicitly. Keep them in the confirmed capture record until
the domain model deliberately adds a reviewed regimen-instruction type.

Suggested intermediate domain terms:

```ts
type PendingMedicationBagDraft = {
  id: string;
  subjectId: string;
  submittedByCarerId: string;
  providerMessageId: string;
  createdAt: string;
  expiresAt: string;
  extraction: MedicationBagExtractionResult;
  status: "pending_review" | "confirmed" | "rejected" | "expired";
};

type ConfirmedMedicationBagRow = {
  rowId: string;
  inputText: string; // confirmed printed name + strength, still verbatim
  dosePerAdministration?: string;
  frequency?: string;
  route?: string;
  timing?: string;
  duration?: string;
  confirmedByCarerId: string;
  confirmedAt: string;
};
```

## 10. Failure taxonomy

Return stable machine-readable failures from the extraction module:

| Reason | Retryable | Product behaviour |
| --- | ---: | --- |
| `unsupported-image-format` | no | reject before provider call |
| `image-too-large` | no | ask caregiver to retake/crop in review UI |
| `image-corrupt` | no | no provider call |
| `provider-auth-failed` | no | operator error, do not expose credentials |
| `provider-rate-limited` | yes | one controlled retry upstream |
| `provider-unavailable` | yes | keep pending media reference if permitted |
| `provider-invalid-output` | maybe | never pass partial JSON downstream |
| `no-medication-table` | no | show reviewable non-result |
| `needs-better-image` | no | no grounding, no snapshot |

Never log image content, patient text, extracted medication text, raw provider
responses, API keys, or signed media URLs. Log opaque request/message ids,
status, timing, byte count, model identifier, schema version, and failure reason.

## 11. Tests and acceptance criteria

Minimum offline tests:

- schema-valid complete extraction;
- partially legible critical field remains partial and triggers review;
- absent field stays `null` and is not inferred;
- no patient identifiers appear in output;
- row ordering and unique ids;
- provider invalid JSON is rejected;
- provider schema mismatch is rejected;
- unmapped or unauthorized LINE user never invokes OCR;
- image for no active subject never invokes OCR;
- duplicate LINE message id produces no duplicate extraction;
- unconfirmed extraction never calls `Resolver` or `LogStore`;
- caregiver confirmation produces `RawInput` using confirmed verbatim text;
- elder upload never creates a snapshot;
- logs contain no base64, extracted text, or credentials.

Integration acceptance:

```text
caregiver sends image
→ webhook acknowledges safely
→ one pending draft is created for the selected subject
→ caregiver sees row coverage and review action
→ caregiver corrects/approves rows
→ confirmed names enter existing TFDA grounding
→ unresolved TFDA matches remain unresolved
→ only then is a snapshot appended
```

The exact project commands must continue to pass:

```bash
npm run typecheck
npm test
npm run build
```

## 12. Definition of done

The OCR migration is not done merely because Claude returns JSON. It is done
when all of the following are true:

- a LINE image is accepted only from an authorized caregiver;
- subject selection is explicit and verified;
- external output validates against the committed schema;
- every draft is visibly labelled unconfirmed;
- every critical field can be corrected;
- confirmation is audited;
- unconfirmed data cannot reach grounding, rules, narration, or logs;
- confirmed names use the existing Resolver;
- unreadable and unresolved items remain visible;
- provider and image failures have tested behaviour;
- no secret or patient image/text appears in logs;
- PRD/TDD describe the implemented state without claiming measured accuracy.

## 13. Copy-paste task for the Claude Code agent

```text
Implement the first safe medication-bag OCR slice described in
docs/MEDICATION-BAG-OCR-MIGRATION.md.

Treat docs/MEDICATION-BAG-OCR-OUTPUT.schema.json as the provider output
contract and docs/MEDICATION-BAG-OCR-OUTPUT.example.json as an example only.
Do not modify the schema without first explaining the compatibility impact.

Keep Claude behind a MedicationBagExtractor interface. Extend LINE transport
only to normalize/download image content; keep Anthropic calls, TFDA grounding,
medical rules, and presentation outside src/lib/delivery/line/**.

Implement caregiver-only intake first. Never infer the subject from text in
the image, never persist an unconfirmed result as a RegimenSnapshot, and never
let OCR produce a clinical finding. After caregiver confirmation, pass the
confirmed printed name + strength through the existing Resolver and preserve
unresolved results.

Add offline tests for every acceptance criterion in §11. Preserve existing
tests and exact run commands. Before editing, report any conflict between this
contract and the current code or LINE UX specification.
```

