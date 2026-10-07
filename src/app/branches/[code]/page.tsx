import Link from "next/link";
import { CategoryTabs, PageHeader, StatTile } from "@/components/ui";
import { CATEGORY_LABEL, ctc, num, rupees, stipend } from "@/lib/format";
import { branchDetail, branchStrength, parseCategory } from "@/lib/queries";

export default async function Branch({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ cat?: string }> }) {
  const code = (await params).code.toUpperCase();
  const cat = parseCategory((await searchParams).cat);
  const [b, strength] = await Promise.all([branchDetail(code, cat), branchStrength()]);
  const total = strength.get(code);

  return (
    <>
      <PageHeader title={code} sub={<><Link href="/branches" className="link">All branches</Link>{total ? ` · ${num(total)} students in the branch` : ""}</>}>
        <CategoryTabs current={cat} basePath={`/branches/${code}`} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile className="col-span-2 lg:col-span-1" label="Offers" value={num(b.offers)} sub={`from ${b.companies.filter((c) => c.selected).length} companies`} />
        <StatTile label="Average stipend" value={b.stipend ? rupees(b.stipend.mean) : "—"} sub="across offers" />
        <StatTile label="Median stipend" value={b.stipend ? rupees(b.stipend.median) : "—"} />
        <StatTile label="Highest stipend" value={b.stipend ? rupees(b.stipend.max) : "—"} />
        <StatTile label="Lowest stipend" value={b.stipend ? rupees(b.stipend.min) : "—"} />
      </div>

      <div className="card mt-3 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Company</th><th>Type</th><th className="num">Stipend</th><th className="num">CTC</th>
              <th className="num">On lists</th><th className="num">Selected</th>
            </tr>
          </thead>
          <tbody>
            {b.companies.map((c) => (
              <tr key={c.drive_id}>
                <td>
                  <Link href={`/companies/${c.company_id}`} className="font-medium hover:underline">{c.company}</Link>
                  {c.program && <span className="text-muted"> · {c.program}</span>}
                </td>
                <td className="text-ink-2">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                <td className="num">{stipend(c.stipend_monthly)}</td>
                <td className="num">{ctc(c.ctc_lpa)}</td>
                <td className="num">{c.reached}</td>
                <td className="num font-medium">{c.selected || "—"}</td>
              </tr>
            ))}
            {!b.companies.length && <tr><td colSpan={6} className="py-8 text-center text-muted">No {code} students on any list yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
