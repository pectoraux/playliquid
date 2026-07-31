/**
 * CDN Provider — abstraction over content delivery network integration.
 *
 * Application code depends on the `CdnProvider` interface. The DI container
 * selects the implementation (`LocalCdnProvider` for development,
 * `CloudflareCdnProvider` for production).
 *
 * Features:
 *   - getUrl(key) — public CDN URL for an asset
 *   - getSignedUrl(key, expiresIn) — time-limited signed URL
 *   - getVersion(key) — content-hash version string for cache busting
 *   - invalidate(paths) — purge specific paths from the CDN edge cache
 *   - purgeAll() — purge the entire zone / cache
 *
 * Backends:
 *   - `LocalCdnProvider` — appends `?v=<hash>` query params; invalidation is
 *     a no-op (logged at debug level).
 *   - `CloudflareCdnProvider` — constructs Cloudflare CDN URLs and calls the
 *     Cloudflare REST API for cache invalidation.
 */

import { createHmac, createHash } from 'node:crypto';

import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CdnProvider {
  /** Get the CDN URL for an asset. */
  getUrl(key: string): string;
  /** Invalidate cached paths. */
  invalidate(paths: string[]): Promise<void>;
  /** Generate a signed CDN URL. */
  getSignedUrl(key: string, expiresIn: number): string;
  /** Get asset version hash for cache busting. */
  getVersion(key: string): string;
  /** Purge everything. */
  purgeAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic short hash of a key, used as a stable cache-busting version.
 * The same key always yields the same version string within a process, so
 * callers can rely on it for URL stability across builds of identical content.
 */
function stableVersion(key: string): string {
  return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/** Join a base URL and a key without producing double slashes. */
function joinUrl(baseUrl: string, key: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedKey = key.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedKey}`;
}

// ---------------------------------------------------------------------------
// LocalCdnProvider
// ---------------------------------------------------------------------------

export interface LocalCdnProviderOptions {
  /** Public base URL (e.g. `http://localhost:3000/assets`). */
  baseUrl?: string;
  /** HMAC secret for signed URLs. Defaults to `getConfig().auth.secret`. */
  secret?: string;
}

/**
 * Local CDN provider — useful for development and tests. Generates the same
 * URL shape as a real CDN but routes traffic to the local server. Version
 * hashes are deterministic SHA-1 prefixes of the asset key, so the cache
 * buster is stable across rebuilds of identical content.
 */
export class LocalCdnProvider implements CdnProvider {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(opts: LocalCdnProviderOptions = {}) {
    this.baseUrl = opts.baseUrl ?? '/assets';
    this.secret = opts.secret ?? getConfig().auth.secret;
  }

  getUrl(key: string): string {
    return `${joinUrl(this.baseUrl, key)}?v=${this.getVersion(key)}`;
  }

  getSignedUrl(key: string, expiresIn: number): string {
    const expires = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresIn));
    const version = this.getVersion(key);
    const payload = `${key}:${version}:${expires}`;
    const signature = createHmac('sha256', this.secret).update(payload).digest('hex');
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${joinUrl(this.baseUrl, encodedKey)}?v=${version}&expires=${expires}&signature=${signature}`;
  }

  getVersion(key: string): string {
    return stableVersion(key);
  }

  async invalidate(paths: string[]): Promise<void> {
    logger.system().debug('Local CDN invalidate (no-op)', { count: paths.length });
  }

  async purgeAll(): Promise<void> {
    logger.system().debug('Local CDN purgeAll (no-op)');
  }
}

// ---------------------------------------------------------------------------
// CloudflareCdnProvider
// ---------------------------------------------------------------------------

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface CloudflareCdnProviderOptions {
  /** Cloudflare zone ID. */
  zoneId: string;
  /** Cloudflare API token with cache-purge permissions for the zone. */
  apiToken: string;
  /** Public CDN base URL (e.g. `https://cdn.playliquid.com`). */
  baseUrl: string;
  /** Secret used to sign CDN URLs. Defaults to `getConfig().auth.secret`. */
  signingSecret?: string;
}

interface CloudflarePurgeResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
}

/**
 * Cloudflare CDN provider. Constructs public URLs under the configured base
 * URL, generates HMAC-signed URLs for protected assets, and calls the
 * Cloudflare REST API to purge cached paths (or the entire zone).
 *
 * The Cloudflare API is contacted via the global `fetch` implementation, so
 * no extra HTTP dependency is required.
 */
export class CloudflareCdnProvider implements CdnProvider {
  private readonly zoneId: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly signingSecret: string;

  constructor(opts: CloudflareCdnProviderOptions) {
    if (!opts.zoneId) throw new Error('CloudflareCdnProvider requires zoneId');
    if (!opts.apiToken) throw new Error('CloudflareCdnProvider requires apiToken');
    if (!opts.baseUrl) throw new Error('CloudflareCdnProvider requires baseUrl');
    this.zoneId = opts.zoneId;
    this.apiToken = opts.apiToken;
    this.baseUrl = opts.baseUrl;
    this.signingSecret = opts.signingSecret ?? getConfig().auth.secret;
  }

  getUrl(key: string): string {
    return `${joinUrl(this.baseUrl, key)}?v=${this.getVersion(key)}`;
  }

  getSignedUrl(key: string, expiresIn: number): string {
    const expires = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresIn));
    const version = this.getVersion(key);
    const payload = `${key}:${version}:${expires}`;
    const signature = createHmac('sha256', this.signingSecret).update(payload).digest('hex');
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${joinUrl(this.baseUrl, encodedKey)}?v=${version}&expires=${expires}&signature=${signature}`;
  }

  getVersion(key: string): string {
    return stableVersion(key);
  }

  async invalidate(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    // Cloudflare accepts up to 30 files per request; batch larger lists.
    const batchSize = 30;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      // Accept either keys (resolved against baseUrl) or absolute URLs.
      const files = batch.map((p) => (p.startsWith('http://') || p.startsWith('https://') ? p : joinUrl(this.baseUrl, p)));
      await this.callPurgeApi({ files });
    }
  }

  async purgeAll(): Promise<void> {
    await this.callPurgeApi({ purge_everything: true });
    logger.system().info('Cloudflare CDN purge-all requested', { zoneId: this.zoneId });
  }

  private async callPurgeApi(body: Record<string, unknown>): Promise<void> {
    const url = `${CLOUDFLARE_API_BASE}/zones/${this.zoneId}/purge_cache`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      logger.system().error('Cloudflare purge request failed', { zoneId: this.zoneId }, e);
      throw new Error(`Cloudflare purge request failed: ${(e as Error).message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '<no body>');
      logger.system().error('Cloudflare purge API error', {
        zoneId: this.zoneId,
        status: response.status,
        body: text,
      });
      throw new Error(`Cloudflare purge failed (HTTP ${response.status}): ${text}`);
    }

    let parsed: CloudflarePurgeResponse | null = null;
    try {
      parsed = (await response.json()) as CloudflarePurgeResponse;
    } catch {
      // Some success responses have empty bodies; treat as success if status is 2xx.
    }
    if (parsed && !parsed.success) {
      const message = parsed.errors.map((e) => `${e.code}: ${e.message}`).join('; ');
      logger.system().error('Cloudflare purge reported errors', { zoneId: this.zoneId, errors: parsed.errors });
      throw new Error(`Cloudflare purge failed: ${message}`);
    }
    logger.system().debug('Cloudflare purge succeeded', { zoneId: this.zoneId, body: Object.keys(body) });
  }
}
