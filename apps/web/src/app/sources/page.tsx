import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { SourcesClient } from "@/components/sources-client";
import { requirePageSession } from "@/lib/page-session";

export default async function SourcesPage(): Promise<ReactNode> {
  const session = await requirePageSession("/sources");
  return (
    <AppShell email={session.email}>
      <SourcesClient />
    </AppShell>
  );
}
