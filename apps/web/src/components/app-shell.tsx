"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/topics", label: "Topics" },
  { href: "/chat", label: "Advisor" },
  { href: "/sources", label: "Sources" },
  { href: "/settings", label: "Settings" },
] as const;

type AppShellProps = {
  email: string;
  children: ReactNode;
};

export function AppShell({ email, children }: AppShellProps): ReactNode {
  const pathname = usePathname();
  const router = useRouter();

  async function onSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <header className="masthead">
        <div className="masthead-inner">
          <Link href="/" className="masthead-brand">
            Newsroom
          </Link>
          <nav className="masthead-nav" aria-label="Primary">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "nav-link is-active" : "nav-link"}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="masthead-aside">
            <span className="masthead-email" title={email}>
              {email}
            </span>
            <button
              type="button"
              className="linkish"
              onClick={() => void onSignOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
