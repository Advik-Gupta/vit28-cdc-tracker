import Link from "next/link";
import { CampusPill, PageHeader, studentName } from "@/components/ui";
import { num } from "@/lib/format";
import { branchCodes, listStudents } from "@/lib/queries";

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; branch?: string; selected?: string; campus?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const branch = sp.branch ?? "";
  const onlySelected = sp.selected === "1";
  const campus = sp.campus === "vellore" || sp.campus === "other" ? sp.campus : "";
  const [{ rows, total }, codes] = await Promise.all([listStudents(q, branch, onlySelected, campus), branchCodes()]);

  return (
    <>
      <PageHeader title="Students" sub="Everyone who has appeared on a list in a CDC mail." />
      <div className="card">
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <input className="input min-w-40 flex-1 sm:max-w-64" name="q" defaultValue={q} placeholder="Name or registration number" />
          <select className="input" name="branch" defaultValue={branch} aria-label="Branch">
            <option value="">All branches</option>
            {codes.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select className="input" name="campus" defaultValue={campus} aria-label="Campus">
            <option value="">All campuses</option>
            <option value="vellore">Vellore</option>
            <option value="other">Other campuses</option>
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" name="selected" value="1" defaultChecked={onlySelected} /> Selected only
          </label>
          <button className="btn">Apply</button>
          <span className="label ml-auto">
            {total > rows.length ? `Showing ${rows.length} of ${num(total)}` : `${num(total)} ${total === 1 ? "student" : "students"}`}
          </span>
        </form>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Reg no.</th><th>Name</th><th className="hidden sm:table-cell">Branch</th><th className="hidden md:table-cell">Campus</th><th className="num hidden sm:table-cell">Drives</th><th>Selected at</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.regno}>
                  <td className="tabular-nums"><Link href={`/students/${s.regno}`} className="font-medium hover:underline">{s.regno}</Link></td>
                  <td className={s.name ? "" : "text-muted"}>{studentName(s)}</td>
                  <td className="hidden sm:table-cell"><Link href={`/branches/${s.branch}`} className="hover:underline">{s.branch}</Link></td>
                  <td className="hidden md:table-cell"><CampusPill campus={s.campus} /></td>
                  <td className="num hidden sm:table-cell">{s.drives}</td>
                  <td>{s.selected ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="py-8 text-center text-muted">No students match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
