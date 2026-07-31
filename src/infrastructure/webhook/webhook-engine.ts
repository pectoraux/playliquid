/**
 * Webhook Engine
 *
 * Pluggable webhook delivery framework. Other platform services call
 * `engine.dispatch(event, data)` and the engine:
 *   1. Finds all registrations subscribed to that event type.
 *   2. Creates a WebhookDelivery record (status = pending).
 *   3. POSTs the JSON-serialised WebhookPayload to each registration URL,
 *      signed with HMAC-SHA256 in the `X-Webhook-Signature` header.
 *   4. Retries failed deliveries with exponential backoff (`withRetry`).
 *   5. Dead-letters deliveries that exceed the max retry count.
 *   6. Caches nonces to provide replay protection (the same payload id +
 *      webhook id is never delivered twice).
 *
 * Every HTTP call is wrapped in a CircuitBreaker so a chronically failing
 * endpoint fails fast instead of piling up queued deliveries.
 *
 * HTTP transport uses the built-in `fetch()`.
 */

import {
  CircuitBreaker,
  DEFAULT_CIRCUIT_OPTIONS,
} from '@/infrastructure/circuit-breaker/circuit-breaker';
import type { CircuitBreakerOptions } from '@/infrastructure/circuit-breaker/circuit-breaker';
import { withRetry } from '@/infrastructure/retry/retry';
import { logger } from '@/shared/logging';
import { createId, nonce as randomNonce } from '@/shared/ids';
import { createHmac, timingSafeEqual } from 'crypto';
import { getConfig } from '@/shared/config';

// ---------------------------------------------------------------------------
// Public types (exact shape required by the spec)
// ---------------------------------------------------------------------------

export interface WebhookRegistration {
  id: string;
  url: string;
  events: string[]; // event types to subscribe to
  secret: string; // for HMAC signing
  isActive: boolean;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface WebhookPayload {
  id: string;
  event: string;
  data: unknown;
  timestamp: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  payload: WebhookPayload;
  attempts: number;
  status: 'pending' | 'delivered' | 'failed';
  responseStatus?: number;
  responseBody?: string;
  deliveredAt?: number;
  nextRetryAt?: number;
}

export interface WebhookEngine {
  register(url: string, events: string[], metadata?: Record<string, unknown>): Promise<WebhookRegistration>;
  unregister(id: string): Promise<void>;
  list(): Promise<WebhookRegistration[]>;
  dispatch(event: string, data: unknown): Promise<number>; // returns deliveries created
  retryDelivery(deliveryId: string): Promise<void>;
  getDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
}

// ---------------------------------------------------------------------------
// WebhookStore — pluggable persistence
// ---------------------------------------------------------------------------

export interface WebhookStore {
  saveRegistration(reg: WebhookRegistration): Promise<void>;
  getRegistration(id: string): Promise<WebhookRegistration | null>;
  listRegistrations(): Promise<WebhookRegistration[]>;
  deleteRegistration(id: string): Promise<void>;

  saveDelivery(delivery: WebhookDelivery): Promise<void>;
  getDelivery(id: string): Promise<WebhookDelivery | null>;
  listDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>;
  listPendingDeliveries(limit?: number): Promise<WebhookDelivery[]>;
  deleteDelivery(id: string): Promise<void>;

  saveDeadLetter(delivery: WebhookDelivery): Promise<void>;
  listDeadLetters(limit?: number): Promise<WebhookDelivery[]>;
}

/**
 * In-memory webhook store. Suitable for development / single-instance
 * deployments. Production deployments should provide a Redis- or
 * Prisma-backed implementation.
 */
export class InMemoryWebhookStore implements WebhookStore {
  private readonly registrations = new Map<string, WebhookRegistration>();
  private readonly deliveries = new Map<string, WebhookDelivery>();
  private readonly deadLetters: WebhookDelivery[] = [];

