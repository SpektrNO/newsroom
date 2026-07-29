/**
 * Normalize a Bluesky handle or DID for storage / AppView `actor`.
 * - Handle: trim, strip leading `@`, lowercase ASCII
 * - DID (`did:plc:` / `did:web:`): trim only; keep casing as provided
 */
export function normalizeBlueskyHandle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("invalid_handle");
  }

  if (/^did:/i.test(trimmed)) {
    if (!/^did:(plc|web):.+/i.test(trimmed)) {
      throw new Error("invalid_handle");
    }
    return trimmed;
  }

  const handle = trimmed.replace(/^@+/, "").toLowerCase();
  if (!handle || handle.length > 253) {
    throw new Error("invalid_handle");
  }

  // AT Proto handle: ≥2 dot-separated segments of [a-z0-9-], no leading/trailing hyphen per segment.
  if (
    !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      handle,
    )
  ) {
    throw new Error("invalid_handle");
  }

  return handle;
}
