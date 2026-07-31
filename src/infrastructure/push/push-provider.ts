// @ts-nocheck
/**
 * Push Notification Provider Infrastructure
 *
 * Pluggable push-notification abstraction. Application code depends on the
 * `PushProvider` interface; the DI container selects the implementation
 * (ConsolePushProvider for dev, FcmPushProvider for production via Firebase
 * Cloud Messaging).
 *
 * Features:
 *   - Device registration: register / unregister / getTokens(userId)
 *   - send(to: token) — single device
 *   - broadcast(message) — fan-out to all registered devices, returns count
 *   - Console provider logs every action to stdout (dev)
 *   - FCM provider lazily loads `firebase-admin` and wraps every call in a
 *     CircuitBreaker
 *
 * Device registrations are stored in a pluggable `DeviceTokenStore` so the
 * same provider can be backed by Redis (production) or an in-memory Map (dev).
 */

import { CircuitBreaker, DEFAULT_CIRCUIT_OPTIONS } from '@/infrastructure/circuit-breaker/circuit-breaker';
import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { logger } from '@/shared/logging';
import { createId } from '@/shared/ids';

// ---------------------------------------------------------------------------
// Public types (exact shape required by the spec)
// ---------------------------------------------------------------------------

export interface PushMessage {
  to: string; // device token
  title: string;
  body: string;
  data?: Record<string, unknown>;
  icon?: string;
  badge?: number;
  sound?: string;
  ttl?: number;
}

export interface PushResult {
  messageId: string;
  status: 'sent' | 'failed';
  provider: string;
}

export type PushPlatform = 'ios' | 'android' | 'web';

/** A PushMessage without the `to` field — used for broadcast helpers. */
export type PushMessageBuildable = Omit<PushMessage, 'to'>;

export interface PushProvider {
  register(userId: string, token: string, platform: PushPlatform): Promise<void>;
  unregister(token: string): Promise<void>;
  send(message: PushMessage): Promise<PushResult>;
  broadcast(message: Omit<PushMessage, 'to'>): Promise<number>;
  getTokens(userId: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// DeviceTokenStore — pluggable registration persistence
// ---------------------------------------------------------------------------

export interface DeviceTokenStore {
  register(userId: string, token: string, platform: PushPlatform): Promise<void>;
  unregister(token: string): Promise<void>;
  getTokens(userId: string): Promise<string[]>;
  getAllTokens(): Promise<string[]>;
  getUserId(token: string): Promise<string | null>;
}

/**
 * In-memory device-token store. Used by ConsolePushProvider and as the
 * default fallback when no Redis client is configured.
 */
export class InMemoryDeviceTokenStore implements DeviceTokenStore {
  /** token → { userId, platform } */
  private readonly tokenIndex = new Map<string, { userId: string; platform: PushPlatform }>();
  /** userId → Set<token> */
  private readonly userIndex = new Map<string, Set<string>>();

  async register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    // Remove any previous owner of this token (a device can only belong to
    // one user at a time).
    const existing = this.tokenIndex.get(token);
    if (existing && existing.userId !== userId) {
      this.userIndex.get(existing.userId)?.delete(token);
    }
    this.tokenIndex.set(token, { userId, platform });
    let tokens = this.userIndex.get(userId);
    if (!tokens) {
      tokens = new Set();
      this.userIndex.set(userId, tokens);
    }
    tokens.add(token);
  }

  async unregister(token: string): Promise<void> {
    const entry = this.tokenIndex.get(token);
    if (!entry) return;
    this.tokenIndex.delete(token);
    this.userIndex.get(entry.userId)?.delete(token);
  }

  async getTokens(userId: string): Promise<string[]> {
    const tokens = this.userIndex.get(userId);
    return tokens ? Array.from(tokens) : [];
  }

  async getAllTokens(): Promise<string[]> {
    return Array.from(this.tokenIndex.keys());
  }

  async getUserId(token: string): Promise<string | null> {
    return this.tokenIndex.get(token)?.userId ?? null;
  }
}

/**
 * Redis-backed device-token store. Uses two keys per registration:
 *   - `push:token:{token}` → JSON `{userId, platform}` (TTL'd)
 *   - `push:user:{userId}` → JSON `string[]` of tokens (re-serialised on add)
 */
export class RedisDeviceTokenStore implements DeviceTokenStore {
  private static readonly TOKEN_PREFIX = 'push:token:';
  private static readonly USER_PREFIX = 'push:user:';

