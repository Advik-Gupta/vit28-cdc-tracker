// Command-line twin of the daily job.
//   npm run sync                      fetch new mails and read them
//   npm run sync -- --rebuild         re-read every stored mail (after changing the rules)
//   npm run sync -- --roster          load data/vit_students.xlsx, then re-read every mail
//   npm run sync -- --ignore "RECAT"  drop mails whose subject contains the text
//   npm run sync -- --token <token>   store a Gmail refresh token
import fs from "node:fs";
import path from "node:path";

// Next loads .env.local by itself; a plain script has to.
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

async function main() {
  const { setSetting, usingSupabase } = await import("../src/lib/db");
  const { runSync, forgetReadings, ignoreBySubject } = await import("../src/lib/sync");
  const { loadRoster } = await import("../src/lib/roster");
  const args = process.argv.slice(2);
  const value = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  console.log(usingSupabase() ? "Database: Supabase (DATABASE_URL)" : "Database: local test database in data/pg");

  if (value("--token")) {
    await setSetting("google_refresh_token", value("--token")!.trim());
    console.log("Gmail token stored.");
  }
  if (value("--ignore")) {
    const subjects = await ignoreBySubject(value("--ignore")!);
    console.log(`Ignored ${subjects.length} mails:`);
    for (const s of subjects) console.log("  " + s);
  }
  if (args.includes("--roster")) {
    const n = await loadRoster(path.join(process.cwd(), "data", "vit_students.xlsx"));
    console.log(`Loaded ${n} students into the roster.`);
  }
  if (args.includes("--rebuild") || args.includes("--roster")) {
    await forgetReadings();
    console.log("Cleared earlier readings; reading every mail again.");
  }
  const result = await runSync((line) => console.log(line));
  console.log(`Fetched ${result.fetched} new, read ${result.read}, failed ${result.failed}.`);
  if (result.error) console.error(`Problem: ${result.error}`);
  process.exit(result.error || result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
