type ReviewRoutingPayload = Record<string, unknown>;

function debugFlagFromEnv(): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env.NEXT_PUBLIC_CUTLIST_DEBUG_REVIEW_ROUTING ?? process.env.CUTLIST_DEBUG_REVIEW_ROUTING;
}

export function reviewRoutingDebugEnabled(): boolean {
  const envFlag = debugFlagFromEnv();
  if (envFlag === "1") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem("CUTLIST_DEBUG_REVIEW_ROUTING") === "1";
  } catch {
    return false;
  }
}

export function emitReviewRoutingTrace(stage: string, payload: ReviewRoutingPayload): void {
  if (!reviewRoutingDebugEnabled()) {
    return;
  }

  const line = JSON.stringify({
    channel: "cutlist-review-routing",
    stage,
    ...payload
  });

  if (typeof window === "undefined") {
    console.error(line);
    return;
  }

  console.info(line);
}

export function summarizeReviewSuggestions(
  suggestions: Array<{ type: string; applicationMode?: string | null }>
): string[] {
  return suggestions.map((suggestion) => `${suggestion.type}:${suggestion.applicationMode ?? "unknown"}`);
}
