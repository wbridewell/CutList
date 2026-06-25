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
          replacementMode: "generic",
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
            placement: null,
            replacementTarget: null,
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
          replacementMode: "generic",
          reviewMode: null,
          operators: [
            { kind: "remove_tracks" },
            { kind: "summarize_for_user" }
          ],
          declaredEntities: {
            namedTracks: [],
            transition: null,
            placement: null,
            replacementTarget: null,
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

  it("binds relative add placement against an existing anchor track", async () => {
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
          routeFamily: "curator",
          executionPolicy: "mutating",
          planTemplate: "curator_mutation",
          replacementMode: "generic",
          reviewMode: null,
          operators: [
            { kind: "summarize_for_user" }
          ],
          declaredEntities: {
            namedTracks: [],
            transition: null,
            placement: {
              mode: "after_track",
              anchorQuery: "Firestarter"
            },
            replacementTarget: null,
            targetSpan: null
          },
          parameterHints: {
            requestedCount: 1,
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
      "Add Army of Me after Firestarter."
    );

    expect(plan.routeFamily).toBe("curator");
    expect(plan.boundEntities.placement).toMatchObject({
      mode: "after_track",
      anchorTrackId: "prodigy-firestarter",
      resolution: "exact"
    });
  });

  it("binds canonical replacement targets and clears add placement for replacements", async () => {
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
          routeFamily: "curator",
          executionPolicy: "mutating",
          planTemplate: "curator_mutation",
          replacementMode: "canonical_version",
          reviewMode: null,
          operators: [{ kind: "summarize_for_user" }],
          declaredEntities: {
            namedTracks: [],
            transition: null,
            placement: {
              mode: "after_track",
              anchorQuery: "Roads"
            },
            replacementTarget: "Blue Monday",
            targetSpan: null
          },
          parameterHints: {
            requestedCount: 1,
            targetTotalTrackCount: null,
            replacementCount: 1,
            maxTrackDurationMs: null,
            avoidArtistRepeats: false,
            preserve: [],
            avoid: []
          },
          confidence: "high",
          planningNotes: []
        }
      });

    const replacementPlaylist = {
      ...playlist,
      tracks: [
        ...playlist.tracks,
        {
          id: "blue-monday",
          title: "Blue Monday",
          artist: "New Order",
          album: "iTunes Originals",
          durationMs: 420000,
          runtime: "7:00",
          verified: true,
          source: "itunes" as const,
          sourceId: "3",
          sourceUrl: null,
          artworkUrl: null,
          vibeTags: [],
          genreTags: ["electronic"],
          rationale: null,
          fitNotes: null,
          energy: 7,
          verificationNote: "Manual."
        }
      ]
    };

    const plan = await resolveOperatorPlan(
      replacementPlaylist,
      "Replace this iTunes Original version of Blue Monday with the canonical track."
    );

    expect(plan.replacementMode).toBe("canonical_version");
    expect(plan.boundEntities.replacementTarget).toMatchObject({
      trackId: "blue-monday",
      resolution: "exact"
    });
    expect(plan.boundEntities.placement).toBeNull();
  });

});
