/**
 * Authentication utilities — password hashing, verification, session tokens.
 *
 * Uses scrypt (Node built-in) for password hashing and HMAC-SHA256 for
 * session token signing. No external auth library needed — this is a
 * lightweight, secure implementation.
 */

import * as crypto from 'crypto';
import { getConfig } from '@/shared/config';

const SESSION_COOKIE = 'pl_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Verify a plaintext password against a stored hash. */
export function verifyPassword(plaintext: string, storedHash: string): boolean {
  try {
    // Format: $scrypt$salt$hash
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[1] !== 'scrypt') return false;
    const salt = parts[2];
    const expectedHash = parts[3];
    const hash = crypto.scryptSync(plaintext, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}

/** Create a signed session token. */
export function createSessionToken(payload: SessionPayload): string {
  const config = getConfig();
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', config.auth.secret).update(data).digest('hex');
  return `${data}.${signature}`;
}

/** Verify and decode a session token. */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const config = getConfig();
    const [data, signature] = token.split('.');
    if (!data || !signature) return null;

    const expectedSignature = crypto.createHmac('sha256', config.auth.secret).update(data).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64').toString()) as SessionPayload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface SessionPayload {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  roles: string[];
  activeRole: string;
  isDemo: boolean;
  isPermanent: boolean;
  expiresAt: number;
}

export { SESSION_COOKIE, SESSION_TTL_SECONDS };
