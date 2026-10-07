import fs from "node:fs";
import { q, tx } from "./db";
import { rowsFromSpreadsheet, studentsFromRows } from "./parse";

/**
 * Loads the list of Vellore students (columns REG NO, STUDENT NAME) into the database.
 * It names students whose mails list only a register number, marks everyone else as
 * another campus, and gives the size of each branch.
 */
export async function loadRoster(file: string): Promise<number> {
  const seen = new Map<string, { regno: string; name: string; branch: string }>();
  for (const sheet of rowsFromSpreadsheet(fs.readFileSync(file))) {
    for (const s of studentsFromRows(sheet.rows)) {
      if (!seen.has(s.regno)) seen.set(s.regno, { regno: s.regno, name: s.name, branch: s.branch });
    }
  }
  const rows = [...seen.values()];
  await tx(async (run) => {
    await run("DELETE FROM roster");
    for (let i = 0; i < rows.length; i += 2000) {
      await run(
        `INSERT INTO roster (regno, name, branch)
         SELECT x.regno, x.name, x.branch FROM jsonb_to_recordset($1::text::jsonb) AS x(regno text, name text, branch text)`,
        [JSON.stringify(rows.slice(i, i + 2000))],
      );
    }
  });
  return rows.length;
}

export const rosterSize = async () => (await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM roster"))[0].n;
