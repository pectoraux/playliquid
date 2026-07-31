/**
 * Distributed Session Store + JWT Service
 *
 * Pluggable session management for stateless (JWT) and stateful (opaque
 * token + Redis lookup) authentication. Application code depends on the
 * `SessionStore` and `JwtService` interfaces; the DI container selects the
 * implementation.
 *
 * Features:
 *   - create / get / getByToken / getByUserId
 *   - revoke(id) / revokeAllForUser(userId) → returns count
 *   - cleanup() → removes expired sessions, returns count
 *   - refresh(id, newToken, newExpiresAt) → rotates the session token
 *   - RedisSessionStore — JSON-serialised sessions with TTL (production)
 *   - InMemorySessionStore — Map-backed fallback (dev)
 *   - HmacJwtService — HS256 JWT implementation using Node's crypto module,
 *     no external dependencies. Signs with HMAC-SHA256 and verifies both
 *     the signature and the `exp` claim.
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { logger } from '@/shared/logging';
import { createId } from '@/shared/ids';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { getConfig } from '@/shared/config';

// ---------------------------------------------------------------------------
// Public types (exact shape required by the spec)
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  userId: string;
  token: string; // JWT or opaque token
  refreshToken?: string;
  device?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: number;
  expiresAt: number;
  refreshExpiresAt?: number;
  revokedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionStore {
  create(session: Omit<Session, 'id' | 'createdAt'>): Promise<Session>;
  get(id: string): Promise<Session | null>;
  getByToken(token: string): Promise<Session | null>;
  getByUserId(userId: string): Promise<Session[]>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  cleanup(): Promise<number>; // remove expired
  refresh(id: string, newToken: string, newExpiresAt: number): Promise<Session>;
}

export interface JwtService {
  sign(payload: Record<string, unknown>, expiresIn: number): Promise<string>;
  verify(token: string): Promise<Record<string, unknown> | null>;
  decode(token: string): Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// InMemorySessionStore
// ---------------------------------------------------------------------------

/**
 * In-memory session store. Sessions are kept in two indexes:
 *   - by id (primary)
 *   - by token (for fast `getByToken` lookups)
 *   - by userId (for `getByUserId` / `revokeAllForUser`)
 */
export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, Session>();
  private readonly byToken = new Map<string, string>(); // token → id
  private readonly byUser = new Map<string, Set<string>>(); // userId → Set<id>

  async create(session: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    const now = Date.now();
    const full: Session = { ...session, id: createId('sess'), createdAt: now };
    this.byId.set(full.id, full);
    this.byToken.set(full.token, full.id);
    let set = this.byUser.get(full.userId);
    if (!set) {
      set = new Set();
      this.byUser.set(full.userId, set);
    }
    set.add(full.id);
    return full;
  }

  async get(id: string): Promise<Session | null> {
    const s = this.byId.get(id);
    if (!s) return null;
    if (s.expiresAt < Date.now()) {
      await this.deleteInternal(s);
      return null;
    }
    return s;
  }

  async getByToken(token: string): Promise<Session | null> {
    const id = this.byToken.get(token);
    if (!id) return null;
    return this.get(id);
  }

  async getByUserId(userId: string): Promise<Session[]> {
    const ids = this.byUser.get(userId);
    if (!ids) return [];
    const out: Session[] = [];
    for (const id of ids) {
      const s = this.byId.get(id);
      if (s && s.expiresAt >= Date.now() && s.revokedAt === undefined) {
        out.push(s);
      }
    }
    return out;
  }

  async revoke(id: string): Promise<void> {
    const s = this.byId.get(id);
    if (!s) return;
    s.revokedAt = Date.now();
    this.byToken.delete(s.token);
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const ids = this.byUser.get(userId);
    if (!ids) return 0;
    let count = 0;
    for (const id of ids) {
      const s = this.byId.get(id);
      if (s && s.revokedAt === undefined) {
        s.revokedAt = Date.now();
        this.byToken.delete(s.token);
        count++;
      }
    }
    return count;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const s of Array.from(this.byId.values())) {
      const expired = s.expiresAt < now;
      const refreshExpired = s.refreshExpiresAt !== undefined && s.refreshExpiresAt < now;
      if (expired || refreshExpired) {
        await this.deleteInternal(s);
        count++;
      }
    }
    return count;
  }

  async refresh(id: string, newToken: string, newExpiresAt: number): Promise<Session> {
    const s = this.byId.get(id);
    if (!s) throw new Error(`Session not found: ${id}`);
    if (s.revokedAt !== undefined) throw new Error(`Cannot refresh revoked session: ${id}`);
    // Drop old token index entry, add new one.
    this.byToken.delete(s.token);
    s.token = newToken;
    s.expiresAt = newExpiresAt;
    this.byToken.set(newToken, s.id);
    return s;
  }

  private async deleteInternal(s: Session): Promise<void> {
    this.byId.delete(s.id);
    this.byToken.delete(s.token);
    this.byUser.get(s.userId)?.delete(s.id);
  }
}

