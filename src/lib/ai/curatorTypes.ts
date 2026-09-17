import type { CuratorProgressEvent } from "@/types/playlist";
import type { ConversationContext, PrecomputedOperatorPlan } from "@/types/playlist";

export type { CuratorProgressEvent };

export type CuratorRunOptions = {
  conversationContext?: ConversationContext;
  onProgress?: (event: CuratorProgressEvent) => void;
  // See PrecomputedOperatorPlanSchema: reused by handlePlaylistMessage when its fingerprint matches.
  precomputedPlan?: PrecomputedOperatorPlan;
  requestId?: string;
  signal?: AbortSignal;
};
