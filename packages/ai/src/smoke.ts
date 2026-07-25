/**
 * Live Ollama smoke. Skips cleanly when Ollama is down so CI / offline runs pass.
 *
 *   pnpm --filter @newsroom/ai smoke
 *   OLLAMA_SMOKE=1 pnpm --filter @newsroom/ai smoke   # fail if unreachable
 */
import { OllamaProvider } from "./ollama.js";

const requireLive = process.env.OLLAMA_SMOKE === "1";

async function main() {
  const provider = new OllamaProvider({
    timeoutMs: 5_000,
    completeTimeoutMs: 180_000,
  });
  const reachable = await provider.health();

  if (!reachable) {
    const msg = `Ollama unreachable at ${provider.host} (model ${provider.model})`;
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
  console.log(`OK model=${result.model} text=${JSON.stringify(result.text.slice(0, 80))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
