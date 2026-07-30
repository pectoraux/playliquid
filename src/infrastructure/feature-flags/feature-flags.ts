/**
 * Feature Flag Platform
 *
 * Provides runtime-toggleable feature flags with multiple evaluation strategies:
 *   - boolean        → on/off for everyone
 *   - percentage     → hash-based deterministic rollout (consistent per rolloutId)
 *   - country        → allowlist of country codes
 *   - region         → allowlist of region codes
 *   - user           → allowlist of user ids
 *   - organization   → allowlist of organization ids
 *   - time-window    → active between startAt and endAt (epoch ms)
 *   - kill-switch    → emergency off — always returns false
 *
 * The `CachedFeatureFlagService` wraps a backing store (an in-memory Map by
 * default, but any object satisfying the same shape can be injected) and caches
 * evaluations for a configurable TTL. This keeps hot-path flag checks off the
 * backing store. Mutations (`setFlag` / `deleteFlag`) invalidate the cache.
 *
 * Architecture note: no direct environment variable access here — backing
 * store population is the caller's responsibility (typically the composition
 * root, which reads env-backed config).
 */

import { logger } from '@/shared/logging';

export type FlagType =
  | 'boolean'
  | 'percentage'
  | 'country'
  | 'region'
  | 'user'
  | 'organization'
  | 'time-window'
  | 'kill-switch';

export interface FeatureFlag {
  key: string;
  type: FlagType;
  enabled: boolean;
  /** For percentage rollout (0-100). */
  percentage?: number;
  /** For targeted rollout — ISO country codes (e.g. 'US', 'GB'). */
  allowedCountries?: string[];
  /** For targeted rollout — region codes (e.g. 'us-east-1'). */
  allowedRegions?: string[];
  /** For targeted rollout — user ids. */
  allowedUsers?: string[];
  /** For targeted rollout — organization ids. */
  allowedOrganizations?: string[];
  /** For time-window — epoch ms (inclusive). */
  startAt?: number;
  /** For time-window — epoch ms (inclusive). */
  endAt?: number;
  /** For kill-switch — human description. */
  description?: string;
  /** Last update time (epoch ms). */
  updatedAt: number;
}

export interface EvaluationContext {
  userId?: string;
  organizationId?: string;
  country?: string;
  region?: string;
  timestamp?: number;
  /** Stable identifier for percentage rollout (typically the userId). */
  rolloutId?: string;
}

export interface FeatureFlagService {
  isEnabled(key: string, context?: EvaluationContext): boolean;
  getFlag(key: string): FeatureFlag | null;
  setFlag(flag: FeatureFlag): Promise<void>;
  deleteFlag(key: string): Promise<void>;
  listFlags(): FeatureFlag[];
  evaluate(key: string, context?: EvaluationContext): { enabled: boolean; reason: string };
}

/** A backing store for feature flags (in-memory by default). */
export interface FeatureFlagStore {
  get(key: string): FeatureFlag | null;
  set(flag: FeatureFlag): void;
  delete(key: string): void;
  list(): FeatureFlag[];
}

/** In-memory feature flag store. */
export class InMemoryFeatureFlagStore implements FeatureFlagStore {
  private readonly flags = new Map<string, FeatureFlag>();

  get(key: string): FeatureFlag | null {
    return this.flags.get(key) ?? null;
  }

  set(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
  }

  delete(key: string): void {
    this.flags.delete(key);
  }

  list(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }
}

/** Cached evaluation entry. */
interface CacheEntry {
  readonly enabled: boolean;
  readonly reason: string;
  readonly expiresAt: number;
}

/**
 * djb2 string hash — fast, deterministic, good distribution for rollout buckets.
 * Returns a non-negative 32-bit integer.
 */
function djb2Hash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Build the cache key from the flag key + serialized context. */
function buildCacheKey(flagKey: string, context: EvaluationContext | undefined): string {
  if (!context) return `${flagKey}::__none__`;
  // Deterministic key — sort fields by name for stable serialization.
  const fields = Object.keys(context).sort();
  const parts = fields
    .filter((k) => context[k as keyof EvaluationContext] !== undefined)
    .map((k) => `${k}=${String(context[k as keyof EvaluationContext])}`);
  return `${flagKey}::${parts.join('|')}`;
}

/**
 * Cached feature flag service.
 *
 * Wraps a `FeatureFlagStore` and caches `evaluate()` results for a configurable
 * TTL. Mutating operations (`setFlag`, `deleteFlag`) invalidate the cache for
 * the affected key (or the entire cache if no key is given).
 */
