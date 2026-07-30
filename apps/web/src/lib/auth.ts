import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, account, session, user, verification } from "@newsroom/db";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function extraTrustedOrigins(): string[] {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Reuse the process-wide pool (same as API routes) — do not createDb() again.
const db = getDb();

const baseURL = requireEnv("BETTER_AUTH_URL");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL,
  // Localhost aliases + optional tunnels (ngrok, etc.) via BETTER_AUTH_TRUSTED_ORIGINS.
  trustedOrigins: [
    baseURL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...extraTrustedOrigins(),
  ],
});

export type Session = typeof auth.$Infer.Session;
