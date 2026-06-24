import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveUserRequestPlan } from "@/lib/ai/services/userRequestPlan";
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
  tracks: [{
    id: "track-1",
    title: "Song",
    artist: "Artist",
    album: null,
    durationMs: 180000,
    runtime: "3:00",
    verified: true,
    source: "manual",
    sourceId: "track-1",
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: [],
    rationale: null,
    energy: null,
    evidenceNotes: [],
    verificationNote: "Manual.",
    verificationConfidence: "manual"
  }],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-23T00:00:00Z"
};

describe("resolveUserRequestPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces read-only review plans for explicit non-modification directives", async () => {
    const plan = await resolveUserRequestPlan(
      playlist,
      "Reorder the playlist to improve flow, but do not modify the playlist."
    );

    expect(plan.routeFamily).toBe("review");
    expect(plan.executionPolicy).toBe("read_only");
    expect(plan.reviewMode).toBe("sequencing_only");
    expect(plan.routingNotes).toContain("explicit_non_modification_directive");
    expect(vi.mocked(attemptLlmContract)).not.toHaveBeenCalled();
  });

  it("forces import plans for pasted track tables", async () => {
    const plan = await resolveUserRequestPlan(
      playlist,
      "Artist - Song\nAnother Artist - Another Song"
    );

    expect(plan.routeFamily).toBe("import");
    expect(plan.operationPlan.kind).toBe("import_only");
    expect(plan.routingNotes).toContain("pasted_tracks_detected");
  });

  it("routes mixed requests through a mutating mixed plan when the intent model allows mutation", async () => {
    vi.mocked(attemptLlmContract).mockResolvedValueOnce({
      status: "success",
      raw: {},
      repairedFromRaw: null,
      parsed: {
        operationIntent: {
          type: "add",
          requestedTrackCount: 2,
          targetTotalTrackCount: null,
          replaceCount: null,
          confidence: "high"
        },
        verifiedRules: {},
        curatorGuidance: {},
        routingIntent: {
          routeFamily: "curator",
          allowMutation: true,
          diagnosisOnly: false,
          hypotheticalOnly: false,
          reviewMode: null
        },
        scopeIntent: {
          persistentVerifiedRuleFields: [],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: []
        },
        notes: []
      }
    });

    const plan = await resolveUserRequestPlan(
      playlist,
      "Review the playlist and suggest two tracks by Tori Amos."
    );

    expect(plan.operationPlan.kind).toBe("mixed_review_and_curator");
    expect(plan.executionPolicy).toBe("mutating");
    expect(plan.operationPlan.reviewPrompt).toBe("Review the playlist");
    expect(plan.operationPlan.curatorPrompt).toBe("suggest two tracks by Tori Amos.");
  });

  it("falls back to lexical review routing when the intent model times out", async () => {
    vi.mocked(attemptLlmContract).mockResolvedValueOnce({
      status: "fallback",
      reason: "timeout",
      error: new Error("timeout"),
      raw: null
    });

    const plan = await resolveUserRequestPlan(
      playlist,
      "Identify the single biggest structural problem in this playlist. Focus on identity, pacing, transitions, and version risks."
    );

    expect(plan.routeFamily).toBe("review");
    expect(plan.reviewMode).toBe("diagnose_only");
    expect(plan.routingNotes).toContain("llm_router_fallback");
    expect(plan.routingNotes).toContain("lexical_review_request");
  });

  it("resolves focused transition repair review mode for named bridge requests", async () => {
    const plan = await resolveUserRequestPlan(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks."
    );

    expect(plan.routeFamily).toBe("review");
    expect(plan.executionPolicy).toBe("read_only");
    expect(plan.reviewMode).toBe("focused_transition_repair");
  });

  it("keeps focused review mode when the review button forces read-only planning", async () => {
    const plan = await resolveUserRequestPlan(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks.",
      { forceReadOnly: true }
    );

    expect(plan.routeFamily).toBe("review");
    expect(plan.executionPolicy).toBe("read_only");
    expect(plan.reviewMode).toBe("focused_transition_repair");
    expect(plan.routingNotes).toContain("review_button_forces_read_only");
    expect(vi.mocked(attemptLlmContract)).not.toHaveBeenCalled();
  });

  it("does not downgrade focused transition repair to compression review when the prompt prefers short bridge tracks", async () => {
    const plan = await resolveUserRequestPlan(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks. Prefer tracks under 5 minutes.",
      { forceReadOnly: true }
    );

    expect(plan.routeFamily).toBe("review");
    expect(plan.executionPolicy).toBe("read_only");
    expect(plan.reviewMode).toBe("focused_transition_repair");
  });

  it("keeps explicit tightening-and-cutting requests on the mutating curator path", async () => {
    vi.mocked(attemptLlmContract).mockResolvedValueOnce({
      status: "fallback",
      reason: "timeout",
      error: new Error("timeout"),
      raw: null
    });

    const plan = await resolveUserRequestPlan(
      playlist,
      "Tighten the middle and cut anything that reads as dead weight."
    );

    expect(plan.routeFamily).toBe("curator");
    expect(plan.executionPolicy).toBe("mutating");
    expect(plan.operationPlan.kind).toBe("curator_only");
  });
});
