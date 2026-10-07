import { q } from "./db";

export type Category = "all" | "internship" | "placement";
export const parseCategory = (v: string | string[] | undefined): Category =>
  v === "internship" || v === "placement" ? v : "all";

// A drive tagged "both" counts under internships and placements alike. $1 is always the category.
const CAT = "($1::text = 'all' OR d.category = $1 OR d.category = 'both')";
const RANK = `CASE r.type
  WHEN 'registration' THEN 0 WHEN 'ppt' THEN 1 WHEN 'event' THEN 1 WHEN 'online_test' THEN 2
  WHEN 'group_discussion' THEN 3 WHEN 'interview' THEN 4 WHEN 'other' THEN 5 WHEN 'selected' THEN 9 END`;
// Applied and registered lists carry no date but always come before the dated rounds.
const ROUND_ORDER = `(r.type != 'registration'), COALESCE(r.date, '9999'), ${RANK}, r.id`;
// The furthest stage a drive has reached: latest kind of round, then latest date.
const FURTHEST = `${RANK} DESC, r.date DESC NULLS LAST, r.id DESC`;
const SELECTED = "JOIN rounds r ON r.id = rs.round_id AND r.type = 'selected'";

export function numberStats(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return {
    count: s.length,
    min: s[0],
    max: s[s.length - 1],
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

export type DriveRow = {
  id: number;
  company_id: number;
  company: string;
  program: string;
  category: string;
  batch: string;
  role: string | null;
  stipend_monthly: number | null;
  stipend_text: string | null;
  ctc_lpa: number | null;
  ctc_text: string | null;
  first_seen: number;
  last_update: number;
  stage: string | null;
  rounds: number;
  listed: number;
  selected: number;
};

export const listDrives = (cat: Category) =>
  q<DriveRow>(
    `SELECT d.id, d.company_id, c.name AS company, d.program, d.category, d.batch, d.role,
       d.stipend_monthly, d.stipend_text, d.ctc_lpa, d.ctc_text, d.first_seen, d.last_update,
       (SELECT r.name FROM rounds r WHERE r.drive_id = d.id ORDER BY ${FURTHEST} LIMIT 1) AS stage,
       (SELECT COUNT(*)::int FROM rounds r WHERE r.drive_id = d.id) AS rounds,
       (SELECT COUNT(DISTINCT rs.regno)::int FROM rounds r JOIN round_students rs ON rs.round_id = r.id
          WHERE r.drive_id = d.id AND r.type != 'selected') AS listed,
       (SELECT COUNT(DISTINCT rs.regno)::int FROM rounds r JOIN round_students rs ON rs.round_id = r.id
          WHERE r.drive_id = d.id AND r.type = 'selected') AS selected
     FROM drives d JOIN companies c ON c.id = d.company_id
     WHERE ${CAT} ORDER BY d.last_update DESC`,
    [cat],
  );

export async function overview(cat: Category) {
  const [drives, [totals]] = await Promise.all([
    listDrives(cat),
    q<{ offers: number; students: number }>(
      `SELECT COUNT(*)::int AS offers, COUNT(DISTINCT rs.regno)::int AS students
       FROM round_students rs ${SELECTED} JOIN drives d ON d.id = r.drive_id WHERE ${CAT}`,
      [cat],
    ),
  ]);
  return {
    drives,
    companies: new Set(drives.map((d) => d.company_id)).size,
    offers: totals.offers,
    selectedStudents: totals.students,
    stipend: numberStats(drives.flatMap((d) => (d.stipend_monthly ? [d.stipend_monthly] : []))),
    ctc: numberStats(drives.flatMap((d) => (d.ctc_lpa ? [d.ctc_lpa] : []))),
  };
}

export const upcomingRounds = (cat: Category, today: string) =>
  q<{ id: number; name: string; date: string; time: string | null; venue: string | null; company: string; company_id: number }>(
    `SELECT r.id, r.name, r.date, r.time, r.venue, c.name AS company, c.id AS company_id
     FROM rounds r JOIN drives d ON d.id = r.drive_id JOIN companies c ON c.id = d.company_id
     WHERE r.date >= $2 AND ${CAT} ORDER BY r.date, r.id LIMIT 8`,
    [cat, today],
  );

export const recentUpdates = (cat: Category) =>
  q<{ id: string; sent_at: number; summary: string | null; subject: string; kind: string | null; company: string; company_id: number }>(
    `SELECT e.id, e.sent_at, e.summary, e.subject, e.kind, c.name AS company, c.id AS company_id
     FROM emails e JOIN drives d ON d.id = e.drive_id JOIN companies c ON c.id = d.company_id
     WHERE e.status = 'processed' AND ${CAT} ORDER BY e.sent_at DESC LIMIT 6`,
    [cat],
  );

export type RoundStudent = { regno: string; name: string; branch: string; campus: string };
export type RoundDetail = {
  id: number;
  type: string;
  name: string;
  date: string | null;
  time: string | null;
  venue: string | null;
  mode: string | null;
  students: RoundStudent[];
};

type DriveFull = {
  id: number; category: string; batch: string; program: string; role: string | null;
  stipend_monthly: number | null; stipend_text: string | null; ctc_lpa: number | null; ctc_text: string | null;
  locations: string | null; eligible_branches: string | null; criteria: string | null;
  deadline: string | null; website: string | null;
};
export type SourceMail = { id: string; subject: string; sender: string; sent_at: number; kind: string | null };

export async function companyDetail(id: number) {
  if (!Number.isInteger(id)) return null;
  const [company] = await q<{ id: number; name: string }>("SELECT id, name FROM companies WHERE id = $1", [id]);
  if (!company) return null;
  const [drives, rounds, students, mails] = await Promise.all([
    q<DriveFull>("SELECT * FROM drives WHERE company_id = $1 ORDER BY first_seen DESC", [id]),
    q<Omit<RoundDetail, "students"> & { drive_id: number }>(
      `SELECT r.id, r.drive_id, r.type, r.name, r.date, r.time, r.venue, r.mode
       FROM rounds r JOIN drives d ON d.id = r.drive_id WHERE d.company_id = $1 ORDER BY ${ROUND_ORDER}`,
      [id],
    ),
    q<RoundStudent & { round_id: number }>(
      `SELECT rs.round_id, s.regno, s.name, s.branch, s.campus
       FROM round_students rs JOIN students s ON s.regno = rs.regno
       JOIN rounds r ON r.id = rs.round_id JOIN drives d ON d.id = r.drive_id
       WHERE d.company_id = $1 ORDER BY s.regno`,
      [id],
    ),
    q<SourceMail & { drive_id: number }>(
      `SELECT e.id, e.drive_id, e.subject, e.sender, e.sent_at, e.kind
       FROM emails e JOIN drives d ON d.id = e.drive_id WHERE d.company_id = $1 ORDER BY e.sent_at`,
      [id],
    ),
  ]);
  const byRound = new Map<number, RoundStudent[]>();
  for (const s of students) byRound.set(s.round_id, [...(byRound.get(s.round_id) ?? []), s]);
  return {
    company,
    drives: drives.map((d) => ({
      ...d,
      rounds: rounds.filter((r) => r.drive_id === d.id).map((r) => ({ ...r, students: byRound.get(r.id) ?? [] })),
      mails: mails.filter((m) => m.drive_id === d.id),
    })),
  };
}

export type Elsewhere = { offers: { company: string; company_id: number }[]; interviews: { company: string; company_id: number }[] };

/** For every student on this drive's lists: where else they reached the interview stage or got an offer. */
export async function elsewhere(driveId: number): Promise<Map<string, Elsewhere>> {
  const rows = await q<{ regno: string; company: string; company_id: number; selected: boolean }>(
    `SELECT rs.regno, c.name AS company, c.id AS company_id, bool_or(r.type = 'selected') AS selected
     FROM round_students rs JOIN rounds r ON r.id = rs.round_id JOIN drives d ON d.id = r.drive_id
     JOIN companies c ON c.id = d.company_id
     WHERE d.id != $1 AND r.type IN ('interview', 'group_discussion', 'other', 'selected')
       AND rs.regno IN (SELECT rs2.regno FROM round_students rs2 JOIN rounds r2 ON r2.id = rs2.round_id WHERE r2.drive_id = $1)
     GROUP BY rs.regno, d.id, c.id, c.name ORDER BY MIN(d.first_seen)`,
    [driveId],
  );
  const map = new Map<string, Elsewhere>();
  for (const r of rows) {
    const e = map.get(r.regno) ?? { offers: [], interviews: [] };
    (r.selected ? e.offers : e.interviews).push({ company: r.company, company_id: r.company_id });
    map.set(r.regno, e);
  }
  return map;
}

export type StudentRow = { regno: string; name: string; branch: string; campus: string; drives: number; selected: string | null };

export async function listStudents(search: string, branch: string, onlySelected: boolean, campus = "", limit = 200) {
  const rows = await q<StudentRow & { total: number }>(
    `SELECT t.*, COUNT(*) OVER ()::int AS total FROM (
       SELECT s.regno, s.name, s.branch, s.campus,
         COUNT(DISTINCT r.drive_id)::int AS drives,
         string_agg(DISTINCT CASE WHEN r.type = 'selected' THEN c.name END, ', ') AS selected
       FROM students s JOIN round_students rs ON rs.regno = s.regno JOIN rounds r ON r.id = rs.round_id
       JOIN drives d ON d.id = r.drive_id JOIN companies c ON c.id = d.company_id
       WHERE ($1::text = '' OR s.regno ILIKE $2 OR s.name ILIKE $2)
         AND ($3::text = '' OR s.branch = $3) AND ($4::text = '' OR s.campus = $4)
       GROUP BY s.regno
     ) t WHERE ($5::boolean = false OR t.selected IS NOT NULL)
     ORDER BY (t.selected IS NULL), t.drives DESC, t.regno LIMIT $6`,
    [search, `%${search}%`, branch, campus, onlySelected, limit],
  );
  return { rows, total: rows[0]?.total ?? 0 };
}

export const branchCodes = async () =>
  (await q<{ branch: string }>("SELECT DISTINCT branch FROM students ORDER BY branch")).map((b) => b.branch);

export async function studentDetail(regno: string) {
  const [student] = await q<{ regno: string; name: string; branch: string; year: string; campus: string }>(
    "SELECT * FROM students WHERE regno = $1",
    [regno],
  );
  if (!student) return null;
  const rounds = await q<{
    drive_id: number; company_id: number; company: string; program: string; category: string;
    stipend_monthly: number | null; ctc_lpa: number | null; round: string; type: string; date: string | null;
  }>(
    `SELECT d.id AS drive_id, c.id AS company_id, c.name AS company, d.program, d.category, d.stipend_monthly, d.ctc_lpa,
       r.name AS round, r.type, r.date
     FROM round_students rs JOIN rounds r ON r.id = rs.round_id JOIN drives d ON d.id = r.drive_id
     JOIN companies c ON c.id = d.company_id WHERE rs.regno = $1 ORDER BY d.first_seen DESC, ${ROUND_ORDER}`,
    [regno],
  );
  return { student, rounds };
}

export const branchSummary = (cat: Category) =>
  q<{ branch: string; students: number; drives: number; selected: number; selected_vellore: number; avg_stipend: number | null }>(
    `SELECT s.branch,
       COUNT(DISTINCT s.regno)::int AS students,
       COUNT(DISTINCT r.drive_id)::int AS drives,
       COUNT(DISTINCT CASE WHEN r.type = 'selected' THEN s.regno || ':' || r.drive_id END)::int AS selected,
       COUNT(DISTINCT CASE WHEN r.type = 'selected' AND s.campus = 'vellore' THEN s.regno || ':' || r.drive_id END)::int AS selected_vellore,
       AVG(CASE WHEN r.type = 'selected' THEN d.stipend_monthly END)::float8 AS avg_stipend
     FROM students s JOIN round_students rs ON rs.regno = s.regno JOIN rounds r ON r.id = rs.round_id
     JOIN drives d ON d.id = r.drive_id WHERE ${CAT}
     GROUP BY s.branch ORDER BY selected DESC, students DESC, s.branch`,
    [cat],
  );

export async function branchDetail(branch: string, cat: Category) {
  const companies = await q<{
    drive_id: number; company_id: number; company: string; program: string; category: string;
    stipend_monthly: number | null; ctc_lpa: number | null; reached: number; selected: number;
  }>(
    `SELECT d.id AS drive_id, c.id AS company_id, c.name AS company, d.program, d.category, d.stipend_monthly, d.ctc_lpa,
       COUNT(DISTINCT s.regno)::int AS reached,
       COUNT(DISTINCT CASE WHEN r.type = 'selected' THEN s.regno END)::int AS selected
     FROM students s JOIN round_students rs ON rs.regno = s.regno JOIN rounds r ON r.id = rs.round_id
     JOIN drives d ON d.id = r.drive_id JOIN companies c ON c.id = d.company_id
     WHERE s.branch = $2 AND ${CAT} GROUP BY d.id, c.id ORDER BY selected DESC, reached DESC, c.name`,
    [cat, branch],
  );
  const stipends = companies.flatMap((c) => (c.stipend_monthly ? Array<number>(c.selected).fill(c.stipend_monthly) : []));
  return { companies, offers: companies.reduce((a, c) => a + c.selected, 0), stipend: numberStats(stipends) };
}

/** Students per branch code in the Vellore roster. */
export async function branchStrength(): Promise<Map<string, number>> {
  const rows = await q<{ branch: string; n: number }>("SELECT branch, COUNT(*)::int AS n FROM roster GROUP BY branch");
  return new Map(rows.map((r) => [r.branch, r.n]));
}

export type MailRow = {
  id: string; subject: string; sender: string; sent_at: number; status: string; kind: string | null;
  confidence: number | null; error: string | null; student_count: number;
  company: string | null; company_id: number | null;
};

export const listMails = () =>
  q<MailRow>(
    `SELECT e.id, e.subject, e.sender, e.sent_at, e.status, e.kind, e.confidence, e.error, e.student_count,
       c.name AS company, c.id AS company_id
     FROM emails e LEFT JOIN drives d ON d.id = e.drive_id LEFT JOIN companies c ON c.id = d.company_id
     ORDER BY e.sent_at DESC`,
  );

/** Offers per branch, split by campus. */
export const offersByBranchCampus = (cat: Category) =>
  q<{ branch: string; vellore: number; other: number }>(
    `SELECT s.branch, (COUNT(*) FILTER (WHERE s.campus = 'vellore'))::int AS vellore,
       (COUNT(*) FILTER (WHERE s.campus != 'vellore'))::int AS other
     FROM round_students rs ${SELECTED} JOIN drives d ON d.id = r.drive_id JOIN students s ON s.regno = rs.regno
     WHERE ${CAT} GROUP BY s.branch ORDER BY COUNT(*) DESC, s.branch`,
    [cat],
  );

/** Unique students at each depth of the process, split by campus. */
export async function campusSplit(cat: Category) {
  const [row] = await q<Record<string, number>>(
    `SELECT ${[
      ["listed", "'registration','ppt','online_test','event'"],
      ["interviewed", "'interview','group_discussion','other'"],
      ["selected", "'selected'"],
    ]
      .flatMap(([name, types]) => [
        `COUNT(DISTINCT s.regno) FILTER (WHERE r.type IN (${types}) AND s.campus = 'vellore')::int AS ${name}_vellore`,
        `COUNT(DISTINCT s.regno) FILTER (WHERE r.type IN (${types}) AND s.campus != 'vellore')::int AS ${name}_other`,
      ])
      .join(", ")}
     FROM round_students rs JOIN rounds r ON r.id = rs.round_id JOIN drives d ON d.id = r.drive_id
     JOIN students s ON s.regno = rs.regno WHERE ${CAT}`,
    [cat],
  );
  const pair = (name: string) => ({ vellore: row[`${name}_vellore`], other: row[`${name}_other`] });
  return { listed: pair("listed"), interviewed: pair("interviewed"), selected: pair("selected") };
}

/** Per company: how many were tested, interviewed and selected. */
export const driveFunnels = (cat: Category) =>
  q<{ company_id: number; company: string; tested: number; interviewed: number; selected: number }>(
    `SELECT c.id AS company_id, c.name AS company,
       COUNT(DISTINCT CASE WHEN r.type = 'online_test' THEN rs.regno END)::int AS tested,
       COUNT(DISTINCT CASE WHEN r.type IN ('interview', 'group_discussion', 'other') THEN rs.regno END)::int AS interviewed,
       COUNT(DISTINCT CASE WHEN r.type = 'selected' THEN rs.regno END)::int AS selected
     FROM drives d JOIN companies c ON c.id = d.company_id JOIN rounds r ON r.drive_id = d.id
     JOIN round_students rs ON rs.round_id = r.id
     WHERE ${CAT} AND r.type IN ('online_test', 'interview', 'group_discussion', 'other', 'selected')
     GROUP BY d.id, c.id ORDER BY d.first_seen DESC`,
    [cat],
  );

/** Branch codes from most to least common, so a branch keeps one colour on every chart. */
export const branchOrder = async () =>
  (await q<{ branch: string }>("SELECT branch FROM students GROUP BY branch ORDER BY COUNT(*) DESC, branch")).map((b) => b.branch);

export const counts = async () =>
  (await q<{ mails: number; students: number; roster: number }>(
    `SELECT (SELECT COUNT(*)::int FROM emails) AS mails, (SELECT COUNT(*)::int FROM students) AS students,
       (SELECT COUNT(*)::int FROM roster) AS roster`,
  ))[0];
