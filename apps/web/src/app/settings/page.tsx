import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "@/components/settings-client";
import { requirePageSession } from "@/lib/page-session";

export default async function SettingsPage(): Promise<ReactNode> {
  const session = await requirePageSession("/settings");
  return (
    <AppShell email={session.email}>
      <SettingsClient email={session.email} />
    </AppShell>
  );
}
