import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredLlmRequestsPerMinute,
  resetLlmRateLimitStateForTests,
  waitForLlmRequestSlot
} from "@/lib/ai/llmRateLimit";

describe("LLM rate limit helper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T12:00:00.000Z"));
    resetLlmRateLimitStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetLlmRateLimitStateForTests();
  });

  it("reads the test-specific RPM override", () => {
    vi.stubEnv("LLM_TEST_REQUESTS_PER_MINUTE", "15");

    expect(getConfiguredLlmRequestsPerMinute()).toBe(15);
  });

  it("defaults to 15 RPM when no override is configured", () => {
    expect(getConfiguredLlmRequestsPerMinute()).toBe(15);
  });

  it("waits once the configured minute window is full", async () => {
    vi.stubEnv("LLM_TEST_REQUESTS_PER_MINUTE", "2");

    await waitForLlmRequestSlot("gemini");
    await waitForLlmRequestSlot("gemini");

    const thirdRequest = waitForLlmRequestSlot("gemini");
    await vi.advanceTimersByTimeAsync(59_000);
    let settled = false;
    void thirdRequest.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await thirdRequest;
    expect(settled).toBe(true);
  });
});
