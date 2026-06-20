import "server-only";
import { parseJsonResponse } from "@/lib/ai/jsonResponse";
import { resolveLLMConfig, type EffectiveLLMConfig } from "@/lib/ai/llmConfig";

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

const strictJsonInstruction = "Return strict JSON only. Do not include markdown fences or commentary.";

function geminiModel(config: EffectiveLLMConfig): string {
  return config.geminiModel;
}

function geminiApiBaseUrl(): string {
  return (process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
}

function geminiApiKey(config: EffectiveLLMConfig): string {
  const key = config.geminiApiKey;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return key;
}

export async function getJsonFromGemini(prompt: string, options: { signal?: AbortSignal; config?: EffectiveLLMConfig } = {}): Promise<unknown> {
  const config = options.config ?? resolveLLMConfig();
  const model = geminiModel(config);
  const response = await fetch(`${geminiApiBaseUrl()}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": geminiApiKey(config)
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: `${strictJsonInstruction}\n\n${prompt}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8
      }
    }),
    signal: options.signal
  });

  const body = await response.json().catch(() => ({})) as GeminiResponse;
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${body.error?.message ?? response.statusText}`);
  }

  const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!content) {
    throw new Error("Gemini returned an empty response.");
  }
  return parseJsonResponse(content).value;
}
