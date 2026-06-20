import { describe, expect, it, vi } from "vitest";
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
