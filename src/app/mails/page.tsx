import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { REVIEW_BELOW } from "@/lib/extract";
import { dayTime, KIND_LABEL, num, senderName } from "@/lib/format";
import { listMails, type MailRow } from "@/lib/queries";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "drives", label: "Drive mails" },
  { value: "other", label: "Not about a drive" },
  { value: "review", label: "Unclear" },
];

const unclear = (m: MailRow) =>
  m.status === "error" || (m.status === "processed" && (m.confidence ?? 1) < REVIEW_BELOW) || Boolean(m.error);

export default async function Mails({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const show = FILTERS.some((f) => f.value === sp.show) ? sp.show! : "all";
  const mails = (await listMails()).filter((m) => m.status !== "ignored");
  const groups: Record<string, MailRow[]> = {
    all: mails,
    drives: mails.filter((m) => m.company_id),
    other: mails.filter((m) => m.status === "processed" && !m.company_id),
    review: mails.filter(unclear),
  };
  const rows = groups[show];

  return (
    <>
      <PageHeader title="Mails" sub="Every CDC mail this site is built from. To read one, find it in your own VIT inbox by date and subject." />

      <div className="card">
        <div className="flex gap-1 overflow-x-auto border-b border-line p-3 text-[13px]">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/mails" : `/mails?show=${f.value}`}
              aria-current={f.value === show ? "page" : undefined}
              className={`shrink-0 rounded-lg px-2.5 py-1 ${f.value === show ? "tab-on" : "text-ink-2 hover:text-ink"}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{num(groups[f.value].length)}</span>
            </Link>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 px-3 py-3 sm:px-4">
              <div className="text-[13px] font-medium">{m.subject || "(no subject)"}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="tabular-nums">{dayTime(m.sent_at)}</span>
                <span>· {senderName(m.sender)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {m.company_id ? (
                  <>
                    <Link href={`/companies/${m.company_id}`} className="chip hover:border-ink-2">{m.company}</Link>
                    <span className="chip">{KIND_LABEL[m.kind ?? "other"]}</span>
                    {m.student_count > 0 && <span className="chip">{num(m.student_count)} students</span>}
                  </>
                ) : m.status === "pending" ? (
                  <span className="chip">Not read yet</span>
                ) : m.status === "error" ? (
                  <span className="chip border-bad text-bad">Could not be read</span>
                ) : unclear(m) ? (
                  <span className="chip border-bad text-bad">Company unclear</span>
                ) : (
                  <span className="chip">Not about a drive</span>
                )}
              </div>
            </li>
          ))}
          {!rows.length && <li className="py-8 text-center text-[13px] text-muted">{mails.length ? "Nothing here." : "No mails fetched yet."}</li>}
        </ul>
      </div>
    </>
  );
}
