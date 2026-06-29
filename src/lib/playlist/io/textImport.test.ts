import { describe, expect, it } from "vitest";
import { parseExplicitRequestedTracks, parseTrackRowsFromText } from "@/lib/playlist/io/textImport";

describe("text playlist import", () => {
  it("parses tab-separated Name Artist Album exports", () => {
    const tracks = parseTrackRowsFromText([
      "Name\tArtist\tAlbum",
      "Bring The Noise\tAnthrax & Public Enemy\tAttack Of The Killer B's",
      "Vision Thing\tThe Sisters of Mercy\tVision Thing"
    ].join("\n"));

    expect(tracks).toEqual([
      {
        title: "Bring The Noise",
        artist: "Anthrax & Public Enemy",
        album: "Attack Of The Killer B's"
      },
      {
        title: "Vision Thing",
        artist: "The Sisters of Mercy",
        album: "Vision Thing"
      }
    ]);
  });

  it("parses headerless tab-separated title artist album rows", () => {
    const tracks = parseTrackRowsFromText([
      "Bring The Noise\tAnthrax & Public Enemy\tAttack Of The Killer B's",
      "Vision Thing\tThe Sisters of Mercy\tVision Thing"
    ].join("\n"));

    expect(tracks).toEqual([
      {
        title: "Bring The Noise",
        artist: "Anthrax & Public Enemy",
        album: "Attack Of The Killer B's"
      },
      {
        title: "Vision Thing",
        artist: "The Sisters of Mercy",
        album: "Vision Thing"
      }
    ]);
  });

  it("parses headerless comma-separated title artist album seed rows", () => {
    const tracks = parseTrackRowsFromText("Gudbuy T'Jane, Slade, Slayed");

    expect(tracks).toEqual([{ title: "Gudbuy T'Jane", artist: "Slade", album: "Slayed" }]);
  });

  it("parses artist dash title seed lines", () => {
    const tracks = parseTrackRowsFromText("Nick Drake - Pink Moon");

    expect(tracks).toEqual([{ artist: "Nick Drake", title: "Pink Moon", album: null }]);
  });

  it("does not parse comma-separated prose as a track row", () => {
    const tracks = parseTrackRowsFromText("some of these songs are versions of the same track. can you keep the best versions, remove the other versions, and add a few replacements?");

    expect(tracks).toEqual([]);
  });

  it("does not parse bridge-transition prose as artist dash title rows", () => {
    const tracks = parseTrackRowsFromText([
      "Find one verified bridge track for this transition: Erykah Badu - Phone Down into Cocteau Twins - Cherry-Coloured Funk.",
      "Transition: Erykah Badu - Phone Down into Cocteau Twins - Cherry-Coloured Funk."
    ].join("\n"), {
      allowHeaderlessCommaRows: false
    });

    expect(tracks).toEqual([]);
  });

  it("can disable headerless comma rows for chat auto-detection", () => {
    const tracks = parseTrackRowsFromText("Find warm, strange songs that move from tension to relief.", {
      allowHeaderlessCommaRows: false
    });

    expect(tracks).toEqual([]);
  });

  it("keeps headerless comma rows available for explicit imports", () => {
    const tracks = parseTrackRowsFromText("Gudbuy T'Jane, Slade, Slayed", {
      allowHeaderlessCommaRows: true
    });

    expect(tracks).toEqual([{ title: "Gudbuy T'Jane", artist: "Slade", album: "Slayed" }]);
  });

  it("parses comma-separated rows only when a title and artist header is present", () => {
    const tracks = parseTrackRowsFromText("Title,Artist,Album\nPink Moon,Nick Drake,Pink Moon");

    expect(tracks).toEqual([{ title: "Pink Moon", artist: "Nick Drake", album: "Pink Moon" }]);
  });

  it("parses quoted comma-separated rows with embedded commas", () => {
    const tracks = parseTrackRowsFromText("\"Mack the Knife, Live\",Ella Fitzgerald,\"Mack the Knife\"");

    expect(tracks).toEqual([{ title: "Mack the Knife, Live", artist: "Ella Fitzgerald", album: "Mack the Knife" }]);
  });

  it("parses exact requested add-track prompts", () => {
    expect(parseExplicitRequestedTracks("add heaven have mercy by diamanda galas")).toEqual([
      { title: "heaven have mercy", artist: "diamanda galas", album: null }
    ]);
    expect(parseExplicitRequestedTracks("add smells like teen spirit covered by patti smith and covered by tori amos")).toEqual([
      { title: "smells like teen spirit", artist: "patti smith", album: null },
      { title: "smells like teen spirit", artist: "tori amos", album: null }
    ]);
    expect(parseExplicitRequestedTracks("add two tracks by lingua ignota")).toEqual([]);
  });
});
