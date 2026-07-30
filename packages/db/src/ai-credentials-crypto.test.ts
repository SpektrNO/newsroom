import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  isByokConfigured,
  keyHintFromSecret,
  resolveAiCredentialsKey,
} from "./ai-credentials-crypto.js";
import { parseUserAiCredentialProvider } from "./ai-credentials.js";

describe("ai-credentials crypto", () => {
  const envKey = "AI_CREDENTIALS_KEY";
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[envKey];
    process.env[envKey] =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[envKey];
    else process.env[envKey] = saved;
  });

  it("resolves a 64-hex key and rejects short keys", () => {
    assert.equal(resolveAiCredentialsKey()?.length, 32);
    assert.equal(isByokConfigured(), true);
    process.env[envKey] = "tooshort";
    assert.equal(resolveAiCredentialsKey(), null);
    assert.equal(isByokConfigured(), false);
  });

  it("round-trips encrypt/decrypt", () => {
    const key = resolveAiCredentialsKey()!;
    const payload = encryptSecret("sk-test-secret-value", key);
    assert.equal(decryptSecret(payload, key), "sk-test-secret-value");
    assert.notEqual(payload, "sk-test-secret-value");
  });

  it("keyHintFromSecret returns last 4", () => {
    assert.equal(keyHintFromSecret("abcd"), "abcd");
    assert.equal(keyHintFromSecret("sk-abcdefgh"), "efgh");
  });

  it("parseUserAiCredentialProvider accepts openai/google only", () => {
    assert.equal(parseUserAiCredentialProvider("openai"), "openai");
    assert.equal(parseUserAiCredentialProvider("GOOGLE"), "google");
    assert.equal(parseUserAiCredentialProvider("ollama"), null);
    assert.equal(parseUserAiCredentialProvider(""), null);
  });
});
