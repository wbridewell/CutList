import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatPanel, createCompletedRequestMessages, createRequestMessageList } from "@/components/ChatPanel";
import { LlmSetupButton } from "@/components/LlmSetupButton";
import { SessionStatusButton } from "@/components/SessionStatusButton";
import { ActiveExchange, latestActiveExchange } from "@/components/chat/ActiveExchange";
import { ConversationTimeline, RejectedCandidatesDisclosure } from "@/components/chat/ConversationTimeline";
import { CommandDrawer } from "@/components/chat/CommandDrawer";
import { buildIssueInboxItems } from "@/components/chat/issueInboxState";
import { NaturalRequestForm } from "@/components/chat/NaturalRequestForm";
import { PlaylistPanel } from "@/components/PlaylistPanel";
import { TrackCard } from "@/components/TrackCard";
import { WelcomeGuide } from "@/components/WelcomeGuide";
import type { ChatMessage, RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { AnalyzePlaylistResponse, PlaylistState, Track } from "@/types/playlist";

const emptyPlaylist: PlaylistState = {
  id: "test-playlist",
  title: "Test CutList",
  mood: "A test mood.",
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-05-28T00:00:00.000Z"
};

const track: Track = {
  id: "track-1",
  title: "Haunted Test",
  artist: "The Fixtures",
  album: "Spec Suite",
  durationMs: 180000,
  runtime: "3:00",
  verified: true,
  source: "itunes",
  sourceId: "itunes-1",
  sourceUrl: null,
  artworkUrl: null,
  vibeTags: [],
  genreTags: ["post-punk"],
  rationale: null,
  fitNotes: "Fits the test playlist because it opens with tension.",
  energy: null,
  verificationNote: null,
  verificationConfidence: "high"
};

const rejectedEntry: RequestHistoryEntry = {
  id: "rejected-entry",
  userMessage: "Add a bridge track.",
  assistantMessage: "One candidate needs review.",
  acceptedCount: 0,
  rejectedCandidates: [{
    artist: "Loose Match",
    title: "Night Drift",
    reason: "Closest provider result looks like a live version.",
    violatedConstraint: null,
    attemptedMatches: [{
      artist: "Loose Match",
      title: "Night Drift (Live)",
      album: "Fixtures Live",
      durationMs: 181000,
      runtime: "3:01",
      source: "itunes",
      sourceId: "live-match",
      sourceUrl: null,
      score: 0.81,
      confidence: "medium"
    }]
  }],
  createdAt: "2026-06-13T00:00:00.000Z",
  kind: "request",
  issueStatuses: [{
    issueId: "Loose Match::Night Drift",
    issueKind: "rejected_candidate",
    status: "rejected",
    actedAt: null
  }]
};

const review: AnalyzePlaylistResponse = {
  reviewMode: "full_critique",
  message: "There is one cleanup suggestion and one handled follow-up.",
  strengths: [],
  weakLinks: [],
  sequencingNotes: [],
  constraintReport: { passed: false, totalDurationMs: 180000, violations: [], evidenceWarnings: [] },
  suggestedEdits: [],
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
    confidence: "high"
  }],
  transitionReview: [{
    fromTrackId: "track-1",
    toTrackId: "track-1",
    issueType: "weak_bridge",
    summary: "Needs connective tissue.",
    suggestedRepair: "Add a bridge.",
    confidence: "medium"
  }],
  reviewSuggestions: [{
    id: "review-open",
    type: "replace",
    applicationMode: "verify_candidate",
    affectedTrackIds: ["track-1"],
    rationale: "Find a stronger fit for the opener lane.",
    intentPreservation: "Keeps the mood but sharpens the entry.",
    risk: null,
    confidence: "medium",
    suggestedPrompt: "Find a stronger opener."
  }, {
    id: "review-applied",
    type: "remove",
    applicationMode: "remove_existing",
    affectedTrackIds: ["track-1"],
    rationale: "This cleanup is already handled.",
    intentPreservation: "No change.",
    risk: null,
    confidence: "high",
    suggestedPrompt: null
  }],
  debug: undefined
};

