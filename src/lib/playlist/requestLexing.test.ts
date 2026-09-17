import { describe, expect, it } from "vitest";
import {
  detectUnsupportedCatalogQuery,
  hasNonModificationDirective,
  hasReviewSignals,
  isStrictReorderOnlyRequest,
  parseRequestedTrackCount,
  splitOrderedClauses
} from "@/lib/playlist/requestLexing";

describe("isStrictReorderOnlyRequest", () => {
  it("accepts reorder requests that forbid adding or removing", () => {
    expect(isStrictReorderOnlyRequest("Reorder this for a smoother arc without adding or removing anything.")).toBe(true);
    expect(isStrictReorderOnlyRequest("Resequence the playlist but keep all the tracks.")).toBe(true);
    expect(isStrictReorderOnlyRequest("Fix the flow. Do not add or remove tracks.")).toBe(true);
    expect(isStrictReorderOnlyRequest("Rearrange it, no additions or removals.")).toBe(true);
  });

  it("rejects reorder requests that leave structural changes open", () => {
    expect(isStrictReorderOnlyRequest("Reorder this for a smoother arc.")).toBe(false);
    expect(isStrictReorderOnlyRequest("Add two tracks and then reorder.")).toBe(false);
  });

  it("rejects requests that forbid changes but do not ask to reorder", () => {
    expect(isStrictReorderOnlyRequest("Don't add anything, just tell me what you think.")).toBe(false);
  });
});

describe("detectUnsupportedCatalogQuery", () => {
  it("recognizes album tracklist questions", () => {
    expect(detectUnsupportedCatalogQuery("What songs are on Confessions of a Knife?")).toBe("album_tracks");
    expect(detectUnsupportedCatalogQuery("List the tracks on Loveless")).toBe("album_tracks");
  });

  it("recognizes artist discography questions", () => {
    expect(detectUnsupportedCatalogQuery("Which tracks by Bjork should I know?")).toBe("artist_songs");
    expect(detectUnsupportedCatalogQuery("list songs by Bjork")).toBe("artist_songs");
  });

  it("leaves ordinary curator requests alone", () => {
    expect(detectUnsupportedCatalogQuery("Add two songs by Bjork.")).toBeNull();
    expect(detectUnsupportedCatalogQuery("What songs would fit after the opener?")).toBeNull();
  });
});

describe("shared lexical cues", () => {
  it("detects review and non-modification language", () => {
    expect(hasReviewSignals("Review the sequencing of this playlist.")).toBe(true);
    expect(hasReviewSignals("Add three more tracks.")).toBe(false);
    expect(hasNonModificationDirective("Don't change anything, just critique it.")).toBe(true);
  });

  it("parses a requested track count", () => {
    expect(parseRequestedTrackCount("Add three more tracks.")).toBe(3);
    expect(parseRequestedTrackCount("Add 5 songs.")).toBe(5);
    expect(parseRequestedTrackCount("Make it moodier.")).toBeNull();
  });

  it("splits ordered clauses in the order they were written", () => {
    const clauses = splitOrderedClauses("Remove the live versions, then add two closers.");

    expect(clauses.map((clause) => clause.text)).toEqual(["Remove the live versions", "add two closers."]);
  });
});
