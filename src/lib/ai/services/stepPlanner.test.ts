import { describe, expect, it, vi } from "vitest";
import { buildCuratorStepPlan } from "@/lib/ai/services/stepPlanner";
import { collectCuratorHeuristics } from "@/lib/ai/services/curatorRequestIntent";
import { normalizeInstructionIntentLayers } from "@/lib/ai/services/instructionIntent";
import type { PlaylistState, Track } from "@/types/playlist";

vi.mock("@/lib/ai/llmClient", () => ({
  getLLMProvider: vi.fn(() => "none")
}));

function track(id: string, title: string, artist: string): Track {
  return {
    id,
    title,
    artist,
    album: null,
    durationMs: 180000,
    runtime: "3:00",
    verified: true,
    source: "manual",
    sourceId: id,
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: ["rock"],
    rationale: null,
    fitNotes: null,
    energy: 5,
    verificationNote: "Manual."
  };
}

const playlist: PlaylistState = {
  id: "playlist",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [
    track("track-1", "Army of Me", "Bjork"),
    track("track-2", "Firestarter", "The Prodigy"),
    track("track-3", "Roads", "Portishead")
  ],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-29T00:00:00.000Z"
};

async function buildPlan(userMessage: string) {
  const heuristics = collectCuratorHeuristics(userMessage, playlist.constraints);
  return buildCuratorStepPlan({
    playlist,
    userMessage,
    parsedTracks: [],
    normalizedIntent: normalizeInstructionIntentLayers(null),
    heuristics,
    requestedAddCount: heuristics.counts.requestedAddCount,
    targetTotalTrackCount: heuristics.counts.targetTotalTrackCount,
    replacementCount: heuristics.counts.replacementCount,
    hasRuleChanges: false
  });
}

describe("stepPlanner", () => {
  it("splits mixed review and tighten prompts into analyze then remove", async () => {
    const plan = await buildPlan("review this, then tighten the playlist");

    expect(plan.steps.map((step) => step.kind)).toEqual(["analyze", "remove"]);
  });

  it("upgrades existing-track placement adds into reorders", async () => {
    const plan = await buildPlan("queue army of me after firestarter");

    expect(plan.steps.map((step) => step.kind)).toEqual(["reorder"]);
  });

  it("treats replace clauses as replace-only even when add and remove words also appear", async () => {
    const plan = await buildPlan("replace the weakest track with something warmer");

    expect(plan.steps.map((step) => step.kind)).toEqual(["replace"]);
  });
});
