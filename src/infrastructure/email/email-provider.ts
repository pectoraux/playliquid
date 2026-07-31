/**
 * Email Provider Infrastructure
 *
 * Pluggable email delivery abstraction. Application code depends on the
 * `EmailProvider` interface; the DI container selects the implementation
 * (ConsoleEmailProvider for dev, SmtpEmailProvider for production).
 *
 * Features:
 *   - send / sendBulk / getStatus
 *   - Console provider logs to stdout (dev)
 *   - SMTP provider dynamically loads `nodemailer` and wraps every call in a
 *     CircuitBreaker so a misbehaving SMTP server can't take down the process
 *   - HTML + text + attachments + reply-to + custom headers
 */

import { CircuitBreaker, DEFAULT_CIRCUIT_OPTIONS } from '@/infrastructure/circuit-breaker/circuit-breaker';
import { logger } from '@/shared/logging';
import { createId } from '@/shared/ids';

// ---------------------------------------------------------------------------
// Public types (exact shape required by the spec)
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  templateId?: string;
  templateData?: Record<string, unknown>;
}

export interface EmailResult {
  messageId: string;
  status: 'sent' | 'queued' | 'failed';
  provider: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
  sendBulk(messages: EmailMessage[]): Promise<EmailResult[]>;
  getStatus(messageId: string): Promise<EmailResult | null>;
}

// ---------------------------------------------------------------------------
// ConsoleEmailProvider — development backend
// ---------------------------------------------------------------------------

/**
 * Development email provider that logs the message to stdout. Returns
 * deterministic-but-unique message IDs so callers can pretend the email was
 * queued. Status lookups always report `sent` for IDs this provider issued.
 */
export class ConsoleEmailProvider implements EmailProvider {
  private readonly issuedIds = new Set<string>();

  async send(message: EmailMessage): Promise<EmailResult> {
    const messageId = createId('email');
    this.issuedIds.add(messageId);

    const summary = {
      messageId,
      to: message.to,
      from: message.from ?? '(default)',
      subject: message.subject,
      hasHtml: message.html !== undefined,
      hasText: message.text !== undefined,
      attachments: message.attachments?.length ?? 0,
      templateId: message.templateId,
    };

    // Use logger so it appears in the structured log stream.
    logger.system().info('ConsoleEmailProvider.send', summary);

    // Also write the body to stdout for dev convenience (so a developer
    // running `next dev` can eyeball the rendered email).
    process.stdout.write(
      `\n📧 [EMAIL] to=${message.to} subject="${message.subject}"\n` +
        (message.text ? `----- text -----\n${message.text}\n----------------\n` : '') +
        (message.html ? `----- html -----\n${message.html.slice(0, 500)}${message.html.length > 500 ? '…' : ''}\n----------------\n` : '') +
        '\n',
    );

    return { messageId, status: 'sent', provider: 'console' };
  }

  async sendBulk(messages: EmailMessage[]): Promise<EmailResult[]> {
    const results: EmailResult[] = [];
    for (const msg of messages) {
      results.push(await this.send(msg));
    }
    return results;
  }

