import { q, tx, type Q } from "./db";
import type { Extraction, Extractor, KnownDrive } from "./extract";
import { dedupeStudents, rowsFromHtml, studentsFromRows, studentsFromText, type ParsedStudent } from "./parse";

type EmailRow = {
  id: string;
  subject: string;
  sender: string;
  sent_at: number;
  body_text: string;
  body_html: string;
  attachments: { filename: string; preview?: string; problem?: string }[];
  sheet_students: ParsedStudent[];
};
type Row = Record<string, unknown>;

export const companyKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|inc|llp|india|technologies|technology)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

async function knownDrives(): Promise<KnownDrive[]> {
  const drives = await q<Omit<KnownDrive, "rounds">>(
    `SELECT d.id, c.name AS company, d.program, d.category, d.batch
     FROM drives d JOIN companies c ON c.id = d.company_id ORDER BY d.last_update DESC`,
  );
  const rounds = await q<KnownDrive["rounds"][number] & { drive_id: number }>(
    "SELECT id, drive_id, type, name, date FROM rounds ORDER BY date, id",
  );
  return drives.map((d) => ({ ...d, rounds: rounds.filter((r) => r.drive_id === d.id) }));
}

/** Removes everything the given mails contributed, so they can be ignored or read again. */
export async function unlinkEmails(run: Q, emailIds: string[]) {
  if (!emailIds.length) return;
  const ids = JSON.stringify(emailIds);
  const mine = "SELECT value FROM jsonb_array_elements_text($1::text::jsonb)";
  await run(`DELETE FROM round_students WHERE round_id IN (SELECT id FROM rounds WHERE list_email_id IN (${mine}))`, [ids]);
  await run(`UPDATE rounds SET list_email_id = NULL WHERE list_email_id IN (${mine})`, [ids]);
  await run(`DELETE FROM round_emails WHERE email_id IN (${mine})`, [ids]);
  await run(`UPDATE emails SET drive_id = NULL, student_count = 0 WHERE id IN (${mine})`, [ids]);
  // Whatever no mail vouches for any more goes too.
  await run("DELETE FROM rounds WHERE id NOT IN (SELECT round_id FROM round_emails)");
  await run("DELETE FROM drives WHERE id NOT IN (SELECT drive_id FROM emails WHERE drive_id IS NOT NULL)");
  await run("DELETE FROM rounds WHERE drive_id NOT IN (SELECT id FROM drives)");
  await run("DELETE FROM round_emails WHERE round_id NOT IN (SELECT id FROM rounds)");
  await run("DELETE FROM round_students WHERE round_id NOT IN (SELECT id FROM rounds)");
  await run("DELETE FROM companies WHERE id NOT IN (SELECT company_id FROM drives)");
  await run("DELETE FROM students WHERE regno NOT IN (SELECT regno FROM round_students)");
}

