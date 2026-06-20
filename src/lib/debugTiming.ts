type TimingFieldValue = boolean | number | string | undefined;

export function debugTimingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CUTLIST_DEBUG_TIMING === "1";
}

function currentTimingId(env: NodeJS.ProcessEnv = process.env): string {
  return env.CUTLIST_TIMING_ID?.trim() || "unknown";
}

function formatTimingFields(fields: Record<string, TimingFieldValue>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

export function logTiming(event: string, startedAt: number, fields: Record<string, TimingFieldValue> = {}): void {
  if (!debugTimingEnabled()) {
    return;
  }
  const ms = Math.round(performance.now() - startedAt);
  const detail = formatTimingFields({
    id: currentTimingId(),
    duration_ms: ms,
    ...fields
  });
  console.error(`[cutlist:timing] ${event}${detail ? ` ${detail}` : ""}`);
}

export async function timeAsync<T>(
  event: string,
  operation: () => T | Promise<T>,
  fields: Record<string, TimingFieldValue> = {}
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    logTiming(event, startedAt, fields);
  }
}
