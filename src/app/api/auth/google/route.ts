import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl, googleConfigured } from "@/lib/gmail";

// Connecting Gmail is a one-time step done on the owner's own machine. The public site never offers it.
export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  if (!googleConfigured()) {
    return new NextResponse("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local and restart the app first.", { status: 400 });
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
