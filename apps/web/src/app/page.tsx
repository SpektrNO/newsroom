import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import "./globals.css";

export default async function HomePage(): Promise<ReactNode> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <main className="shell">
      <section className="panel">
        <h1 className="brand">Newsroom</h1>
        <p className="lede">
          Focused stories for topics you care about. Sign in to continue.
        </p>

        {session ? (
          <div className="session-box">
            <p className="meta">
              Signed in as <strong>{session.user.email}</strong>
            </p>
            <p className="meta">Session is active. Feed UI arrives in a later feature.</p>
            <Link href="/sign-in">Sign out / switch account</Link>
          </div>
        ) : (
          <div className="footer-links">
            <Link href="/sign-up">Create an account</Link>
            {" · "}
            <Link href="/sign-in">Sign in</Link>
          </div>
        )}
      </section>
    </main>
  );
}
