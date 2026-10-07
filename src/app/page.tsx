import Link from "next/link";
import { Avatar, BarList, CAMPUS_COLOR, Card, CategoryTabs, Columns, Donut, Empty, Legend, PageHeader, StackedBars, StatTile } from "@/components/ui";
import { ctc, isoDay, KIND_LABEL, num, rupees, shortDay, todayIso } from "@/lib/format";
import { campusSplit, driveFunnels, offersByBranchCampus, overview, parseCategory, recentUpdates, upcomingRounds } from "@/lib/queries";

const CAMPUS_LEGEND = [
  { label: "Vellore", color: CAMPUS_COLOR.vellore },
  { label: "Other campuses", color: CAMPUS_COLOR.other },
];
const campusParts = (c: { vellore: number; other: number }) => [
  { name: "Vellore", value: c.vellore, color: CAMPUS_COLOR.vellore },
  { name: "Other campuses", value: c.other, color: CAMPUS_COLOR.other },
];

export default async function Overview({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const cat = parseCategory((await searchParams).cat);
  const [o, branches, campus, funnels, upcoming, updates] = await Promise.all([
    overview(cat),
    offersByBranchCampus(cat),
    campusSplit(cat),
    driveFunnels(cat),
    upcomingRounds(cat, todayIso()),
    recentUpdates(cat),
  ]);
  const placements = cat === "placement";

  const paid = o.drives
    .filter((d) => (placements ? d.ctc_lpa : d.stipend_monthly))
    .sort((a, b) => (placements ? b.ctc_lpa! - a.ctc_lpa! : b.stipend_monthly! - a.stipend_monthly!));
  const top = paid[0];
  const pay = placements ? o.ctc : o.stipend;
  const money = (v: number) => (placements ? ctc(v) : rupees(v));
  const offersBy = o.drives.filter((d) => d.selected).sort((a, b) => b.selected - a.selected);

  const months = new Map<string, number>();
  for (const d of [...o.drives].sort((a, b) => a.first_seen - b.first_seen)) {
    const label = new Date(d.first_seen).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
    months.set(label, (months.get(label) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Overview" sub="Every drive announced by CDC, compiled from the mails.">
        <CategoryTabs current={cat} basePath="/" />
      </PageHeader>

      {!o.drives.length && (
        <Card className="mb-4"><Empty>No drives here yet. New CDC mails are picked up every day at 12 pm.</Empty></Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile icon="🏢" color="var(--s1)" label="Companies" value={num(o.companies)} sub={`${o.drives.length} ${o.drives.length === 1 ? "drive" : "drives"}`} />
        <StatTile icon="🎉" color="var(--s3)" label="Offers" value={num(o.offers)} sub={`${num(o.selectedStudents)} students selected`} />
        <StatTile icon="🚀" color="var(--s5)" label={placements ? "Highest CTC" : "Highest stipend"} value={pay ? money(pay.max) : "—"} sub={top?.company} />
        <StatTile icon="⚖️" color="var(--s4)" label={placements ? "Median CTC" : "Median stipend"} value={pay ? money(pay.median) : "—"} sub={pay ? `across ${pay.count} drives` : "none stated yet"} />
        <StatTile className="col-span-2 lg:col-span-1" icon="💰" color="var(--s7)" label={placements ? "Average CTC" : "Average stipend"} value={pay ? money(pay.mean) : "—"} sub={pay ? `lowest ${money(pay.min)}` : undefined} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Offers by campus">
          {o.offers ? <Donut size={104} parts={campusParts(campus.selected)} centerLabel="selected" /> : <Empty>No final selection lists yet.</Empty>}
        </Card>
        <Card title="Reached interviews" note="unique students">
          {campus.interviewed.vellore + campus.interviewed.other ? <Donut size={104} parts={campusParts(campus.interviewed)} centerLabel="students" /> : <Empty>No interview lists yet.</Empty>}
        </Card>
        <Card title="Applied or shortlisted for a test" note="unique students">
          {campus.listed.vellore + campus.listed.other ? <Donut size={104} parts={campusParts(campus.listed)} centerLabel="students" /> : <Empty>No lists yet.</Empty>}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Offers by branch" note={<Legend items={CAMPUS_LEGEND} />}>
          {branches.length ? (
            <StackedBars
              rows={branches.slice(0, 14).map((b) => ({
                label: b.branch,
                href: `/branches/${b.branch}`,
                parts: [
                  { name: "Vellore", value: b.vellore, color: CAMPUS_COLOR.vellore },
                  { name: "Other campuses", value: b.other, color: CAMPUS_COLOR.other },
                ],
              }))}
            />
          ) : <Empty>No final selection lists yet.</Empty>}
          {branches.length > 14 && <Link href="/branches" className="link mt-2 inline-block text-xs text-ink-2">All {branches.length} branches</Link>}
        </Card>

        <Card title={placements ? "CTC by company" : "Stipend by company"} note={placements ? "lakhs per annum" : "per month"}>
          {paid.length ? (
            <BarList
              labelWidth={170}
              color="var(--s3)"
              bars={paid.slice(0, 14).map((d) => ({
                label: d.company,
                avatar: true,
                value: placements ? d.ctc_lpa! : d.stipend_monthly!,
                display: placements ? ctc(d.ctc_lpa) : rupees(d.stipend_monthly),
                href: `/companies/${d.company_id}`,
                hint: [d.program, d.role, d.selected ? `${d.selected} selected` : null].filter(Boolean).join(" · ") || undefined,
              }))}
            />
          ) : <Empty>No {placements ? "CTC" : "stipend"} figures yet.</Empty>}
        </Card>

        <Card title="Offers by company" note={`${num(o.offers)} offers`}>
          {offersBy.length ? (
            <BarList
              labelWidth={170}
              color="var(--s7)"
              bars={offersBy.map((d) => ({ label: d.company, avatar: true, value: d.selected, href: `/companies/${d.company_id}`, hint: d.stipend_monthly ? `${rupees(d.stipend_monthly)} per month` : undefined }))}
            />
          ) : <Empty>No final selection lists yet.</Empty>}
        </Card>

        <Card title="How selective each drive was" note="students at each stage">
          {funnels.length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Company</th><th className="num">Test</th><th className="num">Interview</th><th className="num">Selected</th><th className="num">Test → offer</th></tr></thead>
                <tbody>
                  {funnels.map((f) => (
                    <tr key={f.company_id}>
                      <td><Link href={`/companies/${f.company_id}`} className="hover:underline">{f.company}</Link></td>
                      <td className="num">{f.tested ? num(f.tested) : "—"}</td>
                      <td className="num">{f.interviewed || "—"}</td>
                      <td className="num font-medium">{f.selected || "—"}</td>
                      <td className="num text-ink-2">{f.tested && f.selected ? `${((f.selected / f.tested) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No student lists yet.</Empty>}
        </Card>

        <Card title="Coming up">
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={r.company} />
                    <div className="min-w-0">
                      <Link href={`/companies/${r.company_id}`} className="font-medium hover:underline">{r.company}</Link>
                      <span className="text-ink-2"> · {r.name}</span>
                      {r.venue && <div className="truncate text-xs text-muted">{r.venue}</div>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[13px] tabular-nums text-ink-2">
                    {isoDay(r.date)}{r.time && <div className="text-xs text-muted">{r.time}</div>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing scheduled from today onward.</Empty>}
        </Card>

        <Card title="Latest updates">
          {updates.length ? (
            <ul className="divide-y divide-line">
              {updates.map((u) => (
                <li key={u.id} className="flex items-baseline justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/companies/${u.company_id}`} className="font-medium hover:underline">{u.company}</Link>
                    {u.kind && <span className="chip ml-2">{KIND_LABEL[u.kind] ?? u.kind}</span>}
                    <div className="truncate text-xs text-muted" title={u.subject}>{u.summary || u.subject}</div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{shortDay(u.sent_at)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>No mails read yet.</Empty>}
        </Card>
      </div>

      {months.size > 1 && (
        <Card title="New drives by month" className="mt-3 pb-9">
          <Columns data={[...months].map(([label, value]) => ({ label, value, hint: `${value} drives first announced in ${label}` }))} />
        </Card>
      )}
    </>
  );
}
