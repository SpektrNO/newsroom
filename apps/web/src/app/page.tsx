import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { FeedClient } from "@/components/feed-client";
import { getPageSession } from "@/lib/page-session";

export default async function HomePage(): Promise<ReactNode> {
  const session = await getPageSession();

  if (!session) {
    return (
      <main className="shell landing-shell">
        <section className="landing">
          <h1 className="brand landing-brand">Newsroom</h1>
          <p className="lede landing-lede">
            Focused stories for topics you care about.
          </p>
          <div className="landing-ctas">
            <Link className="button-link" href="/sign-up">
              Sign up
            </Link>
            <Link href="/sign-in">Sign in</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell email={session.email}>
      <FeedClient />
    </AppShell>
  );
}
