import { ZodError } from "zod";
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
// {code, message} straight through to the frontend, which is what lets
// errorMessageForWorkflow branch on `code` instead of pattern-matching message text.
export function classifyBackendError(error: unknown): DesktopError {
  const message = messageOf(error);

  if (error instanceof ZodError) {
    return { code: "invalid_payload", message };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "cancelled", message };
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
