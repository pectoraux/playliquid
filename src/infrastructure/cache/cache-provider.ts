/**
 * Cache Framework — provider abstraction with tag-based invalidation.
 *
 * Application code depends on the CacheProvider interface. The DI container
 * selects the implementation (MemoryCacheProvider or RedisCacheProvider).
 * Switching is a config change — no business logic changes.
 *
 * Features:
 *   - get / set / delete / exists / increment / expire
 *   - remember() — read-through caching with a loader function
 *   - invalidate() / invalidateByTag() — tag-based bulk invalidation
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { logger } from '@/shared/logging';

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  increment(key: string, by?: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, tags?: string[]): Promise<T>;
  invalidate(key: string): Promise<void>;
  invalidateByTag(tag: string): Promise<void>;
  invalidateByTags(tags: string[]): Promise<void>;
  flush(): Promise<void>;
  readonly backend: string;
}

/** In-memory cache provider with LRU eviction and tag tracking. */
export class MemoryCacheProvider implements CacheProvider {
  readonly backend = 'memory';
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly tagIndex = new Map<string, Set<string>>(); // tag → keys
  private readonly keyTags = new Map<string, Set<string>>(); // key → tags
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      await this.delete(key);
      return null;
    }
    // LRU: move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void> {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) await this.delete(firstKey);
    }
    // Clean up old tags for this key
    const oldTags = this.keyTags.get(key);
    if (oldTags) {
      for (const tag of oldTags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (tags && tags.length > 0) {
      const tagSet = new Set(tags);
      this.keyTags.set(key, tagSet);
      for (const tag of tags) {
        let keys = this.tagIndex.get(tag);
        if (!keys) {
          keys = new Set();
          this.tagIndex.set(tag, keys);
        }
        keys.add(key);
      }
    } else {
      this.keyTags.delete(key);
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    const tags = this.keyTags.get(key);
    if (tags) {
      for (const tag of tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
      this.keyTags.delete(key);
    }
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      await this.delete(key);
      return false;
    }
    return true;
  }

  async increment(key: string, by = 1): Promise<number> {
    const entry = this.store.get(key);
    const current = entry ? (entry.value as number) : 0;
    const next = current + by;
    const expiresAt = entry ? entry.expiresAt : Date.now() + 3600 * 1000;
    this.store.set(key, { value: next, expiresAt });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, tags?: string[]): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds, tags);
    return value;
  }

  async invalidate(key: string): Promise<void> {
    await this.delete(key);
  }

  async invalidateByTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    if (keys) {
      for (const key of keys) {
        this.store.delete(key);
        this.keyTags.delete(key);
      }
      this.tagIndex.delete(tag);
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.invalidateByTag(tag);
    }
  }

  async flush(): Promise<void> {
    this.store.clear();
    this.tagIndex.clear();
    this.keyTags.clear();
  }
}

/** Redis-backed cache provider. */
export class RedisCacheProvider implements CacheProvider {
  readonly backend = 'redis';
  private readonly tagKeyPrefix = '__tag:';
  private readonly keyTagsPrefix = '__keytags:';

  constructor(private readonly redis: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.redis.set(key, serialized, ttlSeconds);
    if (tags && tags.length > 0) {
      // Store key→tags mapping and add key to each tag set
      await this.redis.set(this.keyTagsPrefix + key, JSON.stringify(tags), ttlSeconds);
      for (const tag of tags) {
        // Use a simple set-like structure via a list key
        const tagMembersKey = this.tagKeyPrefix + tag;
        const existing = await this.redis.get(tagMembersKey);
        const members = existing ? (JSON.parse(existing) as string[]) : [];
        if (!members.includes(key)) {
          members.push(key);
          await this.redis.set(tagMembersKey, JSON.stringify(members), ttlSeconds);
        }
      }
    }
  }

  async delete(key: string): Promise<void> {
    // Clean up tag memberships
    const tagsRaw = await this.redis.get(this.keyTagsPrefix + key);
    if (tagsRaw) {
      const tags = JSON.parse(tagsRaw) as string[];
      for (const tag of tags) {
        const tagMembersKey = this.tagKeyPrefix + tag;
        const existing = await this.redis.get(tagMembersKey);
        if (existing) {
          const members = (JSON.parse(existing) as string[]).filter((k) => k !== key);
          if (members.length > 0) {
            await this.redis.set(tagMembersKey, JSON.stringify(members), 86400);
          } else {
            await this.redis.del(tagMembersKey);
          }
        }
      }
      await this.redis.del(this.keyTagsPrefix + key);
    }
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.redis.exists(key);
  }

  async increment(key: string, by = 1): Promise<number> {
    let result = 0;
    for (let i = 0; i < by; i++) {
      result = await this.redis.incr(key);
    }
    return result;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, tags?: string[]): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds, tags);
    return value;
  }

  async invalidate(key: string): Promise<void> {
    await this.delete(key);
  }

  async invalidateByTag(tag: string): Promise<void> {
    const tagMembersKey = this.tagKeyPrefix + tag;
    const existing = await this.redis.get(tagMembersKey);
    if (existing) {
      const keys = JSON.parse(existing) as string[];
      for (const key of keys) {
        await this.redis.del(key);
        await this.redis.del(this.keyTagsPrefix + key);
      }
      await this.redis.del(tagMembersKey);
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.invalidateByTag(tag);
    }
  }

  async flush(): Promise<void> {
    await this.redis.flush();
  }
}
