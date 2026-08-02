import { beforeEach, describe, expect, it, vi } from "vitest";
import { desktopCommandNames } from "@/lib/desktop/contracts";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args)
}));

describe("LLM setup client cache", () => {
  it("shares concurrent setup reads", async () => {
    const { getLLMSetup } = await import("@/lib/client/llmSetupApi");
    const response = {
      localSettingsPresent: false,
      status: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        timeoutMs: 120000,
        curatorPersona: "razor",
        configured: false,
        keyPresent: false,
        llmAssistedMatchReviewEnabled: true,
        keySource: "missing",
        envOverrides: {
          provider: false,
          key: false,
          model: false,
          timeout: false
        }
      }
    };
    invokeMock.mockResolvedValue(response);

    await expect(Promise.all([getLLMSetup(), getLLMSetup()])).resolves.toEqual([response, response]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(desktopCommandNames.getLlmSetup, { payload: null });
  });
});

describe("LLM provider secret storage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
  });

  it("sends the provider and secret straight to the keychain command", async () => {
    const { setLLMProviderSecret } = await import("@/lib/client/llmSetupApi");
    invokeMock.mockResolvedValue({ ok: true });

    await setLLMProviderSecret("gemini", "sk-test-key");

    expect(invokeMock).toHaveBeenCalledWith(desktopCommandNames.setProviderSecret, {
      provider: "gemini",
      secret: "sk-test-key"
    });
  });

  it("deletes a provider secret and invalidates the cached setup status", async () => {
    const { deleteLLMProviderSecret, getLLMSetup } = await import("@/lib/client/llmSetupApi");
    const initialStatus = { status: { provider: "gemini" }, localSettingsPresent: false };
    const afterDeleteStatus = { status: { provider: "gemini" }, localSettingsPresent: false };
    invokeMock.mockResolvedValueOnce(initialStatus);
    await getLLMSetup();

    invokeMock.mockResolvedValueOnce({ ok: true });
    await deleteLLMProviderSecret("openai");

    invokeMock.mockResolvedValueOnce(afterDeleteStatus);
    await getLLMSetup();

    expect(invokeMock).toHaveBeenCalledWith(desktopCommandNames.deleteProviderSecret, { provider: "openai" });
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });
});
