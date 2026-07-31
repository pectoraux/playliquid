/**
 * In-memory cache with LRU eviction and TTL expiry.
 *
 * Used by the QueryCacheMiddleware and any read-side service that benefits
 * from short-lived caching. Not distributed — in a multi-instance deployment
 * this would be replaced by Redis without changing the interface.
 */

import type { Cache } from '@/application/ports';

export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class InMemoryCache implements Cache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Move to end (most recently used) for LRU.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (this.store.size >= this.maxSize) {
      // Evict the oldest (first) entry.
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
