import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type PageSession = {
  userId: string;
  email: string;
  name: string;
};

export async function getPageSession(): Promise<PageSession | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? session.user.email,
  };
}

/** Redirect unauthenticated visitors to sign-in with return path. */
export async function requirePageSession(
  callbackPath: string,
): Promise<PageSession> {
  const session = await getPageSession();
  if (!session) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }
  return session;
}
