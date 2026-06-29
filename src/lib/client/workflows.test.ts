import { describe, expect, it } from "vitest";
import {
  effectiveDiscoveryRadiusForRequest,
  acceptManualMatchWorkflow,
  applyReviewSuggestionWorkflow,
  applyVerifiedReviewSuggestionResponse,
  buildConversationContext,
  classifyComposerRequest,
  composeAnalyzeAssistantMessage,
  composeMixedReviewAndCuratorAssistantMessage,
  createCompletedRequestMessages,
  createRequestMessageList,
  promptForReviewSuggestion,
  reviewPromptForComposerRequest,
  runAnalyzeWorkflow,
  runCuratorRequestWorkflow,
  runMixedReviewAndCuratorWorkflow,
  runImportWorkflow,
  runSeedVerificationWorkflow,
  splitMixedComposerRequest
} from "@/lib/client/workflows";
import type {
  AnalyzePlaylistResponse,
  AttemptedMatch,
  CuratorResponse,
  ImportChatResponse,
  PlaylistMessageRequest,
  PlaylistState,
  Track
} from "@/types/playlist";

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? "itunes:1",
    title: overrides.title ?? "Opening Song",
    artist: overrides.artist ?? "Fixture Artist",
    album: overrides.album ?? "Fixture Album",
    durationMs: overrides.durationMs ?? 180000,
    runtime: overrides.runtime ?? "3:00",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "itunes",
    sourceId: overrides.sourceId ?? "1",
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    explicit: overrides.explicit ?? false,
    releaseDate: overrides.releaseDate ?? null,
    vibeTags: overrides.vibeTags ?? [],
    genreTags: overrides.genreTags ?? [],
    rationale: overrides.rationale ?? "Fits.",
    fitNotes: overrides.fitNotes,
    energy: overrides.energy ?? null,
    bpm: overrides.bpm ?? null,
    bpmConfidence: overrides.bpmConfidence ?? null,
    vocalProfile: overrides.vocalProfile ?? null,
    vocalProfileConfidence: overrides.vocalProfileConfidence ?? null,
    evidenceNotes: overrides.evidenceNotes ?? [],
    verificationNote: overrides.verificationNote ?? "Verified.",
    verificationConfidence: overrides.verificationConfidence ?? "high"
  };
}

function playlist(tracks: Track[] = []): PlaylistState {
  return {
    id: "client-workflow-playlist",
    title: "Client Workflow Playlist",
    mood: "tense",
    arc: null,
    tracks,
    constraints: {},
    discoveryRadius: "moderate",
    conversationSummary: null,
    updatedAt: "2026-06-07T00:00:00.000Z"
  };
}

function analysisResponse(overrides: Partial<AnalyzePlaylistResponse> = {}): AnalyzePlaylistResponse {
  return {
    reviewMode: overrides.reviewMode ?? "full_critique",
    curatorTake: overrides.curatorTake ?? "This set has a real center, but the sequence still wants firmer hands.",
    message: overrides.message ?? "This works.",
    strengths: overrides.strengths ?? ["Strong opener"],
    weakLinks: overrides.weakLinks ?? [],
    sequencingNotes: overrides.sequencingNotes ?? ["The ending resolves cleanly"],
    constraintReport: overrides.constraintReport ?? {
      passed: false,
      totalDurationMs: 180000,
      violations: [{ type: "maxTrackDurationMs", message: "Too long." }],
      evidenceWarnings: [{ type: "vocalProfile", message: "Unknown vocal evidence." }]
    },
    suggestedEdits: overrides.suggestedEdits ?? [],
    intentSummary: overrides.intentSummary,
    trackRoles: overrides.trackRoles ?? [],
    transitionReview: overrides.transitionReview ?? [],
    reviewSuggestions: overrides.reviewSuggestions ?? [],
    debug: overrides.debug
  };
}

