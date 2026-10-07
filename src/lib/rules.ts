import type { ExtractInput, Extraction, KnownDrive, RoundType } from "./extract";

/**
 * Reads a CDC mail without any AI, from the fixed shapes these mails take:
 *   "<Company> online test is scheduled on 6th October 2026 - Virtual"
 *   "<Company> Summer Internship : Registration - 2028 Batch"  (+ a details table)
 *   "Congratulations !! <Company> Summer Internship Selection list 2028 Batch !!"
 */

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

export function findDate(text: string, sentAt: number): string | null {
  const sent = new Date(sentAt);
  const named = /\b(\d{1,2})\s*(?:st|nd|rd|th)?[\s.,-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(\d{4})?/i.exec(text);
  const numeric = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/.exec(text);
  let d: number, m: number, y: number | null;
  if (named && (!numeric || named.index <= numeric.index)) {
    d = Number(named[1]);
    m = MONTHS[named[2].toLowerCase()];
    y = named[3] ? Number(named[3]) : null;
  } else if (numeric) {
    d = Number(numeric[1]);
    m = Number(numeric[2]);
    y = Number(numeric[3]);
  } else return null;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  if (y === null) {
    // No year written: take the one that puts the date nearest the day the mail was sent.
    y = sent.getFullYear();
    const guess = Date.UTC(y, m - 1, d);
    if (guess < sentAt - 180 * 864e5) y += 1;
    else if (guess > sentAt + 180 * 864e5) y -= 1;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

const findTime = (text: string) =>
  /\b(\d{1,2}(?:[.:]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))(?:\s*onwards)?/i.exec(text)?.[1].replace(/\s+/g, " ") ?? null;

function findVenue(text: string): string | null {
  for (const m of text.matchAll(/(?:@|\bat\b|\bvenue\s*[:-])\s*([^@|\n]+?)(?=\s+[-–]\s+|\s*[|\n(]|$)/gi)) {
    const v = m[1].replace(/\s+by\s+\d.*$/i, "").trim().replace(/[.\s]+$/, "");
    if (v && !/^\d{1,2}[.:]?\d{0,2}\s*(am|pm)/i.test(v) && v.length <= 60) return v;
  }
  return null;
}

const ROUND_WORDS: { re: RegExp; type: RoundType; name: string }[] = [
  { re: /\b(ppt|pre[- ]?placement talk)\b/i, type: "ppt", name: "Pre-placement talk" },
  { re: /\b(online (test|assessment|exam)|aptitude test|coding (test|round)|written test|assessment|test)\b/i, type: "online_test", name: "Online test" },
  { re: /\b(group discussion|gd)\b/i, type: "group_discussion", name: "Group discussion" },
  { re: /\b(interviews?|technical round|hr round)\b/i, type: "interview", name: "Interview" },
  { re: /\b(next round|final round|round\s*\d)\b/i, type: "other", name: "Next round" },
  { re: /\b(launch event|event)\b/i, type: "event", name: "Event" },
];

type FoundRound = { type: RoundType; name: string; index: number; end: number };

function roundsIn(text: string): FoundRound[] {
  const found: FoundRound[] = [];
  for (const w of ROUND_WORDS) {
    const m = w.re.exec(text);
    if (!m) continue;
    // "next round" only counts when nothing more specific is named.
    if (w.type === "other" && found.length) continue;
    const name = w.type === "event" || w.type === "other" ? m[0][0].toUpperCase() + m[0].slice(1).toLowerCase() : w.name;
    found.push({ type: w.type, name, index: m.index, end: m.index + m[0].length });
  }
  return found.sort((a, b) => a.index - b.index);
}

const PREFIX = /^(?:\s*(?:gentle reminder|reminder|re|fwd?|updated? shortlist|updated?|revised|kind attention|congratulations|important|urgent)\b[\s:!\-–]*)+/i;
// Contests, talks and notices that CDC forwards but that are not a company hiring through a drive.
const NOT_A_DRIVE = /\b(hackathon|hackfest|ideathon|challenge|competition|codevita|workshop|expert talk|webinar|mock|invitation|quieres|certification|coordinator|recat|fake)\b/i;
const STOP = /\b(online|next round|final round|ppt|pre[- ]?placement|interviews?|summer|winter|internships?|intern|scholars?|selection|selected|shortlist(?:ed)?|registration|placements?|hiring|recruitment|drive|test|assessment|hackathon|technical|hr round|group discussion|round|results?|is scheduled|scheduled|launch|event|webinar|session|super dream|dream|ppo|full[- ]?time)\b|[:–]|\s-\s/i;
const NOT_A_COMPANY = /\b(batch|semester|students?|attention|all|dear|vit|cdc|recat|training|mock|campus|notice|schedule|list|year|20\d\d|placement|internship)\b/i;

const tidyCompany = (name: string) =>
  name.replace(/[\s:–\-|,!&]+$/, "").replace(/\s+(pvt\.?|private|ltd\.?|limited|inc\.?|llp)$/gi, "").replace(/\s+(pvt\.?|private)$/i, "").trim();

function companyFromSubject(subject: string, known: string[]): { company: string; program: string | null; known: boolean } | null {
  const lead = /^([^()]+?)\s*\(([^)]+)\)/.exec(subject);
  // "Summer Internship Hiring Drive for Batch of 2028 | Texas Instruments"
  const tail = /^(?:summer |winter )?(?:internship|placement)[^|]*\|\s*([^|]+)$/i.exec(subject);

  let company: string;
  let program: string | null = null;
  if (tail) company = tail[1];
  else if (lead && !STOP.test(lead[1])) {
    company = lead[1];
    // "Amazon ( Summer Internship)" restates the category; "Marvell (M-STEM Scholar)" names a programme.
    if (!/\b(internship|placement|intern)\b/i.test(lead[2])) program = lead[2].trim();
  } else {
    const stop = STOP.exec(subject);
    if (!stop) return null;
    company = subject.slice(0, stop.index);
  }
  company = tidyCompany(company);
  if (!company) return null;

  // The same company is written long and short: "Samsung Research Institute" and "Samsung".
  const k = key(company);
  const hit = known.find((n) => key(n) === k) ??
    known.find((n) => n.toLowerCase().startsWith(company.toLowerCase() + " ") || company.toLowerCase().startsWith(n.toLowerCase() + " "));
  if (hit) return { company: hit, program, known: true };

  if (!/^[A-Za-z]/.test(company) || company.length > 40 || company.split(/\s+/).length > 4) return null;
  if (NOT_A_COMPANY.test(company)) return null;
  return { company, program, known: false };
}

function money(text: string | null): number | null {
  if (!text) return null;
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lpa|l\b)?/i.exec(text);
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ""));
  const unit = m[2]?.toLowerCase();
  if (unit === "k") v *= 1000;
  else if (unit) v *= 100000;
  return v;
}

