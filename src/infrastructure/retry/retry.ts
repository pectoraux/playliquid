/**
 * Retry Framework
 *
 * Reusable retry policies with backoff strategies. Combined with circuit
 * breakers to protect against cascading failures.
 *
 * Policies:
 *   - Immediate: retry immediately
 *   - Linear: delay increases linearly
 *   - Exponential: delay doubles each retry
 *   - Exponential + Jitter: exponential with random jitter (recommended)
 */

import { logger } from '@/shared/logging';

export type BackoffStrategy = 'immediate' | 'linear' | 'exponential' | 'exponential-jitter';

export interface RetryOptions {
  maxRetries: number;
  strategy: BackoffStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn?: (error: unknown) => boolean;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  strategy: 'exponential-jitter',
  baseDelayMs: 100,
  maxDelayMs: 5000,
};

/** Calculate delay for a given attempt using the strategy. */
export function calculateDelay(attempt: number, options: RetryOptions): number {
  switch (options.strategy) {
    case 'immediate':
      return 0;
    case 'linear':
      return Math.min(options.baseDelayMs * attempt, options.maxDelayMs);
    case 'exponential':
      return Math.min(options.baseDelayMs * Math.pow(2, attempt - 1), options.maxDelayMs);
    case 'exponential-jitter': {
      const exp = Math.min(options.baseDelayMs * Math.pow(2, attempt - 1), options.maxDelayMs);
      const jitter = Math.random() * exp * 0.3;
      return Math.min(exp + jitter, options.maxDelayMs);
    }
    default:
      return options.baseDelayMs;
  }
}

/** Execute a function with retry logic. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt > opts.maxRetries) break;
      if (opts.retryOn && !opts.retryOn(e)) break;

      const delay = calculateDelay(attempt, opts);
      logger.system().warn('Retrying after error', {
        attempt,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: (e as Error)?.message,
      });

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/** Retry policy builder for fluent configuration. */
export class RetryPolicy {
  private options: RetryOptions = { ...DEFAULT_RETRY };

  maxRetries(n: number): this {
    this.options.maxRetries = n;
    return this;
  }

  strategy(s: BackoffStrategy): this {
    this.options.strategy = s;
    return this;
  }

  baseDelay(ms: number): this {
    this.options.baseDelayMs = ms;
    return this;
  }

  maxDelay(ms: number): this {
    this.options.maxDelayMs = ms;
    return this;
  }

  retryOn(predicate: (error: unknown) => boolean): this {
    this.options.retryOn = predicate;
    return this;
  }

  build(): RetryOptions {
    return { ...this.options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, this.options);
  }
}
