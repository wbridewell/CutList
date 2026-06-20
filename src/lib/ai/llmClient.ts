import "server-only";
import { resolveLLMConfig, type EffectiveLLMConfig, type LLMProvider } from "@/lib/ai/llmConfig";
import { waitForLlmRequestSlot } from "@/lib/ai/llmRateLimit";
import { getJsonFromGemini } from "@/lib/ai/providers/geminiClient";
import { getJsonFromOllama } from "@/lib/ai/providers/ollamaClient";
import { getJsonFromOpenAI } from "@/lib/ai/providers/openaiClient";

export class LLMDisabledError extends Error {
  constructor() {
    super("LLM provider is disabled. Set LLM_PROVIDER=ollama, LLM_PROVIDER=openai, or LLM_PROVIDER=gemini for generation, freeform chat import, and LLM critique.");
    this.name = "LLMDisabledError";
  }
}

export class LLMTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms.`);
    this.name = "LLMTimeoutError";
  }
}

function llmTimeoutMs(config: EffectiveLLMConfig): number {
  return config.timeoutMs;
}

async function withLLMTimeout<T>(operation: Promise<T>, config: EffectiveLLMConfig, signal?: AbortSignal): Promise<T> {
  const timeoutMs = llmTimeoutMs(config);
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new LLMTimeoutError(timeoutMs)), timeoutMs);
        if (signal) {
          abortListener = () => reject(new DOMException("Request interrupted.", "AbortError"));
          signal.addEventListener("abort", abortListener, { once: true });
        }
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}

export function getLLMProvider(): LLMProvider {
  return resolveLLMConfig().provider;
}

export async function getJsonFromLLM(prompt: string, options: { signal?: AbortSignal } = {}): Promise<unknown> {
  const config = resolveLLMConfig();
  if (config.provider === "none") {
    throw new LLMDisabledError();
  }
  await waitForLlmRequestSlot(config.provider);
  if (config.provider === "openai") {
    return withLLMTimeout(getJsonFromOpenAI(prompt, { ...options, config }), config, options.signal);
  }
  if (config.provider === "gemini") {
    return withLLMTimeout(getJsonFromGemini(prompt, { ...options, config }), config, options.signal);
  }
  return withLLMTimeout(getJsonFromOllama(prompt, { ...options, config }), config, options.signal);
}