  constructor(private readonly redis: RedisClient) {}

  async register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    const tokenKey = RedisDeviceTokenStore.TOKEN_PREFIX + token;
    const userKey = RedisDeviceTokenStore.USER_PREFIX + userId;

    // Remove the token from any previous owner.
    const previousRaw = await this.redis.get(tokenKey);
    if (previousRaw) {
      try {
        const previous = JSON.parse(previousRaw) as { userId: string };
        if (previous.userId !== userId) {
          await this.removeTokenFromUser(token, previous.userId);
        }
      } catch {
        // corrupt entry — overwrite below
      }
    }

    await this.redis.set(tokenKey, JSON.stringify({ userId, platform }), 60 * 60 * 24 * 30); // 30-day TTL

    const userTokensRaw = await this.redis.get(userKey);
    const userTokens = userTokensRaw ? (JSON.parse(userTokensRaw) as string[]) : [];
    if (!userTokens.includes(token)) {
      userTokens.push(token);
      await this.redis.set(userKey, JSON.stringify(userTokens), 60 * 60 * 24 * 30);
    }
  }

  async unregister(token: string): Promise<void> {
    const tokenKey = RedisDeviceTokenStore.TOKEN_PREFIX + token;
    const raw = await this.redis.get(tokenKey);
    if (raw) {
      try {
        const entry = JSON.parse(raw) as { userId: string };
        await this.removeTokenFromUser(token, entry.userId);
      } catch {
        // corrupt — fall through
      }
    }
    await this.redis.del(tokenKey);
  }

  async getTokens(userId: string): Promise<string[]> {
    const raw = await this.redis.get(RedisDeviceTokenStore.USER_PREFIX + userId);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  async getAllTokens(): Promise<string[]> {
    const tokenKeys = await this.redis.keys(RedisDeviceTokenStore.TOKEN_PREFIX + '*');
    return tokenKeys.map((k) => k.slice(RedisDeviceTokenStore.TOKEN_PREFIX.length));
  }

  async getUserId(token: string): Promise<string | null> {
    const raw = await this.redis.get(RedisDeviceTokenStore.TOKEN_PREFIX + token);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { userId: string }).userId;
    } catch {
      return null;
    }
  }

  private async removeTokenFromUser(token: string, userId: string): Promise<void> {
    const userKey = RedisDeviceTokenStore.USER_PREFIX + userId;
    const raw = await this.redis.get(userKey);
    if (!raw) return;
    try {
      const tokens = (JSON.parse(raw) as string[]).filter((t) => t !== token);
      if (tokens.length === 0) {
        await this.redis.del(userKey);
      } else {
        await this.redis.set(userKey, JSON.stringify(tokens), 60 * 60 * 24 * 30);
      }
    } catch {
      // corrupt — leave as-is
    }
  }
}

// ---------------------------------------------------------------------------
// ConsolePushProvider — development backend
// ---------------------------------------------------------------------------

/**
 * Development push provider that logs every action. Uses an in-memory device
 * token store so the registration / lookup path can be exercised end-to-end
 * in dev.
 */
export class ConsolePushProvider implements PushProvider {
  private readonly store: DeviceTokenStore;
  private readonly issuedIds = new Set<string>();

  constructor(store?: DeviceTokenStore) {
    this.store = store ?? new InMemoryDeviceTokenStore();
  }

  async register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.store.register(userId, token, platform);
    logger.system().info('ConsolePush.register', { userId, platform, token: token.slice(0, 8) + '…' });
  }

  async unregister(token: string): Promise<void> {
    await this.store.unregister(token);
    logger.system().info('ConsolePush.unregister', { token: token.slice(0, 8) + '…' });
  }

  async send(message: PushMessage): Promise<PushResult> {
    const messageId = createId('push');
    this.issuedIds.add(messageId);
    logger.system().info('ConsolePush.send', {
      messageId,
      to: message.to.slice(0, 8) + '…',
      title: message.title,
      body: message.body,
    });
    process.stdout.write(
      `\n🔔 [PUSH] to=${message.to.slice(0, 8)}… title="${message.title}" body="${message.body}"\n\n`,
    );
    return { messageId, status: 'sent', provider: 'console' };
  }

  async broadcast(message: Omit<PushMessage, 'to'>): Promise<number> {
    const tokens = await this.store.getAllTokens();
    for (const token of tokens) {
      await this.send({ ...message, to: token });
    }
    logger.system().info('ConsolePush.broadcast complete', { recipients: tokens.length });
    return tokens.length;
  }

  async getTokens(userId: string): Promise<string[]> {
    return this.store.getTokens(userId);
  }
}