async function applyExtraction(run: Q, email: EmailRow, ext: Extraction, students: ParsedStudent[], problems: string[]) {
  const finish = (driveId: number | null, studentCount: number) =>
    run(
      `UPDATE emails SET status = 'processed', kind = $1, relevant = $2, confidence = $3, summary = $4,
         error = $5, drive_id = $6, student_count = $7, processed_at = $8 WHERE id = $9`,
      [ext.kind, ext.relevant, ext.confidence, ext.summary, problems.length ? problems.join(" ") : null, driveId, studentCount, Date.now(), email.id],
    );

  // Find the drive: the extractor's link first, then company + category + batch.
  let drive: Row | undefined = ext.existing_drive_id
    ? (await run<Row>("SELECT * FROM drives WHERE id = $1", [ext.existing_drive_id]))[0]
    : undefined;

  if (!drive) {
    if (!ext.relevant || !ext.company?.trim()) return finish(null, 0);
    const name = ext.company.trim();
    const key = companyKey(name) || name.toLowerCase();
    await run("INSERT INTO companies (name, key) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [name, key]);
    const [company] = await run<{ id: number }>("SELECT id FROM companies WHERE key = $1", [key]);
    const batch = ext.batch?.trim() ?? "";
    const program = ext.program?.trim() ?? "";
    const candidates = await run<Row>("SELECT * FROM drives WHERE company_id = $1 AND category = $2", [company.id, ext.category]);
    drive = candidates.find(
      (c) =>
        (!batch || !c.batch || c.batch === batch) &&
        (!program || !c.program || String(c.program).toLowerCase() === program.toLowerCase()),
    );
    if (!drive) {
      [drive] = await run<Row>(
        "INSERT INTO drives (company_id, category, batch, program, first_seen, last_update) VALUES ($1, $2, $3, $4, $5, $5) RETURNING *",
        [company.id, ext.category, batch, program, email.sent_at],
      );
    }
  }
  const found: Row = drive;
  const driveId = found.id as number;

  // Offer details: an announcement is authoritative, anything else only fills blanks.
  const offer: Row = {
    // A drive first seen without a category takes the one a later mail names.
    category: found.category === "other" && ext.category !== "other" ? ext.category : null,
    batch: ext.batch?.trim() || null,
    program: ext.program?.trim() || null,
    role: ext.role,
    stipend_monthly: ext.stipend_monthly_inr ? Math.round(ext.stipend_monthly_inr) : null,
    stipend_text: ext.stipend_text,
    ctc_lpa: ext.ctc_lpa || null,
    ctc_text: ext.ctc_text,
    locations: ext.locations.length ? ext.locations.join(", ") : null,
    eligible_branches: ext.eligible_branches,
    criteria: ext.eligibility_criteria,
    deadline: ext.registration_deadline,
    website: ext.website,
  };
  const changes = Object.entries(offer).filter(([col, value]) => {
    if (value === null || value === "") return false;
    const empty = found[col] === null || found[col] === "" || col === "category";
    return empty || ext.kind === "announcement";
  });
  const sets = changes.map(([col], i) => `${col} = $${i + 3}`);
  await run(
    `UPDATE drives SET last_update = GREATEST(last_update, $1), first_seen = LEAST(first_seen, $1)${sets.length ? ", " + sets.join(", ") : ""} WHERE id = $2`,
    [email.sent_at, driveId, ...changes.map(([, v]) => v)],
  );

  // Rounds. A list with no round named still needs somewhere to live.
  const rounds = [...ext.rounds];
  if (students.length && !rounds.some((r) => r.has_student_list)) {
    const stage = ext.student_list_stage;
    rounds.push({
      existing_round_id: null,
      type: stage === "selected" ? "selected" : stage === "registered" ? "registration" : "other",
      name: stage === "selected" ? "Final selection" : stage === "registered" ? "Registered students" : "Shortlist",
      date: null,
      time: null,
      venue: null,
      mode: "unknown",
      has_student_list: true,
    });
  }

  const existing = await run<Row>("SELECT * FROM rounds WHERE drive_id = $1 ORDER BY id DESC", [driveId]);
  let listed = 0;
  let listAttached = false;
  for (const r of rounds) {
    let round = r.existing_round_id ? existing.find((x) => x.id === r.existing_round_id) : undefined;
    if (!round) {
      const sameType = existing.filter((x) => x.type === r.type);
      // A drive has one final selection; later lists (additional offers) join it.
      round = r.type === "selected" || !r.date ? sameType[0] : sameType.find((x) => x.date === r.date || x.date === null);
    }
    if (!round && r.date) {
      // "Next round" and a named round on the same day are the same round.
      round = [...existing]
        .reverse()
        .find(
          (x) =>
            x.date === r.date &&
            ["other", "interview", "online_test", "group_discussion"].includes(String(x.type)) &&
            (x.type === "other" || r.type === "other"),
        );
      if (round && round.type === "other" && r.type !== "other") {
        await run("UPDATE rounds SET type = $1, name = $2 WHERE id = $3", [r.type, r.name, round.id]);
        round.type = r.type;
      }
    }
    if (round) {
      const date = round.type === "selected" ? null : r.date;
      await run(
        `UPDATE rounds SET date = COALESCE($1, date), time = COALESCE($2, time), venue = COALESCE($3, venue),
           mode = CASE WHEN $4::text = 'unknown' THEN mode ELSE $4::text END WHERE id = $5`,
        [date, r.time, r.venue, r.mode, round.id],
      );
      if (date) round.date = date;
    } else {
      [round] = await run<Row>(
        "INSERT INTO rounds (drive_id, type, name, date, time, venue, mode, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
        [driveId, r.type, r.name.trim() || r.type, r.date, r.time, r.venue, r.mode, email.sent_at],
      );
      existing.unshift(round);
    }
    const roundId = round.id as number;
    await run("INSERT INTO round_emails (round_id, email_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [roundId, email.id]);

    if (r.has_student_list && students.length && !listAttached) {
      listAttached = true;
      const [current] = await run<{ sent_at: number }>(
        "SELECT e.sent_at FROM rounds r JOIN emails e ON e.id = r.list_email_id WHERE r.id = $1",
        [roundId],
      );
      // A newer list replaces the old one (revised lists) unless the mail says it adds to it.
      if (current && current.sent_at > email.sent_at && !ext.student_list_is_addition) continue;
      if (current && !ext.student_list_is_addition) await run("DELETE FROM round_students WHERE round_id = $1", [roundId]);

      // One statement for the whole list. A student absent from the Vellore roster is from another campus;
      // a list that gives no name takes the roster's.
      const list = JSON.stringify(students.map((s) => ({ regno: s.regno, name: s.name, branch: s.branch, year: s.year })));
      await run(
        `INSERT INTO students (regno, name, branch, year, campus)
         SELECT x.regno, COALESCE(NULLIF(x.name, ''), ro.name, ''), x.branch, x.year,
           CASE WHEN ro.regno IS NULL AND EXISTS (SELECT 1 FROM roster) THEN 'other' ELSE 'vellore' END
         FROM jsonb_to_recordset($1::text::jsonb) AS x(regno text, name text, branch text, year text)
         LEFT JOIN roster ro ON ro.regno = x.regno
         ON CONFLICT (regno) DO UPDATE SET campus = EXCLUDED.campus,
           name = CASE WHEN students.name = '' THEN EXCLUDED.name ELSE students.name END`,
        [list],
      );
      await run(
        `INSERT INTO round_students (round_id, regno)
         SELECT $1::int, x.regno FROM jsonb_to_recordset($2::text::jsonb) AS x(regno text) ON CONFLICT DO NOTHING`,
        [roundId, list],
      );
      if (!current || !ext.student_list_is_addition) {
        await run("UPDATE rounds SET list_email_id = $1 WHERE id = $2", [email.id, roundId]);
      }
      listed = students.length;
    }
  }
  await finish(driveId, listed);
}

export async function processEmail(emailId: string, extract: Extractor): Promise<void> {
  const [email] = await q<EmailRow>(
    "SELECT id, subject, sender, sent_at, body_text, body_html, attachments, sheet_students FROM emails WHERE id = $1",
    [emailId],
  );
  if (!email) throw new Error(`No mail with id ${emailId}`);

  const tableRows = rowsFromHtml(email.body_html);
  const found = [...studentsFromRows(tableRows), ...email.sheet_students];
  if (!found.length) found.push(...studentsFromText(email.body_text));
  const students = dedupeStudents(found);
  const problems = email.attachments.flatMap((a) => (a.problem ? [a.problem] : []));

  const ext = await extract({
    subject: email.subject,
    sender: email.sender,
    sentAt: email.sent_at,
    bodyText: email.body_text,
    tableRows: tableRows.map((r) => r.map(String)),
    attachments: email.attachments,
    studentCount: students.length,
    knownDrives: await knownDrives(),
  });
  await tx(async (run) => {
    await unlinkEmails(run, [emailId]);
    await applyExtraction(run, email, ext, students, problems);
  });
}

export const markEmailError = (emailId: string, message: string) =>
  q("UPDATE emails SET status = 'error', error = $1, processed_at = $2 WHERE id = $3", [message, Date.now(), emailId]);
