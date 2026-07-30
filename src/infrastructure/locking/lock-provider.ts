/**
 * Distributed Lock Manager
 *
 * Provides mutually-exclusive access to shared resources across multiple
 * application instances. Uses Redis SET NX with TTL for production, with
 * an in-memory fallback for single-instance deployments.
 *
 * Use cases: leaderboard rebuilds, payouts, settlement, scheduled jobs,
 * projection replay, any operation that must not run concurrently.
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { nonce } from '@/shared/ids';
import { logger } from '@/shared/logging';

export interface Lock {
  readonly key: string;
  readonly token: string;
  readonly acquiredAt: number;
  readonly ttlSeconds: number;
}

export interface LockProvider {
  /** Try to acquire a lock. Returns null if already held. */
  acquire(key: string, ttlSeconds: number): Promise<Lock | null>;
  /** Renew an existing lock. */
  renew(lock: Lock, ttlSeconds: number): Promise<boolean>;
  /** Release a lock (only if we hold it). */
  release(lock: Lock): Promise<boolean>;
  /** Execute a function while holding a lock. Auto-renews. */
  executeWithLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}

/** In-memory lock provider (single-instance only). */
export class MemoryLockProvider implements LockProvider {
  private readonly locks = new Map<string, { token: string; expiresAt: number }>();
  private readonly renewals = new Map<string, NodeJS.Timeout>();

  async acquire(key: string, ttlSeconds: number): Promise<Lock | null> {
    const existing = this.locks.get(key);
    if (existing && Date.now() < existing.expiresAt) {
      return null;
    }
    const token = nonce(16);
    const lock: Lock = {
      key,
      token,
      acquiredAt: Date.now(),
      ttlSeconds,
    };
    this.locks.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
    return lock;
  }

  async renew(lock: Lock, ttlSeconds: number): Promise<boolean> {
    const existing = this.locks.get(lock.key);
    if (!existing || existing.token !== lock.token) return false;
    if (Date.now() >= existing.expiresAt) return false;
    existing.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }

  async release(lock: Lock): Promise<boolean> {
    const existing = this.locks.get(lock.key);
    if (!existing || existing.token !== lock.token) return false;
    this.locks.delete(lock.key);
    const renewal = this.renewals.get(lock.key);
    if (renewal) {
      clearInterval(renewal);
      this.renewals.delete(lock.key);
    }
    return true;
  }

  async executeWithLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const lock = await this.acquire(key, ttlSeconds);
    if (!lock) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    // Auto-renew at 1/3 of TTL
    const renewalInterval = Math.max(1000, (ttlSeconds * 1000) / 3);
    const renewal = setInterval(() => {
      this.renew(lock, ttlSeconds).catch(() => {});
    }, renewalInterval);
    this.renewals.set(key, renewal);

    try {
      return await fn();
    } finally {
      clearInterval(renewal);
      this.renewals.delete(key);
      await this.release(lock);
    }
  }
}

/** Redis-backed distributed lock provider. */
export class RedisLockProvider implements LockProvider {
  constructor(private readonly redis: RedisClient) {}

  async acquire(key: string, ttlSeconds: number): Promise<Lock | null> {
    const token = nonce(16);
    const lockKey = `lock:${key}`;
    const acquired = await this.redis.setNX(lockKey, token, ttlSeconds);
    if (!acquired) return null;
    return { key, token, acquiredAt: Date.now(), ttlSeconds };
  }

  async renew(lock: Lock, ttlSeconds: number): Promise<boolean> {
    // Atomic check-and-set via a Lua-like pattern (simulated with get/set)
    const lockKey = `lock:${lock.key}`;
    const current = await this.redis.get(lockKey);
    if (current !== lock.token) return false;
    // Re-set with new TTL (in production this would be a Lua script for atomicity)
    await this.redis.set(lockKey, lock.token, ttlSeconds);
    return true;
  }

  async release(lock: Lock): Promise<boolean> {
    const lockKey = `lock:${lock.key}`;
    const current = await this.redis.get(lockKey);
    if (current !== lock.token) return false;
    await this.redis.del(lockKey);
    return true;
  }

  async executeWithLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const lock = await this.acquire(key, ttlSeconds);
    if (!lock) {
      throw new Error(`Failed to acquire distributed lock: ${key}`);
    }

    // Auto-renew
    const renewalInterval = Math.max(1000, (ttlSeconds * 1000) / 3);
    const renewal = setInterval(() => {
      this.renew(lock, ttlSeconds).catch(() => {});
    }, renewalInterval);

    try {
      return await fn();
    } finally {
      clearInterval(renewal);
      await this.release(lock);
    }
  }
}
