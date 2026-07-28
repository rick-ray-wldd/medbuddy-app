/**
 * Speech, in and out.
 *
 * Two providers behind one interface, and the split is not about quality.
 *
 * The browser's own synthesis runs on the device: nothing leaves, no key, no
 * account, works offline. It is the default for that reason.
 *
 * A cloned caregiver voice is materially better at getting a
 * technology-averse older adult to engage — a familiar voice is the difference
 * between opening the thing and ignoring it — but synthesising a medication
 * explanation with a third-party provider **sends health information off the
 * process**. That is the only place in this product where that happens, so it
 * is opt-in, per-subject, and stated rather than defaulted.
 *
 * ## What is deliberately impossible here
 *
 * There is no way to register a voice that is not the caregiver's own, and no
 * outbound path at all. Cloned family voices are the live fraud vector against
 * older adults, and a deceased person cannot consent. The design that survives
 * is: the caregiver records themselves, and the older adult hears it only after
 * pressing something.
 */

export type VoiceProfileId = string;

export type VoiceProfile = {
  id: VoiceProfileId;
  /** Which person's carer this voice belongs to. Never shared across subjects. */
  subjectId: string;
  /** Shown to the older adult, e.g. 「小明的聲音」. */
  displayName: string;
  provider: "browser" | "fish";
  /** Provider-side model id. Absent for the browser voice. */
  externalVoiceId?: string;
  createdAt: string;
  /**
   * Recorded consent. The person whose voice this is must be the person who
   * registered it, and the product has no route to any other case.
   */
  consent: {
    /** Free text, in the caregiver's words, kept as given. */
    statement: string;
    givenAt: string;
  };
};

export type SynthesisRequest = {
  text: string;
  /** Traditional Chinese by default; the register and the criteria are zh-TW. */
  language: "zh" | "en";
  profile: VoiceProfile;
};

export type SynthesisResult =
  | { ok: true; audio: Uint8Array; format: "mp3"; durationMs?: number }
  | { ok: false; reason: string; retryable: boolean };

export interface VoiceProvider {
  readonly name: VoiceProfile["provider"];
  /** Never called for the browser provider, which synthesises on the device. */
  synthesise(request: SynthesisRequest): Promise<SynthesisResult>;
}

export type CalibrationSample = {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
};

export interface VoiceCalibrator {
  /**
   * Register a caregiver's own voice from samples they recorded.
   *
   * Returns a profile, or a reason. Never partially succeeds: a profile that
   * exists but does not speak is worse than none, because the elder-facing
   * surface would offer it.
   */
  calibrate(input: {
    subjectId: string;
    displayName: string;
    consentStatement: string;
    samples: CalibrationSample[];
  }): Promise<{ ok: true; profile: VoiceProfile } | { ok: false; reason: string }>;
}

/** The voice available with no setup, no key, and nothing leaving the device. */
export function browserProfile(subjectId: string): VoiceProfile {
  return {
    id: `browser:${subjectId}`,
    subjectId,
    displayName: "系統語音",
    provider: "browser",
    createdAt: "",
    consent: { statement: "裝置內建語音,不涉及任何人的聲音", givenAt: "" },
  };
}