function stipendMonthly(text: string | null): number | null {
  const v = money(text);
  if (v === null || /per\s*annum|p\.?a\.?\b|lpa/i.test(text ?? "")) return null;
  return v >= 1000 && v <= 1_000_000 ? Math.round(v) : null;
}

function ctcLpa(text: string | null): number | null {
  if (!text) return null;
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(lpa|lakhs?|l\b)?/i.exec(text);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  if (m[2]) return v > 0 && v < 200 ? v : null;
  // A bare rupee figure such as 1200000.
  return v >= 100000 ? Number((v / 100000).toFixed(2)) : null;
}

function categoryOf(text: string): Extraction["category"] {
  text = text.replace(/pre[- ]?placement/gi, "");
  const intern = /\bintern(ship)?s?\b/i.test(text);
  const place = /\b(placements?|full[- ]?time|fte)\b/i.test(text);
  return intern && place ? "both" : intern ? "internship" : place ? "placement" : "other";
}

function pickDrive(drives: KnownDrive[], company: string, category: string, batch: string | null, program: string | null) {
  const same = drives.filter((d) => key(d.company) === key(company));
  const fits = (d: KnownDrive) =>
    (!batch || !d.batch || d.batch === batch) && (!program || !d.program || key(d.program) === key(program));
  return (
    same.find((d) => d.category === category && fits(d)) ??
    // A mail that names no category continues whichever drive the company has open,
    // and a drive first seen without a category takes the one named later.
    (category === "other" ? same.find(fits) : same.find((d) => d.category === "other" && fits(d))) ??
    null
  );
}