describe("client workflows", () => {
  it("creates request message lists and completed assistant messages", () => {
    const started = createRequestMessageList([{ role: "assistant", content: "Ready." }], "Add tracks.");
    expect(started).toEqual([
      { role: "assistant", content: "Ready." },
      { role: "user", content: "Add tracks." }
    ]);
    expect(createCompletedRequestMessages(started, "Done.")).toEqual([
      ...started,
      { role: "assistant", content: "Done." }
    ]);
  });

  it("builds bounded recent conversation context for curator requests", () => {
    expect(buildConversationContext([
      { role: "user", content: "Earlier ask." },
      { role: "assistant", content: "Earlier answer." },
      { role: "user", content: "Keep the next batch under 8 minutes." }
    ])).toEqual({
      recentMessages: [
        { role: "user", content: "Earlier ask." },
        { role: "assistant", content: "Earlier answer." },
        { role: "user", content: "Keep the next batch under 8 minutes." }
      ]
    });

    const manyMessages = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `message ${index}`
    }));
    expect(buildConversationContext(manyMessages)?.recentMessages.map((message) => message.content)).toEqual([
      "message 2",
      "message 3",
      "message 4",
      "message 5",
      "message 6",
      "message 7",
      "message 8",
      "message 9"
    ]);
  });

  it("classifies composer requests into review, curator, and mixed paths", () => {
    const base = playlist([track()]);

    expect(classifyComposerRequest("review the playlist", base)).toBe("review_only");
    expect(classifyComposerRequest("Identify the single biggest structural problem in this playlist. Focus on identity, pacing, transitions, and version risks. Give a focused diagnosis, not a full rewrite.", base)).toBe("review_only");
    expect(classifyComposerRequest("Reorder the playlist to improve flow, but do not modify the playlist.", base)).toBe("review_only");
    expect(classifyComposerRequest("suggest two tracks by tori amos", base)).toBe("curator_only");
    expect(classifyComposerRequest("review the playlist. suggest two tracks by tori amos.", base)).toBe("mixed_review_and_curator");
    expect(classifyComposerRequest("review this, then reorder it", base)).toBe("mixed_review_and_curator");
    expect(classifyComposerRequest("reorder the playlist to improve flow", base)).toBe("curator_only");
    expect(classifyComposerRequest("review the playlist", playlist())).toBe("curator_only");
  });

  it("splits mixed composer prompts into review-only and curator-only clauses", () => {
    expect(splitMixedComposerRequest("review the playlist. suggest two tracks by tori amos.")).toEqual({
      reviewPrompt: "review the playlist.",
      curatorPrompt: "suggest two tracks by tori amos."
    });
    expect(splitMixedComposerRequest("review this, then reorder it")).toEqual({
      reviewPrompt: "review this",
      curatorPrompt: "reorder it"
    });
    expect(splitMixedComposerRequest("review the playlist and suggest two tracks by tori amos")).toEqual({
      reviewPrompt: "review the playlist",
      curatorPrompt: "suggest two tracks by tori amos"
    });
    expect(splitMixedComposerRequest("review this, then tighten the playlist")).toEqual({
      reviewPrompt: "review this",
      curatorPrompt: "tighten the playlist"
    });
    expect(splitMixedComposerRequest("review this, then compress it to 8 tracks")).toEqual({
      reviewPrompt: "review this",
      curatorPrompt: "compress it to 8 tracks"
    });
  });

  it("derives a critique-only prompt for review button flows", () => {
    expect(reviewPromptForComposerRequest("")).toBe("Review this playlist.");
    expect(reviewPromptForComposerRequest("review the playlist and add two tori amos tracks")).toBe("review the playlist");
    expect(reviewPromptForComposerRequest("Reorder the playlist to improve flow, but do not modify the playlist.")).toBe(
      "Reorder the playlist to improve flow, but do not modify the playlist."
    );
    expect(reviewPromptForComposerRequest("Identify the single biggest structural problem in this playlist. Focus on identity, pacing, transitions, and version risks. Give a focused diagnosis, not a full rewrite.")).toBe(
      "Identify the single biggest structural problem in this playlist. Focus on identity, pacing, transitions, and version risks. Give a focused diagnosis, not a full rewrite."
    );
    expect(reviewPromptForComposerRequest("Review this playlist and name the two tracks that weaken its identity.")).toBe(
      "Review this playlist and name the two tracks that weaken its identity."
    );
  });

  it("composes deterministic mixed review and curator assistant messages", () => {
    expect(composeMixedReviewAndCuratorAssistantMessage("Review side.", "Curator side.")).toBe(
      "Review:\nReview side.\n\nCurator action:\nCurator side."
    );
  });

  it("runs a curator request and returns playlist, messages, and history updates", async () => {
    const base = playlist([track({ id: "itunes:1", sourceId: "1", title: "First" })]);
    const second = track({ id: "itunes:2", sourceId: "2", title: "Second" });
    const response: CuratorResponse = {
      message: "Added one.",
      playlistUpdate: { action: "add", tracks: [second], orderRationale: null },
      playlistMeta: null,
      updatedConstraints: {},
      constraintReport: { passed: true, totalDurationMs: 360000, violations: [] },
      rejectedCandidates: [{ artist: "Nope", title: "Rejected", reason: "No confident metadata match.", rejectionCode: "noCredibleMatch" }]
    };

    let sentInput: PlaylistMessageRequest | null = null;
    const priorMessages = [
      { role: "user" as const, content: "The last picks were too hard to find." },
      { role: "assistant" as const, content: "I will stay closer to verified catalog terrain." }
    ];
    const result = await runCuratorRequestWorkflow(
      { messages: priorMessages, outgoing: "Add one.", playlist: base },
      {
        onProgress: () => undefined,
        sendMessage: async (input) => {
          sentInput = input;
          return response;
        }
      }
    );

    expect(result.nextPlaylist?.tracks.map((item) => item.title)).toEqual(["First", "Second"]);
    expect(result.nextPlaylist?.suppressedCandidateFingerprints?.map((item) => item.title)).toEqual(["Rejected"]);
    expect(result.messages).toEqual([
      ...priorMessages,
      { role: "user", content: "Add one." },
      { role: "assistant", content: "Added one.\n\nRejected Nope - Rejected: No confident metadata match. Won't be suggested again in this session." }
    ]);
    expect((sentInput as PlaylistMessageRequest | null)?.conversationContext?.recentMessages).toEqual(priorMessages);
    expect(result.historyEntry).toMatchObject({
      kind: "request",
      acceptedCount: 1,
      playlistAction: "add",
      playlistBefore: base
    });
    expect(result.historyEntry?.resultingPlaylistUpdatedAt).toBe(result.nextPlaylist?.updatedAt);
  });

  it("runs mixed review and curator requests as one combined visible turn", async () => {
    const base = playlist([track({ id: "itunes:1", sourceId: "1", title: "First" })]);
    const second = track({ id: "itunes:2", sourceId: "2", title: "Second" });
    const priorMessages = [{ role: "assistant" as const, content: "Ready." }];
    const analyzeCalls: string[] = [];
    const curatorCalls: PlaylistMessageRequest[] = [];

    const result = await runMixedReviewAndCuratorWorkflow(
      { messages: priorMessages, outgoing: "review the playlist. suggest two tracks by tori amos.", playlist: base },
      {
        onProgress: () => undefined,
        analyze: async (_playlist, userMessage) => {
          analyzeCalls.push(userMessage ?? "");
          return analysisResponse({
            curatorTake: "The center holds, but the room wants another voice.",
            reviewSuggestions: [{
              id: "review-suggestion-1",
              type: "add_bridge",
              applicationMode: "verify_candidate",
              affectedTrackIds: ["itunes:1", "itunes:2"],
              rationale: "Smooth the handoff.",
              intentPreservation: "Keeps the arc intact.",
              risk: null,
              confidence: "medium",
              suggestedPrompt: "Find a bridge track."
            }]
          });
        },
        sendMessage: async (request) => {
          curatorCalls.push(request);
          return {
            message: "Added one.",
            playlistUpdate: { action: "add", tracks: [second], orderRationale: null },
            playlistMeta: null,
            updatedConstraints: {},
            constraintReport: { passed: true, totalDurationMs: 360000, violations: [] },
            rejectedCandidates: []
          };
        }
      }
    );

    expect(analyzeCalls).toEqual(["review the playlist."]);
    expect(curatorCalls[0]?.userMessage).toBe("suggest two tracks by tori amos.");
    expect(result.assistantMessage.content).toContain("Review:\nThe center holds, but the room wants another voice.");
    expect(result.assistantMessage.content).toContain("Curator action:\nAdded one.");
    expect(result.messages).toEqual([
      ...priorMessages,
      { role: "user", content: "review the playlist. suggest two tracks by tori amos." },
      { role: "assistant", content: result.assistantMessage.content }
    ]);
    expect(result.review?.reviewSuggestions[0]?.id).toBe("review-suggestion-1");
    expect(result.reviewHistoryEntry).toMatchObject({ kind: "review" });
    expect(result.curatorHistoryEntry).toMatchObject({ kind: "request", playlistAction: "add" });
    expect(result.nextPlaylist?.tracks.map((item) => item.title)).toEqual(["First", "Second"]);
  });

  it("keeps review results visible when the curator half fails", async () => {
    const base = playlist([track()]);

    const result = await runMixedReviewAndCuratorWorkflow(
      { messages: [], outgoing: "review this playlist and suggest two tracks.", playlist: base },
      {
        onProgress: () => undefined,
        analyze: async () => analysisResponse({
          curatorTake: "The palette is clear enough to critique."
        }),
        sendMessage: async () => {
          throw new Error("Network down.");
        }
      }
    );

    expect(result.review?.curatorTake).toBe("The palette is clear enough to critique.");
    expect(result.reviewHistoryEntry).toMatchObject({ kind: "review" });
    expect(result.curatorHistoryEntry).toMatchObject({
      kind: "error",
      error: "CutList could not reach the provider. Check your internet connection or local Ollama server, then try again. Your playlist is unchanged."
    });
    expect(result.assistantMessage.content).toContain("Review:\nThe palette is clear enough to critique.");
    expect(result.assistantMessage.content).toContain("Curator action:\nCutList could not reach the provider.");
    expect(result.nextPlaylist).toBeUndefined();
  });

  it("turns curator request errors into assistant and history results", async () => {
    const result = await runCuratorRequestWorkflow(
      { messages: [], outgoing: "Stop.", playlist: playlist() },
      {
        onProgress: () => undefined,
        sendMessage: async () => {
          throw new DOMException("Stopped.", "AbortError");
        }
      }
    );

    expect(result.messages[1]).toEqual({ role: "assistant", content: "Stopped." });
    expect(result.historyEntry).toMatchObject({ kind: "error", error: "Stopped." });
  });

  it("does not record curator undo snapshot data for no-op curator responses", async () => {
    const base = playlist([track({ id: "itunes:1", sourceId: "1", title: "First" })]);
    const result = await runCuratorRequestWorkflow(
      { messages: [], outgoing: "Thoughts?", playlist: base },
      {
        onProgress: () => undefined,
        sendMessage: async () => ({
          message: "No safe change to apply.",
          playlistUpdate: null,
          playlistMeta: null,
          updatedConstraints: undefined,
          constraintReport: { passed: true, totalDurationMs: 180000, violations: [] },
          rejectedCandidates: []
        })
      }
    );

    expect(result.nextPlaylist).toBeUndefined();
    expect(result.historyEntry?.playlistBefore).toBeUndefined();
    expect(result.historyEntry?.resultingPlaylistUpdatedAt).toBeUndefined();
  });

  it("verifies seeds and keeps parse failures inside workflow results", async () => {
    const empty = await runSeedVerificationWorkflow({ playlist: playlist(), seedText: "" });
    expect(empty.assistantMessage.content).toContain("I could not read any seed tracks");

    const verified = track({ title: "Seed Song" });
    const result = await runSeedVerificationWorkflow(
      { playlist: playlist(), seedText: "Fixture Artist - Seed Song" },
      { verifySeeds: async () => ({ verified: [verified], rejected: [] }) }
    );

    expect(result.nextPlaylist?.tracks.map((item) => item.title)).toEqual(["Seed Song"]);
    expect(result.assistantMessage.content).toContain("Verified 1 seed track.");
    expect(result.clearInput).toBe(true);
    expect(result.historyEntry).toMatchObject({ kind: "seed", acceptedCount: 1 });
  });

  it("imports verified tracks and composes next-step guidance", async () => {
    const imported = track({ title: "Imported Song" });
    const response: ImportChatResponse = {
      extractedVibeBrief: "Late-night lift.",
      extractedConstraints: { maxTracks: 10 },
      verifiedTracks: [imported],
      rejectedCandidates: [],
      unresolvedNotes: [],
      suggestedNextPrompt: "Make it warmer."
    };

    const result = await runImportWorkflow(
      { playlist: playlist(), importText: "some chat" },
      { importText: async () => response }
    );

    expect(result?.nextPlaylist?.mood).toBe("Late-night lift.");
    expect(result?.nextPlaylist?.constraints.maxTracks).toBe(10);
    expect(result?.assistantMessage.content).toContain("Next: Make it warmer.");
    expect(result?.historyEntry).toMatchObject({ kind: "import", acceptedCount: 1 });
  });

  it("composes playlist review messages and warns when review input looks like unverified tracks", async () => {
    const warning = await runAnalyzeWorkflow({ playlist: playlist(), userMessage: "Title\tArtist\nSong\tArtist" });
    expect(warning.assistantMessage.content).toContain("Use Import and verify first");
    expect(warning.historyEntry).toBeUndefined();

    const result = await runAnalyzeWorkflow(
      { playlist: playlist([track()]), userMessage: "Review this.", messages: [{ role: "user", content: "Keep it under 8 minutes." }] },
      {
        analyze: async () => analysisResponse({
          intentSummary: {
            playlistIdentity: "Nocturnal pressure with a brittle center.",
            preservedQualities: ["Keep the opener's tension."],
            likelyUserIntent: "Tighten the sequence without softening it.",
            riskNotes: [],
            confidence: "medium"
          }
        })
      }
    );

    expect(result.assistantMessage.content).toContain("This set has a real center");
    expect(result.assistantMessage.content).toContain("Playlist identity: Nocturnal pressure with a brittle center.");
    expect(result.assistantMessage.content).toContain("What works:");
    expect(result.assistantMessage.content).toContain("Verified observations:");
    expect(result.assistantMessage.content).toContain("Verified-rule issues:");
    expect(result.assistantMessage.content).toContain("Not enough evidence to verify all rules:");
    expect(result.review).toBeTruthy();
    expect(result.historyEntry).toMatchObject({ kind: "review" });
    expect(result.historyEntry?.userMessage).toBe("Review this.");
    expect(result.historyEntry?.reviewSuggestions).toEqual([]);
    expect(result.clearInput).toBe(true);
  });

  it("composes structured transformation review details", () => {
    const message = composeAnalyzeAssistantMessage(analysisResponse({
      curatorTake: "This is close, but the sequence loses its nerve in the middle.",
      intentSummary: {
        playlistIdentity: "Nocturnal pressure.",
        preservedQualities: ["Keep the opener."],
        likelyUserIntent: "Rise without losing dread.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [{
        trackId: "track-1",
        role: "opener",
        rationale: "Frames the entry.",
        confidence: "high",
        basis: "metadata_heuristic"
      }],
      transitionReview: [{
        fromTrackId: "track-1",
        toTrackId: "track-2",
        issueType: "weak_bridge",
        summary: "Needs connective tissue.",
        suggestedRepair: "Add a bridge.",
        confidence: "medium",
        basis: "metadata_heuristic"
      }],
      reviewSuggestions: [{
        id: "bridge-1",
        type: "add_bridge",
        applicationMode: "verify_candidate",
        affectedTrackIds: ["track-1", "track-2"],
        rationale: "Bridge the gap.",
        intentPreservation: "Keeps both anchors.",
        risk: null,
        confidence: "medium",
        basis: "model_judgment",
        suggestedPrompt: "Find a bridge."
      }]
    }));

    expect(message.startsWith("This is close, but the sequence loses its nerve in the middle.")).toBe(true);
    expect(message).toContain("Playlist identity: Nocturnal pressure.");
    expect(message).toContain("Curator judgment:");
    expect(message).toContain("Intent:");
    expect(message).toContain("Track roles:");
    expect(message).toContain("Transitions:");
    expect(message).toContain("Suggested follow-ups:");
    expect(message.indexOf("Playlist identity: Nocturnal pressure.")).toBeLessThan(message.indexOf("Intent: Rise without losing dread."));
  });

  it("renders focused transition repair reviews with named bridge tracks", () => {
    const message = composeAnalyzeAssistantMessage(analysisResponse({
      reviewMode: "focused_transition_repair",
      curatorTake: "The handoff needs a cold decompression corridor.",
      transitionReview: [{
        fromTrackId: "track-1",
        toTrackId: "track-2",
        issueType: "abrupt_energy_jump",
        summary: "Firestarter drops straight into a void before Roads.",
        suggestedRepair: "Bridge it.",
        confidence: "high",
        basis: "model_judgment"
      }],
      reviewSuggestions: [{
        id: "bridge-1",
        type: "add_bridge",
        applicationMode: "informational",
        affectedTrackIds: ["track-1", "track-2"],
        rationale: "Nine Inch Nails - Closer: Acts as a heavy hydraulic brake that keeps the mechanical pulse alive.",
        intentPreservation: "Keeps the pressure intact.",
        risk: null,
        confidence: "high",
        basis: "model_judgment",
        candidate: {
          title: "Closer",
          artist: "Nine Inch Nails",
          album: null,
          reason: "Cold mid-tempo pressure.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 7
        },
        suggestedPrompt: "Add Nine Inch Nails - Closer as a bridge."
      }]
    }));

    expect(message).toContain("Bridge options:");
    expect(message).toContain("Nine Inch Nails - Closer");
    expect(message).toContain("heavy hydraulic brake");
    expect(message).not.toContain("Curator judgment:");
  });

  it("includes track labels in weak-link review summaries", () => {
    const tracks = playlist([
      track({ id: "track-1", artist: "Talking Heads", title: "This Must Be the Place" }),
      track({ id: "track-2", artist: "M83", title: "Midnight City" })
    ]);
    const message = composeAnalyzeAssistantMessage(analysisResponse({
      reviewMode: "weak_links_only",
      curatorTake: "We are cutting the tourist stops.",
      weakLinks: [{
        trackId: "track-1",
        reason: "The track introduces a pop-brightness that acts as dead weight against the surrounding industrial and electronic tension."
      }],
      reviewSuggestions: [{
        id: "remove-1",
        type: "remove",
        applicationMode: "informational",
        affectedTrackIds: ["track-1"],
        rationale: "Eliminating this track removes the most significant anchor of brightness that fights the playlist's core industrial identity.",
        intentPreservation: "Keeps the colder center intact.",
        risk: null,
        confidence: "high",
        basis: "model_judgment",
        suggestedPrompt: null
      }]
    }), tracks);

    expect(message).toContain("Talking Heads - This Must Be the Place");
    expect(message).toContain("Suggested cuts:");
  });

  it("persists review suggestions as non-actionable review history context", async () => {
    const result = await runAnalyzeWorkflow(
      { playlist: playlist([track()]), userMessage: "Review this." },
      {
        analyze: async () => analysisResponse({
          reviewSuggestions: [{
            id: "review-suggestion-1",
            type: "add_bridge",
            applicationMode: "verify_candidate",
            affectedTrackIds: ["itunes:1", "itunes:2"],
            rationale: "Smooth the handoff.",
            intentPreservation: "Keeps the arc intact.",
            risk: null,
            confidence: "medium",
            suggestedPrompt: "Find a bridge track."
          }]
        })
      }
    );

    expect(result.historyEntry?.reviewSuggestions?.[0].id).toBe("review-suggestion-1");
    expect(result.historyEntry?.issueStatuses).toEqual([]);
  });

  it("does not offer an apply action for informational reorder notes", () => {
    expect(promptForReviewSuggestion).toBeTypeOf("function");
    const label = analysisResponse({
      reviewSuggestions: [{
        id: "reorder-note-1",
        type: "reorder",
        applicationMode: "informational",
        affectedTrackIds: ["track-1", "track-2"],
        rationale: "Spread out the clustered artists.",
        intentPreservation: "Keeps the same tracks.",
        risk: "This is a note only because no full safe order was returned.",
        confidence: "medium",
        suggestedPrompt: null
      }]
    }).reviewSuggestions[0];

    expect(label?.applicationMode).toBe("informational");
  });

  it("applies safe review suggestions and routes candidate suggestions through prompts", () => {
    const first = track({ id: "track-1", title: "First", energy: 8 });
    const second = track({ id: "track-2", title: "Second", energy: 2 });
    const base = playlist([first, second]);

    const remove = applyReviewSuggestionWorkflow(base, {
      id: "remove-1",
      type: "remove",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-1"],
      rationale: "Too much.",
      intentPreservation: "Keeps the remaining arc.",
      risk: null,
      confidence: "high",
      suggestedPrompt: null
    });
    expect(remove.nextPlaylist?.tracks.map((item) => item.id)).toEqual(["track-2"]);
    expect(remove.suppressAssistantMessage).toBe(true);

    const reorder = applyReviewSuggestionWorkflow(base, {
      id: "reorder-1",
      type: "reorder",
      applicationMode: "reorder_existing",
      affectedTrackIds: ["track-1", "track-2"],
      orderedTrackIds: ["track-2", "track-1"],
      rationale: "Rise better.",
      intentPreservation: "Keeps both tracks.",
      risk: null,
      confidence: "medium",
      suggestedPrompt: null
    });
    expect(reorder.nextPlaylist?.tracks.map((item) => item.id)).toEqual(["track-2", "track-1"]);
    expect(reorder.suppressAssistantMessage).toBe(true);

    const stale = applyReviewSuggestionWorkflow(base, {
      id: "stale",
      type: "reorder",
      applicationMode: "reorder_existing",
      affectedTrackIds: ["track-1"],
      orderedTrackIds: ["track-1"],
      rationale: "Bad order.",
      intentPreservation: "N/A",
      risk: null,
      confidence: "low",
      suggestedPrompt: null
    });
    expect(stale.nextPlaylist).toBeUndefined();
    expect(stale.suppressAssistantMessage).toBeUndefined();
    expect(stale.assistantMessage.content).toContain("stale or incomplete");

    const bridgePrompt = promptForReviewSuggestion({
      id: "bridge",
      type: "add_bridge",
      applicationMode: "verify_candidate",
      affectedTrackIds: ["track-1", "track-2"],
      rationale: "Needs a bridge.",
      intentPreservation: "Keeps anchors.",
      risk: null,
      confidence: "medium",
      suggestedPrompt: "Find a bridge track."
    }, base);
    expect(bridgePrompt).toContain("Find one verified bridge track for this transition: First by Fixture Artist -> Second by Fixture Artist.");
    expect(bridgePrompt).toContain("Review rationale: Needs a bridge.");
    expect(bridgePrompt).toContain("Preserve: Keeps anchors.");
    expect(bridgePrompt).toContain("Original review instruction: Find a bridge track.");
    expect(bridgePrompt).toContain("Discovery radius: moderate.");

    const compression = applyReviewSuggestionWorkflow(base, {
      id: "compress-1",
      type: "compress_section",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-2"],
      rationale: "The middle drags.",
      intentPreservation: "Keeps the opener as the anchor.",
      risk: "Compression is interpretive.",
      confidence: "medium",
      suggestedPrompt: null,
      orderedTrackIds: ["track-1"],
      compressionPlan: {
        removeTrackIds: ["track-2"],
        keepTrackIds: ["track-1"],
        targetTrackCount: 1,
        targetTotalDurationMs: null
      },
      sectionLabel: "Middle sag",
      sectionStartTrackId: "track-1",
      sectionEndTrackId: "track-2"
    });
    expect(compression.nextPlaylist?.tracks.map((item) => item.id)).toEqual(["track-1"]);
    expect(compression.suppressAssistantMessage).toBe(true);
    expect(compression.assistantMessage.content).toContain("Applied compression");

    const compressionPrompt = promptForReviewSuggestion({
      id: "compress-2",
      type: "compress_section",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-2"],
      rationale: "Trim the repeated dip.",
      intentPreservation: "Keep the opener and closer.",
      risk: null,
      confidence: "medium",
      suggestedPrompt: null,
      compressionPlan: {
        removeTrackIds: ["track-2"],
        keepTrackIds: ["track-1"],
        targetTrackCount: 1,
        targetTotalDurationMs: null
      },
      sectionLabel: "Middle sag",
      sectionStartTrackId: "track-1",
      sectionEndTrackId: "track-2"
    }, base);
    expect(compressionPrompt).toContain("Review this compressed playlist state");
    expect(compressionPrompt).toContain("Target: about 1 track.");
  });

  it("resolves request-scoped discovery radius overrides over the saved default", () => {
    const base = playlist();
    expect(effectiveDiscoveryRadiusForRequest(base, "add something new")).toBe("moderate");
    expect(effectiveDiscoveryRadiusForRequest(base, "play it safe and stay close to the current lane")).toBe("safe");
    expect(effectiveDiscoveryRadiusForRequest({ ...base, discoveryRadius: "safe" }, "get weirder")).toBe("adventurous");
    expect(effectiveDiscoveryRadiusForRequest({ ...base, discoveryRadius: "safe" }, "get highly experimental")).toBe("highly_experimental");
  });

  it("inserts verified bridge suggestions at the reviewed transition", () => {
    const badu = track({ id: "track-badu", title: "Phone Down", artist: "Erykah Badu" });
    const cocteau = track({ id: "track-cocteau", title: "Cherry-Coloured Funk", artist: "Cocteau Twins" });
    const bridge = track({ id: "track-bridge", title: "Roads", artist: "Portishead" });
    const base = playlist([badu, cocteau]);

    const next = applyVerifiedReviewSuggestionResponse(base, {
      id: "bridge-1",
      type: "add_bridge",
      applicationMode: "verify_candidate",
      affectedTrackIds: ["track-badu", "track-cocteau"],
      rationale: "Needs a stabilizer.",
      intentPreservation: "Keeps both anchors.",
      risk: "Bridge quality is interpretive.",
      confidence: "low",
      suggestedPrompt: "Find a bridge."
    }, {
      message: "Verified one bridge.",
      playlistUpdate: { action: "add", tracks: [bridge], orderRationale: null },
      playlistMeta: null,
      updatedConstraints: undefined,
      constraintReport: { passed: true, totalDurationMs: 540000, violations: [] },
      rejectedCandidates: []
    });

    expect(next?.tracks.map((item) => item.id)).toEqual(["track-badu", "track-bridge", "track-cocteau"]);
  });

  it("includes debug text in composed review messages", () => {
    const message = composeAnalyzeAssistantMessage(analysisResponse({
      debug: { validationError: "bad shape", modelRawOutput: { message: "raw" } }
    }));

    expect(message).toContain("Model debug:");
    expect(message).toContain("bad shape");
  });

  it("accepts, rejects, and de-duplicates manual matches", () => {
    const match: AttemptedMatch = {
      artist: "Manual Artist",
      title: "Manual Song",
      album: null,
      durationMs: 200000,
      runtime: "3:20",
      source: "musicbrainz",
      sourceId: "mbid",
      confidence: "medium",
      score: 0.78
    };
    const accepted = acceptManualMatchWorkflow(playlist(), match);
    expect(accepted.nextPlaylist?.tracks[0].title).toBe("Manual Song");
    expect(accepted.historyEntry).toMatchObject({ kind: "manual-match", acceptedCount: 1 });
    expect(accepted.suppressAssistantMessage).toBe(true);

    const duplicate = acceptManualMatchWorkflow(accepted.nextPlaylist!, match);
    expect(duplicate.assistantMessage.content).toContain("already in the playlist");
    expect(duplicate.nextPlaylist).toBeUndefined();
    expect(duplicate.suppressAssistantMessage).toBeUndefined();

    const missingSourceId = acceptManualMatchWorkflow(playlist(), { ...match, sourceId: undefined });
    expect(missingSourceId.assistantMessage.content).toContain("missing a provider id");
    expect(missingSourceId.suppressAssistantMessage).toBeUndefined();
  });

  it("puts a manually accepted replacement match back into the removed slot when history provides context", () => {
    const before = playlist([
      track({ id: "track-1", sourceId: "1", title: "One" }),
      track({ id: "track-2", sourceId: "2", title: "Two" }),
      track({ id: "track-3", sourceId: "3", title: "Three" })
    ]);
    const current = {
      ...before,
      tracks: [before.tracks[0], before.tracks[2]]
    };
    const match: AttemptedMatch = {
      artist: "Manual Artist",
      title: "Manual Song",
      album: null,
      durationMs: 200000,
      runtime: "3:20",
      source: "musicbrainz",
      sourceId: "mbid",
      confidence: "medium",
      score: 0.78
    };

    const accepted = acceptManualMatchWorkflow(current, match, {
      historyEntry: {
        id: "entry-1",
        userMessage: "Replace track 2.",
        assistantMessage: "Needs review.",
        acceptedCount: 0,
        rejectedCandidates: [],
        createdAt: "now",
        kind: "request",
        playlistAction: "set",
        playlistBefore: before,
        resultingPlaylistUpdatedAt: current.updatedAt,
        issueStatuses: []
      }
    });

    expect(accepted.nextPlaylist?.tracks.map((track) => track.title)).toEqual([
      before.tracks[0].title,
      "Manual Song",
      before.tracks[2].title
    ]);
  });

  it("respects saved add-after placement when a manual match is accepted", () => {
    const before = playlist([
      track({ id: "track-1", sourceId: "1", title: "Firestarter", artist: "The Prodigy" }),
      track({ id: "track-2", sourceId: "2", title: "Roads", artist: "Portishead" })
    ]);
    const match: AttemptedMatch = {
      artist: "Bjork",
      title: "Army of Me",
      album: null,
      durationMs: 200000,
      runtime: "3:20",
      source: "musicbrainz",
      sourceId: "mbid",
      confidence: "medium",
      score: 0.78
    };

    const accepted = acceptManualMatchWorkflow(before, match, {
      historyEntry: {
        id: "entry-after",
        userMessage: "Add Bjork's Army of Me after Firestarter.",
        assistantMessage: "Needs match review.",
        acceptedCount: 0,
        rejectedCandidates: [],
        createdAt: "now",
        kind: "request",
        issueStatuses: []
      }
    });

    expect(accepted.nextPlaylist?.tracks.map((track) => track.title)).toEqual([
      "Firestarter",
      "Army of Me",
      "Roads"
    ]);
  });

  it("respects saved add-before placement when a manual match is accepted", () => {
    const before = playlist([
      track({ id: "track-1", sourceId: "1", title: "Firestarter", artist: "The Prodigy" }),
      track({ id: "track-2", sourceId: "2", title: "Roads", artist: "Portishead" })
    ]);
    const match: AttemptedMatch = {
      artist: "Bjork",
      title: "Army of Me",
      album: null,
      durationMs: 200000,
      runtime: "3:20",
      source: "musicbrainz",
      sourceId: "mbid-2",
      confidence: "medium",
      score: 0.78
    };

    const accepted = acceptManualMatchWorkflow(before, match, {
      historyEntry: {
        id: "entry-before",
        userMessage: "Add Bjork's Army of Me before Roads.",
        assistantMessage: "Needs match review.",
        acceptedCount: 0,
        rejectedCandidates: [],
        createdAt: "now",
        kind: "request",
        issueStatuses: []
      }
    });

    expect(accepted.nextPlaylist?.tracks.map((track) => track.title)).toEqual([
      "Firestarter",
      "Army of Me",
      "Roads"
    ]);
  });
});
