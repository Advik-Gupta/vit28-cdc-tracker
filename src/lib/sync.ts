import { q, setSetting, tx } from "./db";
import { extract } from "./extract";
import { fetchAndStoreMessage, gmailConnected, listMessageIds } from "./gmail";
import { markEmailError, processEmail, unlinkEmails } from "./pipeline";

export type SyncResult = { fetched: number; read: number; failed: number; error: string | null };

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** Fetches mails not seen before, then reads every mail that has not been read yet. */
export async function runSync(log: (line: string) => void = () => {}): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, read: 0, failed: 0, error: null };

  if (await gmailConnected()) {
    try {
      const ids = await listMessageIds();
      const have = new Set((await q<{ id: string }>("SELECT id FROM emails")).map((r) => r.id));
      const fresh = ids.filter((id) => !have.has(id));
      log(`${ids.length} CDC mails in Gmail, ${fresh.length} new`);
      await pool(fresh, 2, async (id) => {
        await fetchAndStoreMessage(id);
        result.fetched++;
      });
      await setSetting("last_sync", String(Date.now()));
    } catch (e) {
      // Whatever was downloaded before the failure is still read below.
      result.error = e instanceof Error ? e.message : String(e);
    }
  } else {
    result.error = "Gmail is not connected.";
  }

  // Oldest first, one at a time: each mail is linked against the drives earlier mails created.
  const pending = await q<{ id: string }>("SELECT id FROM emails WHERE status IN ('pending', 'error') ORDER BY sent_at, id");
  for (const { id } of pending) {
    try {
      await processEmail(id, extract);
      result.read++;
      if (result.read % 20 === 0) log(`read ${result.read}/${pending.length}`);
    } catch (e) {
      result.failed++;
      await markEmailError(id, e instanceof Error ? e.message : String(e));
    }
  }
  return result;
}

/** Throws away everything derived from the mails and marks them all unread, for after the rules change. */
export async function forgetReadings() {
  await tx(async (run) => {
    for (const t of ["round_students", "round_emails", "rounds", "drives", "companies", "students"]) await run(`DELETE FROM ${t}`);
    await run("UPDATE emails SET status = 'pending', drive_id = NULL, student_count = 0, error = NULL WHERE status != 'ignored'");
  });
}

/** Marks mails whose subject contains the text as ignored and removes what they contributed. */
export async function ignoreBySubject(text: string): Promise<string[]> {
  const mails = await q<{ id: string; subject: string }>("SELECT id, subject FROM emails WHERE subject ILIKE $1", [`%${text}%`]);
  await tx(async (run) => {
    await unlinkEmails(run, mails.map((m) => m.id));
    await run("UPDATE emails SET status = 'ignored', error = NULL WHERE subject ILIKE $1", [`%${text}%`]);
  });
  return mails.map((m) => m.subject);
}
