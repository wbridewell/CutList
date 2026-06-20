import { describe, expect, it } from "vitest";
import { sanitizeMatchReviewSummary } from "@/lib/music/llmMatchReview";

describe("LLM match review summary sanitization", () => {
  it("turns provider-id-heavy prune summaries into user-facing category counts", () => {
    expect(
      sanitizeMatchReviewSummary(
        "All candidates were pruned for being either remixes (385912636, 633748506), live recordings (1097753487), or non-canonical theatrical/musical versions (531494076, 721565062)."
      )
    ).toBe("All candidates were pruned: 2 remixes, 1 live recording, and 2 non-canonical theatrical or musical versions.");
  });

  it("removes single-candidate provider ids from mismatch summaries", () => {
    expect(
      sanitizeMatchReviewSummary(
        "Candidate 1861206839 was pruned as it is a mismatch for the requested artist and album."
      )
    ).toBe("One candidate was pruned because it is a mismatch for the requested artist and album.");
  });

  it("keeps generalized pruning language while stripping raw ids", () => {
    expect(
      sanitizeMatchReviewSummary(
        "Wrong artists (1001, 1002) and soundtrack/title collisions (2001) were removed before review."
      )
    ).toBe("All candidates were pruned: 2 wrong artist matches and 1 soundtrack or title collision.");
  });
});
