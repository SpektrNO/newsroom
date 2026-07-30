/**
 * Normalize a Reddit subreddit name for storage and API.
 * Strips leading r/, lowercases, allows [a-z0-9_]+ (2–50 chars).
 */
export function normalizeSubredditName(raw: string): string {
  let name = raw.trim();
  if (!name) {
    throw new Error("invalid_config");
  }
  name = name.replace(/^\/?(r\/)/i, "");
  name = name.replace(/\/+$/, "");
  name = name.toLowerCase();
  if (!/^[a-z0-9_]{2,50}$/.test(name)) {
    throw new Error("invalid_config");
  }
  // Reddit reserved / invalid for user subs
  if (name === "all" || name === "popular" || name === "friends" || name === "mod") {
    throw new Error("invalid_config");
  }
  return name;
}
