import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  llmSetupStatus,
  mergeLocalLLMSettings,
  readLocalLLMSettings,
  resolveLLMConfig,
  writeLocalLLMSettings
} from "@/lib/ai/llmConfig";

let tempDir: string;

describe("LLM config resolution", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cutlist-llm-config-"));
    vi.stubEnv("CUTLIST_LLM_SETTINGS_PATH", join(tempDir, "settings.json"));
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "");
    vi.stubEnv("OLLAMA_MODEL", "");
    vi.stubEnv("OLLAMA_BASE_URL", "");
    vi.stubEnv("LLM_TIMEOUT_MS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses Gemini defaults when no env or local settings exist", () => {
    const config = resolveLLMConfig();

    expect(config.provider).toBe("gemini");
    expect(config.geminiModel).toBe("gemini-2.5-flash");
    expect(config.geminiApiKey).toBeUndefined();
    expect(llmSetupStatus()).toMatchObject({
      provider: "gemini",
      configured: false,
      keyPresent: false,
      keySource: "missing",
      llmAssistedMatchReviewEnabled: true,
      curatorPersona: "razor"
    });
  });

  it("uses local settings when env vars are absent", () => {
    writeLocalLLMSettings({
      provider: "gemini",
      geminiApiKey: "local-gemini-key",
      geminiModel: "gemini-2.5-flash-lite",
      timeoutMs: 180000,
      llmAssistedMatchReviewEnabled: false,
      curatorPersona: "firestarter"
    });

    const config = resolveLLMConfig();

    expect(config.provider).toBe("gemini");
    expect(config.geminiApiKey).toBe("local-gemini-key");
    expect(config.geminiModel).toBe("gemini-2.5-flash-lite");
    expect(config.timeoutMs).toBe(180000);
    expect(llmSetupStatus()).toMatchObject({
      configured: true,
      keyPresent: true,
      keySource: "local",
      llmAssistedMatchReviewEnabled: false,
      curatorPersona: "firestarter"
    });
  });

  it("lets environment variables override local settings", () => {
    writeLocalLLMSettings({
      provider: "gemini",
      geminiApiKey: "local-gemini-key",
      geminiModel: "gemini-2.5-flash-lite",
      timeoutMs: 180000
    });
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "env-openai-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-test");
    vi.stubEnv("LLM_TIMEOUT_MS", "300000");

    const config = resolveLLMConfig();

    expect(config.provider).toBe("openai");
    expect(config.openaiApiKey).toBe("env-openai-key");
    expect(config.openaiModel).toBe("gpt-test");
    expect(config.timeoutMs).toBe(300000);
    expect(llmSetupStatus()).toMatchObject({
      configured: true,
      keySource: "env",
      envOverrides: {
        provider: true,
        key: true,
        model: true,
        timeout: true
      }
    });
  });

  it("merges local settings without returning raw keys in status", () => {
    mergeLocalLLMSettings({
      provider: "openai",
      openaiApiKey: "secret-key",
      openaiModel: "gpt-4.1-mini",
      curatorPersona: "archivist"
    });

    expect(readLocalLLMSettings()).toMatchObject({ openaiApiKey: "secret-key", curatorPersona: "archivist" });
    expect(JSON.stringify(llmSetupStatus())).not.toContain("secret-key");
    expect(llmSetupStatus().curatorPersona).toBe("archivist");
  });
});
