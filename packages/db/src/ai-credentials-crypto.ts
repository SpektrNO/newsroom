import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const KEY_ENV = "AI_CREDENTIALS_KEY";

/** 32-byte key from 64 hex chars in `AI_CREDENTIALS_KEY`. */
export function resolveAiCredentialsKey(
  raw: string | undefined = process.env[KEY_ENV],
): Buffer | null {
  const hex = raw?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function isByokConfigured(): boolean {
  return resolveAiCredentialsKey() != null;
}

/**
 * Encrypt a secret with AES-256-GCM.
 * Wire format: `base64(iv).base64(ciphertext).base64(authTag)`
 */
export function encryptSecret(
  plaintext: string,
  key: Buffer = resolveAiCredentialsKey()!,
): string {
  if (!key || key.length !== 32) {
    throw new Error("AI_CREDENTIALS_KEY missing or invalid (need 64 hex chars)");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${enc.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptSecret(
  payload: string,
  key: Buffer = resolveAiCredentialsKey()!,
): string {
  if (!key || key.length !== 32) {
    throw new Error("AI_CREDENTIALS_KEY missing or invalid (need 64 hex chars)");
  }
  const parts = payload.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("invalid credential ciphertext");
  }
  const iv = Buffer.from(parts[0], "base64");
  const data = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export function keyHintFromSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

/** Constant-time compare for tests / optional auth. */
export function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
