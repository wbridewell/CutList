import "server-only";
import { parseJsonResponse } from "@/lib/ai/jsonResponse";
import { resolveLLMConfig, type EffectiveLLMConfig } from "@/lib/ai/llmConfig";

export class OllamaUnavailableError extends Error {
  constructor(baseUrl: string) {
    super(`Ollama is not reachable at ${baseUrl}. Start Ollama, update OLLAMA_BASE_URL, or switch to Gemini, OpenAI, or none mode in LLM setup.`);
    this.name = "OllamaUnavailableError";
  }
}

export class OllamaModelMissingError extends Error {
  constructor(model: string) {
    super(`Ollama model "${model}" is not available. Run "ollama pull ${model}" or switch to Gemini, OpenAI, or none mode in LLM setup.`);
    this.name = "OllamaModelMissingError";
  }
}

type OllamaChatResponse = {
  message?: {
    content?: string;
    thinking?: string;
  };
  error?: string;
};

type OllamaChatRequestBody = {
  model: string;
  stream: boolean;
  format?: "json";
  think?: OllamaGptOssThinkLevel;
  messages: { role: "system" | "user"; content: string }[];
  options?: {
    temperature: number;
  };
};

const strictJsonInstruction = "Return strict JSON only. Do not include markdown fences or commentary.";
const gptOssModelPattern = /^gpt-oss(?::|$)/i;
const gptOssThinkLevels = new Set(["low", "medium", "high"]);
type OllamaGptOssThinkLevel = "low" | "medium" | "high";

function ollamaBaseUrl(config: EffectiveLLMConfig): string {
  return config.ollamaBaseUrl.replace(/\/+$/, "");
}

export function getOllamaModel(config: EffectiveLLMConfig = resolveLLMConfig()): string {
  return config.ollamaModel;
}

function isGptOssModel(model: string): boolean {
  return gptOssModelPattern.test(model);
}

function shouldUseJsonMode(model: string): boolean {
  return !isGptOssModel(model);
}

function shouldStreamResponse(model: string): boolean {
  return isGptOssModel(model);
}

function getGptOssThinkLevel(config: EffectiveLLMConfig): OllamaGptOssThinkLevel {
  return gptOssThinkLevels.has(config.ollamaGptOssThink) ? config.ollamaGptOssThink : "medium";
}

function ollamaThinkLevel(model: string, config: EffectiveLLMConfig): OllamaGptOssThinkLevel | undefined {
  return isGptOssModel(model) ? getGptOssThinkLevel(config) : undefined;
}

function createOllamaRequestBody(model: string, prompt: string, config: EffectiveLLMConfig): OllamaChatRequestBody {
  const stream = shouldStreamResponse(model);
  const useSingleUserMessage = isGptOssModel(model);
  return {
    model,
    stream,
    ...(shouldUseJsonMode(model) ? { format: "json" as const } : {}),
    ...(ollamaThinkLevel(model, config) ? { think: ollamaThinkLevel(model, config) } : {}),
    messages: useSingleUserMessage
      ? [{ role: "user", content: `${strictJsonInstruction}\n\n${prompt}` }]
      : [
        {
          role: "system",
          content: strictJsonInstruction
        },
        { role: "user", content: prompt }
      ],
    ...(useSingleUserMessage ? {} : { options: { temperature: 0.1 } })
  };
}

function parseJsonlLine(line: string, model: string): string {
  const body = JSON.parse(line) as OllamaChatResponse;
  if (body.error) {
    if (/model.*(not found|not available)|pull/i.test(body.error)) {
      throw new OllamaModelMissingError(model);
    }
    throw new Error(`Ollama request failed: ${body.error}`);
  }
  return body.message?.content ?? "";
}

async function parseStreamedContent(response: Response, model: string): Promise<string> {
  const body = response.body;
  if (!body) {
    throw new Error("Ollama returned an empty response stream.");
  }

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let content = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += value;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        content += parseJsonlLine(line, model);
      }
    }
  }

  if (buffer.trim()) {
    content += parseJsonlLine(buffer, model);
  }

  return content;
}

export async function getJsonFromOllama(prompt: string, options: { signal?: AbortSignal; config?: EffectiveLLMConfig } = {}): Promise<unknown> {
  const config = options.config ?? resolveLLMConfig();
  const baseUrl = ollamaBaseUrl(config);
  const model = getOllamaModel(config);
  const requestBody = createOllamaRequestBody(model, prompt, config);
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: options.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new OllamaUnavailableError(baseUrl);
  }

  if (requestBody.stream && response.ok) {
    const content = await parseStreamedContent(response, model);
    if (!content) {
      throw new Error("Ollama returned an empty response.");
    }
    return parseJsonResponse(content).value;
  }

  const body = await response.json().catch(() => ({})) as OllamaChatResponse;
  if (!response.ok) {
    const message = body.error ?? response.statusText;
    if (response.status === 404 || /model.*(not found|not available)|pull/i.test(message)) {
      throw new OllamaModelMissingError(model);
    }
    throw new Error(`Ollama request failed: ${message}`);
  }

  const content = body.message?.content;
  if (!content) {
    if (body.message?.thinking) {
      throw new Error("Ollama returned thinking output without a JSON response.");
    }
    throw new Error("Ollama returned an empty response.");
  }

  return parseJsonResponse(content).value;
}
