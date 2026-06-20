import { describe, expect, it, vi } from "vitest";
import { parseInstructionIntentDetailed } from "@/lib/ai/services/instructionIntent";
import type { PlaylistState } from "@/types/playlist";

vi.mock("@/lib/ai/llmClient", () => ({
  getLLMProvider: vi.fn(() => "gemini")
}));

vi.mock("@/lib/ai/services/llmService", () => ({
  attemptLlmContract: vi.fn()
}));

const { attemptLlmContract } = await import("@/lib/ai/services/llmService");

const playlist: PlaylistState = {
  id: "playlist-1",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-18T00:00:00Z"
};

describe("parseInstructionIntentDetailed", () => {
  it("preserves repaired-success parse status for downstream routing", async () => {
    vi.mocked(attemptLlmContract).mockResolvedValueOnce({
      status: "success_repaired",
      raw: { broken: true },
      repairedFromRaw: { broken: true },
      parsed: {
        operationIntent: {
          type: "replace",
          requestedTrackCount: null,
          targetTotalTrackCount: null,
          replaceCount: 2,
          confidence: "high"
        },
        verifiedRules: {},
        curatorGuidance: {},
        scopeIntent: {
          persistentVerifiedRuleFields: [],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: []
        },
        notes: []
      }
    });

    const result = await parseInstructionIntentDetailed(playlist, "replace the weakest 2 tracks");

    expect(result.status).toBe("success_repaired");
    expect(result.intent?.operationIntent.type).toBe("replace");
    expect(result.intent?.operationIntent.replaceCount).toBe(2);
  });
});
