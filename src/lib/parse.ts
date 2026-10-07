import * as cheerio from "cheerio";
import * as XLSX from "xlsx";

export type ParsedStudent = { regno: string; name: string; branch: string; year: string };

// 24BEC0397 -> year 24, branch BEC. Bhopal/AP numbers carry five trailing digits.
const REGNO = /^(\d{2})([A-Z]{3})(\d{4,5})$/;

export function parseRegno(raw: unknown): { regno: string; branch: string; year: string } | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const cleaned = String(raw).toUpperCase().replace(/\s+/g, "");
  const m = REGNO.exec(cleaned);
  if (!m) return null;
  return { regno: cleaned, branch: m[2], year: m[1] };
}

export function tidyName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Lists mix "ARYAMAN TRIPATHI", "Laksh jaiswal" and "Kriti Garg"; show them alike.
  if (s === s.toUpperCase() || s === s.toLowerCase() || /\b[a-z]/.test(s)) {
    return s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  }
  return s;
}

function looksLikeName(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return s.length > 1 && /[A-Za-z]/.test(s) && !/@/.test(s) && !/\d{3,}/.test(s) && !parseRegno(s);
}

/** Pulls students out of table rows: one registration number per row, name beside it. */
export function studentsFromRows(rows: unknown[][]): ParsedStudent[] {
  const out: ParsedStudent[] = [];
  let nameCol = -1;
  for (const row of rows) {
    const regIdx = row.findIndex((c) => parseRegno(c));
    if (regIdx === -1) {
      const header = row.findIndex(
        (c) => typeof c === "string" && /name/i.test(c) && !/company|college|file/i.test(c),
      );
      if (header !== -1) nameCol = header;
      continue;
    }
    const reg = parseRegno(row[regIdx])!;
    let name = "";
    if (nameCol !== -1 && nameCol !== regIdx && looksLikeName(row[nameCol])) name = row[nameCol] as string;
    else {
      const after = row.slice(regIdx + 1).find(looksLikeName);
      const before = row.slice(0, regIdx).find(looksLikeName);
      name = (after ?? before ?? "") as string;
    }
    out.push({ ...reg, name: tidyName(name) });
  }
  return out;
}

/** For mails that list bare registration numbers in running text instead of a table. */
export function studentsFromText(text: string): ParsedStudent[] {
  const out: ParsedStudent[] = [];
  for (const m of text.toUpperCase().matchAll(/\b\d{2}[A-Z]{3}\d{4,5}\b/g)) {
    const reg = parseRegno(m[0]);
    if (reg) out.push({ ...reg, name: "" });
  }
  return out;
}

export function rowsFromSpreadsheet(file: Buffer): { sheet: string; rows: unknown[][] }[] {
  const wb = XLSX.read(file, { type: "buffer" });
  return wb.SheetNames.map((sheet) => ({
    sheet,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: false, defval: "" }),
  }));
}

export function rowsFromHtml(html: string): unknown[][] {
  if (!html) return [];
  const $ = cheerio.load(html);
  // Keep words apart where the mail separates them only by a line break or paragraph.
  $("br").replaceWith(" ");
  $("p,div,li").append(" ");
  const rows: unknown[][] = [];
  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td,th")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();
    if (cells.length) rows.push(cells);
  });
  return rows;
}

export function htmlToText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("style,script,head").remove();
  $("br").replaceWith("\n");
  $("td,th").each((_, el) => {
    $(el).append(" | ");
  });
  $("p,div,tr,li,h1,h2,h3,h4,table").each((_, el) => {
    $(el).append("\n");
  });
  return $.root()
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export const isSpreadsheet = (filename: string) => /\.(xlsx|xlsm|xls|csv)$/i.test(filename);
export const isPdf = (filename: string) => /\.pdf$/i.test(filename);

export function dedupeStudents(list: ParsedStudent[]): ParsedStudent[] {
  const map = new Map<string, ParsedStudent>();
  for (const s of list) {
    const prev = map.get(s.regno);
    if (!prev || (!prev.name && s.name)) map.set(s.regno, s);
  }
  return [...map.values()];
}
