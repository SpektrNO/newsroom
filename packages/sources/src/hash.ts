import type { NormalizedArticle } from "./types.js";
import { createHash } from "node:crypto";

/** Stable hash for change detection when adapters omit contentHash. */
export function hashArticleContent(
  article: Pick<NormalizedArticle, "url" | "title" | "summary" | "author">,
): string {
  const payload = [
    article.url,
    article.title,
    article.summary ?? "",
    article.author ?? "",
  ].join("\n");
  return createHash("sha256").update(payload).digest("hex");
}