  async saveRegistration(reg: WebhookRegistration): Promise<void> {
    this.registrations.set(reg.id, reg);
  }
  async getRegistration(id: string): Promise<WebhookRegistration | null> {
    return this.registrations.get(id) ?? null;
  }
  async listRegistrations(): Promise<WebhookRegistration[]> {
    return Array.from(this.registrations.values());
  }
  async deleteRegistration(id: string): Promise<void> {
    this.registrations.delete(id);
    // Also drop associated deliveries.
    for (const [deliveryId, d] of this.deliveries) {
      if (d.webhookId === id) this.deliveries.delete(deliveryId);
    }
  }
  async saveDelivery(delivery: WebhookDelivery): Promise<void> {
    this.deliveries.set(delivery.id, delivery);
  }
  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    return this.deliveries.get(id) ?? null;
  }
  async listDeliveries(webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    return Array.from(this.deliveries.values())
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => b.payload.timestamp - a.payload.timestamp)
      .slice(0, limit);
  }
  async listPendingDeliveries(limit = 100): Promise<WebhookDelivery[]> {
    const now = Date.now();
    return Array.from(this.deliveries.values())
      .filter((d) => d.status === 'pending' && (d.nextRetryAt ?? 0) <= now)
      .slice(0, limit);
  }
  async deleteDelivery(id: string): Promise<void> {
    this.deliveries.delete(id);
  }
  async saveDeadLetter(delivery: WebhookDelivery): Promise<void> {
    this.deadLetters.push(delivery);
  }
  async listDeadLetters(limit = 100): Promise<WebhookDelivery[]> {
    return this.deadLetters.slice(-limit);
  }
}

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

export interface WebhookEngineOptions {
  store?: WebhookStore;
  /** Default signing secret when registration didn't supply one. */
  defaultSecret?: string;
  /** Per-endpoint circuit-breaker options. */
  circuitBreaker?: CircuitBreakerOptions;
  /** Max attempts before a delivery is dead-lettered (default 5). */
  maxAttempts?: number;
  /** Base delay for the exponential backoff (default 1000ms). */
  baseRetryMs?: number;
  /** Cap for the exponential backoff (default 60000ms). */
  maxRetryMs?: number;
  /** Request timeout in ms (default 10000). */
  requestTimeoutMs?: number;
  /** TTL of the nonce-replay cache in seconds (default 1h). */
  nonceTtlSeconds?: number;
}

const DEFAULT_OPTS: Required<Omit<WebhookEngineOptions, 'store'>> = {
  defaultSecret: getConfig().auth.secret,
  circuitBreaker: DEFAULT_CIRCUIT_OPTIONS,
  maxAttempts: 5,
  baseRetryMs: 1000,
  maxRetryMs: 60000,
  requestTimeoutMs: 10000,
  nonceTtlSeconds: 3600,
};

// ---------------------------------------------------------------------------
// DefaultWebhookEngine
// ---------------------------------------------------------------------------

/**
 * Default webhook engine implementation.
 *
 * The engine is intentionally synchronous-ish on the dispatch path:
 * `dispatch()` creates the delivery records and kicks off delivery in the
 * background (fire-and-forget). The background delivery uses `withRetry` for
 * short-term transient retries and the engine's own scheduling loop for
 * long-term retries with exponential backoff.
 */
export class DefaultWebhookEngine implements WebhookEngine {
  private readonly store: WebhookStore;
  private readonly opts: Required<Omit<WebhookEngineOptions, 'store'>>;
  /** Per-URL circuit breakers (so one bad endpoint doesn't trip the others). */
  private readonly breakers = new Map<string, CircuitBreaker>();
  /** Replay-protection cache: nonce → expiresAt. */
  private readonly nonceCache = new Map<string, number>();

  constructor(opts: WebhookEngineOptions = {}) {
    this.store = opts.store ?? new InMemoryWebhookStore();
    this.opts = { ...DEFAULT_OPTS, ...opts } as Required<Omit<WebhookEngineOptions, 'store'>>;
  }

  async register(
    url: string,
    events: string[],
    metadata?: Record<string, unknown>,
  ): Promise<WebhookRegistration> {
    const reg: WebhookRegistration = {
      id: createId('wh'),
      url,
      events: Array.from(new Set(events)), // dedupe
      secret: this.opts.defaultSecret,
      isActive: true,
      createdAt: Date.now(),
      metadata,
    };
    await this.store.saveRegistration(reg);
    logger.system().info('Webhook registered', { id: reg.id, url, events: reg.events });
    return reg;
  }

  async unregister(id: string): Promise<void> {
    await this.store.deleteRegistration(id);
    logger.system().info('Webhook unregistered', { id });
  }

  async list(): Promise<WebhookRegistration[]> {
    return this.store.listRegistrations();
  }

