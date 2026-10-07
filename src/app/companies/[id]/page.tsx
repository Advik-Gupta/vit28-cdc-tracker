import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, BarList, branchParts, CAMPUS_COLOR, CampusPill, Card, Donut, PageHeader, studentName } from "@/components/ui";
import { CATEGORY_LABEL, ctc, dayTime, isoDay, KIND_LABEL, senderName, stipend } from "@/lib/format";
import { branchOrder, companyDetail, elsewhere, type Elsewhere } from "@/lib/queries";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-[13px]">{children || <span className="text-muted">Not stated</span>}</dd>
    </div>
  );
}

function ElsewhereBadges({ e }: { e?: Elsewhere }) {
  if (!e) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {e.offers.map((o) => (
        <Link key={`o${o.company_id}`} href={`/companies/${o.company_id}`} className="pill text-ink hover:underline" style={{ background: "color-mix(in srgb, var(--s3) 20%, transparent)" }}>
          ✓ Offer · {o.company}
        </Link>
      ))}
      {e.interviews.map((o) => (
        <Link key={`i${o.company_id}`} href={`/companies/${o.company_id}`} className="pill text-ink hover:underline" style={{ background: "color-mix(in srgb, var(--s4) 22%, transparent)" }}>
          Interview · {o.company}
        </Link>
      ))}
    </span>
  );
}