// ---------------------------------------------------------------------------
// RedisSessionStore
// ---------------------------------------------------------------------------

/**
 * Redis-backed session store. Each session is stored as JSON under three keys:
 *   - `sess:id:{id}`           → full session JSON (TTL = expiresAt)
 *   - `sess:token:{token}`     → session id (TTL = expiresAt)
 *   - `sess:user:{userId}`     → JSON array of session ids (TTL = 30 days)
 *
 * The user→sessions index is rebuilt lazily; entries are filtered on read.
 */
export class RedisSessionStore implements SessionStore {
  private static readonly ID_PREFIX = 'sess:id:';
  private static readonly TOKEN_PREFIX = 'sess:token:';
  private static readonly USER_PREFIX = 'sess:user:';
  private static readonly USER_INDEX_TTL = 60 * 60 * 24 * 30; // 30 days

  constructor(private readonly redis: RedisClient) {}

  async create(session: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    const now = Date.now();
    const full: Session = { ...session, id: createId('sess'), createdAt: now };
    const ttlSeconds = Math.max(1, Math.ceil((full.expiresAt - now) / 1000));

    const idKey = RedisSessionStore.ID_PREFIX + full.id;
    const tokenKey = RedisSessionStore.TOKEN_PREFIX + full.token;
    const userKey = RedisSessionStore.USER_PREFIX + full.userId;

    await this.redis.set(idKey, JSON.stringify(full), ttlSeconds);
    await this.redis.set(tokenKey, full.id, ttlSeconds);

    const userRaw = await this.redis.get(userKey);
    const userIds = userRaw ? (JSON.parse(userRaw) as string[]) : [];
    if (!userIds.includes(full.id)) {
      userIds.push(full.id);
      await this.redis.set(userKey, JSON.stringify(userIds), RedisSessionStore.USER_INDEX_TTL);
    }
    return full;
  }