describe("UI redesign behavior", () => {
  it("keeps a request message once when completing a curator response", () => {
    const messages: ChatMessage[] = [{ role: "assistant", content: "Ready." }];
    const requestMessages = createRequestMessageList(messages, "Add five tracks.");
    const completedMessages = createCompletedRequestMessages(requestMessages, "Added verified tracks.");

    expect(completedMessages).toEqual([
      { role: "assistant", content: "Ready." },
      { role: "user", content: "Add five tracks." },
      { role: "assistant", content: "Added verified tracks." }
    ]);
  });

  it("does not call an empty playlist fully verified", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      canResetDraft: false,
      playlist: emptyPlaylist,
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("No tracks yet");
    expect(html).toContain("Start by describing the playlist you want in the Curator Console.");
    expect(html).toContain("Import a draft or verify seed tracks when you already know the songs.");
    expect(html).toContain("Nothing joins the list until it is verified.");
    expect(html).not.toContain("New session");
    expect(html).not.toContain("All verified");
  });

  it("renders curator-turn undo next to the latest response when available", () => {
    const html = renderToStaticMarkup(React.createElement(ActiveExchange, {
      busy: false,
      curatorUndoDescription: "Restore the playlist state from before the most recent curator-applied turn.",
      messages: [
        { role: "user", content: "Reorder this." },
        { role: "assistant", content: "Done." }
      ],
      onUndoCuratorTurn: () => undefined,
      progressStatus: null
    }));

    expect(html).toContain("Restore the playlist state from before the most recent curator-applied turn.");
    expect(html).toContain("Undo last curator turn");
  });

  it("renders a reuse-prompt action on the active exchange when requested", () => {
    const html = renderToStaticMarkup(React.createElement(ActiveExchange, {
      busy: false,
      messages: [
        { role: "user", content: "Retry this exact request." },
        { role: "assistant", content: "The provider timed out." }
      ],
      onReusePrompt: () => undefined,
      progressStatus: null
    }));

    expect(html).toContain("Reuse prompt");
  });

  it("keeps the submitted prompt visible while the console is busy", () => {
    const html = renderToStaticMarkup(React.createElement(NaturalRequestForm, {
      busy: true,
      playlistHasTracks: true,
      progressStatus: "Starting request.",
      userMessage: "Queue Army of Me after Firestarter.",
      onAnalyze: () => undefined,
      onInterrupt: () => undefined,
      onSend: () => undefined,
      onUserMessageChange: () => undefined
    }));

    expect(html).toContain("Queue Army of Me after Firestarter.");
    expect(html).toContain("disabled");
  });

  it("does not render curator-turn undo when no undoable curator state exists", () => {
    const html = renderToStaticMarkup(React.createElement(ActiveExchange, {
      busy: false,
      messages: [
        { role: "user", content: "Review this." },
        { role: "assistant", content: "Needs work." }
      ],
      progressStatus: null
    }));

    expect(html).not.toContain("Undo last curator turn");
  });

  it("renders a first-run welcome guide with clear starting paths", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeGuide));

    expect(html).toContain("Start here");
    expect(html).toContain("How The CutList works");
    expect(html).toContain("Build a verified playlist with a curator at your side.");
    expect(html).toContain("Describe the playlist");
    expect(html).toContain("Add known tracks if needed");
    expect(html).toContain("Review and repair");
    expect(html).toContain("use one of the suggested moves below");
    expect(html).toContain("Paste known tracks or an old draft");
  });

  it("explains active playlist rules in plain language", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      playlist: {
        ...emptyPlaylist,
        constraints: {
          maxTrackDurationMs: 300000,
          preferredGenres: ["rock", "soul"],
          notes: ["Keep the fourth act high energy."]
        }
      },
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("Verified rules");
    expect(html).toContain("Tracks must be 5:00 or shorter");
    expect(html).toContain("Curator guidance");
    expect(html).toContain("Prefer rock");
    expect(html).toContain("Prefer soul");
    expect(html).toContain("Keep the fourth act high energy.");
    expect(html).not.toContain("Max track 5:00");
  });

  it("renders BPM, vocalist, trajectory rules, and unknown evidence warnings", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      playlist: {
        ...emptyPlaylist,
        tracks: [track],
        constraints: {
          minBpm: 100,
          maxBpm: 125,
          maxTracksPerArtist: 1,
          vocalProfile: "female_vocals",
          energyTrajectory: {
            direction: "gradual_rise",
            peakTrackNumber: 12,
            ending: "hopeful"
          }
        }
      },
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("Tracks should be at least 100 BPM when known");
    expect(html).toContain("Tracks should be 125 BPM or lower when known");
    expect(html).toContain("No more than 1 track per artist");
    expect(html).toContain("Female vocals requested");
    expect(html).toContain("Energy trajectory: gradually increase energy, peak by track 12, hopeful ending");
    expect(html).toContain("Not enough evidence for all verified rules");
    expect(html).toContain("does not have BPM evidence");
    expect(html).not.toContain("needs stronger evidence");
  });

  it("renders hard constraint issues separately from unknown evidence", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      playlist: {
        ...emptyPlaylist,
        tracks: [{ ...track, durationMs: 360000, runtime: "6:00" }],
        constraints: {
          maxTrackDurationMs: 300000,
          minBpm: 100
        }
      },
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("Constraint issues");
    expect(html).toContain("1 flagged track will be removed if you use the bulk action.");
    expect(html).toContain("&quot;Haunted Test&quot;");
    expect(html).toContain("exceeds the maximum track runtime.");
    expect(html).toContain("Remove 1 flagged track");
    expect(html).toContain("data-constraint-violating=\"true\"");
    expect(html).toContain("Not enough evidence for all verified rules");
    expect(html).toContain("1 coverage note across 1 track.");
    expect(html).toContain("does not have BPM evidence");
  });

  it("surfaces current rejected counts in the playlist summary without mixing them into constraint warnings", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      liveRejectedCount: 2,
      playlist: {
        ...emptyPlaylist,
        tracks: [track]
      },
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("Review 2 rejected");
    expect(html).toContain("Open Issues to resolve rejected matches and blocked tracks.");
    expect(html).not.toContain("Current request repair");
  });

  it("keeps playlist outputs as playlist-owned controls without putting exports into history", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      playlist: {
        ...emptyPlaylist,
        tracks: [track]
      },
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("Outputs");
    expect(html).not.toContain("Copy tracklist");
    expect(html).not.toContain("Migration CSV");
    expect(html).not.toContain("Apple Music XML");
  });

  it("keeps playlist detail fields out of the inline track stack by default", () => {
    const html = renderToStaticMarkup(React.createElement(PlaylistPanel, {
      playlist: {
        ...emptyPlaylist,
        tracks: [track],
        arc: "A five-act rise."
      },
      onPlaylistChange: () => undefined,
      onResetDraft: () => undefined
    }));

    expect(html).toContain("Edit details");
    expect(html).not.toContain("Hide Details");
    expect(html).not.toContain("placeholder=\"Describe the current mood.\"");
    expect(html).not.toContain("placeholder=\"Describe the sequence or emotional arc.\"");
  });

  it("uses clear track action labels instead of abbreviations", () => {
    const html = renderToStaticMarkup(React.createElement(TrackCard, {
      dragging: false,
      dropTarget: false,
      expanded: false,
      constraintViolationMessages: [],
      index: 0,
      track,
      onDragCancel: () => undefined,
      onDragOver: () => undefined,
      onDragStart: () => undefined,
      onDrop: () => undefined,
      onRemove: () => undefined,
      onToggleExpand: () => undefined
    }));

    expect(html).toContain("Show details for Haunted Test");
    expect(html).toContain("Drag to reorder");
    expect(html).toContain("type=\"button\"");
    expect(html).not.toContain("draggable=");
    expect(html).toContain("aria-label=\"Remove Haunted Test\"");
    expect(html).toContain("×");
    expect(html).not.toContain(">Remove<");
    expect(html).not.toContain(">Details<");
    expect(html).not.toContain("Move Haunted Test up");
    expect(html).not.toContain("Move Haunted Test down");
    expect(html).not.toContain(">Up<");
    expect(html).not.toContain(">Down<");
    expect(html).not.toContain(">RM<");
  });

  it("renders track fit notes in expanded details", () => {
    const html = renderToStaticMarkup(React.createElement(TrackCard, {
      dragging: false,
      dropTarget: false,
      expanded: true,
      constraintViolationMessages: [],
      index: 0,
      track: { ...track, rationale: "The curator picked it for the opening unease." },
      onDragCancel: () => undefined,
      onDragOver: () => undefined,
      onDragStart: () => undefined,
      onDrop: () => undefined,
      onRemove: () => undefined,
      onToggleExpand: () => undefined
    }));

    expect(html).toContain("Fit note");
    expect(html).toContain("Fits the test playlist because it opens with tension.");
    expect(html).toContain("Why it was added");
    expect(html).toContain("The curator picked it for the opening unease.");
  });

  it("builds triage inbox items from active issues only", () => {
    const items = buildIssueInboxItems({
      appliedSuggestionIds: new Set(["review-applied"]),
      constraintReport: {
        passed: false,
        totalDurationMs: 180000,
        violations: [{ type: "max_tracks_per_artist", message: "\"Haunted Test\" repeats the same artist.", trackId: "track-1" }],
        evidenceWarnings: [{ type: "min_bpm", message: "\"Haunted Test\" does not have BPM evidence.", trackId: "track-1" }]
      },
      dismissedSuggestionIds: new Set<string>(),
      ignoredSuggestionIds: new Set<string>(),
      playlist: { ...emptyPlaylist, tracks: [track] },
      rejectedEntry,
      review,
      sentSuggestionIds: new Set<string>()
    });

    expect(items.map((item) => item.kind)).toEqual([
      "rejected_candidate",
      "verified_rule_issue",
      "evidence_note"
    ]);
    expect(items.some((item) => item.id.includes("review-applied"))).toBe(false);
  });

  it("keeps duplicate rejected candidate inbox rows keyed uniquely", () => {
    const duplicateRejectedEntry: RequestHistoryEntry = {
      ...rejectedEntry,
      rejectedCandidates: [rejectedEntry.rejectedCandidates[0], rejectedEntry.rejectedCandidates[0]],
      issueStatuses: []
    };
    const items = buildIssueInboxItems({
      appliedSuggestionIds: new Set<string>(),
      constraintReport: { passed: true, totalDurationMs: 0, violations: [], evidenceWarnings: [] },
      dismissedSuggestionIds: new Set<string>(),
      ignoredSuggestionIds: new Set<string>(),
      playlist: emptyPlaylist,
      rejectedEntry: duplicateRejectedEntry,
      review: null,
      sentSuggestionIds: new Set<string>()
    });

    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
    expect(items[0].kind === "rejected_candidate" ? items[0].issueId : null)
      .toBe(items[1].kind === "rejected_candidate" ? items[1].issueId : null);
  });

  it("renders the issues drawer as a triage inbox without handled review receipts", () => {
    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: "issues",
      appliedSuggestionIds: new Set(["review-applied"]),
      busy: false,
      dismissedSuggestionIds: new Set<string>(),
      history: [rejectedEntry],
      ignoredSuggestionIds: new Set<string>(),
      importText: "",
      onAcceptMatch: () => undefined,
      onApplySuggestion: () => undefined,
      onDismissRejectedCandidate: () => undefined,
      onDismissSuggestion: () => undefined,
      onIgnoreSuggestion: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onModeChange: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined,
      onVerifySuggestion: () => undefined,
      playlist: {
        ...emptyPlaylist,
        tracks: [track],
        constraints: {
          maxTracksPerArtist: 1,
          minBpm: 100
        }
      },
      rejectedEntry,
      review,
      seedText: "",
      sentSuggestionIds: new Set<string>()
    }));

    expect(html).toContain("Triage inbox");
    expect(html).toContain("Next up: repair 1 rejected candidate.");
    expect(html).toContain("Rejected candidate");
    expect(html).toContain("Evidence note");
    expect(html).not.toContain("Curator review");
    expect(html).not.toContain("Apply review action");
    expect(html).not.toContain("Handled review actions");
    expect(html).not.toContain("This cleanup is already handled.");
  });

  it("renders BPM, vocalist profile, and evidence notes in expanded track details", () => {
    const html = renderToStaticMarkup(React.createElement(TrackCard, {
      dragging: false,
      dropTarget: false,
      expanded: true,
      constraintViolationMessages: [],
      index: 0,
      track: {
        ...track,
        bpm: 112,
        bpmConfidence: "high",
        vocalProfile: "female_vocals",
        vocalProfileConfidence: "medium",
        evidenceNotes: ["Manual evidence review confirmed vocalist profile."]
      },
      onDragCancel: () => undefined,
      onDragOver: () => undefined,
      onDragStart: () => undefined,
      onDrop: () => undefined,
      onRemove: () => undefined,
      onToggleExpand: () => undefined
    }));

    expect(html).toContain("112 BPM / high");
    expect(html).toContain("female vocals / medium");
    expect(html).toContain("Evidence notes");
    expect(html).toContain("Manual evidence review confirmed vocalist profile.");
  });

  it("renders compact console tools and keeps playlist review with the ask composer", () => {
    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: null,
      busy: false,
      history: [],
      importText: "",
      playlist: emptyPlaylist,
      seedText: "",
      onAcceptMatch: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onModeChange: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined
    }));
    const composerHtml = renderToStaticMarkup(React.createElement(NaturalRequestForm, {
      busy: false,
      playlistHasTracks: true,
      progressStatus: null,
      userMessage: "",
      onAnalyze: () => undefined,
      onInterrupt: () => undefined,
      onSend: () => undefined,
      onUserMessageChange: () => undefined
    }));

    expect(html.indexOf("Session")).toBeLessThan(html.indexOf("Issues"));
    expect(html.indexOf("Issues")).toBeLessThan(html.indexOf("Import"));
    expect(html.indexOf("Import")).toBeLessThan(html.indexOf("History"));
    expect(html).toContain("Curator utilities");
    expect(html).toContain("Session");
    expect(html).toContain("Issues");
    expect(html).toContain("Import");
    expect(html).toContain("History");
    expect(html).toContain("Drafts and seeds");
    expect(html).not.toContain("Console tools");
    expect(html).not.toContain("Review playlist");
    expect(composerHtml).toContain("Curator Console");
    expect(composerHtml).toContain("Instruction");
    expect(composerHtml).toContain("Tell the Curator what move to make next");
    expect(composerHtml).toContain("Review playlist");
    expect(composerHtml).toContain("Common moves");
    expect(composerHtml).toContain(">Add<");
    expect(composerHtml).toContain(">Review<");
    expect(composerHtml).toContain(">Tighten<");
    expect(composerHtml).toContain(">Replace<");
    expect(composerHtml).toContain(">Reorder<");
    expect(composerHtml).not.toContain("Ask for tracks");
    expect(html).not.toContain("Review history");
  });

  it("shows the saved discovery radius selection in the curator composer", () => {
    const html = renderToStaticMarkup(React.createElement(NaturalRequestForm, {
      busy: false,
      discoveryRadius: "adventurous",
      playlistHasTracks: false,
      progressStatus: null,
      userMessage: "",
      onAnalyze: () => undefined,
      onInterrupt: () => undefined,
      onSend: () => undefined,
      onUserMessageChange: () => undefined
    }));

    expect(html).toContain("button-secondary is-active");
    expect(html).toContain("role=\"radiogroup\"");
    expect(html).toContain("Discovery radius");
    expect(html).toContain("Adventurous");
    expect(html).toContain("Broaden era, scene, and texture choices");
    expect(html).toContain("aria-checked=\"true\" class=\"button-secondary is-active discovery-radius-option\"");
    expect(html).toContain("name=\"discovery-radius\"");
    expect(html).toContain("checked=\"\" value=\"adventurous\"");
    expect(html).not.toContain("How far should the Curator travel");
    expect(html).not.toContain("LLM setup");
  });

  it("keeps the history shelf archival and free of export controls", () => {
    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: "history",
      busy: false,
      history: [],
      importText: "",
      playlist: {
        ...emptyPlaylist,
        tracks: [track]
      },
      seedText: "",
      onAcceptMatch: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onModeChange: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined
    }));

    expect(html).toContain("History");
    expect(html).toContain("Conversation History");
    expect(html).not.toContain("Copy tracklist");
    expect(html).not.toContain("Migration CSV");
  });

  it("keeps the active exchange visible while the history shelf is open", () => {
    const html = renderToStaticMarkup(React.createElement(ChatPanel, {
      history: [],
      messages: [
        { role: "assistant", content: "Ready." },
        { role: "user", content: "Keep the next pass under 8 minutes." },
        { role: "assistant", content: "A very long latest response should still live in its own panel." }
      ],
      mobileMode: "history",
      onHistoryChange: () => undefined,
      onMessagesChange: () => undefined,
      onPlaylistChange: () => undefined,
      playlist: {
        ...emptyPlaylist,
        tracks: [track]
      }
    }));

    expect(html).toContain("Active exchange");
    expect(html).toContain("Curator thread");
    expect(html).toContain("latest-response-region");
    expect(html).toContain("Keep the next pass under 8 minutes.");
    expect(html).toContain("A very long latest response should still live in its own panel.");
    expect(html).toContain("History");
  });

  it("renders active exchange progress between the current ask and curator response", () => {
    const messages: ChatMessage[] = [
      { role: "assistant", content: "Ready." },
      { role: "user", content: "Add two stranger songs." },
      { role: "assistant", content: "I found two left turns that still fit." }
    ];

    expect(latestActiveExchange(messages)).toEqual({
      userMessage: { role: "user", content: "Add two stranger songs." },
      assistantMessage: { role: "assistant", content: "I found two left turns that still fit." }
    });

    const html = renderToStaticMarkup(React.createElement(ActiveExchange, {
      busy: true,
      messages,
      progressStatus: "Asking the curator for candidate tracks."
    }));

    expect(html).toContain("Working");
    expect(html).toContain("Add two stranger songs.");
    expect(html).toContain("Asking the curator for candidate tracks.");
    expect(html).toContain("I found two left turns that still fit.");
  });

  it("renders a topbar session launcher for local drafts and named sessions", () => {
    const localDraftHtml = renderToStaticMarkup(React.createElement(SessionStatusButton, {
      savedAt: null,
      onOpenSessions: () => undefined
    }));
    const sessionHtml = renderToStaticMarkup(React.createElement(SessionStatusButton, {
      activeSession: {
        id: "session-1",
        name: "Slow dream-pop arc",
        playlistTitle: "Slow dream-pop arc",
        savedAt: "2026-05-27T00:00:05Z",
        trackCount: 7
      },
      savedAt: "2026-05-27T00:00:05Z",
      onOpenSessions: () => undefined
    }));

    expect(localDraftHtml).toContain("Local draft");
    expect(localDraftHtml).toContain("Ready");
    expect(localDraftHtml).toContain("Open sessions");
    expect(sessionHtml).toContain("Slow dream-pop arc");
    expect(sessionHtml).toContain("Saved");
  });

  it("renders the alpha LLM setup launcher for the topbar", () => {
    const html = renderToStaticMarkup(React.createElement(LlmSetupButton));

    expect(html).toContain("LLM setup");
    expect(html).toContain("Setup");
    expect(html).toContain("Open LLM setup");
    expect(html).not.toContain("LLM_PROVIDER=ollama");
  });

  it("renders Gemini-first LLM setup controls without exposing saved keys", () => {
    const html = renderToStaticMarkup(React.createElement(LlmSetupButton, { initialOpen: true }));

    expect(html).toContain("Gemini (recommended)");
    expect(html).toContain("gemini-2.5-flash");
    expect(html).toContain("Save and test");
    expect(html).toContain("API keys are saved only on this machine");
    expect(html).not.toContain("LLM_PROVIDER=gemini");
  });

  it("renders saved session controls in the command drawer", () => {
    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: "session",
      activeSessionId: "session-1",
      busy: false,
      history: [],
      importText: "",
      playlist: emptyPlaylist,
      seedText: "",
      sessions: [{
        id: "session-1",
        name: "Slow dream-pop arc",
        playlistTitle: "The CutList",
        savedAt: "2026-05-27T00:00:05Z",
        trackCount: 7
      }],
      onAcceptMatch: () => undefined,
      onDeleteSession: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onLoadSession: () => undefined,
      onModeChange: () => undefined,
      onSaveSession: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined
    }));

    expect(html).toContain("Session");
    expect(html).toContain("Current project");
    expect(html).toContain("Save current session");
    expect(html).toContain("Slow dream-pop arc");
    expect(html).toContain("7 tracks");
    expect(html).toContain("Load");
    expect(html).toContain("Current");
    expect(html).toContain("Delete Slow dream-pop arc");
  });

  it("explains when sessions are disabled for fixtures", () => {
    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: "session",
      busy: false,
      history: [],
      importText: "",
      playlist: emptyPlaylist,
      seedText: "",
      sessionsEnabled: false,
      onAcceptMatch: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onModeChange: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined
    }));

    expect(html).toContain("Sessions are disabled while viewing the fixture playlist.");
  });

  it("shows task starters before the playlist has tracks", () => {
    const composerHtml = renderToStaticMarkup(React.createElement(NaturalRequestForm, {
      busy: false,
      playlistHasTracks: false,
      progressStatus: null,
      userMessage: "",
      onAnalyze: () => undefined,
      onInterrupt: () => undefined,
      onSend: () => undefined,
      onUserMessageChange: () => undefined
    }));

    expect(composerHtml).toContain("Ways to start");
    expect(composerHtml).toContain("Describe playlist");
    expect(composerHtml).toContain("Describe the playlist you want.");
    expect(composerHtml).toContain("cutlist_mascot_app.png");
    expect(composerHtml).toContain(">Build<");
    expect(composerHtml).toContain(">Seed<");
    expect(composerHtml).toContain(">Constrain<");
    expect(composerHtml).toContain("builds the first pass");
    expect(composerHtml).toContain("Build playlist");
    expect(composerHtml).toContain("Import and known-track tools are still available");
    expect(composerHtml).toContain("Add verified tracks before requesting a playlist review.");
    expect(composerHtml).not.toContain("Import this draft and verify the tracks before we shape it.");
    expect(composerHtml).not.toContain("Reorder ideas");
    expect(composerHtml).not.toContain("without adding or removing songs");
  });

  it("adapts the task starters to the selected curator persona", () => {
    const archivistHtml = renderToStaticMarkup(React.createElement(NaturalRequestForm, {
      busy: false,
      curatorPersona: "archivist",
      playlistHasTracks: false,
      progressStatus: null,
      userMessage: "",
      onAnalyze: () => undefined,
      onInterrupt: () => undefined,
      onSend: () => undefined,
      onUserMessageChange: () => undefined
    }));
    const firestarterHtml = renderToStaticMarkup(React.createElement(NaturalRequestForm, {
      busy: false,
      curatorPersona: "firestarter",
      playlistHasTracks: true,
      progressStatus: null,
      userMessage: "",
      onAnalyze: () => undefined,
      onInterrupt: () => undefined,
      onSend: () => undefined,
      onUserMessageChange: () => undefined
    }));

    expect(archivistHtml).toContain(">Seed<");
    expect(archivistHtml).toContain(">Constrain<");
    expect(archivistHtml).not.toContain("Autechre - Gantz Graf");
    expect(firestarterHtml).toContain(">Add<");
    expect(firestarterHtml).toContain(">Review<");
    expect(firestarterHtml).not.toContain("museum survey");
    expect(firestarterHtml).not.toContain("identify where the historical argument becomes too tasteful");
  });

  it("renders conversation history newest first with an empty state", () => {
    const older: RequestHistoryEntry = {
      id: "older",
      userMessage: "older ask",
      assistantMessage: "older response",
      acceptedCount: 1,
      rejectedCandidates: [],
      createdAt: "2026-05-28T10:00:00.000Z",
      kind: "request"
    };
    const newer: RequestHistoryEntry = {
      id: "newer",
      userMessage: "newer import",
      assistantMessage: "newer response",
      acceptedCount: 0,
      rejectedCandidates: [],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "import"
    };

    const emptyHtml = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history: []
    }));
    const html = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history: [older, newer]
    }));

    expect(emptyHtml).toContain("Conversation activity appears here after you ask, import, verify, or review.");
    expect(html.indexOf("newer import")).toBeLessThan(html.indexOf("older ask"));
    expect(html).toContain("Imported draft");
    expect(html).toContain("Asked for tracks");
    expect(html).toContain("timeline-message-user");
    expect(html).toContain("timeline-message-curator");
  });

  it("renders curator reorder rationale and movement highlights", () => {
    const history: RequestHistoryEntry[] = [{
      id: "reorder",
      userMessage: "improve the flow",
      assistantMessage: "I tightened the arc.",
      acceptedCount: 0,
      rejectedCandidates: [],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request",
      movedTrackCount: 2,
      movedTrackSummary: ["2 -> 1 · Second by Artist B", "1 -> 2 · Song by Artist"],
      orderRationale: "The second track opens stronger.",
      playlistAction: "reorder"
    }];

    const html = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history
    }));

    expect(html).toContain("Reordered playlist");
    expect(html).toContain("2 moved");
    expect(html).toContain("Sequence only");
    expect(html).toContain("Reorder recap");
    expect(html).toContain("Why this order:");
    expect(html).toContain("The second track opens stronger.");
    expect(html).toContain("Show 2 position changes");
    expect(html).not.toContain("0 accepted");
  });

  it("renders informational review suggestions as notes instead of open actions", () => {
    const history: RequestHistoryEntry[] = [{
      id: "review-info",
      userMessage: "Review playlist",
      assistantMessage: "Two tracks are soft spots.",
      acceptedCount: 0,
      rejectedCandidates: [],
      createdAt: "2026-06-23T12:00:00.000Z",
      kind: "review",
      reviewSuggestions: [{
        id: "review-note-1",
        type: "remove",
        applicationMode: "informational",
        affectedTrackIds: ["track-2"],
        rationale: "These tracks are the velvet curtains of the set.",
        intentPreservation: "Keeps the diagnosis focused on identity drift.",
        risk: null,
        confidence: "high",
        suggestedPrompt: "Remove the two soft spots."
      }],
      issueStatuses: []
    }];

    const html = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history
    }));

    expect(html).toContain("Review notes");
    expect(html).toContain("Informational");
    expect(html).not.toContain("Still open");
  });

  it("exposes rejected candidates through an accessible disclosure", () => {
    const history: RequestHistoryEntry[] = [{
      id: "rejected",
      userMessage: "find one",
      assistantMessage: "No safe match.",
      acceptedCount: 0,
      rejectedCandidates: [{
        artist: "Nope",
        title: "Missing",
        reason: "No credible metadata match was found.",
        violatedConstraint: null,
        attemptedMatches: [{
          artist: "Close Artist",
          title: "Close Title",
          album: "Close Album",
          durationMs: 90000,
          runtime: "1:30",
          source: "itunes",
          sourceId: "123",
          sourceUrl: null,
          artworkUrl: null,
          confidence: "medium",
          score: 0.74
        }]
      }],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request"
    }];

    const html = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history
    }));

    expect(html).toContain("<details");
    expect(html).toContain("<summary>1 rejected: 1 unverified</summary>");
    expect(html).toContain("Nope - Missing");
    expect(html).toContain("1 provider match reviewed");
    expect(html).toContain("Still open");
  });

  it("can surface recent rejected metadata matches outside the history drawer", () => {
    const entry: RequestHistoryEntry = {
      id: "live-rejected",
      userMessage: "find one",
      assistantMessage: "No safe match.",
      acceptedCount: 0,
      rejectedCandidates: [{
        artist: "Nope",
        title: "Missing",
        reason: "No credible metadata match was found.",
        violatedConstraint: null,
        attemptedMatches: [{
          artist: "Close Artist",
          title: "Close Title",
          album: "Close Album",
          durationMs: 90000,
          runtime: "1:30",
          source: "itunes",
          sourceId: "123",
          sourceUrl: null,
          artworkUrl: null,
          confidence: "medium",
          score: 0.74
        }]
      }],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request"
    };
    const html = renderToStaticMarkup(React.createElement(RejectedCandidatesDisclosure, {
      candidates: entry.rejectedCandidates,
      entry,
      mode: "live",
      title: "Review rejected metadata matches",
      onAcceptMatch: () => undefined
    }));

    expect(html).toContain("Review rejected metadata matches");
    expect(html).toContain("Nope - Missing");
    expect(html).toContain("Close Artist - Close Title");
    expect(html).toContain("Close Album / 1:30 / itunes / medium confidence");
    expect(html).toContain("score 74%");
    expect(html).toContain("Accept match");
  });

  it("renders the latest rejected candidates as a live repair drawer section", () => {
    const rejectedEntry: RequestHistoryEntry = {
      id: "rejected-now",
      userMessage: "find one",
      assistantMessage: "No safe match.",
      acceptedCount: 0,
      rejectedCandidates: [{
        artist: "Nope",
        title: "Missing",
        reason: "No credible metadata match was found.",
        violatedConstraint: null,
        attemptedMatches: [{
          artist: "Close Artist",
          title: "Close Title",
          album: "Close Album",
          durationMs: 90000,
          runtime: "1:30",
          source: "itunes",
          sourceId: "123",
          sourceUrl: null,
          artworkUrl: null,
          confidence: "medium",
          score: 0.74
        }]
      }],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request"
    };

    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: "issues",
      busy: false,
      history: [],
      importText: "",
      playlist: emptyPlaylist,
      rejectedEntry,
      seedText: "",
      onAcceptMatch: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onModeChange: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined
    }));

    expect(html).toContain("Issues");
    expect(html).toContain("1 active");
    expect(html).toContain("Triage inbox");
    expect(html).toContain("Next up: repair 1 rejected candidate.");
    expect(html).toContain("Rejected candidate");
    expect(html).toContain("Review rejected candidate");
    expect(html).toContain("Accept match");
    expect(html).toContain("Close Artist - Close Title");
    expect(html).toContain("Repairs");
  });

  it("collapses deterministic sections and mutes empty summary cards when the repair queue leads", () => {
    const rejectedEntry: RequestHistoryEntry = {
      id: "rejected-now",
      userMessage: "find one",
      assistantMessage: "No safe match.",
      acceptedCount: 0,
      rejectedCandidates: [{
        artist: "Nope",
        title: "Missing",
        reason: "No credible metadata match was found.",
        violatedConstraint: null,
        attemptedMatches: []
      }],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request"
    };

    const html = renderToStaticMarkup(React.createElement(CommandDrawer, {
      activeMode: "issues",
      busy: false,
      history: [],
      importText: "",
      playlist: {
        ...emptyPlaylist,
        tracks: [{
          ...track,
          id: "track-det",
          title: "Slow Test",
          artist: "Constraint Band",
          explicit: true,
          bpm: null
        }],
        constraints: {
          allowExplicit: false,
          minBpm: 120
        }
      },
      rejectedEntry,
      seedText: "",
      onAcceptMatch: () => undefined,
      onImportChat: () => undefined,
      onImportTextChange: () => undefined,
      onModeChange: () => undefined,
      onSeedTextChange: () => undefined,
      onVerifySeeds: () => undefined
    }));

    expect(html).toContain("Rules");
    expect(html).toContain("Verified rule");
    expect(html).toContain("Evidence note");
    expect(html).toContain("Slow Test breaks a verified rule");
    expect(html).toContain("Slow Test has limited metadata evidence");
  });

  it("does not allow manual accept for constraint-rejected matches", () => {
    const history: RequestHistoryEntry[] = [{
      id: "constraint-rejected",
      userMessage: "short songs only",
      assistantMessage: "One match broke a constraint.",
      acceptedCount: 0,
      rejectedCandidates: [{
        artist: "Too Long",
        title: "Big Finale",
        reason: "Track would exceed the requested maximum duration.",
        violatedConstraint: "maxTrackDurationMs",
        attemptedMatches: [{
          artist: "Too Long",
          title: "Big Finale",
          album: "Long Set",
          durationMs: 420000,
          runtime: "7:00",
          source: "itunes",
          sourceId: "too-long",
          sourceUrl: null,
          artworkUrl: null,
          confidence: "high",
          score: 0.98
        }]
      }],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request"
    }];

    const html = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history
    }));

    expect(html).toContain("Constraint: maxTrackDurationMs");
    expect(html).toContain("Blocked");
    expect(html).not.toContain("Accept match");
  });

  it("explains when an attempted match cannot be accepted without a source id", () => {
    const history: RequestHistoryEntry[] = [{
      id: "missing-source-id",
      userMessage: "find one",
      assistantMessage: "One match lacked a stable source id.",
      acceptedCount: 0,
      rejectedCandidates: [{
        artist: "Maybe",
        title: "Almost",
        reason: "No credible metadata match was found.",
        attemptedMatches: [{
          artist: "Maybe Artist",
          title: "Almost",
          album: null,
          durationMs: 180000,
          runtime: "3:00",
          source: "musicbrainz",
          sourceUrl: null,
          artworkUrl: null,
          confidence: "low",
          score: 0.44
        }]
      }],
      createdAt: "2026-05-28T11:00:00.000Z",
      kind: "request"
    }];

    const html = renderToStaticMarkup(React.createElement(ConversationTimeline, {
      history
    }));

    expect(html).toContain("Still open");
    expect(html).not.toContain("Accept match");
  });
});
