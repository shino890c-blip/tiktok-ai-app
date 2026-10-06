import { isRetryable } from "./errors.js";

export interface BackoffOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs = 5 * 60_000, factor = 2): number {
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, Math.max(0, attempt - 1)));
}

/**
 * Exponential backoff. Bounded by `retries` — never retries forever.
 * attempt 1 is the first call; at most retries+1 calls are made.
 */
export async function withBackoff<T>(fn: (attempt: number) => Promise<T>, opts: BackoffOptions): Promise<T> {
  const shouldRetry = opts.shouldRetry ?? ((e) => isRetryable(e));
  const doSleep = opts.sleep ?? sleep;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt > opts.retries || !shouldRetry(err, attempt)) throw err;
      const delay = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.factor);
      opts.onRetry?.(err, attempt, delay);
      await doSleep(delay);
    }
  }
}

/** Rejects with the given error factory if `promise` does not settle in time. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
