const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const rupees = (n: number | null | undefined) => (n ? `₹${inr.format(Math.round(n))}` : "—");
export const stipend = (n: number | null | undefined, text?: string | null) =>
  n ? `₹${inr.format(n)}/mo` : text || "—";
export const ctc = (n: number | null | undefined, text?: string | null) =>
  n ? `₹${Number(n.toFixed(2))} LPA` : text || "—";

export const num = (n: number) => inr.format(n);

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const shortFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export const day = (ms: number) => dateFmt.format(new Date(ms));
export const shortDay = (ms: number) => shortFmt.format(new Date(ms));
/** For YYYY-MM-DD strings, which carry no time zone. */
export const isoDay = (iso: string | null) => {
  if (!iso) return "Date not announced";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
};
export const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export const CATEGORY_LABEL: Record<string, string> = {
  internship: "Internship",
  placement: "Placement",
  both: "Internship + placement",
  other: "Type not stated",
};

export const KIND_LABEL: Record<string, string> = {
  announcement: "Announcement",
  schedule: "Schedule",
  shortlist: "Shortlist",
  selection: "Selection",
  event: "Event",
  reminder: "Reminder",
  other: "Other",
};

const timeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** When a mail arrived, in Indian time: "6 Oct 2026, 11:00 am". */
export const dayTime = (ms: number) => timeFmt.format(new Date(ms));

/** "'No Reply CDC Info' via B.Tech. - ECE 2024 Group <24bec@...>" -> "No Reply CDC Info". */
export const senderName = (from: string) =>
  from.replace(/<[^>]*>/g, "").split(/\s+via\s+/i)[0].replace(/['"]/g, "").trim() || "CDC";
