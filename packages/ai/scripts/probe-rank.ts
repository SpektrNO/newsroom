import { OllamaProvider, rankArticleBatch } from "../src/index.ts";

async function main() {
  const provider = new OllamaProvider({ completeTimeoutMs: 300_000 });
  const articles = Array.from({ length: 5 }, (_, i) => ({
    articleId: `f883d01f-44fd-4211-9a6e-7846e48ce7e${i}`,
    title:
      i % 2 === 0
        ? `Open source LLM release number ${i}`
        : `Unrelated sports scoreline ${i}`,
    summary: i % 2 === 0 ? "Local inference and models" : "Football match report",
  }));

  console.log("ranking", articles.length, "articles with UUID ids...");
  const ranked = await rankArticleBatch(provider, {
    topics: [{ name: "AI", keywords: ["llm", "ai", "model"], weight: 1 }],
    articles,
  });
  console.log(JSON.stringify(ranked, null, 2));
  console.log("matched", ranked.length, "/", articles.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
