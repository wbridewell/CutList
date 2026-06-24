import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOperatorPlan } from "@/lib/ai/services/operatorPlanner";
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
    id: "prodigy-firestarter",
    title: "Firestarter",
    artist: "The Prodigy",
    album: null,
    durationMs: 280000,
    runtime: "4:40",
    verified: true,
    source: "manual",
    sourceId: "1",
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: ["electronic"],
    rationale: null,
    fitNotes: null,
    energy: 9,
    verificationNote: "Manual."
  }, {
    id: "portishead-roads",
    title: "Roads",
    artist: "Portishead",
    album: null,
    durationMs: 300000,
    runtime: "5:00",
    verified: true,
    source: "manual",
    sourceId: "2",
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: ["trip-hop"],
    rationale: null,
    fitNotes: null,
    energy: 3,
    verificationNote: "Manual."
  }],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-24T00:00:00Z"
};

describe("resolveOperatorPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds the named transition and treats per-track runtime preferences as parameter hints", async () => {
    vi.mocked(attemptLlmContract)
      .mockResolvedValueOnce({
        status: "fallback",
        reason: "shape_error",
        error: new Error("shape"),
        raw: null
      })
      .mockResolvedValueOnce({
        status: "success",
        raw: {},
        repairedFromRaw: null,
        parsed: {
          routeFamily: "review",
          executionPolicy: "read_only",
          planTemplate: "focused_transition_review",
          reviewMode: "focused_transition_repair",
          operators: [
            { kind: "resolve_named_tracks", fromText: "Firestarter", toText: "Roads" },
            { kind: "analyze_transition" },
            { kind: "generate_bridge_options", requestedCount: 3 },
            { kind: "summarize_for_user" }
          ],
          declaredEntities: {
            namedTracks: ["Firestarter", "Roads"],
            transition: { fromText: "Firestarter", toText: "Roads" },
            targetSpan: null
          },
          parameterHints: {
            requestedCount: 3,
            targetTotalTrackCount: null,
            replacementCount: null,
            maxTrackDurationMs: null,
            avoidArtistRepeats: false,
            preserve: [],
            avoid: []
          },
          confidence: "high",
          planningNotes: []
        }
      });

    const plan = await resolveOperatorPlan(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks. Prefer tracks under 5 minutes. Avoid: artist repeats."
    );

    expect(plan.planTemplate).toBe("focused_transition_review");
    expect(plan.boundEntities.namedTransition).toMatchObject({
      fromTrackId: "prodigy-firestarter",
      toTrackId: "portishead-roads",
      resolution: "exact"
    });
    expect(plan.parameterHints.maxTrackDurationMs).toBe(300000);
    expect(plan.parameterHints.avoidArtistRepeats).toBe(true);
  });

  it("rejects illegal mutating operators in read-only plans", async () => {
    vi.mocked(attemptLlmContract)
      .mockResolvedValueOnce({
        status: "fallback",
        reason: "shape_error",
        error: new Error("shape"),
        raw: null
      })
      .mockResolvedValueOnce({
        status: "success",
        raw: {},
        repairedFromRaw: null,
        parsed: {
          routeFamily: "review",
          executionPolicy: "read_only",
          planTemplate: "curator_mutation",
          reviewMode: null,
          operators: [
            { kind: "remove_tracks" },
            { kind: "summarize_for_user" }
          ],
          declaredEntities: {
            namedTracks: [],
            transition: null,
            targetSpan: null
          },
          parameterHints: {
            requestedCount: null,
            targetTotalTrackCount: null,
            replacementCount: null,
            maxTrackDurationMs: null,
            avoidArtistRepeats: false,
            preserve: [],
            avoid: []
          },
          confidence: "medium",
          planningNotes: []
        }
      });

    const plan = await resolveOperatorPlan(
      playlist,
      "Do not modify the playlist. Replace the two weakest tracks."
    );

    expect(plan.executionPolicy).toBe("read_only");
    expect(plan.routeFamily).toBe("review");
    expect(plan.operators.some((operator) => operator.kind === "remove_tracks")).toBe(false);
  });
});
