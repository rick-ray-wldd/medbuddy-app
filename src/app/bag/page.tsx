import Link from "next/link";
import { BagClient } from "./bag-client";
import { DEMO_SUBJECT_ID } from "@/lib/subjects";
import { findSubject } from "@/lib/subjects";

export default function BagPage() {
  const subject = findSubject(DEMO_SUBJECT_ID);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← 回首頁
        </Link>
        <h1 className="text-3xl font-bold mt-2">紀錄用藥</h1>
        <p className="text-slate-600 mt-1">
          拍{subject?.displayName ?? "長輩"}的藥袋,讀出上面印的字。
        </p>
      </div>

      <BagClient subjectId={DEMO_SUBJECT_ID} />
    </main>
  );
}
