/**
 * SMS Provider Infrastructure
 *
 * Pluggable SMS delivery abstraction. Application code depends on the
 * `SmsProvider` interface; the DI container selects the implementation
 * (ConsoleSmsProvider for dev, TwilioSmsProvider for production).
 *
 * Features:
 *   - send / sendBulk / getStatus
 *   - Console provider logs to stdout (dev)
 *   - Twilio provider dynamically loads the `twilio` SDK and protects every
 *     call with a CircuitBreaker
 *   - Optional mediaUrl for MMS-style messages
 */

import { CircuitBreaker, DEFAULT_CIRCUIT_OPTIONS } from '@/infrastructure/circuit-breaker/circuit-breaker';
import { logger } from '@/shared/logging';
import { createId } from '@/shared/ids';

// ---------------------------------------------------------------------------
// Public types (exact shape required by the spec)
// ---------------------------------------------------------------------------

export interface SmsMessage {
  to: string;
  from?: string;
  body: string;
  mediaUrl?: string;
}

export interface SmsResult {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
  provider: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<SmsResult>;
  sendBulk(messages: SmsMessage[]): Promise<SmsResult[]>;
  getStatus(messageId: string): Promise<SmsResult | null>;
}

// ---------------------------------------------------------------------------
// ConsoleSmsProvider — development backend
// ---------------------------------------------------------------------------

/**
 * Development SMS provider that logs the message to stdout. Returns unique
 * message IDs; status lookups always report `sent` for IDs this provider
 * issued.
 */
export class ConsoleSmsProvider implements SmsProvider {
  private readonly issuedIds = new Set<string>();

  async send(message: SmsMessage): Promise<SmsResult> {
    const messageId = createId('sms');
    this.issuedIds.add(messageId);

    const summary = {
      messageId,
      to: message.to,
      from: message.from ?? '(default)',
      bodyLength: message.body.length,
      mediaUrl: message.mediaUrl,
    };
    logger.system().info('ConsoleSmsProvider.send', summary);

    process.stdout.write(
      `\n📱 [SMS] to=${message.to} from=${message.from ?? '(default)'}\n` +
        `   body: ${message.body}\n` +
        (message.mediaUrl ? `   media: ${message.mediaUrl}\n` : '') +
        '\n',
    );

    return { messageId, status: 'sent', provider: 'console' };
  }

  async sendBulk(messages: SmsMessage[]): Promise<SmsResult[]> {
    const results: SmsResult[] = [];
    for (const msg of messages) {
      results.push(await this.send(msg));
    }
    return results;
  }

