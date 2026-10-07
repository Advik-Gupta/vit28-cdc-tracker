"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, ctc, shortDay, stipend } from "@/lib/format";
import type { DriveRow } from "@/lib/queries";
import { Avatar } from "./ui";

const LINKS = [
  { href: "/", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/companies", label: "Companies", icon: "M4 21V5l8-2v18M12 9l8 2v10M2 21h20M8 8v1M8 12v1M8 16v1M16 14v1M16 17v1" },
  { href: "/students", label: "Students", icon: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2-2.8M4 19v-1a3 3 0 0 1 2-2.8" },
  { href: "/branches", label: "Branches", icon: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/mails", label: "Mails", icon: "M3 6h18v12H3zM3 7l9 6 9-6" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Links across the header on wide screens. */
export function Nav() {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 text-[13px] md:flex">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(path, l.href) ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 ${isActive(path, l.href) ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:text-ink"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** The same links as a tab bar under the thumb on phones. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {LINKS.map((l) => {
        const active = isActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-medium text-accent" : "text-muted"}`}
          >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={l.icon} />
            </svg>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ThemeToggle() {
  const flip = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
    } catch {
      /* private window: the choice just lasts for this page */
    }
  };
  return (
    <button className="btn w-9 justify-center px-0 sm:w-8" onClick={flip} aria-label="Switch between light and dark" title="Light / dark">
      ◐
    </button>
  );
}

type SortKey = "last_update" | "company" | "stipend_monthly" | "ctc_lpa" | "listed" | "selected";

export function DrivesTable({ drives }: { drives: DriveRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "last_update", dir: -1 });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? drives.filter((d) => `${d.company} ${d.program} ${d.role ?? ""}`.toLowerCase().includes(needle))
      : drives;
    return [...filtered].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      // Unknown values sink to the bottom whichever way the column is sorted.
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
    });
  }, [drives, q, sort]);

  const Th = ({ k, children, right, className = "" }: { k: SortKey; children: React.ReactNode; right?: boolean; className?: string }) => (
    <th className={`${right ? "num" : ""} ${className}`} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button
        className="cursor-pointer hover:text-ink"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === "company" ? 1 : -1 }))}
      >
        {children}
        <span className="ml-1 inline-block w-2">{sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 border-b border-line p-3">
        <input className="input min-w-0 flex-1 sm:max-w-64" placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="label shrink-0">{rows.length} {rows.length === 1 ? "drive" : "drives"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <Th k="company">Company</Th>
              <th className="hidden md:table-cell">Type</th>
              <Th k="stipend_monthly" right>Stipend</Th>
              <Th k="ctc_lpa" right className="hidden sm:table-cell">CTC</Th>
              <th className="hidden lg:table-cell">Latest stage</th>
              <Th k="listed" right className="hidden sm:table-cell">Shortlisted</Th>
              <Th k="selected" right>Selected</Th>
              <Th k="last_update" right className="hidden md:table-cell">Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/companies/${d.company_id}`} className="flex items-center gap-2.5 hover:underline">
                    <Avatar name={d.company} />
                    <span className="min-w-0">
                      <span className="font-medium">{d.company}</span>
                      {(d.program || d.role) && <span className="block text-xs text-muted">{[d.program, d.role].filter(Boolean).join(" · ")}</span>}
                      {/* On a phone the hidden columns fold in under the name. */}
                      <span className="block text-xs text-muted md:hidden">{d.stage ?? CATEGORY_LABEL[d.category]} · {shortDay(d.last_update)}</span>
                    </span>
                  </Link>
                </td>
                <td className="hidden whitespace-nowrap text-ink-2 md:table-cell">
                  {CATEGORY_LABEL[d.category] ?? d.category}
                  {d.batch && <span className="text-muted"> · {d.batch}</span>}
                </td>
                <td className="num whitespace-nowrap">{stipend(d.stipend_monthly, d.stipend_monthly ? null : d.stipend_text ? "Later" : null)}</td>
                <td className="num hidden whitespace-nowrap sm:table-cell">{ctc(d.ctc_lpa, d.ctc_lpa ? null : d.ctc_text ? "Later" : null)}</td>
                <td className="hidden text-ink-2 lg:table-cell">{d.stage ?? "—"}</td>
                <td className="num hidden sm:table-cell">{d.listed || "—"}</td>
                <td className="num font-medium">{d.selected || "—"}</td>
                <td className="num hidden whitespace-nowrap text-muted md:table-cell">{shortDay(d.last_update)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} className="py-8 text-center text-muted">No drives match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
