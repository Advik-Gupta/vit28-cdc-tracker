import Link from "next/link";
import { CAMPUS_COLOR, Card, CategoryTabs, Empty, Legend, PageHeader, StackedBars } from "@/components/ui";
import { num, rupees } from "@/lib/format";
import { branchStrength, branchSummary, offersByBranchCampus, parseCategory } from "@/lib/queries";

export default async function Branches({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const cat = parseCategory((await searchParams).cat);
  const [rows, strength, split] = await Promise.all([branchSummary(cat), branchStrength(), offersByBranchCampus(cat)]);
  const withOffers = rows.filter((r) => r.selected);

  return (
    <>
      <PageHeader title="Branches" sub="Branch is the three-letter code in the registration number.">
        <CategoryTabs current={cat} basePath="/branches" />
      </PageHeader>

      <Card title="Offers by branch" note={<Legend items={[{ label: "Vellore", color: CAMPUS_COLOR.vellore }, { label: "Other campuses", color: CAMPUS_COLOR.other }]} />}>
        {withOffers.length ? (
          <StackedBars
            rows={split.map((b) => ({
              label: b.branch,
              href: `/branches/${b.branch}`,
              parts: [
                { name: "Vellore", value: b.vellore, color: CAMPUS_COLOR.vellore },
                { name: "Other campuses", value: b.other, color: CAMPUS_COLOR.other },
              ],
            }))}
          />
        ) : <Empty>No final selection lists yet.</Empty>}
      </Card>

      <div className="card mt-3 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Branch</th>
              <th className="num">Students in branch (Vellore)</th>
              <th className="num">Appeared on a list</th>
              <th className="num">Drives reached</th>
              <th className="num">Offers</th>
              <th className="num">Vellore offers</th>
              <th className="num">Vellore offers per 100 students</th>
              <th className="num">Avg stipend of offers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = strength.get(r.branch);
              return (
                <tr key={r.branch}>
                  <td><Link href={`/branches/${r.branch}`} className="font-medium hover:underline">{r.branch}</Link></td>
                  <td className="num">{total ? num(total) : "—"}</td>
                  <td className="num">{num(r.students)}</td>
                  <td className="num">{r.drives}</td>
                  <td className="num font-medium">{r.selected || "—"}</td>
                  <td className="num">{r.selected_vellore || "—"}</td>
                  <td className="num">{total && r.selected_vellore ? ((r.selected_vellore / total) * 100).toFixed(1) : "—"}</td>
                  <td className="num">{rupees(r.avg_stipend)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="py-8 text-center text-muted">No student lists yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
