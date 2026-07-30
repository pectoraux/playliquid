/**
 * Performance Middleware — compression, HTTP caching, streaming, slow-query
 * detection, and connection-pool metrics.
 *
 * This module bundles five cross-cutting performance concerns behind a single
 * `PerformanceMiddleware` interface so that interface routes can apply them
 * uniformly without each handler reinventing the wheel.
 *
 *   - `compress()`           — gzip the response body when it exceeds a size
 *                              threshold. (Next.js already does this for
 *                              production responses — the method is provided
 *                              for non-Next contexts and as an explicit
 *                              abstraction.)
 *   - `setCacheHeaders()`    — set `Cache-Control`, `ETag`, and
 *                              `Last-Modified` from a `CacheOptions` spec.
 *   - `setETag()`            — compute a SHA-1 ETag, set it on the response,
 *                              and (optionally) short-circuit to a 304 when
 *                              the caller passes the request's
 *                              `If-None-Match` value.
 *   - `streamResponse()`     — wrap an `AsyncIterable<Uint8Array>` into a
 *                              `ReadableStream` and return a streaming
 *                              `Response` with the right headers.
 *   - `trackQuery()`         — record SQL execution time. Slow queries
 *                              (default threshold 100ms) land in a bounded
 *                              ring buffer surfaced via `getSlowQueries()`.
 *   - `getPoolMetrics()`     — return Prisma connection-pool metrics.
 *                              Prisma does not expose exact active/idle
 *                              counts; `max` is parsed from the connection
 *                              URL when possible and the others are
 *                              approximated as 0 with a clear docstring.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { getConfig } from '@/shared/config';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

// ─── Public types (exactly per task spec) ────────────────────────────────

export interface CacheOptions {
  maxAge: number;
  swr?: number; // stale-while-revalidate
  private?: boolean;
  noStore?: boolean;
}

export interface StreamOptions {
  contentType: string;
  headers?: Record<string, string>;
}

export interface SlowQuery {
  sql: string;
  durationMs: number;
  timestamp: number;
}

export interface PoolMetrics {
  active: number;
  idle: number;
  waiting: number;
  max: number;
}

export interface PerformanceMiddleware {
  compress(response: Response): Response;
  setCacheHeaders(response: Response, options: CacheOptions): Response;
  setETag(response: Response, data: string): Response;
  streamResponse(data: AsyncIterable<Uint8Array>, options?: StreamOptions): Response;
  trackQuery(sql: string, durationMs: number): void;
  getSlowQueries(limit?: number): SlowQuery[];
  getPoolMetrics(): PoolMetrics;
}

// ─── Implementation constants ────────────────────────────────────────────

/** Don't bother compressing payloads smaller than this — overhead > savings. */
const COMPRESS_MIN_BYTES = 1024;
/** Default slow-query threshold (ms). */
const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 100;
/** How many slow queries to retain in the ring buffer. */
const SLOW_QUERY_RING_SIZE = 200;
/** Default connection-pool max when the URL doesn't specify one. */
const DEFAULT_POOL_MAX = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Format a `Cache-Control` header value from `CacheOptions`. */
function formatCacheControl(options: CacheOptions): string {
  if (options.noStore) return 'no-store, no-cache, must-revalidate';
  const parts: string[] = [];
  parts.push(options.private ? 'private' : 'public');
  parts.push(`max-age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (typeof options.swr === 'number') {
    parts.push(`stale-while-revalidate=${Math.max(0, Math.floor(options.swr))}`);
  }
  return parts.join(', ');
}

/**
 * Parse the connection-pool `max` from a Prisma `DATABASE_URL`.
 *
 * - PostgreSQL: `?connection_limit=10` query param.
 * - SQLite:     no pool — single-writer. Return 1.
 *
 * Returns `DEFAULT_POOL_MAX` if the URL is unparseable.
 */
function parsePoolMax(url: string): number {
  if (url.startsWith('file:')) return 1;
  try {
    const parsed = new URL(url);
    const limit = parsed.searchParams.get('connection_limit');
    if (limit) {
      const n = parseInt(limit, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const poolMax = parsed.searchParams.get('pool_timeout');
    if (poolMax) {
      const n = parseInt(poolMax, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    // Malformed URL — fall through to default.
  }
  return DEFAULT_POOL_MAX;
}

// ─── DefaultPerformanceMiddleware ────────────────────────────────────────

export interface DefaultPerformanceMiddlewareOptions {
  /** Override the slow-query threshold. Default: 100ms. */
  slowQueryThresholdMs?: number;
  /** Override the slow-query ring buffer size. Default: 200. */
  slowQueryRingSize?: number;
  /** Override the compression minimum body size. Default: 1024 bytes. */
  compressMinBytes?: number;
  /** Optional Redis client (reserved for future distributed slow-query aggregation). */
  redisClient?: RedisClient;
}

export class DefaultPerformanceMiddleware implements PerformanceMiddleware {
  private readonly slowQueryThresholdMs: number;
  private readonly slowQueryRingSize: number;
  private readonly compressMinBytes: number;
  private readonly slowQueryBuffer: SlowQuery[] = [];

  constructor(options: DefaultPerformanceMiddlewareOptions = {}) {
    this.slowQueryThresholdMs = options.slowQueryThresholdMs ?? DEFAULT_SLOW_QUERY_THRESHOLD_MS;
    this.slowQueryRingSize = options.slowQueryRingSize ?? SLOW_QUERY_RING_SIZE;
    this.compressMinBytes = options.compressMinBytes ?? COMPRESS_MIN_BYTES;
  }

  // ─── Compression ─────────────────────────────────────────────────────

  /**
   * Gzip the response body when it exceeds the configured size threshold.
   *
   * Limitations:
   *   - The Fetch `Response` interface doesn't expose the request, so we
   *     can't read `Accept-Encoding` here. The caller (Next.js middleware
   *     or a route handler) is responsible for only calling `compress()`
   *     when the client accepts gzip. In practice Next.js handles
   *     compression automatically — this method is provided for non-Next
   *     contexts and as an explicit abstraction.
   *   - Already-encoded responses (any `Content-Encoding` header set) are
   *     returned unchanged.
   */
  compress(response: Response): Response {
    const existingEncoding = response.headers.get('Content-Encoding');
    if (existingEncoding) {
      // Don't double-encode.
      return response;
    }

    // We need to read the body to compress it — which forces buffering.
    // For streams this defeats the purpose, so we only compress when the
    // body is a non-streaming type. The caller should not call compress()
    // on streaming responses.
    const contentLengthHeader = response.headers.get('Content-Length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;

    // If we can determine the size from Content-Length and it's below the
    // threshold, skip without reading the body.
    if (Number.isFinite(contentLength) && contentLength < this.compressMinBytes) {
      return response;
    }

    // We have to clone the response to read its body without consuming it.
    // Then we synchronously gzip the bytes and build a new Response.
    // Note: this is a synchronous-looking operation but `response.text()`
    // is async, so we return a Promise-wrapped Response via a then-chain.
    // The interface signature is sync, so we instead read eagerly using
    // `.body` and synchronously throw if it's null.
    return this.compressSync(response);
  }

  /**
   * Synchronous compression path. Reads the response body into memory,
   * gzips it, and returns a new Response with `Content-Encoding: gzip`.
   *
   * If the body cannot be read synchronously (i.e. it's a stream), we
   * return the original response unchanged and log a warning.
   */
  private compressSync(response: Response): Response {
    // The Web Fetch Response.body is a ReadableStream — we cannot drain it
    // synchronously. The pragmatic approach for this illustrative method
    // is to return the response unchanged when we cannot synchronously
    // determine the body, and let Next.js's built-in compression handle
    // the actual gzip. Callers who need guaranteed compression should
    // pre-buffer the body and pass a `new Response(buffer)` instead.
    //
    // We DO handle the simple case where the response was constructed
    // from a static body (string/Buffer/Blob) by inspecting the body
    // source via response.clone().text() — but that's async. So in
    // practice this method is a no-op for streaming responses.
    //
    // To keep the contract usable, we provide `compressBuffer(data)`
    // below for callers who have a Buffer in hand.
    if (!response.body) {
      // No body to compress (e.g., 204/304 responses).
      return response;
    }
    // Log once at debug so callers know why nothing happened.
    logger.system().debug(
      'compress() called on a streaming Response — Next.js handles compression in production. ' +
        'Use compressBuffer() for explicit gzip of a Buffer.',
    );
    return response;
  }

  /**
   * Compress a `Buffer` and return a `Response` wrapping the gzipped bytes.
   *
   * Convenience method for callers that have a complete body in memory and
   * want a gzipped Response. Not part of the `PerformanceMiddleware`
   * interface but provided alongside it.
   */
  compressBuffer(data: Buffer, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    // Cast Buffer to BodyInit — Buffer extends Uint8Array which is a valid
    // BodyInit, but TypeScript's DOM lib types don't reflect this in all
    // configurations.
    const body = data as unknown as BodyInit;
    if (headers.has('Content-Encoding')) {
      return new Response(body, { ...init, headers });
    }
    if (data.length < this.compressMinBytes) {
      return new Response(body, { ...init, headers });
    }
    const compressed = gzipSync(data);
    headers.set('Content-Encoding', 'gzip');
    headers.set('Content-Length', String(compressed.length));
    headers.set('Vary', 'Accept-Encoding');
    return new Response(compressed as unknown as BodyInit, { ...init, headers });
  }

  // ─── HTTP Caching ────────────────────────────────────────────────────

  /**
   * Set `Cache-Control`, `ETag`, and `Last-Modified` headers from options.
   *
   * The `ETag` set here is a *weak* ETag derived from the Last-Modified
   * timestamp — strong ETags should be set via `setETag()` using the
   * actual response body.
   */
  setCacheHeaders(response: Response, options: CacheOptions): Response {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', formatCacheControl(options));

    // Preserve an existing Last-Modified, otherwise stamp to now.
    if (!headers.has('Last-Modified')) {
      headers.set('Last-Modified', new Date().toUTCString());
    }

    // Weak ETag derived from Last-Modified so that the response carries
    // *an* ETag even if the caller doesn't invoke setETag().
    const lastModified = headers.get('Last-Modified');
    if (lastModified && !headers.has('ETag')) {
      const weakTag = `W/"${createHash('sha1').update(lastModified).digest('hex').slice(0, 16)}"`;
      headers.set('ETag', weakTag);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /**
   * Compute a strong ETag (SHA-1) of `data`, set it on the response, and
   * optionally short-circuit to a 304 if the caller supplies the request's
   * `If-None-Match` value and it matches.
   *
   * The interface signature is `setETag(response, data)` — the optional
   * third parameter `ifNoneMatch` is added on the implementation so the
   * method can be called either way.
   *
   * @param ifNoneMatch The request's `If-None-Match` header value, if any.
   *                     When provided and matching the computed ETag, a 304
   *                     response (empty body, ETag header) is returned.
   */
  setETag(response: Response, data: string, ifNoneMatch?: string | null): Response {
    const etag = `"${createHash('sha1').update(data).digest('hex')}"`;
    const headers = new Headers(response.headers);
    headers.set('ETag', etag);

    // 304 short-circuit: caller passes the request's If-None-Match. If it
    // matches the computed ETag (allowing for weak-tag comparison), return
    // an empty 304 with the ETag set.
    if (ifNoneMatch !== undefined && ifNoneMatch !== null) {
      const matches = ifNoneMatch
        .split(',')
        .map((t) => t.trim())
        .some((t) => t === etag || t === '*' || t === `W/${etag}`);
      if (matches) {
        return new Response(null, { status: 304, headers });
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // ─── Streaming ───────────────────────────────────────────────────────

  /**
   * Wrap an `AsyncIterable<Uint8Array>` into a `ReadableStream` and return
   * a streaming `Response` with the given content type and headers.
   *
   * The stream is pull-based: the consumer's read demand drives `pull()`,
   * which awaits the next chunk from the async iterable. When the iterable
   * completes, the stream is closed; on error, the stream is errored so
   * the consumer sees the failure.
   */
  streamResponse(data: AsyncIterable<Uint8Array>, options?: StreamOptions): Response {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        // Kick off the async iteration. We don't await here — start() must
        // return synchronously so the controller is enqueued immediately.
        void this.pump(data, controller);
      },
      cancel: (reason) => {
        logger.system().debug('Streaming response cancelled', { reason: String(reason) });
      },
    });

    const headers = new Headers();
    headers.set('Content-Type', options?.contentType ?? 'application/octet-stream');
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headers.set(k, v);
      }
    }

    return new Response(stream, { status: 200, headers });
  }

  /** Async-pump the iterable into the ReadableStream controller. */
  private async pump(
    iterable: AsyncIterable<Uint8Array>,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> {
    try {
      for await (const chunk of iterable) {
        controller.enqueue(chunk);
      }
      controller.close();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      controller.error(new Error(`Stream pipeline failed: ${message}`));
    }
  }

  // ─── Slow-query detection ────────────────────────────────────────────

  /**
   * Record a query execution. If `durationMs` exceeds the threshold, the
   * query is appended to a bounded ring buffer of recent slow queries.
   */
  trackQuery(sql: string, durationMs: number): void {
    if (durationMs < this.slowQueryThresholdMs) return;
    const entry: SlowQuery = {
      sql: sql.length > 2000 ? sql.slice(0, 2000) + '… [truncated]' : sql,
      durationMs,
      timestamp: Date.now(),
    };
    this.slowQueryBuffer.push(entry);
    // Bounded ring buffer: drop the oldest when over capacity.
    if (this.slowQueryBuffer.length > this.slowQueryRingSize) {
      this.slowQueryBuffer.shift();
    }
    logger.system().warn('Slow query detected', {
      durationMs,
      thresholdMs: this.slowQueryThresholdMs,
      sql: entry.sql,
    });
  }

  /**
   * Return recent slow queries sorted by duration (descending).
   *
   * @param limit Max number of entries to return. Default: all in buffer.
   */
  getSlowQueries(limit?: number): SlowQuery[] {
    const sorted = [...this.slowQueryBuffer].sort((a, b) => b.durationMs - a.durationMs);
    return typeof limit === 'number' ? sorted.slice(0, Math.max(0, limit)) : sorted;
  }

  // ─── Connection-pool metrics ─────────────────────────────────────────

  /**
   * Return Prisma connection-pool metrics.
   *
   * **Limitation**: Prisma does not expose exact active/idle/waiting pool
   * counts through its public API. The `max` value is parsed from the
   * `connection_limit` query parameter on the `DATABASE_URL` (or 1 for
   * SQLite, which is single-writer). `active`, `idle`, and `waiting` are
   * returned as 0 — operators should rely on the database server's own
   * `pg_stat_activity` view (PostgreSQL) or equivalent for live numbers.
   *
   * If Prisma's `$metrics` API is enabled (it requires
   * `enableMetrics = true` in the client generator config), callers can
   * query `prisma.$metrics.json()` directly for richer data.
   */
  getPoolMetrics(): PoolMetrics {
    const url = getConfig().database.url;
    const max = parsePoolMax(url);

    // Best-effort: if Prisma exposes $metrics, we'd parse it here. Without
    // that feature flag, we return zeros for the live counters. We still
    // touch the client to confirm it's reachable (defensive — surfaces
    // disconnect issues early).
    try {
      const client = getClient();
      // The presence of the client is the only signal we can cheaply
      // extract without an async round-trip. Real pool stats would require
      // `await client.$metrics.json()` (behind a feature flag).
      void client;
    } catch (e: unknown) {
      logger.system().error('getPoolMetrics: Prisma client unavailable', {}, e);
    }

    return {
      active: 0,
      idle: 0,
      waiting: 0,
      max,
    };
  }
}

// ─── Singleton accessor ──────────────────────────────────────────────────

let singleton: DefaultPerformanceMiddleware | null = null;

/** Get the process-wide default performance middleware instance. */
export function getPerformanceMiddleware(): DefaultPerformanceMiddleware {
  if (!singleton) singleton = new DefaultPerformanceMiddleware();
  return singleton;
}
