import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLocalLLMSettings } from "@/lib/ai/llmConfig";
import {
  getDesktopLlmSetup,
  saveDesktopLlmSetup,
  saveDesktopWorkspaceState,
  testDesktopLlmSetup
} from "@/lib/desktop/backend";

vi.mock("@/lib/ai/llmClient", () => ({
  getJsonFromLLM: vi.fn(async () => ({ ok: true }))
}));

let tempDir: string;

describe("desktop backend service", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cutlist-desktop-backend-"));
    vi.stubEnv("CUTLIST_LLM_SETTINGS_PATH", join(tempDir, "settings.json"));
    vi.stubEnv("CUTLIST_DESKTOP_WORKSPACE_STATE_PATH", join(tempDir, "workspace.json"));
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns redacted desktop setup status", () => {
    const response = getDesktopLlmSetup();

    expect(response.status).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-flash",
      configured: false,
      keyPresent: false,
      curatorPersona: "razor"
    });
    expect(JSON.stringify(response)).not.toContain("ApiKey");
  });

  it("saves llm settings without persisting api keys locally", () => {
    const response = saveDesktopLlmSetup({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      timeoutMs: 180000,
      llmAssistedMatchReviewEnabled: false,
      curatorPersona: "firestarter"
    });

    expect(readLocalLLMSettings()).toMatchObject({
      provider: "gemini",
      geminiModel: "gemini-2.5-flash-lite",
      timeoutMs: 180000,
      llmAssistedMatchReviewEnabled: false,
      curatorPersona: "firestarter"
    });
    expect(readLocalLLMSettings()).not.toHaveProperty("geminiApiKey");
    expect(response.status).toMatchObject({
      configured: false,
      keySource: "missing",
      llmAssistedMatchReviewEnabled: false,
      curatorPersona: "firestarter"
    });
  });

  it("reports configured status once Rust has injected a keychain key", () => {
    vi.stubEnv("GEMINI_API_KEY", "keychain-gemini-key");
    vi.stubEnv("CUTLIST_GEMINI_KEY_SOURCE", "1");

    const response = saveDesktopLlmSetup({
      provider: "gemini",
      model: "gemini-2.5-flash-lite"
    });

    expect(JSON.stringify(response)).not.toContain("keychain-gemini-key");
    expect(response.status).toMatchObject({
      configured: true,
      keySource: "keychain"
    });
  });

  it("saves curator persona without replacing provider settings", () => {
    saveDesktopLlmSetup({
      provider: "gemini",
      model: "gemini-2.5-flash-lite"
    });

    const response = saveDesktopLlmSetup({ curatorPersona: "archivist" });

    expect(readLocalLLMSettings()).toMatchObject({
      provider: "gemini",
      geminiModel: "gemini-2.5-flash-lite",
      curatorPersona: "archivist"
    });
    expect(response.status).toMatchObject({
      provider: "gemini",
      curatorPersona: "archivist"
    });
  });

  it("tests the saved setup and returns a friendly status", async () => {
    const response = await testDesktopLlmSetup({
      provider: "gemini",
      model: "gemini-2.5-flash"
    });

    expect(response).toMatchObject({
      ok: true,
      message: "LLM connection works. The Curator is ready to build playlists."
    });
  });

  it("normalizes and returns saved workspace state", () => {
    const state = {
      version: 1 as const,
      draft: null,
      sessions: [],
      activeSessionId: null
    };

    expect(saveDesktopWorkspaceState(state)).toEqual({ state });
  });
});