  async getStatus(messageId: string): Promise<SmsResult | null> {
    if (this.issuedIds.has(messageId)) {
      return { messageId, status: 'sent', provider: 'console' };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// TwilioSmsProvider — production backend
// ---------------------------------------------------------------------------

/**
 * Minimal local type for the `twilio` SDK. We define these locally so we
 * don't have to depend on `@types/twilio` at compile time; the real module
 * is imported lazily on first use.
 */
interface TwilioClientLike {
  messages: {
    create(payload: Record<string, unknown>): Promise<{ sid: string; status: string }>;
  }
}

interface TwilioModuleLike {
  Twilio: new (accountSid: string, authToken: string) => TwilioClientLike;
}

/** Statuses Twilio considers "delivered-ish". */
const TWILIO_DELIVERED = new Set(['delivered', 'sent', 'queued', 'accepted']);
const TWILIO_FAILED = new Set(['failed', 'undelivered', 'canceled']);

export interface TwilioSmsProviderOptions {
  accountSid: string;
  authToken: string;
  /** Default sender (E.164 phone number or messaging-service sid). */
  from: string;
  /** Optional webhook status callback URL. */
  statusCallback?: string;
  circuitBreaker?: typeof DEFAULT_CIRCUIT_OPTIONS;
}

/**
 * Twilio SMS provider. The `twilio` package is imported lazily so that
 * projects that don't use SMS don't have to install it. Every send/getStatus
 * call is wrapped in a CircuitBreaker.
 */
export class TwilioSmsProvider implements SmsProvider {
  private readonly breaker: CircuitBreaker;
  private client: TwilioClientLike | null = null;
  private readonly opts: TwilioSmsProviderOptions;

  constructor(opts: TwilioSmsProviderOptions) {
    this.opts = opts;
    this.breaker = new CircuitBreaker('sms:twilio', opts.circuitBreaker ?? DEFAULT_CIRCUIT_OPTIONS);
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    return this.breaker.execute(async () => {
      const client = await this.ensureClient();
      const from = message.from ?? this.opts.from;
      const payload: Record<string, unknown> = {
        to: message.to,
        from,
        body: message.body,
      };
      if (message.mediaUrl) payload.mediaUrl = message.mediaUrl;
      if (this.opts.statusCallback) payload.statusCallback = this.opts.statusCallback;

      try {
        const result = await client.messages.create(payload);
        const status: SmsResult['status'] = result.status === 'queued' || result.status === 'accepted'
          ? 'queued'
          : TWILIO_FAILED.has(result.status)
            ? 'failed'
            : 'sent';
        return { messageId: result.sid, status, provider: 'twilio' };
      } catch (e) {
        logger.system().error('Twilio send failed', { to: message.to }, e);
        throw e;
      }
    });
  }

  async sendBulk(messages: SmsMessage[]): Promise<SmsResult[]> {
    const results: SmsResult[] = [];
    for (const msg of messages) {
      try {
        results.push(await this.send(msg));
      } catch (e) {
        results.push({ messageId: createId('sms-failed'), status: 'failed', provider: 'twilio' });
        logger.system().error('Twilio bulk send item failed', { to: msg.to }, e);
      }
    }
    return results;
  }

  async getStatus(messageId: string): Promise<SmsResult | null> {
    return this.breaker.execute(async () => {
      const client = await this.ensureClient();
      // The Twilio SDK exposes `client.messages(sid).fetch()`. We use a
      // minimal cast to avoid pulling in full typings.
      const messagesApi = client.messages as unknown as {
        (sid: string): { fetch(): Promise<{ sid: string; status: string }> };
      };
      try {
        const msg = await messagesApi(messageId).fetch();
        const status: SmsResult['status'] = TWILIO_DELIVERED.has(msg.status)
          ? 'sent'
          : TWILIO_FAILED.has(msg.status)
            ? 'failed'
            : 'queued';
        return { messageId: msg.sid, status, provider: 'twilio' };
      } catch (e) {
        logger.system().warn('Twilio getStatus lookup failed', { messageId, error: (e as Error).message });
        return null;
      }
    });
  }

  private async ensureClient(): Promise<TwilioClientLike> {
    if (this.client) return this.client;
    try {
      const mod = (await import(/* webpackIgnore: true */ 'twilio')) as unknown as TwilioModuleLike | { default: TwilioModuleLike };
      const TwilioMod = ('default' in mod ? mod.default : mod) as TwilioModuleLike;
      this.client = new TwilioMod.Twilio(this.opts.accountSid, this.opts.authToken);
      logger.system().info('Twilio SMS client initialised', { accountSid: this.opts.accountSid.slice(0, 6) + '…' });
      return this.client;
    } catch (e) {
      throw new Error(
        'TwilioSmsProvider requires the `twilio` package. ' +
          'Install it with: bun add twilio. ' +
          `Original error: ${(e as Error).message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an SmsProvider from configuration. Selects `ConsoleSmsProvider`
 * unless the required Twilio env vars are present.
 */
export async function createSmsProvider(): Promise<SmsProvider> {
  const { getEnvVar } = await import('@/shared/config');
  const accountSid = getEnvVar('TWILIO_ACCOUNT_SID');
  const authToken = getEnvVar('TWILIO_AUTH_TOKEN');
  const from = getEnvVar('TWILIO_FROM');
  if (!accountSid || !authToken || !from) {
    return new ConsoleSmsProvider();
  }
  return new TwilioSmsProvider({
    accountSid,
    authToken,
    from,
    statusCallback: getEnvVar('TWILIO_STATUS_CALLBACK'),
  });
}
