"use client";

import Link from "next/link";
import { FormEvent, useState, type ReactNode, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function SignInForm(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallback(searchParams.get("callbackUrl"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const result = await authClient.signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Sign-in failed");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="footer-links">
        Need an account? <Link href="/sign-up">Sign up</Link>
      </p>
    </>
  );
}

export default function SignInPage(): ReactNode {
  return (
    <main className="shell">
      <section className="panel">
        <h1 className="brand">Newsroom</h1>
        <p className="lede">Sign in with your email and password.</p>
        <Suspense fallback={<p className="meta">Loading…</p>}>
          <SignInForm />
        </Suspense>
      </section>
    </main>
  );
}
