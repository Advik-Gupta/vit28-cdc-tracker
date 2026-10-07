import Link from "next/link";
import type { ReactNode } from "react";
import type { Category } from "@/lib/queries";

export const CAMPUS_COLOR = { vellore: "var(--s1)", other: "var(--s2)" };
const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];

/** A branch keeps the same colour on every chart: the seven largest get a hue, the rest share grey. */
export const branchColor = (branch: string, order: string[]) => SLOTS[order.indexOf(branch)] ?? "var(--other)";

const tint = (color: string, pct = 16) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const color = SLOTS[hash(name) % SLOTS.length];
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.38, background: tint(color, 22) }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, sub, children, lead }: { title: string; sub?: ReactNode; children?: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {lead}
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Card({ title, note, children, className = "" }: { title?: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {title && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="h2">{title}</h2>
          {note && <span className="label">{note}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub, icon, color = "var(--s1)", className = "" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: string; color?: string; className?: string }) {
  return (
    <div className={`card flex items-start gap-3 px-3.5 py-3.5 sm:px-4 sm:py-4 ${className}`}>
      {icon && (
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: tint(color) }}>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-ink-2">{sub}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted">{children}</p>;
}

const TABS: { value: Category; label: string }[] = [
  { value: "all", label: "All" },
  { value: "internship", label: "Internships" },
  { value: "placement", label: "Placements" },
];

export function CategoryTabs({ current, basePath }: { current: Category; basePath: string }) {
  return (
    <div className="inline-flex max-w-full rounded-xl border border-line bg-surface p-1 text-[13px]">
      {TABS.map((t) => (
        <Link
          key={t.value}
          href={t.value === "all" ? basePath : `${basePath}?cat=${t.value}`}
          aria-current={t.value === current ? "page" : undefined}
          className={`rounded-lg px-3 py-1 ${t.value === current ? "tab-on" : "text-ink-2 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export type Bar = { label: string; value: number; display?: string; href?: string; hint?: string; avatar?: boolean };

/** Horizontal bars for one measure: label, bar from a shared baseline, value at the tip. */
export function BarList({ bars, labelWidth = 120, color = "var(--series)" }: { bars: Bar[]; labelWidth?: number; color?: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  // On a phone the chart keeps its full width and scrolls sideways instead of being squeezed.
  return (
    <div className="max-md:overflow-x-auto">
    <ul className="flex min-w-[30rem] flex-col md:min-w-0">
      {bars.map((b, i) => {
        const label = (
          <span className="flex min-w-0 items-center gap-2">
            {b.avatar && <Avatar name={b.label} size={22} />}
            <span className="truncate text-[13px] text-ink-2" title={b.label}>{b.label}</span>
          </span>
        );
        return (
          <li key={i} className="group relative flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-wash">
            <div className="flex shrink-0" style={{ width: labelWidth }}>
              {b.href ? <Link href={b.href} className="min-w-0 hover:underline">{label}</Link> : label}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-axis">
              <div className="h-3.5 rounded-r" style={{ width: `${(b.value / max) * 100}%`, minWidth: b.value > 0 ? 2 : 0, background: color }} />
              <span className="shrink-0 text-xs tabular-nums text-ink">{b.display ?? b.value}</span>
            </div>
            {b.hint && (
              <div className="pointer-events-none absolute right-2 top-full z-10 hidden max-w-xs rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-2 shadow-sm group-hover:block">
                <span className="font-medium text-ink">{b.label}</span> · {b.hint}
              </div>
            )}
          </li>
        );
      })}
    </ul>
    </div>
  );
}

export type Part = { name: string; value: number; color: string };

/** Horizontal bars split into parts (e.g. Vellore and other campuses), total at the tip. */
export function StackedBars({ rows, labelWidth = 56 }: { rows: { label: string; href?: string; parts: Part[] }[]; labelWidth?: number }) {
  const max = Math.max(...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0)), 1);
  return (
    <div className="max-md:overflow-x-auto">
    <ul className="flex min-w-[26rem] flex-col md:min-w-0">
      {rows.map((r) => {
        const total = r.parts.reduce((a, p) => a + p.value, 0);
        const shown = r.parts.filter((p) => p.value > 0);
        return (
          <li key={r.label} className="group relative flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-wash">
            <div className="shrink-0 truncate text-[13px] text-ink-2" style={{ width: labelWidth }}>
              {r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-axis">
              <div className="flex h-3.5 gap-0.5" style={{ width: `${(total / max) * 100}%`, minWidth: total ? 4 : 0 }}>
                {shown.map((p, i) => (
                  <div key={p.name} className={i === shown.length - 1 ? "rounded-r" : ""} style={{ flex: p.value, background: p.color }} />
                ))}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-ink">{total}</span>
            </div>
            <div className="pointer-events-none absolute right-2 top-full z-10 hidden rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-2 shadow-sm group-hover:block">
              <span className="font-medium text-ink">{r.label}</span>
              {r.parts.map((p) => <span key={p.name}> · {p.name} {p.value}</span>)}
            </div>
          </li>
        );
      })}
    </ul>
    </div>
  );
}

/** A ring split into shares, with the total in the middle and a legend that carries every number. */
export function Donut({ parts, centerLabel, size = 132 }: { parts: Part[]; centerLabel: string; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  const shown = parts.filter((p) => p.value > 0);
  const gap = shown.length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0 -rotate-90" role="img" aria-label={`${centerLabel}: ${shown.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="13" />
        {shown.map((p) => {
          const len = (p.value / total) * c;
          const el = (
            <circle key={p.name} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="13"
              strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`} strokeDashoffset={-offset}>
              <title>{`${p.name}: ${p.value} (${((p.value / total) * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <g className="rotate-90" style={{ transformOrigin: "50px 50px" }}>
          <text x="50" y="49" textAnchor="middle" fontSize="19" fontWeight="600" fill="var(--ink)">{total}</text>
          <text x="50" y="61" textAnchor="middle" fontSize="7.5" fill="var(--muted)">{centerLabel}</text>
        </g>
      </svg>
      <ul className="flex min-w-36 flex-1 flex-col gap-1 text-[13px]">
        {shown.map((p) => (
          <li key={p.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="truncate text-ink-2">{p.name}</span>
            <span className="ml-auto tabular-nums font-medium">{p.value}</span>
            <span className="w-8 text-right text-xs tabular-nums text-muted">{((p.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Branch shares of a student list: the largest branches get their own slice, the tail is folded together. */
export function branchParts(students: { branch: string }[], order: string[], keep = 6): Part[] {
  const counts = new Map<string, number>();
  for (const s of students) counts.set(s.branch, (counts.get(s.branch) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const head = sorted.filter(([b], i) => i < keep && order.indexOf(b) !== -1 && order.indexOf(b) < SLOTS.length);
  const tail = sorted.filter((x) => !head.includes(x));
  const parts = head.map(([b, n]) => ({ name: b, value: n, color: branchColor(b, order) }));
  const rest = tail.reduce((a, [, n]) => a + n, 0);
  if (rest) parts.push({ name: tail.length === 1 ? tail[0][0] : `${tail.length} other branches`, value: rest, color: "var(--other)" });
  return parts;
}

/** Columns over time, one per period, value on the cap. */
export function Columns({ data }: { data: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="overflow-x-auto pb-6">
    <div className="flex h-40 items-end gap-2 border-b border-axis" style={{ minWidth: data.length * 52 }}>
      {data.map((d) => (
        <div key={d.label} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={d.hint}>
          <span className="mb-1 text-xs tabular-nums text-ink">{d.value}</span>
          <div className="w-full max-w-6 rounded-t" style={{ height: `${(d.value / max) * 78}%`, background: "var(--s7)" }} />
          <span className="absolute -bottom-5 truncate text-[11px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
    </div>
  );
}

export function CampusPill({ campus }: { campus: string }) {
  const other = campus !== "vellore";
  const color = other ? CAMPUS_COLOR.other : CAMPUS_COLOR.vellore;
  return (
    <span className="pill text-ink" style={{ background: tint(color, 18) }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {other ? "Other campus" : "Vellore"}
    </span>
  );
}

export const studentName = (s: { name: string; campus: string }) =>
  s.name || (s.campus !== "vellore" ? "Other campus student" : "Name not listed");
