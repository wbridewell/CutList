import type { CuratorProgressEvent } from "@/types/playlist";
import type { ConversationContext } from "@/types/playlist";

export type { CuratorProgressEvent };

export type CuratorRunOptions = {
  conversationContext?: ConversationContext;
  onProgress?: (event: CuratorProgressEvent) => void;
  signal?: AbortSignal;
};
