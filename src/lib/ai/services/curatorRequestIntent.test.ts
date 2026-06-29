import { describe, expect, it } from "vitest";
import {
  isAdditionIntent,
  isPlaylistShapeIntent,
  isReplacementIntent,
  isRemovalIntent,
  parseReplacementCount,
  parseTargetTotalTrackCount,
  replacementCountForVersionCleanup,
  scopeAdditiveVocalProfileIntent,
  shouldPruneExistingForConstraints
} from "@/lib/ai/services/curatorRequestIntent";
import type { InstructionIntent } from "@/types/playlist";

describe("curator request intent helpers", () => {
  it("scopes additive vocal profile requests to the current request", () => {
    const intent: InstructionIntent = {
      operationIntent: {
        type: "add",
        requestedTrackCount: 3,
        targetTotalTrackCount: null,
        replaceCount: null,
        confidence: "high"
      },
      verifiedRules: {},
      curatorGuidance: { vocalProfile: "female_vocals" },
      routingIntent: {
        routeFamily: "curator",
        allowMutation: true,
        diagnosisOnly: false,
        hypotheticalOnly: false,
        reviewMode: null
      },
      scopeIntent: {
        persistentVerifiedRuleFields: [],
        persistentGuidanceFields: ["vocalProfile"],
        requestScopedVerifiedRuleFields: [],
        requestScopedGuidanceFields: []
      },
      notes: []
    };

    expect(scopeAdditiveVocalProfileIntent(intent, "add some female vocalists")).toMatchObject({
      operationIntent: {
        type: "add",
        requestedTrackCount: 3
      },
      curatorGuidance: { vocalProfile: "female_vocals" },
      scopeIntent: {
        persistentGuidanceFields: [],
        requestScopedGuidanceFields: ["vocalProfile"]
      }
    });
    expect(scopeAdditiveVocalProfileIntent(intent, "queue female vocalists after firestarter")).toMatchObject({
      scopeIntent: {
        persistentGuidanceFields: [],
        requestScopedGuidanceFields: ["vocalProfile"]
      }
    });
    expect(scopeAdditiveVocalProfileIntent(intent, "drop in female vocalists before roads")).toMatchObject({
      scopeIntent: {
        persistentGuidanceFields: [],
        requestScopedGuidanceFields: ["vocalProfile"]
      }
    });
  });

  it("keeps exclusive vocal profile requests persistent", () => {
    const intent: InstructionIntent = {
      operationIntent: {
        type: "add",
        requestedTrackCount: null,
        targetTotalTrackCount: null,
        replaceCount: null,
        confidence: "high"
      },
      verifiedRules: {},
      curatorGuidance: { vocalProfile: "female_vocals" },
      routingIntent: {
        routeFamily: "curator",
        allowMutation: true,
        diagnosisOnly: false,
        hypotheticalOnly: false,
        reviewMode: null
      },
      scopeIntent: {
        persistentVerifiedRuleFields: [],
        persistentGuidanceFields: ["vocalProfile"],
        requestScopedVerifiedRuleFields: [],
        requestScopedGuidanceFields: []
      },
      notes: []
    };

    expect(scopeAdditiveVocalProfileIntent(intent, "female vocalists only from here on")).toBe(intent);
  });

  it("recognizes target totals and replacement counts", () => {
    expect(parseTargetTotalTrackCount("round this out to 20 total tracks")).toBe(20);
    expect(parseTargetTotalTrackCount("bring it up to 200 tracks")).toBe(20);
    expect(replacementCountForVersionCleanup("remove duplicate versions and add a few replacements", 2)).toBe(3);
    expect(replacementCountForVersionCleanup("remove duplicate versions and queue a few warmer replacements", 2)).toBe(3);
    expect(isReplacementIntent("replace the weakest 3 tracks")).toBe(true);
    expect(parseReplacementCount("replace the weakest 3 tracks")).toBe(3);
  });

  it("identifies removal, addition, and constraint-pruning requests", () => {
    expect(isRemovalIntent("remove tracks that bring down the mood")).toBe(true);
    expect(isAdditionIntent("fill this out to 20 total")).toBe(true);
    expect(isPlaylistShapeIntent("reorder this so repeated artists are separated, then cut the extras")).toBe(true);
    expect(shouldPruneExistingForConstraints("make it so only one track per artist exists", { maxTracksPerArtist: 1 })).toBe(true);
    expect(shouldPruneExistingForConstraints("let's keep these songs under 8 minutes", { maxTrackDurationMs: 480000 })).toBe(true);
    expect(shouldPruneExistingForConstraints("add 4 pop songs under 3 minutes", { maxTrackDurationMs: 180000 })).toBe(false);
  });
});
