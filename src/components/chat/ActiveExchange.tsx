"use client";

import type { ChatMessage } from "@/lib/playlist/collaboration";

type Props = {
  busy?: boolean;
  messages: ChatMessage[];
  progressStatus?: string | null;
};

type Exchange = {
  assistantMessage: ChatMessage | null;
  userMessage: ChatMessage | null;
};

export function latestActiveExchange(messages: ChatMessage[]): Exchange {
  const assistantIndex = messages.map((message) => message.role).lastIndexOf("assistant");
  const assistantMessage = assistantIndex >= 0 ? messages[assistantIndex] : null;
  const searchEnd = assistantIndex >= 0 ? assistantIndex : messages.length;
  const userIndex = messages.slice(0, searchEnd).map((message) => message.role).lastIndexOf("user");
  return {
    assistantMessage,
    userMessage: userIndex >= 0 ? messages[userIndex] : null
  };
}

export function ActiveExchange({ busy = false, messages, progressStatus }: Props) {
  const { assistantMessage, userMessage } = latestActiveExchange(messages);

  return (
    <section className="section active-exchange" aria-label="Active curator exchange">
      <div className="active-exchange-header">
        <div>
          <p className="eyebrow">Active exchange</p>
          <h2>Curator thread</h2>
        </div>
        {busy ? <span className="exchange-status">Working</span> : null}
      </div>
      <div className="active-exchange-log" aria-live="polite">
        {userMessage ? <div className="exchange-bubble user">{userMessage.content}</div> : null}
        {progressStatus ? (
          <div className="exchange-bubble progress">
            <span className="progress-dot" aria-hidden="true" />
            {progressStatus}
          </div>
        ) : null}
        {assistantMessage ? <div className="exchange-bubble assistant">{assistantMessage.content}</div> : null}
      </div>
    </section>
  );
}
