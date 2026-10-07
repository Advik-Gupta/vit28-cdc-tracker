# CDC Tracker

A public, read-only site that compiles the VIT placement cell (CDC) mails: which
companies came, what they offered, who was called for each round, who was selected,
and how that splits by branch and campus. Nobody logs in. Once a day a job reads new
CDC mails from one Gmail account and updates the database.

Branch is the three-letter code in the register number (`24BEC0397` is `BEC`).
A student who is not in `data/vit_students.xlsx` is treated as another campus.

## How it fits together

| Piece | What it does |
|---|---|
| Supabase (Postgres) | Stores the mails and everything read from them |
| Vercel | Hosts the site and runs the daily job at 12:00 pm IST (`vercel.json`) |
| Gmail API | Read-only access to the one inbox that receives CDC mails |
| `src/lib/rules.ts` | Reads each mail by pattern. No AI unless `GROQ_API_KEY` is set |

## Run it on your machine

```bash
npm install
npm run dev        # http://localhost:3000
```

With no `DATABASE_URL`, it uses a throwaway database in `data/pg`.

## Commands

```bash
npm run sync                       # fetch new mails and read them (what the daily job does)
npm run sync -- --rebuild          # re-read every stored mail, after changing the rules
npm run sync -- --roster           # load data/vit_students.xlsx, then re-read every mail
npm run sync -- --ignore "RECAT"   # drop mails whose subject contains the text
```

They act on whichever database `DATABASE_URL` in `.env.local` points to.

## Going live

1. **Supabase**: put the connection string in `.env.local` as `DATABASE_URL` (steps in `.env.example`).
2. **Fill the database** from your machine:
   ```bash
   npm run dev                      # then open http://localhost:3000/api/auth/google once to connect Gmail
   npm run sync -- --roster         # loads the student list, fetches and reads all mails
   ```
3. **GitHub**: push this folder to a repository (`data/` and `.env.local` are not committed).
4. **Vercel**: import the repository and add these environment variables:
   `DATABASE_URL`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_QUERY`, `GMAIL_AFTER`
   (same values as `.env.local`). Deploy.
5. The job in `vercel.json` (`30 6 * * *` UTC, which is 12:00 pm IST) then calls `/api/cron` every day.
   On Vercel's free plan it runs once a day, at some point within that hour.

The Gmail connection is stored in the database, so connecting once on your machine is
enough for the hosted site. In Google Cloud the app must be **published** (Audience page),
otherwise Google cancels the connection after 7 days.
