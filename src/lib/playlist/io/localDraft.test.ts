import { describe, expect, it } from "vitest";
import {
  createRequestHistoryEntry,
  createLocalSessionId,
  defaultLocalSessionName,
  materializeLocalSessionSnapshot,
  parsePersistedWorkspaceState,
  parseLocalDraft,
  serializePersistedWorkspaceState,
  serializeLocalDraft,
  type ChatMessage,
  type RequestHistoryEntry
} from "@/lib/playlist/io/localDraft";
import type { CuratorResponse, PlaylistState, Track } from "@/types/playlist";

const playlist: PlaylistState = {
  id: "test",
  title: "Draft",
  mood: null,
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-05-27T00:00:00Z"
};

const track: Track = {
  id: "itunes:1",
  title: "Song",
  artist: "Artist",
  album: null,
  durationMs: 123000,
  runtime: "2:03",
  verified: true,
  source: "itunes",
  sourceId: "1",
  sourceUrl: null,
  artworkUrl: null,
  explicit: false,
  releaseDate: null,
  vibeTags: [],
  genreTags: [],
  rationale: null,
  energy: null,
  verificationNote: "Verified."
};

const messages: ChatMessage[] = [
  { role: "assistant", content: "Ready." },
  { role: "user", content: "add something" }
];

describe("local draft schema", () => {
  it("restores a valid draft with playlist and history", () => {
    const history: RequestHistoryEntry[] = [{
      id: "history-1",
      userMessage: "add one song",
      assistantMessage: "I added one.",
      acceptedCount: 1,
      rejectedCandidates: [],
      createdAt: "2026-05-27T00:00:01Z",
      movedTrackCount: 2,
      movedTrackSummary: ["2 -> 1 · Song B by Artist B"],
      orderRationale: "Better opener.",
      playlistAction: "reorder",
      issueStatuses: [{
        issueId: "suggestion-1",
        issueKind: "review_suggestion",
        status: "dismissed",
        actedAt: "2026-05-27T00:00:01Z"
      }]
    }];
    const raw = serializeLocalDraft({
      playlist: { ...playlist, tracks: [track] },
      messages,
      history,
      savedAt: "2026-05-27T00:00:02Z"
    });

    const draft = parseLocalDraft(raw);

    expect(draft?.playlist.tracks[0].title).toBe("Song");
    expect(draft?.messages).toEqual(messages);
    expect(draft?.history).toEqual(history);
    expect(draft?.savedAt).toBe("2026-05-27T00:00:02Z");
  });

  it("ignores invalid drafts and mismatched versions", () => {
    expect(parseLocalDraft("{bad json")).toBeNull();
    expect(parseLocalDraft(JSON.stringify({ version: 999, playlist, messages: [], history: [], savedAt: "now" }))).toBeNull();
  });

  it("defaults missing discovery radius to moderate when loading older drafts", () => {
    const raw = JSON.stringify({
      version: 1,
      playlist: {
        id: "legacy",
        title: "Legacy",
        mood: null,
        arc: null,
        tracks: [],
        constraints: {},
        conversationSummary: null,
        updatedAt: "2026-05-27T00:00:00Z"
      },
      messages: [],
      history: [],
      savedAt: "2026-05-27T00:00:02Z"
    });

    expect(parseLocalDraft(raw)?.playlist.discoveryRadius).toBe("moderate");
  });

  it("discards malformed history without blocking playlist restore", () => {
    const raw = JSON.stringify({
      version: 1,
      playlist,
      messages,
      history: [
        { id: "good", userMessage: "u", assistantMessage: "a", acceptedCount: 0, rejectedCandidates: [], createdAt: "now" },
        { id: "bad", rejectedCandidates: "not an array" }
      ],
      savedAt: "2026-05-27T00:00:02Z"
    });

    const draft = parseLocalDraft(raw);

    expect(draft?.playlist.title).toBe("Draft");
    expect(draft?.history).toHaveLength(1);
    expect(draft?.history[0].id).toBe("good");
  });

});

describe("local session snapshots", () => {
  it("materializes a named session snapshot", () => {
    const session = materializeLocalSessionSnapshot({
      id: "session-1",
      name: "Dream pop draft",
      playlist: { ...playlist, tracks: [track] },
      messages,
      history: [],
      curatorPersona: "archivist",
      savedAt: "2026-05-27T00:00:04Z"
    });

    expect(session.id).toBe("session-1");
    expect(session.name).toBe("Dream pop draft");
    expect(session.playlist.tracks[0].title).toBe("Song");
    expect(session.messages).toEqual(messages);
    expect(session.curatorPersona).toBe("archivist");
    expect(session.savedAt).toBe("2026-05-27T00:00:04Z");
  });

  it("creates a session id and default name when not provided", () => {
    const savedAt = "2026-05-27T00:00:04Z";
    const name = defaultLocalSessionName(playlist, savedAt);
    const untitledName = defaultLocalSessionName({ ...playlist, title: "The CutList" }, savedAt);
    const session = materializeLocalSessionSnapshot({
      playlist,
      messages,
      history: [],
      savedAt
    });

    expect(createLocalSessionId(new Date(savedAt))).toMatch(/^session-/);
    expect(name).toBe("Draft");
    expect(untitledName).toMatch(/^Session /);
    expect(session.id).toMatch(/^session-/);
    expect(session.name).toBe(name);
  });
});