export class CachedFeatureFlagService implements FeatureFlagService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly store: FeatureFlagStore = new InMemoryFeatureFlagStore(),
    options: { ttlMs?: number } = {},
  ) {
    this.ttlMs = options.ttlMs ?? 30_000; // default 30s
  }

  isEnabled(key: string, context?: EvaluationContext): boolean {
    return this.evaluate(key, context).enabled;
  }

  getFlag(key: string): FeatureFlag | null {
    return this.store.get(key);
  }

  async setFlag(flag: FeatureFlag): Promise<void> {
    this.store.set(flag);
    this.invalidateCache(flag.key);
    logger.system().debug('Feature flag updated', {
      key: flag.key,
      type: flag.type,
      enabled: flag.enabled,
    });
  }

  async deleteFlag(key: string): Promise<void> {
    this.store.delete(key);
    this.invalidateCache(key);
    logger.system().debug('Feature flag deleted', { key });
  }

  listFlags(): FeatureFlag[] {
    return this.store.list();
  }

  evaluate(key: string, context?: EvaluationContext): { enabled: boolean; reason: string } {
    // Check cache first.
    const cacheKey = buildCacheKey(key, context);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return { enabled: cached.enabled, reason: cached.reason };
    }

    const result = this.computeEvaluation(key, context);
    this.cache.set(cacheKey, {
      enabled: result.enabled,
      reason: result.reason,
      expiresAt: now + this.ttlMs,
    });
    return result;
  }

  /** Invalidate cached evaluations. If `key` is omitted, clears the entire cache. */
  invalidateCache(key?: string): void {
    if (key === undefined) {
      this.cache.clear();
      return;
    }
    const prefix = `${key}::`;
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(prefix)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  /** Core evaluation logic — uncached. */
  private computeEvaluation(
    key: string,
    context: EvaluationContext | undefined,
  ): { enabled: boolean; reason: string } {
    const flag = this.store.get(key);
    if (!flag) {
      return { enabled: false, reason: `flag '${key}' not found` };
    }

    // Kill switch overrides everything — even if `enabled: true` is set, treat as off.
    if (flag.type === 'kill-switch') {
      return { enabled: false, reason: `kill-switch '${key}' is active` };
    }

    if (!flag.enabled) {
      return { enabled: false, reason: `flag '${key}' is disabled` };
    }

    switch (flag.type) {
      case 'boolean':
        return { enabled: true, reason: `boolean flag '${key}' is on` };

      case 'percentage': {
        const pct = flag.percentage ?? 0;
        if (pct <= 0) return { enabled: false, reason: `percentage is 0 for '${key}'` };
        if (pct >= 100) return { enabled: true, reason: `percentage is 100 for '${key}'` };
        const rolloutId = context?.rolloutId ?? context?.userId ?? key;
        const bucket = djb2Hash(`${key}:${rolloutId}`) % 100;
        const enabled = bucket < pct;
        return {
          enabled,
          reason: enabled
            ? `rollout bucket ${bucket} < ${pct} for '${key}'`
            : `rollout bucket ${bucket} >= ${pct} for '${key}'`,
        };
      }

      case 'country': {
        const allowed = flag.allowedCountries ?? [];
        if (allowed.length === 0) {
          return { enabled: false, reason: `no countries configured for '${key}'` };
        }
        const country = context?.country;
        if (!country) {
          return { enabled: false, reason: `no country in context for '${key}'` };
        }
        const enabled = allowed.includes(country);
        return {
          enabled,
          reason: enabled
            ? `country '${country}' allowed for '${key}'`
            : `country '${country}' not allowed for '${key}'`,
        };
      }

      case 'region': {
        const allowed = flag.allowedRegions ?? [];
        if (allowed.length === 0) {
          return { enabled: false, reason: `no regions configured for '${key}'` };
        }
        const region = context?.region;
        if (!region) {
          return { enabled: false, reason: `no region in context for '${key}'` };
        }
        const enabled = allowed.includes(region);
        return {
          enabled,
          reason: enabled
            ? `region '${region}' allowed for '${key}'`
            : `region '${region}' not allowed for '${key}'`,
        };
      }

      case 'user': {
        const allowed = flag.allowedUsers ?? [];
        if (allowed.length === 0) {
          return { enabled: false, reason: `no users configured for '${key}'` };
        }
        const userId = context?.userId;
        if (!userId) {
          return { enabled: false, reason: `no userId in context for '${key}'` };
        }
        const enabled = allowed.includes(userId);
        return {
          enabled,
          reason: enabled
            ? `user '${userId}' allowed for '${key}'`
            : `user '${userId}' not allowed for '${key}'`,
        };
      }

      case 'organization': {
        const allowed = flag.allowedOrganizations ?? [];
        if (allowed.length === 0) {
          return { enabled: false, reason: `no organizations configured for '${key}'` };
        }
        const orgId = context?.organizationId;
        if (!orgId) {
          return { enabled: false, reason: `no organizationId in context for '${key}'` };
        }
        const enabled = allowed.includes(orgId);
        return {
          enabled,
          reason: enabled
            ? `organization '${orgId}' allowed for '${key}'`
            : `organization '${orgId}' not allowed for '${key}'`,
        };
      }

      case 'time-window': {
        const now = context?.timestamp ?? Date.now();
        const startAt = flag.startAt ?? -Infinity;
        const endAt = flag.endAt ?? Infinity;
        const enabled = now >= startAt && now <= endAt;
        return {
          enabled,
          reason: enabled
            ? `timestamp ${now} within [${startAt}, ${endAt}] for '${key}'`
            : `timestamp ${now} outside [${startAt}, ${endAt}] for '${key}'`,
        };
      }

      default:
        return { enabled: false, reason: `unknown flag type for '${key}'` };
    }
  }
}
