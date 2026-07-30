import { eq } from "drizzle-orm";
import type { Database } from "./index.js";
import {
  decryptSecret,
  encryptSecret,
  isByokConfigured,
  keyHintFromSecret,
  resolveAiCredentialsKey,
} from "./ai-credentials-crypto.js";
import {
  userAiCredentialProviders,
  userAiCredentials,
  type UserAiCredentialProvider,
} from "./schema/ai-credentials.js";

export type UserAiCredentialMeta = {
  configured: boolean;
  byokEnabled: boolean;
  provider: UserAiCredentialProvider | null;
  keyHint: string | null;
};

export function parseUserAiCredentialProvider(
  raw: unknown,
): UserAiCredentialProvider | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return (userAiCredentialProviders as readonly string[]).includes(v)
    ? (v as UserAiCredentialProvider)
    : null;
}

export async function getUserAiCredentialMeta(
  db: Database,
  userId: string,
): Promise<UserAiCredentialMeta> {
  const byokEnabled = isByokConfigured();
  const rows = await db
    .select({
      provider: userAiCredentials.provider,
      keyHint: userAiCredentials.keyHint,
    })
    .from(userAiCredentials)
    .where(eq(userAiCredentials.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return {
      configured: false,
      byokEnabled,
      provider: null,
      keyHint: null,
    };
  }
  return {
    configured: true,
    byokEnabled,
    provider: row.provider,
    keyHint: row.keyHint,
  };
}

export async function upsertUserAiCredential(
  db: Database,
  userId: string,
  provider: UserAiCredentialProvider,
  apiKey: string,
): Promise<UserAiCredentialMeta> {
  const key = resolveAiCredentialsKey();
  if (!key) {
    throw new Error("byok_not_configured");
  }
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("invalid_api_key");
  }
  const ciphertext = encryptSecret(trimmed, key);
  const keyHint = keyHintFromSecret(trimmed);
  await db
    .insert(userAiCredentials)
    .values({
      userId,
      provider,
      ciphertext,
      keyHint,
    })
    .onConflictDoUpdate({
      target: userAiCredentials.userId,
      set: {
        provider,
        ciphertext,
        keyHint,
        updatedAt: new Date(),
      },
    });
  return {
    configured: true,
    byokEnabled: true,
    provider,
    keyHint,
  };
}

export async function clearUserAiCredential(
  db: Database,
  userId: string,
): Promise<UserAiCredentialMeta> {
  await db
    .delete(userAiCredentials)
    .where(eq(userAiCredentials.userId, userId));
  return {
    configured: false,
    byokEnabled: isByokConfigured(),
    provider: null,
    keyHint: null,
  };
}

/** Decrypt stored key for worker/BFF. Returns null if no row or BYOK disabled. */
export async function loadUserAiCredentialSecret(
  db: Database,
  userId: string,
): Promise<{ provider: UserAiCredentialProvider; apiKey: string } | null> {
  const key = resolveAiCredentialsKey();
  if (!key) return null;
  const rows = await db
    .select({
      provider: userAiCredentials.provider,
      ciphertext: userAiCredentials.ciphertext,
    })
    .from(userAiCredentials)
    .where(eq(userAiCredentials.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    provider: row.provider,
    apiKey: decryptSecret(row.ciphertext, key),
  };
}

export {
  isByokConfigured,
  resolveAiCredentialsKey,
} from "./ai-credentials-crypto.js";
export type { UserAiCredentialProvider } from "./schema/ai-credentials.js";
export { userAiCredentialProviders } from "./schema/ai-credentials.js";
