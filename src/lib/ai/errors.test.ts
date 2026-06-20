import { describe, expect, it, vi } from "vitest";
import {
  isLLMDisabledError,
  isOllamaUnavailableError,
  isOpenAIQuotaError
} from "@/lib/ai/errors";
import { shouldExposeModelDebug } from "@/lib/ai/modelErrors";
import { LLMDisabledError } from "@/lib/ai/llmClient";
import { OllamaUnavailableError } from "@/lib/ai/providers/ollamaClient";

describe("OpenAI error detection", () => {
  it("detects quota errors by status", () => {
    const error = new Error("anything") as Error & { status: number };
    error.status = 429;

    expect(isOpenAIQuotaError(error)).toBe(true);
  });

  it("detects quota errors by message", () => {
    expect(isOpenAIQuotaError(new Error("You exceeded your current quota"))).toBe(true);
  });

  it("detects disabled LLM mode", () => {
    expect(isLLMDisabledError(new LLMDisabledError())).toBe(true);
  });

  it("detects Ollama availability errors", () => {
    expect(isOllamaUnavailableError(new OllamaUnavailableError("http://localhost:11434"))).toBe(true);
  });

  it("does not expose raw model debug output in production", () => {
    vi.stubEnv("LLM_DEBUG_RAW", "1");
    vi.stubEnv("NODE_ENV", "production");

    expect(shouldExposeModelDebug()).toBe(false);

    vi.unstubAllEnvs();
  });
});
