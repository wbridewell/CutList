import { ZodError } from "zod";
import { JsonExtractionError } from "@/lib/ai/jsonResponse";
import { LLMDisabledError, LLMTimeoutError } from "@/lib/ai/llmClient";
import { LLMProviderNotConfiguredError } from "@/lib/ai/providerErrors";
import type { DesktopError } from "@/lib/desktop/contracts";

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown desktop command failure.";
}

// Runs in the Node desktop backend process (desktop/command.ts), where the actual
// exception types are still available. The Rust command boundary passes the resulting
// {code, message} straight through to the frontend, which branches on `code` and never
// re-inspects the message. This is therefore the only place classification happens.
//
// Typed checks come first. The message patterns after them exist for errors that arrive
// as a plain Error: undici's "fetch failed", provider HTTP failures, and OpenAI SDK
// errors. Ollama's own error classes deliberately fall through to "unknown" so the
// client shows their specific remediation text rather than a generic message.
export function classifyBackendError(error: unknown): DesktopError {
  const message = messageOf(error);

  if (error instanceof ZodError) {
    return { code: "invalid_payload", message };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "cancelled", message };
  }
  if (error instanceof LLMDisabledError || error instanceof LLMProviderNotConfiguredError) {
    return { code: "llm_unconfigured", message };
  }
  if (error instanceof LLMTimeoutError) {
    return { code: "llm_timeout", message };
  }
  if (error instanceof JsonExtractionError) {
    return { code: "llm_malformed_response", message };
  }

  if (/GEMINI_API_KEY|OPENAI_API_KEY|LLM provider is disabled|Gemini is not configured|OpenAI is unavailable|local LLM provider is unavailable/i.test(message)) {
    return { code: "llm_unconfigured", message };
  }
  if (/timed out|timeout/i.test(message)) {
    return { code: "llm_timeout", message };
  }
  if (/Could not recover a single valid JSON object or array|Model returned an empty JSON response|returned an empty response|thinking output without a JSON response/i.test(message)) {
    return { code: "llm_malformed_response", message };
  }
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|Failed to fetch|request failed|unavailable/i.test(message)) {
    return { code: "provider_unreachable", message };
  }

  return { code: "unknown", message };
}
