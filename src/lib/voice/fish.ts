/**
 * Fish Audio adapter — cloning a caregiver's own voice, and speaking with it.
 *
 * The request shapes follow the ones already in production in my own app
 * (Mirror): a private model built from samples, then s2-pro synthesis against
 * that model's id. Re-implemented here rather than copied, and narrowed: this
 * adapter can only ever build a private model and can only ever speak text it
 * is handed.
 *
 * ⚠️ **This is the one place health information leaves the process.** Everything
 * else in the product reads files committed to this repository. A caregiver
 * turning this on is choosing to send medication explanations to a third party
 * so that their parent hears a familiar voice, and that trade is theirs to make
 * knowingly — which is why it is opt-in, per-subject, and named in the TDD's
 * privacy section rather than buried.
 */

import type {
  CalibrationSample,
  SynthesisRequest,
  SynthesisResult,
  VoiceCalibrator,
  VoiceProfile,
  VoiceProvider,
} from "./types";

const MODEL_URL = "https://api.fish.audio/model";
const TTS_URL = "https://api.fish.audio/v1/tts";

/**
 * Fish caps total sample length. Mirror trims to stay inside it; here we
 * refuse instead, because silently using part of what someone recorded is the
 * kind of surprise a consent flow should not contain.
 */
const MAX_TOTAL_SAMPLE_BYTES = 25 * 1024 * 1024;

function apiKey(): string | null {
  return process.env.FISH_AUDIO_API_KEY?.trim() || null;
}

export class FishVoiceProvider implements VoiceProvider, VoiceCalibrator {
  readonly name = "fish" as const;

  async calibrate(input: {
    subjectId: string;
    displayName: string;
    consentStatement: string;
    samples: CalibrationSample[];
  }): Promise<{ ok: true; profile: VoiceProfile } | { ok: false; reason: string }> {
    const key = apiKey();
    if (!key) return { ok: false, reason: "FISH_AUDIO_API_KEY is not configured" };
    if (input.samples.length === 0) return { ok: false, reason: "no samples provided" };
    if (!input.consentStatement.trim()) {
      // No consent, no voice. There is no default statement to fall back on.
      return { ok: false, reason: "a consent statement is required" };
    }

    const total = input.samples.reduce((n, s) => n + s.bytes.length, 0);
    if (total > MAX_TOTAL_SAMPLE_BYTES) {
      return { ok: false, reason: `samples total ${Math.round(total / 1e6)}MB, over the limit` };
    }

    const form = new FormData();
    form.append("title", `MedBuddy — ${input.displayName}`);
    form.append("train_mode", "fast");
    form.append("enhance_audio_quality", "true");
    form.append("type", "tts");
    // Private, always. A caregiver's voice must not become a public model.
    form.append("visibility", "private");
    for (const sample of input.samples) {
      form.append(
        "voices",
        new Blob([sample.bytes as unknown as BlobPart], { type: sample.mimeType }),
        sample.filename,
      );
    }

    let response: Response;
    try {
      response = await fetch(MODEL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
    } catch (e) {
      return { ok: false, reason: `could not reach the voice provider: ${String(e)}` };
    }

    if (!response.ok) {
      return { ok: false, reason: `voice provider responded ${response.status}` };
    }

    const data = (await response.json()) as Record<string, string>;
    const externalVoiceId = data._id ?? data.model_id ?? data.id;
    if (!externalVoiceId) {
      // A model we cannot address is not a model. Fail rather than store a
      // profile that would appear in the elder's options and never speak.
      return { ok: false, reason: "voice provider returned no model id" };
    }

    const now = new Date().toISOString();
    return {
      ok: true,
      profile: {
        id: `fish:${externalVoiceId}`,
        subjectId: input.subjectId,
        displayName: input.displayName,
        provider: "fish",
        externalVoiceId,
        createdAt: now,
        consent: { statement: input.consentStatement.trim(), givenAt: now },
      },
    };
  }

  async synthesise(request: SynthesisRequest): Promise<SynthesisResult> {
    const key = apiKey();
    if (!key) return { ok: false, reason: "FISH_AUDIO_API_KEY is not configured", retryable: false };

    const referenceId = request.profile.externalVoiceId;
    if (!referenceId) {
      return { ok: false, reason: "profile carries no provider voice id", retryable: false };
    }

    let response: Response;
    try {
      response = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          model: "s2-pro",
        },
        body: JSON.stringify({
          text: request.text,
          format: "mp3",
          mp3_bitrate: 128,
          latency: "balanced",
          chunk_length: 200,
          reference_id: referenceId,
          language: request.language,
        }),
      });
    } catch (e) {
      return { ok: false, reason: `could not reach the voice provider: ${String(e)}`, retryable: true };
    }

    if (response.status === 429) {
      return { ok: false, reason: "voice provider rate limited", retryable: true };
    }
    if (!response.ok) {
      return { ok: false, reason: `voice provider responded ${response.status}`, retryable: false };
    }

    return {
      ok: true,
      audio: new Uint8Array(await response.arrayBuffer()),
      format: "mp3",
    };
  }
}
