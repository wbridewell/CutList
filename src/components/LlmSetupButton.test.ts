import { describe, expect, it } from "vitest";
import { apiKeyFieldPlaceholder, shouldOfferRemoveSavedKey } from "@/components/LlmSetupButton";
import type { LLMSetupStatus } from "@/lib/client/llmSetupApi";

function statusFor(provider: LLMSetupStatus["provider"], overrides: Partial<LLMSetupStatus> = {}): LLMSetupStatus {
  return {
    provider,
    model: "gemini-2.5-flash",
    timeoutMs: 120000,
    curatorPersona: "razor",
    configured: true,
    keyPresent: true,
    llmAssistedMatchReviewEnabled: true,
    keySource: "keychain",
    envOverrides: { provider: false, key: false, model: false, timeout: false },
    ...overrides
  };
}

describe("shouldOfferRemoveSavedKey", () => {
  it("offers removal when status matches the selected provider and has a keychain key", () => {
    expect(shouldOfferRemoveSavedKey(statusFor("gemini"), "gemini")).toBe(true);
  });

  it("does not offer removal once the dropdown selects a different provider than status describes", () => {
    const staleGeminiStatus = statusFor("gemini");
    expect(shouldOfferRemoveSavedKey(staleGeminiStatus, "openai")).toBe(false);
  });

  it("does not offer removal when the matching provider has no keychain key", () => {
    expect(shouldOfferRemoveSavedKey(statusFor("gemini", { keyPresent: false, keySource: "missing" }), "gemini")).toBe(false);
  });

  it("does not offer removal when the matching provider's key came from a shell env var, not the keychain", () => {
    expect(shouldOfferRemoveSavedKey(statusFor("gemini", { keySource: "env" }), "gemini")).toBe(false);
  });

  it("does not offer removal when there is no status yet", () => {
    expect(shouldOfferRemoveSavedKey(null, "gemini")).toBe(false);
  });
});

describe("apiKeyFieldPlaceholder", () => {
  it("mentions the saved key only when status matches the selected provider", () => {
    expect(apiKeyFieldPlaceholder(statusFor("gemini"), "gemini")).toBe("Key already saved in keychain; leave blank to keep it");
  });

  it("falls back to a generic placeholder once the dropdown selects a different provider than status describes", () => {
    expect(apiKeyFieldPlaceholder(statusFor("gemini"), "openai")).toBe("Paste API key");
  });
});
