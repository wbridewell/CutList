import { describe, expect, it } from "vitest";
import { z } from "zod";
import { JsonExtractionError } from "@/lib/ai/jsonResponse";
import { LLMDisabledError, LLMTimeoutError } from "@/lib/ai/llmClient";
import { LLMProviderNotConfiguredError } from "@/lib/ai/providerErrors";
import { classifyBackendError } from "@/lib/desktop/errors";

describe("classifyBackendError", () => {
  it("classifies Zod validation failures as invalid_payload", () => {
    const result = z.object({ userMessage: z.string() }).safeParse({});
    expect(result.success).toBe(false);

    const error = classifyBackendError(result.success ? undefined : result.error);

    expect(error.code).toBe("invalid_payload");
  });

  it("classifies AbortError as cancelled", () => {
    const error = classifyBackendError(new DOMException("Request interrupted.", "AbortError"));

    expect(error.code).toBe("cancelled");
  });

  it("classifies the typed LLM errors without looking at their messages", () => {
    expect(classifyBackendError(new LLMDisabledError()).code).toBe("llm_unconfigured");
    expect(classifyBackendError(new LLMProviderNotConfiguredError("gemini")).code).toBe("llm_unconfigured");
    expect(classifyBackendError(new LLMTimeoutError(5)).code).toBe("llm_timeout");
    expect(classifyBackendError(new JsonExtractionError("bad", "{")).code).toBe("llm_malformed_response");
  });

  it("classifies missing provider configuration as llm_unconfigured", () => {
    expect(classifyBackendError(new Error("GEMINI_API_KEY is not set.")).code).toBe("llm_unconfigured");
    expect(classifyBackendError(new Error("Gemini is not configured.")).code).toBe("llm_unconfigured");
    expect(classifyBackendError(new Error("local LLM provider is unavailable")).code).toBe("llm_unconfigured");
  });

  it("classifies timeouts as llm_timeout", () => {
    expect(classifyBackendError(new Error("Request timed out after 120000ms.")).code).toBe("llm_timeout");
  });

  it("classifies unparseable model output as llm_malformed_response", () => {
    expect(classifyBackendError(new Error("Could not recover a single valid JSON object or array.")).code).toBe(
      "llm_malformed_response"
    );
  });

  it("classifies network failures as provider_unreachable", () => {
    expect(classifyBackendError(new Error("fetch failed")).code).toBe("provider_unreachable");
    expect(classifyBackendError(new Error("connect ECONNREFUSED 127.0.0.1:11434")).code).toBe("provider_unreachable");
  });

  it("falls back to unknown for unrecognized errors", () => {
    const error = classifyBackendError(new Error("Something unexpected happened."));

    expect(error.code).toBe("unknown");
    expect(error.message).toBe("Something unexpected happened.");
  });

  it("handles non-Error throws", () => {
    expect(classifyBackendError("a plain string failure").message).toBe("a plain string failure");
    expect(classifyBackendError(undefined).message).toBe("Unknown desktop command failure.");
  });
});