  async dispatch(event: string, data: unknown): Promise<number> {
    const registrations = await this.store.listRegistrations();
    const matching = registrations.filter(
      (r) => r.isActive && (r.events.includes(event) || r.events.includes('*')),
    );
    if (matching.length === 0) return 0;

    const timestamp = Date.now();
    const payloadId = createId('whp');
    const payload: WebhookPayload = { id: payloadId, event, data, timestamp };

    let created = 0;
    for (const reg of matching) {
      // Replay protection: one delivery per (webhook, payloadId) pair. The
      // nonce cache is process-local; a Redis-backed store would also key
      // deliveries by (webhookId, payloadId) for cluster-wide dedupe.
      const nonceKey = `${reg.id}:${payloadId}`;
      if (this.nonceCache.has(nonceKey)) {
        logger.system().warn('Webhook dispatch: skipping duplicate (replay protection)', {
          webhookId: reg.id,
          payloadId,
        });
        continue;
      }
      this.nonceCache.set(nonceKey, Date.now() + this.opts.nonceTtlSeconds * 1000);

      const delivery: WebhookDelivery = {
        id: createId('whd'),
        webhookId: reg.id,
        payload,
        attempts: 0,
        status: 'pending',
      };
      await this.store.saveDelivery(delivery);
      created++;

      // Fire-and-forget delivery. Errors are caught and logged.
      void this.attemptDelivery(delivery.id).catch((e) => {
        logger.system().error('Webhook delivery scheduling failed', { deliveryId: delivery.id }, e);
      });
    }
    return created;
  }

  async retryDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.store.getDelivery(deliveryId);
    if (!delivery) {
      throw new Error(`Webhook delivery not found: ${deliveryId}`);
    }
    // Reset attempts + scheduling fields so the next attempt runs immediately.
    delivery.attempts = 0;
    delivery.status = 'pending';
    delivery.nextRetryAt = undefined;
    delivery.responseStatus = undefined;
    delivery.responseBody = undefined;
    await this.store.saveDelivery(delivery);

