import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return new NextResponse(`Google sign-in was not completed (${p.get("error")}).`, { status: 400 });
  const code = p.get("code");
  if (!code || p.get("state") !== req.cookies.get("oauth_state")?.value) {
    return new NextResponse("Sign-in could not be verified. Open /api/auth/google again.", { status: 400 });
  }
  try {
    await exchangeCode(code);
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : String(e), { status: 400 });
  }
  return new NextResponse("Gmail connected. The daily job will use this connection. Run `npm run sync` to fetch mails now.");
}
