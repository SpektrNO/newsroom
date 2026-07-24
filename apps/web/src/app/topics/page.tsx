import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { TopicsClient } from "@/components/topics-client";
import { requirePageSession } from "@/lib/page-session";

export default async function TopicsPage(): Promise<ReactNode> {
  const session = await requirePageSession("/topics");
  return (
    <AppShell email={session.email}>
      <TopicsClient />
    </AppShell>
  );
}
