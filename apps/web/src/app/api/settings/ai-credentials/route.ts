import {
  clearUserAiCredential,
  getDb,
  getUserAiCredentialMeta,
  isByokConfigured,
  upsertUserAiCredential,
} from "@newsroom/db";
import { requireSessionUserId } from "@/lib/session";
import { parseAiCredentialsBody } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  const meta = await getUserAiCredentialMeta(getDb(), authResult.userId);
  return Response.json(meta);
}

export async function PUT(request: Request) {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  if (!isByokConfigured()) {
    return Response.json({ error: "byok_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_credentials" }, { status: 400 });
  }

  const parsed = parseAiCredentialsBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const meta = await upsertUserAiCredential(
      getDb(),
      authResult.userId,
      parsed.provider,
      parsed.apiKey,
    );
    return Response.json(meta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "byok_not_configured") {
      return Response.json({ error: "byok_not_configured" }, { status: 503 });
    }
    throw err;
  }
}

export async function DELETE() {
  const authResult = await requireSessionUserId();
  if ("error" in authResult) return authResult.error;

  if (!isByokConfigured()) {
    return Response.json({ error: "byok_not_configured" }, { status: 503 });
  }

  const meta = await clearUserAiCredential(getDb(), authResult.userId);
  return Response.json(meta);
}