  async getStatus(messageId: string): Promise<EmailResult | null> {
    if (this.issuedIds.has(messageId)) {
      return { messageId, status: 'sent', provider: 'console' };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// SmtpEmailProvider — production backend (nodemailer, lazy import)
// ---------------------------------------------------------------------------

/**
 * Minimal local type for the nodemailer module so we don't have to depend on
 * `@types/nodemailer` at compile time. The actual `nodemailer` package is
 * imported lazily on first use; if it's not installed, a clear error is
 * thrown directing the operator to install it.
 */
interface NodemailerModule {
  createTransport(config: unknown): NodemailerTransport;
}

interface NodemailerTransport {
  sendMail(opts: Record<string, unknown>): Promise<{ messageId: string }>;
  verify(): Promise<true>;
}

/** SMTP transport configuration. Mirrors nodemailer's SMTP options. */
export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  /** Optional default `from` address if the message doesn't specify one. */
  defaultFrom?: string;
  /** Connection timeout in ms (default 10s). */
  connectionTimeout?: number;
}

export interface SmtpEmailProviderOptions {
  smtp: SmtpConfig;
  /** Override the circuit-breaker options. */
  circuitBreaker?: typeof DEFAULT_CIRCUIT_OPTIONS;
}

/**
 * SMTP email provider backed by `nodemailer`. Every call is routed through a
 * `CircuitBreaker` so a failing SMTP server fails fast instead of piling up
 * queued connections.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly breaker: CircuitBreaker;
  private transport: NodemailerTransport | null = null;
  private readonly smtp: SmtpConfig;
  private readonly defaultFrom: string | undefined;

  constructor(opts: SmtpEmailProviderOptions) {
    this.smtp = opts.smtp;
    this.defaultFrom = opts.smtp.defaultFrom;
    this.breaker = new CircuitBreaker('email:smtp', opts.circuitBreaker ?? DEFAULT_CIRCUIT_OPTIONS);
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    return this.breaker.execute(async () => {
      const transport = await this.ensureTransport();
      const from = message.from ?? this.defaultFrom;
      if (!from) {
        throw new Error('SmtpEmailProvider.send: message.from is required when no defaultFrom is configured');
      }

      const mailOptions: Record<string, unknown> = {
        from,
        to: message.to,
        subject: message.subject,
      };
      if (message.html) mailOptions.html = message.html;
      if (message.text) mailOptions.text = message.text;
      if (message.replyTo) mailOptions.replyTo = message.replyTo;
      if (message.headers) mailOptions.headers = message.headers;
      if (message.attachments && message.attachments.length > 0) {
        mailOptions.attachments = message.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        }));
      }

      try {
        const result = await transport.sendMail(mailOptions);
        return {
          messageId: result.messageId,
          status: 'sent',
          provider: 'smtp',
        };
      } catch (e) {
        logger.system().error('SMTP sendMail failed', { to: message.to, subject: message.subject }, e);
        throw e;
      }
    });
  }

  async sendBulk(messages: EmailMessage[]): Promise<EmailResult[]> {
    // Sequential delivery to be friendly to SMTP servers; can be parallelised
    // later if needed. Each call is independently circuit-breaker protected.
    const results: EmailResult[] = [];
    for (const msg of messages) {
      try {
        results.push(await this.send(msg));
      } catch (e) {
        results.push({
          messageId: createId('email-failed'),
          status: 'failed',
          provider: 'smtp',
        });
        logger.system().error('SMTP bulk send item failed', { to: msg.to }, e);
      }
    }
    return results;
  }

  async getStatus(_messageId: string): Promise<EmailResult | null> {
    // SMTP is fire-and-forget — there is no general "get status by id" API.
    // Returns null to indicate the provider cannot look up status.
    return null;
  }

  private async ensureTransport(): Promise<NodemailerTransport> {
    if (this.transport) return this.transport;
    try {
      const mod = (await import(/* webpackIgnore: true */ 'nodemailer')) as unknown as NodemailerModule;
      const transportConfig: Record<string, unknown> = {
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.secure ?? this.smtp.port === 465,
        connectionTimeout: this.smtp.connectionTimeout ?? 10000,
      };
      if (this.smtp.auth) {
        transportConfig.auth = {
          user: this.smtp.auth.user,
          pass: this.smtp.auth.pass,
        };
      }
      this.transport = mod.createTransport(transportConfig);
      logger.system().info('SMTP transport initialised', { host: this.smtp.host, port: this.smtp.port });
      return this.transport;
    } catch (e) {
      throw new Error(
        'SmtpEmailProvider requires the `nodemailer` package. ' +
          'Install it with: bun add nodemailer && bun add -d @types/nodemailer. ' +
          `Original error: ${(e as Error).message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an EmailProvider from configuration. Selects `ConsoleEmailProvider`
 * unless SMTP config is supplied via the `EMAIL_SMTP_HOST` env var.
 */
export async function createEmailProvider(): Promise<EmailProvider> {
  // Read environment through the shared config layer so we don't violate the
  // "no raw env access outside shared/config" architecture rule.
  const { getEnvVar } = await import('@/shared/config');
  const host = getEnvVar('EMAIL_SMTP_HOST');
  if (!host) {
    return new ConsoleEmailProvider();
  }
  const portStr = getEnvVar('EMAIL_SMTP_PORT');
  const port = portStr ? Number(portStr) : 587;
  const user = getEnvVar('EMAIL_SMTP_USER');
  const pass = getEnvVar('EMAIL_SMTP_PASS');
  const defaultFrom = getEnvVar('EMAIL_FROM');
  return new SmtpEmailProvider({
    smtp: {
      host,
      port,
      secure: getEnvVar('EMAIL_SMTP_SECURE') === 'true',
      auth: user && pass ? { user, pass } : undefined,
      defaultFrom,
    },
  });
}
