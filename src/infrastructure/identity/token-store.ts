/**
 * In-memory token store — issues and validates one-time tokens.
 *
 * Used for email verification and password reset. In production this would
 * be Redis-backed for multi-instance consistency.
 */

import type { TokenStore, TokenType } from '@/application/ports/identity-ports';
import { createId } from '@/shared/ids';
import { logger } from '@/shared/logging';

interface StoredToken {
  readonly token: string;
  readonly type: TokenType;
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: number;
  readonly used: boolean;
}

export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, StoredToken>();

  async issue(params: {
    type: TokenType;
    userId: string;
    email: string;
    ttlSeconds: number;
  }): Promise<string> {
    const token = createId('tok');
    const stored: StoredToken = {
      token,
      type: params.type,
      userId: params.userId,
      email: params.email,
      expiresAt: Date.now() + params.ttlSeconds * 1000,
      used: false,
    };
    this.tokens.set(token, stored);
    logger.system().debug('Token issued', { type: params.type, userId: params.userId });
    return token;
  }

  async validate(token: string, type: TokenType): Promise<{ userId: string; email: string } | null> {
    const stored = this.tokens.get(token);
    if (!stored) return null;
    if (stored.used) return null;
    if (stored.type !== type) return null;
    if (Date.now() > stored.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return { userId: stored.userId, email: stored.email };
  }

  async consume(token: string): Promise<void> {
    const stored = this.tokens.get(token);
    if (stored) {
      this.tokens.set(token, { ...stored, used: true });
      // Clean up after a delay
      setTimeout(() => this.tokens.delete(token), 60000);
    }
  }

  async revoke(token: string): Promise<void> {
    this.tokens.delete(token);
  }

  /** Purge expired tokens (housekeeping). */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [token, stored] of this.tokens) {
      if (now > stored.expiresAt || stored.used) {
        this.tokens.delete(token);
        count++;
      }
    }
    return count;
  }
}
