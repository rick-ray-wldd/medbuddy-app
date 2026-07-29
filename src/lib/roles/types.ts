/**
 * Who is holding this phone.
 *
 * The whole LINE interface depends on the answer — which rich menu is linked,
 * whether a link may be sent, whether the surface may show what the family
 * reported. So it is asked once (LINE-UX-SPEC §1) and then stored, and every
 * later decision reads it rather than guessing.
 *
 * This is a property of the *person*, not of the session. There is no "switch
 * to elder view" anywhere, because a view is not what this is.
 */

export type Role = "elder" | "caregiver";

export type RoleBinding = {
  /** LINE userId. Opaque to everything above the adapter. */
  channelUserId: string;
  role: Role;
  boundAt: string;
  /**
   * Whose medications this person may ask about.
   *
   * For an elder this is himself. For a caregiver it is who they are currently
   * acting for — a carer may hold twelve residents, and a finding attached to
   * the wrong one is the worst error this product can make (spec §3).
   */
  subjectId: string;
};

export interface RoleStore {
  get(channelUserId: string): Promise<RoleBinding | null>;
  put(binding: RoleBinding): Promise<void>;
  /**
   * Which account holds a role for a subject.
   *
   * The reverse of `get`, and the reason it exists: sending the clinician
   * summary needs to know which phone is the older adult's, and that answer
   * lives here the moment he taps the card. Asking an environment variable
   * instead made 產生回診單 fail with "no LINE account is bound to 父親" while
   * his phone was, in fact, bound.
   *
   * Null when nobody holds it — which is a real state during setup, not an
   * error.
   */
  findByRole(subjectId: string, role: Role): Promise<RoleBinding | null>;
}
