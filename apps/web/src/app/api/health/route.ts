import { sql } from "drizzle-orm";
import { OllamaProvider } from "@newsroom/ai";
import { getDb } from "@newsroom/db";
import type { HealthResponse } from "@newsroom/api-client";

export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<"ok" | "error"> {
  try {
    if (!process.env.DATABASE_URL) return "error";
    await getDb().execute(sql`select 1`);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkOllama(): Promise<"ok" | "error"> {
  try {
    const provider = new OllamaProvider({ timeoutMs: 3_000 });
    return (await provider.health()) ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function GET() {
  const [database, ollama] = await Promise.all([checkDatabase(), checkOllama()]);

  let status: HealthResponse["status"] = "ok";
  if (database === "error" && ollama === "error") {
    status = "error";
  } else if (database === "error" || ollama === "error") {
    status = "degraded";
  }

  const body: HealthResponse = {
    status,
    checks: { database, ollama },
    timestamp: new Date().toISOString(),
  };

  const httpStatus = status === "error" ? 503 : 200;
  return Response.json(body, { status: httpStatus });
}
