/**
 * Rate Limiting Framework
 *
 * Redis-backed rate limiting with sliding window and token bucket algorithms.
 * Supports limiting by IP, user, API key, organization, or route.
 *
 * No feature communicates directly with Redis — all go through this interface.
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';

export type RateLimitDimension = 'ip' | 'user' | 'apiKey' | 'organization' | 'route';
export type RateLimitAlgorithm = 'sliding-window' | 'token-bucket';

export interface RateLimitOptions {
  dimension: RateLimitDimension;
  algorithm: RateLimitAlgorithm;
  /** Maximum requests in the window (sliding-window) or bucket capacity (token-bucket). */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /** Refill rate per second (token-bucket only). */
  refillRatePerSecond?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Check and consume a rate limit token. */
  limit(identifier: string, options: RateLimitOptions): Promise<RateLimitResult>;
  /** Check without consuming. */
  check(identifier: string, options: RateLimitOptions): Promise<RateLimitResult>;
}

/** In-memory sliding window rate limiter. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, number[]>(); // key → timestamps
  private readonly buckets = new Map<string, { tokens: number; lastRefill: number }>();

  async limit(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const key = this.key(identifier, options);

    if (options.algorithm === 'token-bucket') {
      return this.tokenBucket(key, options, true);
    }
    return this.slidingWindow(key, options, true);
  }

  async check(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const key = this.key(identifier, options);
    if (options.algorithm === 'token-bucket') {
      return this.tokenBucket(key, options, false);
    }
    return this.slidingWindow(key, options, false);
  }

  private slidingWindow(key: string, options: RateLimitOptions, consume: boolean): RateLimitResult {
    const now = Date.now();
    const windowStart = now - options.windowSeconds * 1000;
    let timestamps = this.windows.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    const count = timestamps.length;
    const allowed = count < options.limit;

    if (consume && allowed) {
      timestamps.push(now);
      this.windows.set(key, timestamps);
    }

    const oldestInWindow = timestamps[0] ?? now;
    const resetAt = oldestInWindow + options.windowSeconds * 1000;

    return {
      allowed,
      remaining: Math.max(0, options.limit - (consume && allowed ? count + 1 : count)),
      resetAt,
      retryAfterSeconds: allowed ? 0 : Math.ceil((resetAt - now) / 1000),
    };
  }

  private tokenBucket(key: string, options: RateLimitOptions, consume: boolean): RateLimitResult {
    const now = Date.now();
    const refillRate = options.refillRatePerSecond ?? options.limit / options.windowSeconds;
    let bucket = this.buckets.get(key) ?? { tokens: options.limit, lastRefill: now };

    // Refill tokens
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(options.limit, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    if (consume && allowed) {
      bucket.tokens -= 1;
    }
    this.buckets.set(key, bucket);

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + Math.ceil((1 - bucket.tokens) / refillRate) * 1000,
      retryAfterSeconds: allowed ? 0 : Math.ceil((1 - bucket.tokens) / refillRate),
    };
  }

  private key(identifier: string, options: RateLimitOptions): string {
    return `${options.dimension}:${options.algorithm}:${identifier}`;
  }
}

/** Redis-backed rate limiter. */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: RedisClient) {}

  async limit(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const key = `ratelimit:${options.dimension}:${identifier}`;

    if (options.algorithm === 'token-bucket') {
      return this.tokenBucket(key, options, true);
    }
    return this.slidingWindow(key, options, true);
  }

  async check(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const key = `ratelimit:${options.dimension}:${identifier}`;
    if (options.algorithm === 'token-bucket') {
      return this.tokenBucket(key, options, false);
    }
    return this.slidingWindow(key, options, false);
  }

  private async slidingWindow(key: string, options: RateLimitOptions, consume: boolean): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - options.windowSeconds * 1000;

    // Get current window
    const raw = await this.redis.get(key);
    const timestamps: number[] = raw ? JSON.parse(raw) : [];
    const valid = timestamps.filter((t) => t > windowStart);

    const count = valid.length;
    const allowed = count < options.limit;

    if (consume && allowed) {
      valid.push(now);
      await this.redis.set(key, JSON.stringify(valid), options.windowSeconds);
    }

    const oldestInWindow = valid[0] ?? now;
    const resetAt = oldestInWindow + options.windowSeconds * 1000;

    return {
      allowed,
      remaining: Math.max(0, options.limit - (consume && allowed ? count + 1 : count)),
      resetAt,
      retryAfterSeconds: allowed ? 0 : Math.ceil((resetAt - now) / 1000),
    };
  }

  private async tokenBucket(key: string, options: RateLimitOptions, consume: boolean): Promise<RateLimitResult> {
    const now = Date.now();
    const refillRate = options.refillRatePerSecond ?? options.limit / options.windowSeconds;
    const bucketKey = `${key}:bucket`;
    const raw = await this.redis.get(bucketKey);
    const bucket = raw ? JSON.parse(raw) : { tokens: options.limit, lastRefill: now };

    // Refill
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(options.limit, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    if (consume && allowed) {
      bucket.tokens -= 1;
    }
    await this.redis.set(bucketKey, JSON.stringify(bucket), 3600);

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + Math.ceil((1 - bucket.tokens) / refillRate) * 1000,
      retryAfterSeconds: allowed ? 0 : Math.ceil((1 - bucket.tokens) / refillRate),
    };
  }
}

/** Pre-configured rate limit policies. */
export const RATE_LIMIT_POLICIES = {
  /** General API: 100 req / 15 sec per IP. */
  api: (identifier: string): RateLimitOptions => ({
    dimension: 'ip',
    algorithm: 'sliding-window',
    limit: 100,
    windowSeconds: 15,
  }),
  /** Auth: 5 attempts / 60 sec per IP. */
  auth: (): RateLimitOptions => ({
    dimension: 'ip',
    algorithm: 'sliding-window',
    limit: 5,
    windowSeconds: 60,
  }),
  /** Commands: 60 / 60 sec per user. */
  commands: (): RateLimitOptions => ({
    dimension: 'user',
    algorithm: 'sliding-window',
    limit: 60,
    windowSeconds: 60,
  }),
  /** Queries: 300 / 60 sec per user. */
  queries: (): RateLimitOptions => ({
    dimension: 'user',
    algorithm: 'sliding-window',
    limit: 300,
    windowSeconds: 60,
  }),
  /** AI: 20 / 60 sec per user. */
  ai: (): RateLimitOptions => ({
    dimension: 'user',
    algorithm: 'token-bucket',
    limit: 20,
    windowSeconds: 60,
    refillRatePerSecond: 20 / 60,
  }),
} as const;