describe("persisted workspace state", () => {
  it("round-trips draft, sessions, and active session id", () => {
    const raw = serializePersistedWorkspaceState({
      version: 1,
      draft: {
        version: 1,
        playlist,
        messages,
        history: [],
        curatorPersona: "firestarter",
        savedAt: "2026-05-27T00:00:06Z"
      },
      sessions: [{
        version: 1,
        id: "session-1",
        name: "Session 1",
        playlist: { ...playlist, tracks: [track] },
        messages,
        history: [],
        curatorPersona: "archivist",
        savedAt: "2026-05-27T00:00:07Z"
      }],
      activeSessionId: "session-1"
    });

    const parsed = parsePersistedWorkspaceState(raw);

    expect(parsed?.draft?.savedAt).toBe("2026-05-27T00:00:06Z");
    expect(parsed?.draft?.curatorPersona).toBe("firestarter");
    expect(parsed?.sessions[0]?.id).toBe("session-1");
    expect(parsed?.sessions[0]?.curatorPersona).toBe("archivist");
    expect(parsed?.activeSessionId).toBe("session-1");
  });

  it("fails safe on malformed workspace state", () => {
    expect(parsePersistedWorkspaceState("{bad json")).toBeNull();
  });
});

describe("request history entries", () => {
  it("groups rejected candidates and derives accepted count from add updates", () => {
    const response: CuratorResponse = {
      message: "Done.",
      playlistUpdate: { action: "add", tracks: [track], orderRationale: null },
      playlistMeta: null,
      updatedConstraints: {},
      constraintReport: { passed: true, totalDurationMs: 123000, violations: [] },
      rejectedCandidates: [{ title: "Bad", artist: "Nope", reason: "No credible metadata match was found." }]
    };

    const entry = createRequestHistoryEntry("add one", "Done.", response, "2026-05-27T00:00:03Z");

    expect(entry.userMessage).toBe("add one");
    expect(entry.acceptedCount).toBe(1);
    expect(entry.rejectedCandidates).toEqual(response.rejectedCandidates);
  });

  it("persists issue statuses and review suggestions in local drafts", () => {
    const history: RequestHistoryEntry[] = [{
      id: "history-issue-1",
      userMessage: "review",
      assistantMessage: "Needs work.",
      acceptedCount: 0,
      rejectedCandidates: [],
      reviewSuggestions: [{
        id: "review-suggestion-1",
        type: "remove",
        applicationMode: "remove_existing",
        affectedTrackIds: ["itunes:1"],
        rationale: "It drags.",
        intentPreservation: "Keeps the overall shape tighter.",
        risk: null,
        confidence: "medium",
        suggestedPrompt: null
      }],
      issueStatuses: [{
        issueId: "review-suggestion-1",
        issueKind: "review_suggestion",
        status: "ignored",
        actedAt: "2026-05-27T00:00:05Z"
      }],
      createdAt: "2026-05-27T00:00:05Z",
      kind: "review"
    }];

    const draft = parseLocalDraft(serializeLocalDraft({
      playlist,
      messages,
      history,
      savedAt: "2026-05-27T00:00:06Z"
    }));

    expect(draft?.history[0].reviewSuggestions?.[0].id).toBe("review-suggestion-1");
    expect(draft?.history[0].issueStatuses?.[0].status).toBe("ignored");
  });

  it("round-trips playlist snapshots for curator undo through draft persistence", () => {
    const history: RequestHistoryEntry[] = [{
      id: "history-request-1",
      userMessage: "Reorder this.",
      assistantMessage: "Done.",
      acceptedCount: 0,
      rejectedCandidates: [],
      createdAt: "2026-05-27T00:00:05Z",
      kind: "request",
      playlistAction: "reorder",
      playlistBefore: {
        ...playlist,
        title: "Before",
        tracks: [track]
      },
      resultingPlaylistUpdatedAt: "2026-05-27T00:00:06Z"
    }];

    const draft = parseLocalDraft(serializeLocalDraft({
      playlist: {
        ...playlist,
        title: "After",
        updatedAt: "2026-05-27T00:00:06Z"
      },
      messages,
      history,
      savedAt: "2026-05-27T00:00:07Z"
    }));

    expect(draft?.history[0].playlistBefore?.title).toBe("Before");
    expect(draft?.history[0].playlistBefore?.tracks[0]?.title).toBe("Song");
    expect(draft?.history[0].resultingPlaylistUpdatedAt).toBe("2026-05-27T00:00:06Z");
  });
});
