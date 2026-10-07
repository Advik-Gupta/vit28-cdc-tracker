import { getSetting, q, setSetting } from "./db";
import { dedupeStudents, htmlToText, isSpreadsheet, rowsFromSpreadsheet, studentsFromRows } from "./parse";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const redirectUri = () => `${appUrl()}/api/auth/google/callback`;
export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const gmailConnected = async () => Boolean(await getSetting("google_refresh_token"));

export class GmailAuthError extends Error {}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const json = (await res.json()) as Record<string, string | number | undefined>;
  if (!res.ok) {
    throw new GmailAuthError(`Google rejected the sign-in (${json.error}: ${json.error_description ?? ""})`);
  }
  return json;
}

export async function exchangeCode(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new GmailAuthError("Google did not return a refresh token. Try connecting again.");
  await setSetting("google_refresh_token", String(t.refresh_token));
  cached = { token: String(t.access_token), expires: Date.now() + (Number(t.expires_in) - 60) * 1000 };
  const profile = (await gmailGet("/profile")) as { emailAddress?: string };
  await setSetting("google_email", profile.emailAddress ?? "");
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.token;
  const refresh = await getSetting("google_refresh_token");
  if (!refresh) throw new GmailAuthError("Gmail is not connected. Run the app locally and open /api/auth/google once.");
  try {
    const t = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
    cached = { token: String(t.access_token), expires: Date.now() + (Number(t.expires_in) - 60) * 1000 };
    return cached.token;
  } catch (e) {
    if (e instanceof GmailAuthError && /invalid_grant/.test(e.message)) {
      throw new GmailAuthError("Google has expired the Gmail connection. Run the app locally and open /api/auth/google to reconnect.");
    }
    throw e;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gmailGet(pathAndQuery: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${pathAndQuery}`, {
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    if (res.ok) return res.json();
    const text = await res.text();
    // Gmail allows a fixed amount of work per minute; when it runs out, wait for the window to roll over.
    const limited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|RATE_LIMIT_EXCEEDED/.test(text));
    if ((limited || res.status >= 500) && attempt < 6) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter ? retryAfter * 1000 : Math.min(5000 * 2 ** attempt, 60_000));
      continue;
    }
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
    } catch {
      /* not JSON; show the raw text */
    }
    throw new Error(`Gmail API ${res.status}: ${message.slice(0, 200)}`);
  }
}

export function gmailQuery(): string {
  const base = process.env.GMAIL_QUERY || 'from:("No Reply CDC Info" OR "Helpdesk CDC")';
  const after = process.env.GMAIL_AFTER?.trim();
  return after ? `${base} after:${after}` : base;
}

export async function listMessageIds(): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ q: gmailQuery(), maxResults: "500" });
    if (pageToken) p.set("pageToken", pageToken);
    const page = (await gmailGet(`/messages?${p}`)) as {
      messages?: { id: string }[];
      nextPageToken?: string;
    };
    for (const m of page.messages ?? []) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

type Part = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
};

const b64 = (data: string) => Buffer.from(data, "base64url");

/**
 * Downloads one message and stores it as pending. Spreadsheets are read here and only
 * what was found in them is kept (students and a preview), so no files need storing.
 */
export async function fetchAndStoreMessage(id: string): Promise<void> {
  const msg = (await gmailGet(`/messages/${id}?format=full`)) as {
    id: string;
    threadId: string;
    internalDate: string;
    payload: Part;
  };
  const header = (name: string) =>
    msg.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";

  let text = "";
  let html = "";
  const files: Part[] = [];
  const walk = (p: Part) => {
    if (p.filename && p.body?.attachmentId) files.push(p);
    else if (p.mimeType === "text/plain" && p.body?.data) text += b64(p.body.data).toString("utf8");
    else if (p.mimeType === "text/html" && p.body?.data) html += b64(p.body.data).toString("utf8");
    p.parts?.forEach(walk);
  };
  walk(msg.payload);

  const attachments: { filename: string; preview?: string; problem?: string }[] = [];
  const students = [];
  for (const f of files) {
    const filename = f.filename!;
    if (!isSpreadsheet(filename) || (f.body?.size ?? 0) > MAX_ATTACHMENT_BYTES) {
      attachments.push({ filename });
      continue;
    }
    try {
      const att = (await gmailGet(`/messages/${id}/attachments/${f.body!.attachmentId}`)) as { data: string };
      const sheets = rowsFromSpreadsheet(b64(att.data));
      for (const s of sheets) students.push(...studentsFromRows(s.rows));
      const preview = (sheets[0]?.rows.slice(0, 8) ?? []).map((r) => "  " + r.map(String).join(" | ")).join("\n");
      attachments.push({ filename, preview });
    } catch (e) {
      attachments.push({ filename, problem: `Could not read ${filename}: ${e instanceof Error ? e.message : e}` });
    }
  }

  await q(
    `INSERT INTO emails (id, thread_id, subject, sender, sent_at, body_text, body_html, attachments, sheet_students)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9::text::jsonb) ON CONFLICT (id) DO NOTHING`,
    [
      id,
      msg.threadId,
      header("subject"),
      header("from"),
      Number(msg.internalDate),
      html ? htmlToText(html) : text,
      html,
      JSON.stringify(attachments),
      JSON.stringify(dedupeStudents(students)),
    ],
  );
}
