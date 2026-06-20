import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJsonFromLLM, getLLMProvider, LLMDisabledError, LLMTimeoutError } from "@/lib/ai/llmClient";

describe("LLM provider selection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cutlist-llm-client-"));
    vi.stubEnv("CUTLIST_LLM_SETTINGS_PATH", join(tempDir, "settings.json"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("defaults to Gemini for first-run setup", () => {
    vi.stubEnv("LLM_PROVIDER", "");

    expect(getLLMProvider()).toBe("gemini");
  });

  it("supports explicit OpenAI provider", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");

    expect(getLLMProvider()).toBe("openai");
  });

  it("supports explicit Gemini provider", () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");

    expect(getLLMProvider()).toBe("gemini");
  });

  it("requires an OpenAI key when OpenAI is selected", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(getJsonFromLLM("test")).rejects.toThrow("OPENAI_API_KEY is not configured.");
  });

  it("requires a Gemini key when Gemini is selected", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");

    await expect(getJsonFromLLM("test")).rejects.toThrow("GEMINI_API_KEY is not configured.");
  });

  it("supports disabled LLM mode without requiring an OpenAI key", async () => {
    vi.stubEnv("LLM_PROVIDER", "none");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(getJsonFromLLM("test")).rejects.toBeInstanceOf(LLMDisabledError);
  });

  it("falls back to Gemini for unknown provider values", () => {
    vi.stubEnv("LLM_PROVIDER", "bogus");

    expect(getLLMProvider()).toBe("gemini");
  });

  it("times out slow providers", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("LLM_TIMEOUT_MS", "1");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Promise<Response>(() => {}));

    await expect(getJsonFromLLM("test")).rejects.toBeInstanceOf(LLMTimeoutError);
  });
});
