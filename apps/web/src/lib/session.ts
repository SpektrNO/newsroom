import { headers } from "next/headers";
import { auth } from "./auth";

export async function requireSessionUserId(): Promise<
  { userId: string } | { error: Response }
> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return {
      error: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return { userId: session.user.id };
}
