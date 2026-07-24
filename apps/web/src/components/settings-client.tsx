"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { HealthResponse } from "@newsroom/api-client";
import { authClient } from "@/lib/auth-client";
import { getBrowserApiClient } from "@/lib/api";

type SettingsClientProps = {
  email: string;
};

function healthLabel(status: "ok" | "error"): string {
  return status === "ok" ? "Ok" : "Unavailable";
}

export function SettingsClient({ email }: SettingsClientProps): ReactNode {
  const router = useRouter();
  const api = getBrowserApiClient();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void api
      .health()
      .then((res) => {
        setHealth(res);
        setHealthError(false);
      })
      .catch(() => {
        setHealth(null);
        setHealthError(true);
      });
  }, [api]);

  async function onSignOut() {
    setPending(true);
    await authClient.signOut();
    setPending(false);
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <section className="manage-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-lede">Account and read-only system status.</p>
      </header>

      <div className="settings-block">
        <p className="manage-title">{email}</p>
        <button type="button" onClick={() => void onSignOut()} disabled={pending}>
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <div className="settings-block">
        <h2 className="form-heading">System</h2>
        {healthError ? (
          <p className="manage-meta">Couldn’t reach health checks.</p>
        ) : !health ? (
          <p className="feed-placeholder">Checking…</p>
        ) : (
          <ul className="health-list">
            <li>
              Database · {healthLabel(health.checks.database)}
            </li>
            <li>
              Ollama · {healthLabel(health.checks.ollama)}
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
