/**
 * What the older adult receives, rendered for the web.
 *
 * The dashboard is where a reviewer meets this product, and the half that
 * matters most happens on a phone they do not have. This returns the exact
 * message his LINE would show — same narration, same framing, same schedule —
 * by calling the same functions rather than describing them.
 *
 * Read-only and side-effect free: it sends nothing, records nothing, and does
 * not mint a token. Looking at the preview must not be an event in his log.
 */

import { NextResponse } from "next/server";
import { findSubject } from "@/lib/subjects";
import { getRegistry } from "@/lib/registry";
import { narrate } from "@/lib/narration/narrate";
import { frameMyMeds } from "@/lib/delivery/reminder-framing";
import { narrationHash } from "@/lib/delivery/prerendered-speech";

export async function GET(request: Request) {
  const subjectId =
    new URL(request.url).searchParams.get("subjectId") ?? "subj-father";
  const subject = findSubject(subjectId);
  if (!subject) return NextResponse.json({ error: "unknown subject" }, { status: 400 });

  const { logStore, knownMedicines } = getRegistry();

  const [log, slots] = await Promise.all([
    logStore.read(subject.id).catch(() => null),
    (async () => {
      const { BlobScheduleStore, InMemoryScheduleStore } = await import(
        "@/lib/schedule/store"
      );
      const store = process.env.BLOB_READ_WRITE_TOKEN
        ? new BlobScheduleStore()
        : new InMemoryScheduleStore();
      const schedule = await store.get(subject.id).catch(() => null);
      return (schedule?.slots ?? []).filter((s) => s.enabled).map((s) => s.timeOfDay);
    })(),
  ]);

  const latest = log?.snapshots.at(-1);
  if (!latest) {
    return NextResponse.json({
      subject: { id: subject.id, displayName: subject.displayName },
      hasSnapshot: false,
      slots,
    });
  }

  const outcome = await narrate(latest.verdict, "elder", null, knownMedicines);
  const narration = outcome.narration.segments.map((s) => s.text).join("\n");
  // Same arguments the LINE path passes, so the preview cannot drift from
  // what he actually receives — which is the only reason to show it at all.
  const text = narration.trim()
    ? frameMyMeds(narration, {
        slotTimes: slots,
        intake: latest.intake,
        conditions: subject.conditions,
      })
    : narration;

  return NextResponse.json({
    subject: { id: subject.id, displayName: subject.displayName },
    hasSnapshot: true,
    capturedAt: latest.capturedAt,
    text,
    slots,
    // Segments carry their kind, which is what lets the page show WHY each
    // sentence is there — verified text is the regulator's own words, and a
    // coverage line is the product stating its limit.
    segments: outcome.narration.segments.map((s) => ({ kind: s.kind, text: s.text })),
    usedFallback: outcome.usedFallback,
    /**
     * Whether a clip already exists for this exact text.
     *
     * Reported rather than synthesised: generating audio because somebody
     * opened a dashboard would spend a paid request on nobody listening.
     */
    speechKey: narrationHash(text),
  });
}