// ---------------------------------------------------------------------------
// FcmPushProvider — production backend
// ---------------------------------------------------------------------------

/**
 * Minimal local type for the `firebase-admin` messaging API. We define these
 * locally so we don't need to install `@types/firebase-admin` at compile
 * time; the real module is imported lazily on first use.
 */
interface FcmCredentialCert {
  cert(source: string | Record<string, unknown>): unknown;
}

interface FcmModule {
  initializeApp(config: unknown): unknown;
  messaging(): FcmMessagingClient;
  credential: FcmCredentialCert;
}

interface FcmMessagingClient {
  sendEachForMulticast(message: unknown): Promise<{ successCount: number; failureCount: number; responses: Array<{ success: boolean; messageId?: string; error?: Error }> }>;
  send(message: unknown): Promise<string>;
}

interface FcmAndroidConfig {
  notification?: { icon?: string; sound?: string; click_action?: string; tag?: string; color?: string };
  ttl?: string;
}

interface FcmApnsConfig {
  payload?: { aps?: { badge?: number; sound?: string } };
}

interface FcmMessagePayload {
  token?: string;
  tokens?: string[];
  notification: { title: string; body: string };
  data?: Record<string, string>;
  android?: FcmAndroidConfig;
  apns?: FcmApnsConfig;
  webpush?: { notification?: { icon?: string; badge?: string } };
}

export interface FcmPushProviderOptions {
  /** Path to the service-account JSON file. */
  serviceAccountPath?: string;
  /** Or the parsed service-account object. */
  serviceAccount?: Record<string, unknown>;
  circuitBreaker?: typeof DEFAULT_CIRCUIT_OPTIONS;
  /** Batch size for broadcast() fan-out. */
  batchSize?: number;
}

/**
 * Firebase Cloud Messaging provider. The `firebase-admin` package is imported
 * lazily so projects that don't use push notifications don't have to install
 * it. Every send is wrapped in a CircuitBreaker.
 */
export class FcmPushProvider implements PushProvider {
  private readonly breaker: CircuitBreaker;
  private readonly store: DeviceTokenStore;
  private readonly opts: FcmPushProviderOptions;
  private messaging: FcmMessagingClient | null = null;

  constructor(store: DeviceTokenStore, opts: FcmPushProviderOptions = {}) {
    this.store = store;
    this.opts = opts;
    this.breaker = new CircuitBreaker('push:fcm', opts.circuitBreaker ?? DEFAULT_CIRCUIT_OPTIONS);
  }

  async register(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.store.register(userId, token, platform);
  }

  async unregister(token: string): Promise<void> {
    await this.store.unregister(token);
  }

  async getTokens(userId: string): Promise<string[]> {
    return this.store.getTokens(userId);
  }

  async send(message: PushMessage): Promise<PushResult> {
    return this.breaker.execute(async () => {
      const client = await this.ensureMessaging();
      const payload = this.buildPayload(message);
      try {
        const messageId = await client.send(payload);
        return { messageId, status: 'sent', provider: 'fcm' };
      } catch (e) {
        logger.system().error('FCM send failed', { to: message.to.slice(0, 8) + '…', title: message.title }, e);
        return { messageId: createId('push-failed'), status: 'failed', provider: 'fcm' };
      }
    });
  }

