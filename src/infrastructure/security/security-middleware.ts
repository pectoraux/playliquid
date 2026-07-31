/**
 * Security Middleware — HTTP security primitives for the identity layer.
 *
 * This module bundles the cross-cutting security helpers that login / signup /
 * API-key routes need:
 *
 *   - SecurityHeaders    — Content-Security-Policy + standard hardening headers
 *   - CsrfProtection      — double-submit cookie pattern (stateless CSRF defense)
 *   - SecureCookieOptions — HttpOnly + Secure + SameSite cookie option builder
 *   - LoginThrottler      — wraps the existing RateLimiter for login attempts
 *   - AccountLockout      — per-user exponential backoff after N failed logins
 *
 * All helpers are framework-agnostic: they operate on plain `Headers` /
 * cookie-option objects so they can be consumed by Next.js middleware, API
 * route handlers, or any other HTTP framework.
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import type { RateLimiter, RateLimitOptions, RateLimitResult } from '@/infrastructure/rate-limiting/rate-limiter';
import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { getConfig, getEnvVar } from '@/shared/config';
import { logger } from '@/shared/logging';

// ─── Security Headers ──────────────────────────────────────────────────────

export interface SecurityHeaderPolicy {
  readonly 'Content-Security-Policy': string;
  readonly 'X-Frame-Options': string;
  readonly 'X-Content-Type-Options': string;
  readonly 'Referrer-Policy': string;
  readonly 'Permissions-Policy': string;
  readonly 'Strict-Transport-Security': string;
  readonly 'X-XSS-Protection': string;
}

/**
 * Compose the security header policy.
 *
 * Defaults are conservative:
 *   - CSP: restricts to 'self' for everything; allows inline styles (Next.js
 *     needs them) but no inline scripts; no external origins.
 *   - X-Frame-Options: DENY (no framing at all — defense against clickjacking).
 *   - Referrer-Policy: strict-origin-when-cross-origin.
 *   - HSTS: 1 year, includeSubDomains, preload (only effective over HTTPS).
 *
 * Overrides come from env: CSP_REPORT_URI (enables report-to), CSP_EXTRA_SRC
 * (additional script/style src origins, comma-separated).
 */
export function buildSecurityHeaders(): SecurityHeaderPolicy {
  const extraSrcRaw = getEnvVar('CSP_EXTRA_SRC');
  const extraSrc = extraSrcRaw
    ? extraSrcRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  const extraSrcDirective = extraSrc.length > 0 ? ' ' + extraSrc.join(' ') : '';

  const reportUri = getEnvVar('CSP_REPORT_URI');
  const reportDirective = reportUri ? `; report-uri ${reportUri}` : '';

  const csp = [
    `default-src 'self'`,
    `script-src 'self'${extraSrcDirective}`,
    // Next.js dev mode requires inline styles; production can use nonces,
    // but we keep 'unsafe-inline' for styles as a pragmatic default.
    `style-src 'self' 'unsafe-inline'${extraSrcDirective}`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'${extraSrcDirective}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ') + reportDirective;

  return {
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-XSS-Protection': '1; mode=block',
  };
}

/**
 * Helper that applies the security headers to a Headers object (mutates in
 * place). Useful in route handlers:
 *
 *   const res = NextResponse.json({ ... });
 *   SecurityHeaders.apply(res.headers);
 *   return res;
 */
export const SecurityHeaders = {
  build(): SecurityHeaderPolicy {
    return buildSecurityHeaders();
  },

  apply(headers: Headers): void {
    const policy = buildSecurityHeaders();
    for (const [key, value] of Object.entries(policy)) {
      headers.set(key, value);
    }
  },

  /** Returns a plain object suitable for spreading into a Response init. */
  asRecord(): SecurityHeaderPolicy {
    return buildSecurityHeaders();
  },
};

// ─── CSRF Protection (double-submit cookie) ────────────────────────────────

