import { describe, expect, it } from "vitest";
import { createMinIntervalThrottle } from "@/lib/music/providers/requestThrottle";

function fakeClock(start = 0) {
  let current = start;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      current += ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
    sleeps
  };
}

describe("createMinIntervalThrottle", () => {
  it("does not delay the first request", async () => {
    const clock = fakeClock(1000);
    const throttle = createMinIntervalThrottle(1000, clock);

    await throttle.wait();

    expect(clock.sleeps).toEqual([]);
  });

  it("delays a request that arrives inside the minimum interval by the remainder", async () => {
    const clock = fakeClock(1000);
    const throttle = createMinIntervalThrottle(1000, clock);

    await throttle.wait();
    clock.advance(300);
    await throttle.wait();

    expect(clock.sleeps).toEqual([700]);
  });

  it("does not delay a request that arrives after the interval has elapsed", async () => {
    const clock = fakeClock(1000);
    const throttle = createMinIntervalThrottle(1000, clock);

    await throttle.wait();
    clock.advance(1500);
    await throttle.wait();

    expect(clock.sleeps).toEqual([]);
  });

  it("queues concurrent callers so each waits for the one before it", async () => {
    const clock = fakeClock(1000);
    const throttle = createMinIntervalThrottle(1000, clock);

    await Promise.all([throttle.wait(), throttle.wait(), throttle.wait()]);

    expect(clock.sleeps).toEqual([1000, 1000]);
  });
});
