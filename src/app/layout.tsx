import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Nav, TabBar, ThemeToggle } from "@/components/client";
import { getSetting } from "@/lib/db";
import { dayTime } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  title: "CDC Tracker",
  description: "Internship and placement drives at VIT, compiled from CDC mails.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lastSync = Number(await getSetting("last_sync")) || null;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark choice before the page paints. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body>
        <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
          <div className="mx-auto flex h-13 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
            <div className="flex items-center gap-5">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span aria-hidden className="h-5 w-5 rounded-md" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7) 55%, var(--s5))" }} />
                CDC Tracker
              </Link>
              <Nav />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              {lastSync && <span className="truncate text-xs text-muted">Updated {dayTime(lastSync)}</span>}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-5 md:pb-10 md:pt-7">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
