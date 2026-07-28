/**
 * Voice profiles available to the demo.
 *
 * In the product a profile is created by a caregiver recording themselves —
 * `FishVoiceProvider.calibrate`, which refuses to produce a profile without a
 * consent statement. This file exists because the demo needs something to play
 * before that screen is built, and because the consent behind it should be a
 * fact in the repository rather than a claim in a conversation.
 */

import type { VoiceProfile } from "./types";

/**
 * A real person's voice, used with permission.
 *
 * The model was built for Mirror, my own app. Serin consented to its use in
 * MedBuddy on 2026-07-29. She is not a caregiver in this product and the voice
 * is not a family member's — it stands in so the demo has something to speak
 * with, and the product design remains the caregiver's own voice.
 *
 * Recorded here rather than passed as a bare id at the call site, because the
 * argument the documents make about voice is a consent argument, and a demo
 * that could not say whose voice it was using would undercut it.
 */
export const SERIN_DEMO_VOICE: VoiceProfile = {
  id: "fish:b340fd7c23504a1c9917bcb5284a968e",
  subjectId: "subj-father",
  displayName: "示範聲音(Serin)",
  provider: "fish",
  externalVoiceId: "b340fd7c23504a1c9917bcb5284a968e",
  createdAt: "2026-05-16",
  consent: {
    statement:
      "Serin consented on 2026-07-29 to the use of her Fish Audio voice model — " +
      "originally built for Mirror — in the MedBuddy demo. This is a stand-in " +
      "for a caregiver's own voice, which is what the product uses.",
    givenAt: "2026-07-29",
  },
};

export const DEMO_VOICES: VoiceProfile[] = [SERIN_DEMO_VOICE];

export function findDemoVoice(externalVoiceId: string): VoiceProfile | undefined {
  return DEMO_VOICES.find((v) => v.externalVoiceId === externalVoiceId);
}
