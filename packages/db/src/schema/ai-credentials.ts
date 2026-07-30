import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const userAiCredentialProviders = ["openai", "google"] as const;
export type UserAiCredentialProvider =
  (typeof userAiCredentialProviders)[number];

/** Per-user BYOK cloud credentials (encrypted at rest). */
export const userAiCredentials = pgTable("user_ai_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider")
    .notNull()
    .$type<UserAiCredentialProvider>(),
  /** AES-256-GCM payload: iv.ciphertext.tag (base64 parts). */
  ciphertext: text("ciphertext").notNull(),
  /** Last 4 characters of the plaintext key for Settings display. */
  keyHint: text("key_hint").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
