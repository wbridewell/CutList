import "server-only";

const windowMs = 60_000;
const defaultRequestsPerMinute = 15;

type RateLimitState = {
  timestamps: number[];
};

const state: RateLimitState = {
  timestamps: []
};

function configuredRequestsPerMinute(): number | null {
  const raw = process.env.LLM_TEST_REQUESTS_PER_MINUTE ?? process.env.LLM_REQUESTS_PER_MINUTE;
  if (!raw) {
    return defaultRequestsPerMinute;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRequestsPerMinute;
}

function shouldReportProgress(): boolean {
  return process.env.LLM_RATE_LIMIT_PROGRESS === "1";
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  return remainderSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainderSeconds}s`;
}

function pruneTimestamps(now: number): void {
  state.timestamps = state.timestamps.filter((timestamp) => now - timestamp < windowMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getConfiguredLlmRequestsPerMinute(): number | null {
  return configuredRequestsPerMinute();
}

export async function waitForLlmRequestSlot(label = "LLM"): Promise<void> {
  const limit = configuredRequestsPerMinute();
  if (!limit) {
    return;
  }

  while (true) {
    const now = Date.now();
    pruneTimestamps(now);

    if (state.timestamps.length < limit) {
      state.timestamps.push(now);
      return;
    }

    const waitMs = Math.max(state.timestamps[0]! + windowMs - now, 0);
    if (shouldReportProgress() && waitMs > 0) {
      console.info(`[llm-rate-limit] ${label} waiting ${formatDuration(waitMs)} to stay within ${limit} requests/minute.`);
    }
    await sleep(waitMs);
  }
}

export function resetLlmRateLimitStateForTests(): void {
  state.timestamps = [];
}
