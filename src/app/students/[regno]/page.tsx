import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, CampusPill, Card, PageHeader, studentName } from "@/components/ui";
import { CATEGORY_LABEL, ctc, isoDay, stipend } from "@/lib/format";
import { studentDetail } from "@/lib/queries";

export default async function Student({ params }: { params: Promise<{ regno: string }> }) {
  const data = await studentDetail((await params).regno.toUpperCase());
  if (!data) notFound();
  const { student, rounds } = data;

  const drives = new Map<number, typeof rounds>();
  for (const r of rounds) drives.set(r.drive_id, [...(drives.get(r.drive_id) ?? []), r]);

  return (
    <>
      <PageHeader
        title={studentName(student)}
        sub={<>{student.regno} · <Link className="link" href={`/branches/${student.branch}`}>{student.branch}</Link> · joined 20{student.year} · <CampusPill campus={student.campus} /></>}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {[...drives.values()].map((list) => {
          const d = list[0];
          const selected = list.some((r) => r.type === "selected");
          return (
            <Card key={d.drive_id}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Avatar name={d.company} size={24} />
                  <Link href={`/companies/${d.company_id}`} className="font-semibold hover:underline">{d.company}</Link>
                  <span className="text-ink-2"> · {CATEGORY_LABEL[d.category] ?? d.category}</span>
                </div>
                {selected && <span className="chip border-good text-good">✓ Selected</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {[d.program, d.stipend_monthly ? stipend(d.stipend_monthly) : null, d.ctc_lpa ? ctc(d.ctc_lpa) : null].filter(Boolean).join(" · ")}
              </div>
              <ol className="mt-3 flex flex-col gap-1.5 border-l border-axis pl-3">
                {list.map((r, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span>{r.round}</span>
                    <span className="tabular-nums text-muted">{r.date ? isoDay(r.date) : ""}</span>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>
    </>
  );
}
