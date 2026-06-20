import "server-only";
import OpenAI from "openai";
import { parseJsonResponse } from "@/lib/ai/jsonResponse";
import { resolveLLMConfig, type EffectiveLLMConfig } from "@/lib/ai/llmConfig";

let client: OpenAI | null = null;
let clientApiKey: string | null = null;

export function getOpenAIClient(config: EffectiveLLMConfig = resolveLLMConfig()): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!client || clientApiKey !== config.openaiApiKey) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
    clientApiKey = config.openaiApiKey;
  }
  return client;
}

export async function getJsonFromOpenAI(prompt: string, options: { signal?: AbortSignal; config?: EffectiveLLMConfig } = {}): Promise<unknown> {
  const config = options.config ?? resolveLLMConfig();
  const openai = getOpenAIClient(config);
  const response = await openai.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: "system",
        content: "Return strict JSON only. Do not include markdown fences or commentary."
      },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.8
  }, {
    signal: options.signal
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("The model returned an empty response.");
  }
  return parseJsonResponse(content).value;
}
