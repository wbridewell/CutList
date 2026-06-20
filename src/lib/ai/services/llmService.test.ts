import { beforeEach, describe, expect, it, vi } from "vitest";
import { JsonExtractionError } from "@/lib/ai/jsonResponse";
import { attemptLlmContract } from "@/lib/ai/services/llmService";

vi.mock("@/lib/ai/llmClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llmClient")>("@/lib/ai/llmClient");
  return {
    ...actual,
    getJsonFromLLM: vi.fn()
  };
});

const { getJsonFromLLM } = await import("@/lib/ai/llmClient");

const validInstructionIntent = {
  operationIntent: {
    type: "replace",
    requestedTrackCount: null,
    targetTotalTrackCount: null,
    replaceCount: 3,
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
  notes: ["Preserve the opener."]
};

describe("attemptLlmContract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repairs one malformed schema response for instruction intent", async () => {
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        operationIntent: {
          type: "replace"
        }
      })
      .mockResolvedValueOnce(validInstructionIntent);

    const result = await attemptLlmContract<typeof validInstructionIntent>("instructionIntent", "replace the weakest 3 tracks");

    expect(result.status).toBe("success_repaired");
    if (result.status !== "success_repaired") {
      throw new Error("Expected repaired success.");
    }
    expect(result.parsed.operationIntent.replaceCount).toBe(3);
    expect(result.repairedFromRaw).toEqual({
      operationIntent: {
        type: "replace"
      }
    });
    expect(vi.mocked(getJsonFromLLM)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getJsonFromLLM).mock.calls[1]?.[0]).toContain("Repair this model output into valid JSON");
    expect(vi.mocked(getJsonFromLLM).mock.calls[1]?.[0]).toContain("\"replaceCount\":number|null");
  });

  it("returns a structured extraction fallback when provider JSON recovery fails", async () => {
    vi.mocked(getJsonFromLLM).mockRejectedValueOnce(
      new JsonExtractionError("Could not recover JSON.", "Not actually JSON.")
    );

    const result = await attemptLlmContract("playlistCritique", "review playlist");

    expect(result).toMatchObject({
      status: "fallback",
      reason: "json_extraction_error",
      raw: "Not actually JSON."
    });
  });

  it("falls back with shape_error when the repair attempt is still invalid", async () => {
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        message: "Not enough structure."
      })
      .mockResolvedValueOnce({
        still: "wrong"
      });

    const result = await attemptLlmContract("playlistCritique", "review playlist");

    expect(result.status).toBe("fallback");
    if (result.status !== "fallback") {
      throw new Error("Expected fallback.");
    }
    expect(result.reason).toBe("shape_error");
    expect(vi.mocked(getJsonFromLLM)).toHaveBeenCalledTimes(2);
  });
});