export const CSRF_COOKIE_NAME = 'pl_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Double-submit cookie CSRF defense.
 *
 *   1. On page load (or session start), the server mints a random token and
 *      sets it as a cookie (non-HttpOnly — JavaScript must read it to attach
 *      to subsequent requests as a header).
 *   2. On mutating requests, the client reads the cookie and sends the same
 *      value as the `X-CSRF-Token` header.
 *   3. The server compares the cookie value to the header value using a
 *      constant-time comparison. If they match, the request is authentic.
 *
 * This works because:
 *   - A cross-site attacker cannot read the cookie (SameSite=Lax by default).
 *   - Even if a subdomain is compromised, the SameSite cookie is not sent on
 *     cross-site requests, so the header would be missing.
 *
 * Notes:
 *   - For state-changing requests only (POST, PUT, PATCH, DELETE).
 *   - The token does not need to be secret — its purpose is to prove the
 *     request originated from a context that could read the cookie.
 */
export class CsrfProtection {
  private readonly tokenBytes: number;

  constructor(tokenBytes = 32) {
    this.tokenBytes = tokenBytes;
  }

  /** Mint a fresh CSRF token. Returns base64url string. */
  generateToken(): string {
    const bytes = randomBytes(this.tokenBytes);
    return bytes.toString('base64url');
  }

