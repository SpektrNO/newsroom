"use client";

import Link from "next/link";
import { FormEvent, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage(): ReactNode {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const result = await authClient.signUp.email({
      name: name || email.split("@")[0] || "User",
      email,
      password,
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Sign-up failed");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="shell">
      <section className="panel">
        <h1 className="brand">Newsroom</h1>
        <p className="lede">Create an account with email and password.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Name
            <input name="name" type="text" autoComplete="name" />
          </label>
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
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Sign up"}
          </button>
        </form>
        <p className="footer-links">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
