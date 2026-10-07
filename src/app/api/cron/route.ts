import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
// Reading a day's mails takes seconds; the headroom is for Gmail asking us to slow down.
export const maxDuration = 300;

/** The daily job. Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const result = await runSync();
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
