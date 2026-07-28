/**
 * What changed between two captures of the same cupboard.
 *
 * Pure. The signal a clinician can use in three minutes is not the list — they
 * can see the prescriptions already — it is the delta, and specifically the
 * parts of the delta that never reached them: something bought over the
 * counter, something left over that came back, something that stopped without
 * anyone recording why.
 */

import type { GroundedItem } from "../grounding/types";
import type { RegimenChange, RegimenSnapshot } from "./types";

/**
 * Identity for comparison.
 *
 * A resolved item is identified by its permit, so the same medicine typed two
 * different ways does not read as a change. An unresolved item has only what
 * the person wrote, so that is what identifies it — which means a typo will
 * look like a substitution. That is the honest behaviour: we genuinely do not
 * know whether it is the same thing.
 */
function identity(item: GroundedItem): string {
  return item.resolved ? `permit:${item.permit}` : `text:${item.inputText}`;
}

function label(item: GroundedItem) {
  return {
    inputText: item.inputText,
    nameZh: item.resolved ? item.nameZh : undefined,
  };
}

export function diffSnapshots(
  earlier: RegimenSnapshot,
  later: RegimenSnapshot,
): RegimenChange {
  const before = new Map(earlier.items.map((i) => [identity(i), i]));
  const after = new Map(later.items.map((i) => [identity(i), i]));

  const added = [...after].filter(([k]) => !before.has(k)).map(([, i]) => label(i));
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, i]) => label(i));
  const unchanged = [...after].filter(([k]) => before.has(k)).length;

  return {
    since: earlier.capturedAt,
    until: later.capturedAt,
    added,
    removed,
    unchanged,
  };
}

/**
 * The change against the previous capture, or null when there is nothing to
 * compare against.
 *
 * Null rather than an empty change: "nothing changed" and "this is the first
 * time we looked" are different statements, and a summary that renders the
 * second as the first is telling a clinician something untrue.
 */
export function changeSinceLast(snapshots: RegimenSnapshot[]): RegimenChange | null {
  if (snapshots.length < 2) return null;
  const ordered = [...snapshots].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return diffSnapshots(ordered[ordered.length - 2], ordered[ordered.length - 1]);
}
