import { LLMDisabledError, LLMTimeoutError } from "@/lib/ai/llmClient";
import { isJsonExtractionError as isJsonExtractionErrorValue, JsonExtractionError } from "@/lib/ai/jsonResponse";
import { OllamaModelMissingError, OllamaUnavailableError } from "@/lib/ai/providers/ollamaClient";

export class RequestResolutionError extends Error {
  constructor(message = "The curator could not understand the request before generation started. Try again or simplify the instruction.") {
    super(message);
    this.name = "RequestResolutionError";
  }
}

export function isOpenAIQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = typeof (error as Error & { status?: unknown }).status === "number"
    ? (error as Error & { status: number }).status
    : null;
  const message = error.message.toLowerCase();

  return status === 429 || message.includes("exceeded your current quota") || message.includes("rate limit");
}

export function openAIUnavailableMessage(): string {
  return "OpenAI is unavailable because the configured API key is over quota or rate-limited. Track-list import and iTunes verification still work; generation, chat extraction, and LLM critique need billing/quota restored.";
}

export function isLLMDisabledError(error: unknown): boolean {
  return error instanceof LLMDisabledError;
}

export function isLLMTimeoutError(error: unknown): boolean {
  return error instanceof LLMTimeoutError;
}

export function isJsonExtractionError(error: unknown): error is JsonExtractionError {
  return isJsonExtractionErrorValue(error);
}

export function isOllamaUnavailableError(error: unknown): boolean {
  return error instanceof OllamaUnavailableError || error instanceof OllamaModelMissingError;
}

export function isRequestResolutionError(error: unknown): boolean {
  return error instanceof RequestResolutionError;
}