export function rulesExtract(input: ExtractInput): Extraction {
  // CDC mails are pasted from Word and carry invisible zero-width characters ("202\u200b8 Batch").
  const invisible = /[\u200b-\u200d\ufeff]/g;
  const subject = input.subject.replace(invisible, "").replace(/\s+/g, " ").trim();
  const isReminder = /\b(reminder|update[d]?|revised|re|fwd?)\b/i.test(PREFIX.exec(subject)?.[0] ?? "");
  const clean = subject.replace(PREFIX, "").replace(/[!\s]+$/, "").trim();
  const body = input.bodyText.replace(invisible, "");

  // The details table of an announcement: label in the first cell, value in the second.
  const field = (label: RegExp): string | null => {
    for (const row of input.tableRows) {
      if (row.length >= 2 && label.test(row[0])) {
        const v = row.slice(1).join(" ").replace(/\s+/g, " ").trim();
        if (v) return v;
      }
    }
    return null;
  };
  // Every value that sits to the right of a cell matching the label, wherever in the row the label is.
  const fieldsAnywhere = (label: RegExp): string[] =>
    input.tableRows.flatMap((row) => {
      const i = row.findIndex((c) => label.test(c));
      const v = i === -1 ? "" : row.slice(i + 1).join(" ").replace(/\s+/g, " ").trim();
      return v ? [v] : [];
    });
  // Some rows are malformed in the mail's HTML, leaving the value outside the row; read it from the text instead.
  const cellAfter = (label: RegExp): string | null =>
    new RegExp(`(?:^|\\n)[ \\t]*(?:${label.source})[ \\t]*\\n?(?:[ \\t]*\\|[ \\t]*\\n?)+[ \\t]*([^|\\n]+)`, "i").exec(body)?.[1].trim() ?? null;
  const line = (label: RegExp): string | null => {
    const m = new RegExp(`(?:${label.source})[a-z ]*[:\\-–][ \\t]*\\n?[ \\t]*([^|\\n]+)`, "i").exec(body);
    return m ? m[1].trim() : null;
  };

  const notDrive = NOT_A_DRIVE.test(clean);
  const tableName = field(/name of the (company|organi[sz]ation)/i);
  const tableCompany = tableName ? tidyCompany(tableName) : null;
  const fromSubject = notDrive ? null : companyFromSubject(clean, input.knownDrives.map((d) => d.company));
  // Later mails name the company the way the subject does ("SAIL"), not the way the table does.
  const company = notDrive ? null : (fromSubject?.company ?? tableCompany ?? null);
  const program = fromSubject?.program ?? null;

  // The heading inside the mail is more reliable than the subject, which is sometimes reused from last year.
  const batchIn = (text: string) => /\b(20\d{2})\s*(?:batch|grads|passout)|\bbatch (?:of )?(20\d{2})\b/i.exec(text)?.slice(1).find(Boolean) ?? null;
  const batch = batchIn(body.slice(0, 200)) ?? batchIn(clean) ?? batchIn(body.slice(0, 2000));
  // The subject says internship or placement; the table's "Category" row is the tier (dream, super dream).
  const category = [clean, body.slice(0, 300), field(/^category/i) ?? ""].map(categoryOf).find((c) => c !== "other") ?? "other";

  const isAnnouncement = Boolean(tableCompany) || /\b(registration|hiring drive)\b/i.test(clean);
  const isSelection = /\b(selection list|selected (students|candidates|list)|final (result|list|selection)|congratulations)\b/i.test(subject);
  const attachmentNames = input.attachments.map((a) => a.filename).join(" ");
  const subjectRounds = roundsIn(clean);

  let kind: Extraction["kind"] = "other";
  if (isSelection) kind = "selection";
  else if (isAnnouncement) kind = "announcement";
  else if (/\bshortlist/i.test(`${clean} ${attachmentNames}`)) kind = "shortlist";
  else if (subjectRounds.some((r) => r.type === "event")) kind = "event";
  else if (subjectRounds.length) kind = "schedule";
  if (isReminder && kind !== "other" && kind !== "selection") kind = "reminder";

  // Rounds named in the subject share its date, time and venue.
  const rounds: Extraction["rounds"] = [];
  const subjectDate = findDate(clean, input.sentAt);
  const sentDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(input.sentAt));
  const online = /\b(virtual|online mode|own location)\b/i;
  const venue = findVenue(clean);
  if (isSelection) {
    rounds.push({ existing_round_id: null, type: "selected", name: "Final selection", date: sentDay, time: null, venue: null, mode: "unknown", has_student_list: false });
  } else {
    for (const r of subjectRounds) {
      rounds.push({
        existing_round_id: null,
        type: r.type,
        name: r.name,
        date: subjectDate,
        time: findTime(clean),
        venue,
        mode: online.test(clean) ? "online" : venue ? "offline" : "unknown",
        has_student_list: false,
      });
    }
  }
  // "Date of Visit" in an announcement lists each round with its own date.
  const visit = field(/date of visit|schedule|selection process/i);
  if (visit) {
    const found = roundsIn(visit);
    found.forEach((r, i) => {
      const segment = visit.slice(r.index, found[i + 1]?.index ?? visit.length);
      const date = findDate(segment, input.sentAt);
      if (!date || rounds.some((x) => x.type === r.type)) return;
      const v = findVenue(segment);
      rounds.push({
        existing_round_id: null,
        type: r.type,
        name: r.name,
        date,
        time: findTime(segment),
        venue: v,
        mode: online.test(segment) ? "online" : v ? "offline" : "unknown",
        has_student_list: false,
      });
    });
  }

  let stage: Extraction["student_list_stage"] = "none";
  if (input.studentCount > 0) {
    const says = `${clean} ${body.slice(0, 300)}`;
    const registered =
      !/shortlist/i.test(attachmentNames) &&
      (/\b(appl|regist)/i.test(attachmentNames) || /\b(applied|registered) students?\b/i.test(says)) &&
      !/\bshortlisted students?\b/i.test(says);
    stage = isSelection ? "selected" : registered ? "registered" : "shortlisted";
    if (stage === "registered") {
      // Everyone who applied is its own stage, ahead of whichever round the mail schedules.
      const name = /\bappl/i.test(`${clean} ${attachmentNames} ${body.slice(0, 600)}`) ? "Applied students" : "Registered students";
      rounds.push({ existing_round_id: null, type: "registration", name, date: null, time: null, venue: null, mode: "unknown", has_student_list: true });
    } else if (rounds.length) (rounds.find((r) => r.type !== "ppt") ?? rounds[0]).has_student_list = true;
  }

  // Prefer the stipend wording that actually carries a monthly figure ("Stipend per month | 90,000").
  const stipends = [...fieldsAnywhere(/stipend/i), line(/stipend/)].filter((v): v is string => Boolean(v));
  const stipendText = stipends.find((v) => stipendMonthly(v) !== null) ?? stipends[0] ?? null;
  const ctcText = field(/^(ctc|package|salary)/i) ?? cellAfter(/ctc/) ?? line(/\bctc/);
  const locationText = field(/location/i) ?? line(/(?:job |hiring |work )?location/);
  const locations = (locationText ?? "")
    .replace(/[()]/g, " ")
    .split(/,|&|\/|\band\b|[–-]/i)
    .map((part) => part.replace(/\bhybrid\b/i, "").trim())
    .filter((part) => /^[A-Za-z][A-Za-z .]{2,24}$/.test(part) && !/refer|attach|depend|business|team|month|below|location/i.test(part));

  const drive = company ? pickDrive(input.knownDrives, company, category, batch, program) : null;
  const driveSignal = !notDrive && (isAnnouncement || isSelection || subjectRounds.length > 0 || input.studentCount > 0 || Boolean(fromSubject?.known));
  const relevant = Boolean(company) && driveSignal;

  let confidence: number;
  if (relevant) confidence = tableCompany || drive || fromSubject?.known ? 0.9 : 0.75;
  // Looks like a drive mail but the company could not be made out: needs a human or the model.
  else confidence = driveSignal ? 0.3 : 0.7;

  return {
    relevant,
    kind: relevant ? kind : "other",
    summary: clean || subject,
    confidence,
    existing_drive_id: drive?.id ?? null,
    company: relevant ? company : null,
    program,
    category,
    batch,
    role: field(/designation|job (title|role)|^role|profile/i) ?? line(/job designation(?: offered)?|designation|job role|job title|\\brole/),
    stipend_monthly_inr: stipendMonthly(stipendText),
    stipend_text: stipendText,
    ctc_lpa: ctcLpa(ctcText),
    ctc_text: ctcText,
    locations,
    eligible_branches: field(/eligible (branch|degree|course|stream)/i),
    eligibility_criteria: field(/eligibility criteria|^eligibility/i),
    registration_deadline: findDate(field(/last date/i) ?? "", input.sentAt),
    website: field(/website/i),
    rounds: relevant ? rounds : [],
    student_list_stage: relevant ? stage : "none",
    student_list_is_addition: /\badditional\b/i.test(`${clean} ${body.slice(0, 400)}`),
  };
}
