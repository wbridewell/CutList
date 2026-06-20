"use client";

import type { ChatMessage } from "@/lib/playlist/collaboration";

type Props = {
  compact?: boolean;
  limit?: number;
  messages: ChatMessage[];
};

export function ChatLog({ compact = false, limit, messages }: Props) {
  const visibleMessages = limit == null ? messages : messages.slice(-limit);

  return (
    <div className={`section chat-history${compact ? " compact-chat-history" : ""}`}>
      <h2>{compact ? "Latest response" : "Curator conversation"}</h2>
      <div className="chat-log" aria-live="polite">
        {visibleMessages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.content}</div>)}
      </div>
    </div>
  );
}
