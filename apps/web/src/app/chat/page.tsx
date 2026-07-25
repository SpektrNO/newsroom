import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ChatClient } from "@/components/chat-client";
import { requirePageSession } from "@/lib/page-session";

export default async function ChatPage(): Promise<ReactNode> {
  const session = await requirePageSession("/chat");
  return (
    <AppShell email={session.email}>
      <ChatClient />
    </AppShell>
  );
}