  async get(id: string): Promise<Session | null> {
    const raw = await this.redis.get(RedisSessionStore.ID_PREFIX + id);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as Session;
      if (s.expiresAt < Date.now()) {
        await this.deleteInternal(s);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  async getByToken(token: string): Promise<Session | null> {
    const id = await this.redis.get(RedisSessionStore.TOKEN_PREFIX + token);
    if (!id) return null;
    return this.get(id);
  }

  async getByUserId(userId: string): Promise<Session[]> {
    const raw = await this.redis.get(RedisSessionStore.USER_PREFIX + userId);
    if (!raw) return [];
    let ids: string[];
    try {
      ids = JSON.parse(raw) as string[];
    } catch {
      return [];
    }
    const out: Session[] = [];
    for (const id of ids) {
      const s = await this.get(id);
      if (s && s.revokedAt === undefined) out.push(s);
    }
    return out;
  }

  async revoke(id: string): Promise<void> {
    const s = await this.get(id);
    if (!s) return;
    s.revokedAt = Date.now();
    const ttlSeconds = Math.max(1, Math.ceil((s.expiresAt - Date.now()) / 1000));
    await this.redis.set(RedisSessionStore.ID_PREFIX + s.id, JSON.stringify(s), ttlSeconds);
    await this.redis.del(RedisSessionStore.TOKEN_PREFIX + s.token);
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const sessions = await this.getByUserId(userId);
    let count = 0;
    for (const s of sessions) {
      if (s.revokedAt === undefined) {
        await this.revoke(s.id);
        count++;
      }
    }
    return count;
  }

  async cleanup(): Promise<number> {
    // Redis handles TTL-based expiry automatically. We still iterate the
    // user→sessions indexes to prune stale entries (orphaned ids).
    let count = 0;
    const userKeys = await this.redis.keys(RedisSessionStore.USER_PREFIX + '*');
    for (const userKey of userKeys) {
      const raw = await this.redis.get(userKey);
      if (!raw) continue;
      let ids: string[];
      try {
        ids = JSON.parse(raw) as string[];
      } catch {
        continue;
      }
      const stillAlive: string[] = [];
      for (const id of ids) {
        const exists = await this.redis.exists(RedisSessionStore.ID_PREFIX + id);
        if (exists) {
          stillAlive.push(id);
        } else {
          count++;
        }
      }
      if (stillAlive.length !== ids.length) {
        const userId = userKey.slice(RedisSessionStore.USER_PREFIX.length);
        if (stillAlive.length === 0) {
          await this.redis.del(userKey);
        } else {
          await this.redis.set(
            RedisSessionStore.USER_PREFIX + userId,
            JSON.stringify(stillAlive),
            RedisSessionStore.USER_INDEX_TTL,
          );
        }
      }
    }
    return count;
  }

  async refresh(id: string, newToken: string, newExpiresAt: number): Promise<Session> {
    const s = await this.get(id);
    if (!s) throw new Error(`Session not found: ${id}`);
    if (s.revokedAt !== undefined) throw new Error(`Cannot refresh revoked session: ${id}`);

    // Drop the old token index, then write the new state + new token index.
    await this.redis.del(RedisSessionStore.TOKEN_PREFIX + s.token);
    s.token = newToken;
    s.expiresAt = newExpiresAt;
    const ttlSeconds = Math.max(1, Math.ceil((newExpiresAt - Date.now()) / 1000));
    await this.redis.set(RedisSessionStore.ID_PREFIX + s.id, JSON.stringify(s), ttlSeconds);
    await this.redis.set(RedisSessionStore.TOKEN_PREFIX + newToken, s.id, ttlSeconds);
    return s;
  }

  private async deleteInternal(s: Session): Promise<void> {
    await this.redis.del(RedisSessionStore.ID_PREFIX + s.id);
    await this.redis.del(RedisSessionStore.TOKEN_PREFIX + s.token);
  }
}

// ---------------------------------------------------------------------------
// HmacJwtService — HS256 JWT using Node crypto (no external deps)
// ---------------------------------------------------------------------------

/**
 * HS256 JWT service. The token is the standard three-part base64url-encoded
 * structure: `header.payload.signature`.
 *
 *   header    = {"alg":"HS256","typ":"JWT"}
 *   payload   = caller-supplied claims + iat + exp
 *   signature = HMAC-SHA256(secret, "${header}.${payload}")
 *
 * Verification checks:
 *   1. Token structure (3 dot-separated parts).
 *   2. Signature (constant-time comparison).
 *   3. `exp` claim (rejects expired tokens).
 *   4. `alg` is HS256.
 */
export class HmacJwtService implements JwtService {
  private readonly secret: string;
  private readonly issuer?: string;
  private readonly clockSkewSeconds: number;

  constructor(opts: { secret?: string; issuer?: string; clockSkewSeconds?: number } = {}) {
    this.secret = opts.secret ?? getConfig().auth.secret;
    this.issuer = opts.issuer;
    // Allow 30s of clock skew by default.
    this.clockSkewSeconds = opts.clockSkewSeconds ?? 30;
  }

  async sign(payload: Record<string, unknown>, expiresIn: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.floor(expiresIn);
    const fullPayload: Record<string, unknown> = {
      ...payload,
      iat: now,
      // Allow callers to mint already-expired tokens for testing by passing a
      // negative expiresIn; otherwise clamp to a minimum of 1 second.
      exp: now + (ttlSeconds < 0 ? ttlSeconds : Math.max(1, ttlSeconds)),
    };
    if (this.issuer) fullPayload.iss = this.issuer;
    // Add a short random nonce to make tokens with identical payloads unique.
    fullPayload.jti = randomBytes(8).toString('hex');

    const headerB64 = this.base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(fullPayload));
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = createHmac('sha256', this.secret).update(signingInput).digest();
    const sigB64 = this.base64UrlEncodeBytes(signature);
    return `${signingInput}.${sigB64}`;
  }

  async verify(token: string): Promise<Record<string, unknown> | null> {
    const decoded = this.decode(token);
    if (!decoded) return null;

    // Verify the signature.
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expected = createHmac('sha256', this.secret).update(signingInput).digest();
    const actual = this.base64UrlDecodeToBytes(parts[2]);
    if (expected.length !== actual.length) return null;
    try {
      if (!timingSafeEqual(expected, actual)) return null;
    } catch {
      return null;
    }

    // Verify expiry (with grace period for clock skew).
    const exp = decoded['exp'];
    if (typeof exp === 'number') {
      const now = Math.floor(Date.now() / 1000);
      if (now > exp + this.clockSkewSeconds) return null;
    }

    // Verify issuer if configured.
    if (this.issuer && decoded['iss'] !== this.issuer) return null;

    return decoded;
  }

  decode(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(this.base64UrlDecodeToString(parts[0])) as Record<string, unknown>;
      if (header['alg'] !== 'HS256') return null;
      const payload = JSON.parse(this.base64UrlDecodeToString(parts[1])) as Record<string, unknown>;
      return payload;
    } catch {
      return null;
    }
  }

  // --- base64url helpers ---

  private base64UrlEncode(input: string): string {
    return this.base64UrlEncodeBytes(Buffer.from(input, 'utf8'));
  }

  private base64UrlEncodeBytes(bytes: Buffer | Uint8Array): string {
    const b64 = Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private base64UrlDecodeToString(input: string): string {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(b64, 'base64').toString('utf8');
  }

  private base64UrlDecodeToBytes(input: string): Buffer {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(b64, 'base64');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a SessionStore backed by Redis if a RedisClient is supplied,
 * otherwise fall back to the InMemorySessionStore.
 */
export function createSessionStore(redis?: RedisClient): SessionStore {
  return redis ? new RedisSessionStore(redis) : new InMemorySessionStore();
}

/**
 * Build a JwtService using the auth secret from config (or an override).
 */
export function createJwtService(opts?: { secret?: string; issuer?: string }): JwtService {
  return new HmacJwtService(opts ?? {});
}
