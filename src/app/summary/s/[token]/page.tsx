import { getRegistry } from "@/lib/registry";
import { findSubject } from "@/lib/subjects";
import { verifyShareToken } from "@/lib/summary/share-token";
import { SummarySheet, NoHistory } from "../../[subjectId]/sheet";

export const dynamic = "force-dynamic";

/**
 * What the clinician sees after scanning the QR the family is holding.
 *
 * No account, no install, no app — the doctor points a camera at a phone and
 * reads a page. That is the only distribution channel that exists for someone
 * seeing forty to sixty patients in a session.
 *
 * The token names the subject; the URL never does. `/summary/subj-father`
 * would be guessable, and this page is reached by photographing a screen.
 */
export default async function SharedSummaryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = verifyShareToken(decodeURIComponent(token), Date.now());

  if (!result.valid) {
    return <Unavailable reason={result.reason} />;
  }

  const subject = findSubject(result.payload.subjectId);
  if (!subject) return <Unavailable reason="malformed" />;

  const { logStore } = getRegistry();
  const log = await logStore.read(subject.id);
  const latest = log.snapshots.at(-1);

  if (!latest) return <NoHistory subject={subject} sharedView />;

  return (
    <SummarySheet
      subject={subject}
      verdict={latest.verdict}
      log={log}
      expiresAt={result.payload.expiresAt}
    />
  );
}

/**
 * Deliberately says almost nothing.
 *
 * A page reached with a bad token must not confirm that a person exists, or
 * which one — it is reachable by anyone who photographs a screen or guesses.
 * An expired link is worth distinguishing because the family can simply make
 * a new one; a forged one is not.
 */
function Unavailable({ reason }: { reason: "malformed" | "bad_signature" | "expired" }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">
        {reason === "expired" ? "這個連結已經過期" : "無法顯示"}
      </h1>
      <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
        {reason === "expired"
          ? "為了保護個人健康資料,回診單的連結只在幾小時內有效。請家屬重新產生一次。"
          : "請家屬重新產生回診單。"}
      </p>
    </main>
  );
}
