/**
 * Live AI provider smoke (AI_PROVIDER / Ollama by default).
 * Skips cleanly when unreachable so CI / offline runs pass.
 *
 *   pnpm --filter @newsroom/ai smoke
 *   OLLAMA_SMOKE=1 pnpm --filter @newsroom/ai smoke   # fail if unreachable
 *   AI_SMOKE=1 pnpm --filter @newsroom/ai smoke       # same, provider-agnostic
 */
import { createAiProvider, resolveAiProviderKind } from "./factory.js";

const requireLive =
  process.env.AI_SMOKE === "1" || process.env.OLLAMA_SMOKE === "1";

async function main() {
  const kind = resolveAiProviderKind();
  const provider = createAiProvider({
    timeoutMs: 5_000,
    completeTimeoutMs: 180_000,
  });
  const reachable = await provider.health();

  if (!reachable) {
    const msg = `AI provider (${kind}) unreachable (model ${provider.model ?? "unknown"})`;
    if (requireLive) {
      console.error(msg);
      process.exit(1);
    }
    console.log(`SKIP live smoke: ${msg}`);
    return;
  }

  const result = await provider.complete({
    prompt: 'Reply with exactly the word "pong" and nothing else.',
  });
  console.log(
    `OK provider=${kind} model=${result.model} text=${JSON.stringify(result.text.slice(0, 80))}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