  async broadcast(message: Omit<PushMessage, 'to'>): Promise<number> {
    const tokens = await this.store.getAllTokens();
    if (tokens.length === 0) return 0;

    const batchSize = this.opts.batchSize ?? 500;
    let totalSuccess = 0;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const successes = await this.sendBatch(batch, message);
      totalSuccess += successes;
    }
    return totalSuccess;
  }

  private async sendBatch(tokens: string[], message: Omit<PushMessage, 'to'>): Promise<number> {
    return this.breaker.execute(async () => {
      const client = await this.ensureMessaging();
      const payload: FcmMessagePayload = {
        tokens,
        notification: { title: message.title, body: message.body },
        data: this.stringifyData(message.data),
        android: this.buildAndroidConfig(message),
        apns: this.buildApnsConfig(message),
      };
      if (message.ttl !== undefined) {
        // FCM TTL is a duration string like "30s".
        payload.android = { ...(payload.android ?? {}), ttl: `${message.ttl}s` };
      }
      try {
        const result = await client.sendEachForMulticast(payload);
        if (result.failureCount > 0) {
          logger.system().warn('FCM multicast partial failure', {
            success: result.successCount,
            failure: result.failureCount,
          });
        }
        return result.successCount;
      } catch (e) {
        logger.system().error('FCM broadcast batch failed', { batchSize: tokens.length }, e);
        return 0;
      }
    });
  }

  private buildPayload(message: PushMessage): FcmMessagePayload {
    return {
      token: message.to,
      notification: { title: message.title, body: message.body },
      data: this.stringifyData(message.data),
      android: this.buildAndroidConfig(message),
      apns: this.buildApnsConfig(message),
    };
  }

  private buildAndroidConfig(message: PushMessageBuildable): FcmAndroidConfig {
    const cfg: FcmAndroidConfig = {};
    if (message.icon || message.sound) {
      cfg.notification = { icon: message.icon, sound: message.sound };
    }
    if (message.ttl !== undefined) cfg.ttl = `${message.ttl}s`;
    return cfg;
  }

  private buildApnsConfig(message: PushMessageBuildable): FcmApnsConfig {
    const aps: { badge?: number; sound?: string } = {};
    if (message.badge !== undefined) aps.badge = message.badge;
    if (message.sound) aps.sound = message.sound;
    return Object.keys(aps).length > 0 ? { payload: { aps } } : {};
  }

  /** FCM `data` payload must be string→string. Stringify each value. */
  private stringifyData(data?: Record<string, unknown>): Record<string, string> | undefined {
    if (!data) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }

  private async ensureMessaging(): Promise<FcmMessagingClient> {
    if (this.messaging) return this.messaging;
    try {
      const mod = (await import(/* webpackIgnore: true */ 'firebase-admin')) as unknown as FcmModule;
      const credential = this.opts.serviceAccount
        ? mod.credential.cert(this.opts.serviceAccount)
        : this.opts.serviceAccountPath
          ? mod.credential.cert(this.opts.serviceAccountPath)
          : undefined;
      mod.initializeApp(credential ? { credential } : {});
      this.messaging = mod.messaging();
      logger.system().info('Firebase Admin messaging client initialised');
      return this.messaging;
    } catch (e) {
      throw new Error(
        'FcmPushProvider requires the `firebase-admin` package. ' +
          'Install it with: bun add firebase-admin. ' +
          `Original error: ${(e as Error).message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a PushProvider from configuration. Selects `ConsolePushProvider`
 * unless `FIREBASE_PROJECT_ID` is set.
 */
export async function createPushProvider(redis?: RedisClient): Promise<PushProvider> {
  const { getEnvVar } = await import('@/shared/config');
  const store = redis ? new RedisDeviceTokenStore(redis) : new InMemoryDeviceTokenStore();

  const projectId = getEnvVar('FIREBASE_PROJECT_ID');
  const clientEmail = getEnvVar('FIREBASE_CLIENT_EMAIL');
  const privateKey = getEnvVar('FIREBASE_PRIVATE_KEY');
  const serviceAccountPath = getEnvVar('FIREBASE_SERVICE_ACCOUNT_PATH');

  if (!projectId && !serviceAccountPath) {
    return new ConsolePushProvider(store);
  }

  const serviceAccount: Record<string, unknown> | undefined =
    projectId && clientEmail && privateKey
      ? {
          projectId,
          clientEmail,
          // The private key is often stored with literal `\n` sequences in env
          // vars; replace them so Node's crypto accepts the PEM.
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }
      : undefined;

  return new FcmPushProvider(store, {
    serviceAccount,
    serviceAccountPath: serviceAccountPath ?? undefined,
  });
}
