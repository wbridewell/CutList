export type RequestThrottle = {
  wait(): Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Serializes callers so that consecutive requests are at least `minIntervalMs` apart.
// Concurrent callers queue behind one another rather than all measuring from the same
// last-request time, which is what a per-second provider limit actually needs.
export function createMinIntervalThrottle(
  minIntervalMs: number,
  dependencies: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}
): RequestThrottle {
  const now = dependencies.now ?? (() => Date.now());
  const sleep = dependencies.sleep ?? defaultSleep;
  let nextAllowedAt = 0;
  let chain: Promise<void> = Promise.resolve();

  return {
    wait() {
      const turn = chain.then(async () => {
        const delay = nextAllowedAt - now();
        if (delay > 0) {
          await sleep(delay);
        }
        nextAllowedAt = now() + minIntervalMs;
      });
      chain = turn.catch(() => undefined);
      return turn;
    }
  };
}