  /**
   * Validate that the cookie token and header token match (constant-time).
   * Returns true iff both are present and byte-equal.
   */
  validate(cookieToken: string | null | undefined, headerToken: string | null | undefined): boolean {
    if (!cookieToken || !headerToken) return false;
    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
    if (cookieToken.length === 0 || headerToken.length === 0) return false;
    if (cookieToken.length !== headerToken.length) return false;

    try {
      const a = Buffer.from(cookieToken);
      const b = Buffer.from(headerToken);
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /** Should the given method be CSRF-checked? */
  isMutatingMethod(method: string): boolean {
    const m = method.toUpperCase();
    return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
  }

  /**
   * Convenience: extract the token from a Request-like object (uses the
   * configured header name) and compare against the supplied cookie value.
   */
  validateRequest(request: { method: string; headers: Headers }, cookieToken: string | null | undefined): boolean {
    if (!this.isMutatingMethod(request.method)) return true;
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    return this.validate(cookieToken, headerToken);
  }
}

// ─── Secure Cookie Options ─────────────────────────────────────────────────

export type SameSiteValue = 'lax' | 'strict' | 'none';

export interface SecureCookieOptions {
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: SameSiteValue;
  readonly path: string;
  readonly maxAge: number;
  readonly domain?: string;
}

export interface SecureCookieOverrides {
  readonly httpOnly?: boolean;
  readonly sameSite?: SameSiteValue;
  readonly path?: string;
  readonly maxAge?: number;
  readonly domain?: string;
  /** Force `secure` regardless of NODE_ENV (e.g. for preview deploys). */
  readonly secure?: boolean;
}

/**
 * Build a SecureCookieOptions object from config + overrides.
 *
 * Defaults (production-grade):
 *   - httpOnly: true  (JS cannot read the cookie — defense against XSS)
 *   - secure:   true  (HTTPS only)
 *   - sameSite: 'lax' (defense against CSRF for top-level navigations)
 *   - path:     '/'
 *
 * In development (NODE_ENV !== 'production'), `secure` defaults to false so
 * the cookie works over plain HTTP (localhost).
 */
export function buildSecureCookieOptions(overrides: SecureCookieOverrides = {}): SecureCookieOptions {
  const config = getConfig();
  const isProduction = config.nodeEnv === 'production';

  const sameSite = overrides.sameSite ?? 'lax';
  const secure = overrides.secure ?? isProduction;

  return {
    httpOnly: overrides.httpOnly ?? true,
    secure,
    sameSite,
    path: overrides.path ?? '/',
    maxAge: overrides.maxAge ?? 7 * 24 * 60 * 60, // 7 days default
    ...(overrides.domain ? { domain: overrides.domain } : {}),
  };
}

/**
 * Serialize SecureCookieOptions into the `Set-Cookie` attribute string.
 *
 * Useful for cases where the cookie library expects a single string. Most
 * frameworks (Next.js included) accept an options object directly — prefer
 * `buildSecureCookieOptions` in those cases.
 */
export function serializeSecureCookie(name: string, value: string, options: SecureCookieOptions): string {
  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite}`);
  parts.push(`Path=${options.path}`);
  parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join('; ');
}

// ─── Login Throttler ───────────────────────────────────────────────────────

/**
 * Login rate limiter — wraps the platform RateLimiter with login-specific
 * defaults (5 attempts / 60s per IP, matching the `auth` policy).
 *
 * Tracks per-IP attempt rate. The AccountLockout handles per-USER lockout.
 * Together they form a two-layer defense:
 *
 *   - Throttler: blocks distributed credential stuffing from a single IP.
 *   - Lockout:   blocks brute force against a specific account.
 */
export class LoginThrottler {
  private readonly rateLimiter: RateLimiter;
  private readonly options: RateLimitOptions;

  constructor(
    rateLimiter: RateLimiter,
    options?: Partial<RateLimitOptions>,
  ) {
    this.rateLimiter = rateLimiter;
    this.options = {
      dimension: 'ip',
      algorithm: 'sliding-window',
      limit: 5,
      windowSeconds: 60,
      ...options,
    };
  }

  /** Check without consuming — preview whether a login attempt would be allowed. */
  async check(ip: string): Promise<RateLimitResult> {
    return this.rateLimiter.check(ip, this.options);
  }

  /** Consume a token. Call this when a login attempt is received (before auth). */
  async consume(ip: string): Promise<RateLimitResult> {
    return this.rateLimiter.limit(ip, this.options);
  }

  /**
   * Full check: consume a token, return the result, and surface a friendly
   * retry-after value when blocked. Returns `{ allowed, retryAfterSeconds }`.
   */
  async attempt(ip: string): Promise<{ allowed: boolean; retryAfterSeconds: number; remaining: number }> {
    const result = await this.consume(ip);
    return {
      allowed: result.allowed,
      retryAfterSeconds: result.retryAfterSeconds,
      remaining: result.remaining,
    };
  }
}

// ─── Account Lockout ───────────────────────────────────────────────────────

export interface LockoutState {
  readonly failures: number;
  readonly lockedUntil: number | null; // epoch ms, null if not locked
  readonly lastFailureAt: number | null; // epoch ms
  readonly locked: boolean;
}

export interface AccountLockoutConfig {
  /** Failures before lockout kicks in (default 5). */
  readonly maxFailures: number;
  /** Base lockout duration in seconds (default 60). */
  readonly baseLockSeconds: number;
  /**
   * Multiplier applied on each successive lockout (default 2).
   * After 1st lock: 60s. After 2nd: 120s. After 3rd: 240s. etc.
   */
  readonly multiplier: number;
  /** Cap on lockout duration in seconds (default 3600 = 1h). */
  readonly maxLockSeconds: number;
  /** Reset failure count after this many seconds without a failure (default 900 = 15m). */
  readonly resetAfterSeconds: number;
}

const DEFAULT_LOCKOUT_CONFIG: AccountLockoutConfig = {
  maxFailures: 5,
  baseLockSeconds: 60,
  multiplier: 2,
  maxLockSeconds: 3600,
  resetAfterSeconds: 900,
};

interface StoredLockoutState {
  failures: number;
  lockedUntil: number | null;
  lastFailureAt: number | null;
  consecutiveLockouts: number;
}

const LOCKOUT_PREFIX = 'lockout:';

/**
 * Per-user account lockout tracker.
 *
 * Backed by Redis if a client is supplied (production — survives restarts,
 * works across instances), or an in-memory Map otherwise (dev / single
 * instance). The state is stored as JSON under `lockout:{userId}` with a TTL
 * equal to `resetAfterSeconds`.
 *
 * Algorithm:
 *   - On failure: increment `failures`. If `failures >= maxFailures`, set
 *     `lockedUntil = now + min(baseLockSeconds * multiplier^n, maxLockSeconds)`
 *     where n = consecutiveLockouts. Bump consecutiveLockouts.
 *   - On success: clear all state (reset failures, lockout, consecutive).
 *   - isLocked: returns true iff `lockedUntil > now`. After the lockout
 *     expires, the next failure will re-lock with the same escalating
 *     multiplier (consecutiveLockouts is preserved across the lock window).
 */
export class AccountLockout {
  private readonly config: AccountLockoutConfig;
  private readonly redis: RedisClient | null;
  private readonly memory = new Map<string, StoredLockoutState>();

  constructor(config: Partial<AccountLockoutConfig> = {}, redis?: RedisClient | null) {
    this.config = { ...DEFAULT_LOCKOUT_CONFIG, ...config };
    this.redis = redis ?? null;
  }

  /** Record a failed login attempt for the given user. */
  async recordFailure(userId: string): Promise<LockoutState> {
    const now = Date.now();
    const current = await this.load(userId, now);

    // If the reset window has elapsed since the last failure, clear failures
    // (but keep consecutiveLockouts — that decays separately, after a
    // successful login).
    let failures = current.failures;
    if (
      current.lastFailureAt !== null &&
      now - current.lastFailureAt > this.config.resetAfterSeconds * 1000 &&
      current.lockedUntil === null
    ) {
      failures = 0;
    }

    failures += 1;
    let lockedUntil = current.lockedUntil;
    let consecutiveLockouts = current.consecutiveLockouts;

    if (failures >= this.config.maxFailures) {
      const exponent = consecutiveLockouts;
      const lockSeconds = Math.min(
        this.config.baseLockSeconds * Math.pow(this.config.multiplier, exponent),
        this.config.maxLockSeconds,
      );
      lockedUntil = now + Math.floor(lockSeconds * 1000);
      consecutiveLockouts += 1;
      // Reset failures — the lock is the active defense now.
      failures = 0;
    }

    const nextState: StoredLockoutState = {
      failures,
      lockedUntil,
      lastFailureAt: now,
      consecutiveLockouts,
    };
    await this.save(userId, nextState);
    return this.toPublicState(nextState, now);
  }

  /** Record a successful login — clears all lockout state. */
  async recordSuccess(userId: string): Promise<void> {
    await this.clear(userId);
  }

  /** Check whether the user is currently locked out. */
  async isLocked(userId: string): Promise<boolean> {
    const state = await this.peek(userId);
    if (!state.lockedUntil) return false;
    return state.lockedUntil > Date.now();
  }

  /** Get the full lockout state for a user (does not mutate). */
  async getLockoutInfo(userId: string): Promise<LockoutState> {
    return this.toPublicState(await this.peek(userId), Date.now());
  }

  /** Manually reset a user's lockout (admin override). */
  async reset(userId: string): Promise<void> {
    await this.clear(userId);
    logger.system().info('Account lockout manually reset', { userId });
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async load(userId: string, now: number): Promise<StoredLockoutState> {
    const stored = await this.peek(userId);
    // If the lockout has expired, clear the lock but preserve consecutiveLockouts
    // (so the next failure re-locks with escalation).
    if (stored.lockedUntil !== null && stored.lockedUntil <= now) {
      return {
        ...stored,
        lockedUntil: null,
        failures: 0,
      };
    }
    return stored;
  }

  private async peek(userId: string): Promise<StoredLockoutState> {
    if (this.redis) {
      const raw = await this.redis.get(LOCKOUT_PREFIX + userId);
      if (!raw) return emptyLockoutState();
      try {
        const parsed = JSON.parse(raw) as StoredLockoutState;
        return {
          failures: parsed.failures ?? 0,
          lockedUntil: parsed.lockedUntil ?? null,
          lastFailureAt: parsed.lastFailureAt ?? null,
          consecutiveLockouts: parsed.consecutiveLockouts ?? 0,
        };
      } catch {
        return emptyLockoutState();
      }
    }
    return this.memory.get(userId) ?? emptyLockoutState();
  }

  private async save(userId: string, state: StoredLockoutState): Promise<void> {
    if (this.redis) {
      // TTL = max of resetAfter and current lockout (so the record survives
      // the lockout window even if no further activity occurs).
      const lockMs = state.lockedUntil ? Math.max(0, state.lockedUntil - Date.now()) : 0;
      const ttlSeconds = Math.max(
        this.config.resetAfterSeconds,
        Math.ceil(lockMs / 1000),
      );
      await this.redis.set(LOCKOUT_PREFIX + userId, JSON.stringify(state), ttlSeconds);
    } else {
      this.memory.set(userId, state);
    }
  }

  private async clear(userId: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(LOCKOUT_PREFIX + userId);
    } else {
      this.memory.delete(userId);
    }
  }

  private toPublicState(stored: StoredLockoutState, now: number): LockoutState {
    const locked = stored.lockedUntil !== null && stored.lockedUntil > now;
    return {
      failures: stored.failures,
      lockedUntil: stored.lockedUntil,
      lastFailureAt: stored.lastFailureAt,
      locked,
    };
  }
}

function emptyLockoutState(): StoredLockoutState {
  return {
    failures: 0,
    lockedUntil: null,
    lastFailureAt: null,
    consecutiveLockouts: 0,
  };
}
