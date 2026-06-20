import { describe, expect, it } from "vitest";
import {
  parseDeterministicRequest,
  parseExplicitRequestedTracks
} from "@/lib/ai/services/deterministicRequestParser";

describe("deterministicRequestParser", () => {
  it("parses covers-only constraints as deterministic guidance", () => {
    const result = parseDeterministicRequest("add a constraint that only covers are allowed");

    expect(result.deterministicPersistentConstraints.notes).toContain("Only covers are allowed.");
    expect(result.operationSignals.addition).toBe(false);
  });

  it("parses exact track requests without treating count placeholders as titles", () => {
    expect(parseExplicitRequestedTracks("add heaven have mercy by diamanda galas")).toEqual([
      { title: "heaven have mercy", artist: "diamanda galas", album: null }
    ]);
    expect(parseExplicitRequestedTracks("add smells like teen spirit covered by patti smith and covered by tori amos")).toEqual([
      { title: "smells like teen spirit", artist: "patti smith", album: null },
      { title: "smells like teen spirit", artist: "tori amos", album: null }
    ]);
    expect(parseExplicitRequestedTracks("add two tracks by lingua ignota")).toEqual([]);
    expect(parseExplicitRequestedTracks(
      "add a constraint that no more than 2 songs by the same artist can appear on the playlist and then remove tracks that violate that constraint. this is a playlist of covers only. add two songs by lingua ignota that are covers. reorganize the playlist into a verifiable narrative arc."
    )).toEqual([]);
  });

  it("preserves ordered reorder-plus-cut requests and extracts artist limits", () => {
    const result = parseDeterministicRequest(
      "this is a list of covered songs. i want you to reorder it so that tracks by the same artist are separated. we have too many diamanda galas and patti smith tracks. probably i should limit this to 2 from each artist, so suggest cuts."
    );

    expect(result.sequencingSignals.clauses.flatMap((clause) => clause.operations)).toEqual(["reorder", "remove"]);
    expect(result.deterministicPersistentConstraints.maxTracksPerArtist).toBe(2);
  });

  it("keeps rule-update-plus-remove prompts as both a persistent rule and an edit step", () => {
    const result = parseDeterministicRequest(
      "add a constraint that no more than 2 songs by the same artist can appear on the playlist and then remove tracks that violate that constraint"
    );

    expect(result.deterministicPersistentConstraints.maxTracksPerArtist).toBe(2);
    expect(result.sequencingSignals.clauses.flatMap((clause) => clause.operations)).toContain("remove");
    expect(result.cleanupSignals.shouldPruneExistingForConstraints).toBe(true);
  });

  it("does not turn mixed structural prompts into genre-addition guidance", () => {
    const result = parseDeterministicRequest(
      "add a constraint that no more than 2 songs by the same artist can appear on the playlist and then remove tracks that violate that constraint. this is a playlist of covers only. add two songs by lingua ignota that are covers. reorganize the playlist into a verifiable narrative arc."
    );

    expect(result.deterministicConstraints.requiredGenreAdditions).toEqual([]);
  });

  it("keeps explicit request-scoped rules out of persistent deterministic constraints", () => {
    const result = parseDeterministicRequest("no motley crue for this pass");

    expect(result.deterministicPersistentConstraints.excludedArtists).toBeUndefined();
    expect(result.deterministicRequestScopedConstraints.excludedArtists).toEqual(["motley crue"]);
  });
});
