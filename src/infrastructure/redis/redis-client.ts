/**
 * Redis Platform Client
 *
 * Provides a unified Redis client with graceful fallback to an in-memory
 * implementation when Redis is unavailable. This allows the platform to
 * run in development (no Redis) and production (with Redis) without code
 * changes — the configuration determines which backend is used.
 *
 * All Redis-based services (cache, locks, rate limiter, pub/sub, sessions)
 * depend on this client through the RedisClient interface.
 */

import { getConfig, getEnvVar } from '@/shared/config';
import { logger } from '@/shared/logging';

/** Redis-compatible client interface. */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  flush(): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  ping(): Promise<boolean>;
  readonly backend: 'redis' | 'memory';
}

/** In-memory Redis-compatible implementation (fallback / development). */
export class InMemoryRedisClient implements RedisClient {
  readonly backend = 'memory' as const;
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly subscribers = new Map<string, Set<(message: string) => void>>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt((await this.get(key)) ?? '0', 10);
    const next = current + 1;
    const entry = this.store.get(key);
    await this.set(key, String(next), entry?.expiresAt ? Math.ceil((entry.expiresAt - Date.now()) / 1000) : undefined);
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) result.push(key);
    }
    return result;
  }

  async flush(): Promise<void> {
    this.store.clear();
  }

  async publish(channel: string, message: string): Promise<void> {
    const handlers = this.subscribers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch (e) {
          logger.system().error('Pub/sub handler failed', { channel }, e);
        }
      }
    }
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    let set = this.subscribers.get(channel);
    if (!set) {
      set = new Set();
      this.subscribers.set(channel, set);
    }
    set.add(handler);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscribers.delete(channel);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

/** Redis-backed implementation using ioredis (loaded dynamically). */
export class RedisBackendClient implements RedisClient {
  readonly backend = 'redis' as const;
  private client: any = null;
  private subscriber: any = null;
  private readonly subscribers = new Map<string, Set<(message: string) => void>>();
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;
    try {
      const IORedis = (await import(/* webpackIgnore: true */ 'ioredis')).default;
      this.client = new IORedis(this.url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => Math.min(times * 200, 2000),
      });
      this.subscriber = new IORedis(this.url, { maxRetriesPerRequest: null });
      this.subscriber.on('message', (channel: string, message: string) => {
        const handlers = this.subscribers.get(channel);
        if (handlers) {
          for (const handler of handlers) handler(message);
        }
      });
      logger.system().info('Redis client connected', { url: this.url.replace(/:[^@]*@/, ':***@') });
      return this.client;
    } catch (e) {
      logger.system().warn('Redis module not available, falling back', { error: (e as Error).message });
      throw e;
    }
  }

  async get(key: string): Promise<string | null> {
    const c = await this.ensureClient();
    return c.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const c = await this.ensureClient();
    if (ttlSeconds) {
      await c.set(key, value, 'EX', ttlSeconds);
    } else {
      await c.set(key, value);
    }
  }

  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    const c = await this.ensureClient();
    if (ttlSeconds) {
      const result = await c.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
    const result = await c.setnx(key, value);
    return result === 1;
  }

  async del(key: string): Promise<number> {
    const c = await this.ensureClient();
    return c.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const c = await this.ensureClient();
    const count = await c.exists(key);
    return count === 1;
  }

  async incr(key: string): Promise<number> {
    const c = await this.ensureClient();
    return c.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const c = await this.ensureClient();
    await c.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    const c = await this.ensureClient();
    return c.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const c = await this.ensureClient();
    return c.keys(pattern);
  }

  async flush(): Promise<void> {
    const c = await this.ensureClient();
    await c.flushdb();
  }

  async publish(channel: string, message: string): Promise<void> {
    const c = await this.ensureClient();
    await c.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    const sub = await this.ensureClient();
    let set = this.subscribers.get(channel);
    if (!set) {
      set = new Set();
      this.subscribers.set(channel, set);
      await this.subscriber.subscribe(channel);
    }
    set.add(handler);
  }

  async unsubscribe(channel: string): Promise<void> {
    const sub = await this.ensureClient();
    this.subscribers.delete(channel);
    await this.subscriber.unsubscribe(channel);
  }

  async ping(): Promise<boolean> {
    try {
      const c = await this.ensureClient();
      const result = await c.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

let cachedClient: RedisClient | null = null;

/** Get the singleton Redis client (Redis if configured, else in-memory). */
export async function getRedisClient(): Promise<RedisClient> {
  if (cachedClient) return cachedClient;

  const config = getConfig();
  const redisUrl = getEnvVar('REDIS_URL');

  if (redisUrl) {
    try {
      const client = new RedisBackendClient(redisUrl);
      const ok = await client.ping();
      if (ok) {
        cachedClient = client;
        logger.system().info('Redis platform initialized', { backend: 'redis' });
        return client;
      }
    } catch (e) {
      logger.system().warn('Redis unavailable, falling back to in-memory', {
        error: (e as Error).message,
      });
    }
  }

  cachedClient = new InMemoryRedisClient();
  logger.system().info('Redis platform initialized', { backend: 'memory' });
  return cachedClient;
}

/** Reset the cached client (for testing / hot reload). */
export function resetRedisClient(): void {
  cachedClient = null;
}