export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  const data = await companyDetail(Number((await params).id));
  if (!data) notFound();
  const order = await branchOrder();
  const alsoByDrive = new Map(await Promise.all(data.drives.map(async (d) => [d.id, await elsewhere(d.id)] as const)));
  const SHOWN = 200;

  return (
    <>
      <PageHeader lead={<Avatar name={data.company.name} size={44} />} title={data.company.name} sub={<Link href="/companies" className="link">All companies</Link>} />
      <div className="flex flex-col gap-8">
        {data.drives.map((d) => {
          const withLists = d.rounds.filter((r) => r.students.length);
          const site = d.website ? (/^https?:/i.test(d.website) ? d.website : `https://${d.website}`) : null;
          const also = alsoByDrive.get(d.id)!;
          return (
            <div key={d.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{CATEGORY_LABEL[d.category] ?? d.category}</h2>
                {d.program && <span className="chip">{d.program}</span>}
                {d.batch && <span className="chip">{d.batch} batch</span>}
              </div>

              <Card>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                  <Fact label="Stipend">{stipend(d.stipend_monthly, d.stipend_text)}</Fact>
                  <Fact label="CTC">{ctc(d.ctc_lpa, d.ctc_text)}</Fact>
                  <Fact label="Role">{d.role}</Fact>
                  <Fact label="Location">{d.locations}</Fact>
                  <Fact label="Register by">{d.deadline ? isoDay(d.deadline) : null}</Fact>
                  <Fact label="Website">{site && <a className="link break-all" href={site} target="_blank" rel="noreferrer">{d.website}</a>}</Fact>
                  <div className="col-span-2"><Fact label="Eligible branches">{d.eligible_branches}</Fact></div>
                  <div className="col-span-2 md:col-span-4"><Fact label="Eligibility">{d.criteria}</Fact></div>
                </dl>
              </Card>

              {withLists.length > 1 && (
                <Card title="Students at each stage">
                  <BarList labelWidth={160} color="var(--s7)" bars={withLists.map((r) => ({ label: r.name, value: r.students.length, hint: isoDay(r.date) }))} />
                </Card>
              )}

              {d.rounds.map((r) => {
                // Branches that were in the stage before this one but have nobody left here, biggest first.
                const before = withLists[withLists.indexOf(r) - 1];
                const earlier = new Map<string, number>();
                for (const s of before?.students ?? []) earlier.set(s.branch, (earlier.get(s.branch) ?? 0) + 1);
                const vellore = r.students.filter((s) => s.campus === "vellore").length;
                const present = new Set(r.students.map((s) => s.branch));
                const missing = [...earlier].filter(([b]) => !present.has(b)).sort((a, b) => b[1] - a[1]);
                const withOffer = r.students.filter((s) => also.get(s.regno)?.offers.length).length;
                const withInterview = r.students.filter((s) => also.get(s.regno)?.interviews.length).length;
                // Students with something going on elsewhere come first.
                const sorted = [...r.students].sort((a, b) => {
                  const score = (x: typeof a) => (also.get(x.regno)?.offers.length ?? 0) * 10 + (also.get(x.regno)?.interviews.length ?? 0);
                  return score(b) - score(a);
                });
                return (
                  <Card key={r.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <div>
                        <span className="text-[15px] font-semibold">{r.name}</span>
                        <span className="text-ink-2"> · {isoDay(r.date)}{r.time ? `, ${r.time}` : ""}</span>
                        {(r.venue || r.mode === "online") && <span className="text-muted"> · {r.venue ?? "Online"}</span>}
                      </div>
                      {r.students.length > 0 && <span className="text-[13px] tabular-nums text-ink-2">{r.students.length} students</span>}
                    </div>

                    {r.students.length > 0 && (
                      <>
                        <div className="mt-4 grid gap-6 md:grid-cols-2">
                          <div>
                            <div className="label mb-2">By branch</div>
                            <Donut parts={branchParts(r.students, order)} centerLabel="students" />
                          </div>
                          <div>
                            <div className="label mb-2">By campus</div>
                            <Donut
                              parts={[
                                { name: "Vellore", value: vellore, color: CAMPUS_COLOR.vellore },
                                { name: "Other campuses", value: r.students.length - vellore, color: CAMPUS_COLOR.other },
                              ]}
                              centerLabel="students"
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-1.5 text-[13px] text-ink-2">
                          {missing.length > 0 && (
                            <p>
                              <span className="font-medium text-ink">
                                No students from {missing.length} {missing.length === 1 ? "branch" : "branches"} that had some at "{before.name}":
                              </span>{" "}
                              {missing.slice(0, 12).map(([b, n]) => `${b} (${n})`).join(", ")}
                              {missing.length > 12 && ` and ${missing.length - 12} more`}
                            </p>
                          )}
                          {(withOffer > 0 || withInterview > 0) && (
                            <p>
                              <span className="font-medium text-ink">Also in other drives:</span>{" "}
                              {[withOffer ? `${withOffer} already hold an offer elsewhere` : null, withInterview ? `${withInterview} reached interviews elsewhere` : null].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>

                        <details className="mt-3" open={r.students.length <= 30}>
                          <summary className="link cursor-pointer text-xs text-ink-2">Student list ({r.students.length})</summary>
                          <div className="mt-2 max-h-[30rem] overflow-auto rounded-xl border border-line">
                            <table className="tbl">
                              <thead><tr><th>Reg no.</th><th>Name</th><th>Branch</th><th>Campus</th><th>Other drives</th></tr></thead>
                              <tbody>
                                {sorted.slice(0, SHOWN).map((s) => (
                                  <tr key={s.regno}>
                                    <td className="tabular-nums"><Link href={`/students/${s.regno}`} className="hover:underline">{s.regno}</Link></td>
                                    <td className={s.name ? "" : "text-muted"}>{studentName(s)}</td>
                                    <td>{s.branch}</td>
                                    <td><CampusPill campus={s.campus} /></td>
                                    <td><ElsewhereBadges e={also.get(s.regno)} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {sorted.length > SHOWN && (
                            <p className="mt-2 text-xs text-muted">
                              Showing {SHOWN} of {sorted.length}. Look anyone up on the <Link href="/students" className="link">Students</Link> page.
                            </p>
                          )}
                        </details>
                      </>
                    )}
                  </Card>
                );
              })}
              {!d.rounds.length && <Card><p className="text-[13px] text-muted">No rounds announced yet.</p></Card>}

              <Card title="Source mails" note={`${d.mails.length} from CDC`}>
                <ul className="divide-y divide-line">
                  {d.mails.map((m) => (
                    <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="text-[13px]">{m.subject}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span className="tabular-nums">{dayTime(m.sent_at)}</span>
                        <span>· {senderName(m.sender)}</span>
                        {m.kind && <span className="chip">{KIND_LABEL[m.kind] ?? m.kind}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          );
        })}
      </div>
    </>
  );
}
