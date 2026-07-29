import { notFound } from "next/navigation";
import Link from "next/link";
import { getRegistry } from "@/lib/registry";
import { findSubject } from "@/lib/subjects";
import { NoHistory, SummarySheet } from "./sheet";
import ShareButton from "./share-button";

export const dynamic = "force-dynamic";

/**
 * The caregiver's view of the sheet, before an appointment.
 *
 * Identical to what the clinician sees, plus the control that turns it into
 * something the older adult can carry into the room.
 */
export default async function SummaryPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const subject = findSubject(subjectId);
  if (!subject) notFound();

  const { logStore } = getRegistry();
  const log = await logStore.read(subjectId);
  const latest = log.snapshots.at(-1);

  if (!latest) return <NoHistory subject={subject} />;

  return (
    <>
      <SummarySheet subject={subject} verdict={latest.verdict} log={log} />
      <div className="mx-auto max-w-2xl px-6 pb-12 print:hidden">
        <ShareButton subjectId={subject.id} />
        <Link className="mt-6 inline-block underline" href="/">
          ← 回到核對
        </Link>
      </div>
    </>
  );
}