    void this.attemptDelivery(deliveryId).catch((e) => {
      logger.system().error('Webhook retry scheduling failed', { deliveryId }, e);
    });
  }

  async getDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]> {
    return this.store.listDeliveries(webhookId, limit);
  }

  // -------------------------------------------------------------------------
  // Internal: delivery attempt
  // -------------------------------------------------------------------------

  private async attemptDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.store.getDelivery(deliveryId);
    if (!delivery) return;
    if (delivery.status === 'delivered') return;

    const reg = await this.store.getRegistration(delivery.webhookId);
    if (!reg || !reg.isActive) {
      delivery.status = 'failed';
      delivery.responseBody = 'Webhook inactive or missing';
      await this.store.saveDelivery(delivery);
      return;
    }

    delivery.attempts += 1;
    await this.store.saveDelivery(delivery);

    const breaker = this.getBreaker(reg.url);
    try {
      const result = await breaker.execute(() =>
        withRetry(
          () => this.deliverOnce(reg, delivery.payload),
          {
            maxRetries: 2, // short-term retries inside one attempt
            strategy: 'exponential-jitter',
            baseDelayMs: 250,
            maxDelayMs: 4000,
            // Only retry on transient network errors (NOT on HTTP 4xx).
            retryOn: (e) => {
              const name = (e as Error)?.name ?? '';
              return name !== 'WebhookHttpError';
            },
          },
        ),
      );

      delivery.responseStatus = result.status;
      delivery.responseBody = result.body.slice(0, 1024); // cap stored body
      if (result.status >= 200 && result.status < 300) {
        delivery.status = 'delivered';
        delivery.deliveredAt = Date.now();
        delivery.nextRetryAt = undefined;
        await this.store.saveDelivery(delivery);
        logger.system().info('Webhook delivered', {
          deliveryId: delivery.id,
          webhookId: reg.id,
          url: reg.url,
          status: result.status,
          attempts: delivery.attempts,
        });
        return;
      }

      // Non-2xx response — treat as failure for retry/backoff purposes.
      throw new WebhookHttpError(`HTTP ${result.status}`, result.status);
    } catch (e) {
      await this.handleDeliveryFailure(delivery, reg, e);
    }
  }

  private async handleDeliveryFailure(
    delivery: WebhookDelivery,
    reg: WebhookRegistration,
    error: unknown,
  ): Promise<void> {
    const err = error as Error & { status?: number };
    if (err.status !== undefined) delivery.responseStatus = err.status;
    delivery.responseBody = (err.message ?? String(error)).slice(0, 1024);

    if (delivery.attempts >= this.opts.maxAttempts) {
      delivery.status = 'failed';
      delivery.nextRetryAt = undefined;
      await this.store.saveDelivery(delivery);
      await this.store.saveDeadLetter(delivery);
      logger.system().error('Webhook dead-lettered', {
        deliveryId: delivery.id,
        webhookId: reg.id,
        url: reg.url,
        attempts: delivery.attempts,
      });
      return;
    }

    // Schedule next attempt with exponential backoff.
    const backoff = Math.min(
      this.opts.baseRetryMs * Math.pow(2, delivery.attempts - 1),
      this.opts.maxRetryMs,
    );
    const jitter = Math.random() * backoff * 0.3;
    delivery.nextRetryAt = Date.now() + backoff + jitter;
    delivery.status = 'pending';
    await this.store.saveDelivery(delivery);

    logger.system().warn('Webhook delivery failed, scheduling retry', {
      deliveryId: delivery.id,
      webhookId: reg.id,
      attempts: delivery.attempts,
      nextRetryAt: delivery.nextRetryAt,
      error: err.message,
    });

    // Schedule the next attempt.
    const delay = delivery.nextRetryAt - Date.now();
    setTimeout(() => {
      void this.attemptDelivery(delivery.id).catch((e) => {
        logger.system().error('Webhook retry attempt failed', { deliveryId: delivery.id }, e);
      });
    }, Math.max(0, delay));
  }

  /** Single HTTP POST to a webhook endpoint. */
  private async deliverOnce(
    reg: WebhookRegistration,
    payload: WebhookPayload,
  ): Promise<{ status: number; body: string }> {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceValue = randomNonce(16);
    const signature = this.sign(reg.secret, `${timestamp}.${nonceValue}.${body}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    try {
      const response = await fetch(reg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Nonce': nonceValue,
          'X-Webhook-Event': payload.event,
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text().catch(() => '');
      return { status: response.status, body: text };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Compute the HMAC-SHA256 signature for a signed payload. */
  private sign(secret: string, signedPayload: string): string {
    return createHmac('sha256', secret).update(signedPayload).digest('hex');
  }

  /** Get-or-create a circuit breaker for a URL. */
  private getBreaker(url: string): CircuitBreaker {
    let b = this.breakers.get(url);
    if (!b) {
      b = new CircuitBreaker(`webhook:${url}`, this.opts.circuitBreaker);
      this.breakers.set(url, b);
    }
    return b;
  }

  /**
   * Periodic maintenance: prune expired nonces and retry pending deliveries
   * whose `nextRetryAt` has passed but weren't scheduled (e.g. process
   * restart). Safe to call from a worker on a fixed interval.
   */
  async processPending(): Promise<number> {
    const now = Date.now();
    // Prune nonce cache.
    for (const [k, expiresAt] of this.nonceCache) {
      if (expiresAt < now) this.nonceCache.delete(k);
    }
    // Find deliveries that need a kick.
    const pending = await this.store.listPendingDeliveries(100);
    for (const delivery of pending) {
      void this.attemptDelivery(delivery.id).catch((e) => {
        logger.system().error('Webhook pending retry failed', { deliveryId: delivery.id }, e);
      });
    }
    return pending.length;
  }
}

/** Custom error used to distinguish HTTP-level failures from network errors. */
class WebhookHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'WebhookHttpError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Webhook signature verification helper (used by receivers)
// ---------------------------------------------------------------------------

/**
 * Verify a webhook signature received on the other side. Constant-time
 * comparison. Returns `true` if the signature matches.
 *
 * Receivers should also check the timestamp freshness (e.g. reject if the
 * timestamp is more than 5 minutes old) to mitigate replay attacks.
 */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  nonceValue: string,
  body: string,
  signatureHeader: string,
): boolean {
  // Accept either `sha256=<hex>` or bare `<hex>`.
  const expected = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  const computed = createHmac('sha256', secret)
    .update(`${timestamp}.${nonceValue}.${body}`)
    .digest('hex');

  if (expected.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(computed));
  } catch {
    return false;
  }
}
