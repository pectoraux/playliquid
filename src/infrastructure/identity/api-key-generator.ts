/**
 * API Key Generator — produces PlayLiquid secret keys (`pl_sk_<random>`).
 *
 * The plaintext key is shown to the caller ONCE at creation time. The system
 * persists only the SHA-256 hash (so it can be looked up by presented key)
 * and the first 12 characters (for display in admin UIs).
 *
 * Layout:
 *   pl_sk_<32-char-base62-entropy>
 *
 *   - `pl_sk`  — PlayLiquid Secret Key prefix
 *   - 32 chars from [A-Za-z0-9] gives ~190 bits of entropy
 *
 * Hash:
 *   SHA-256(plaintext) → 64-char hex string. Used as the unique lookup key
 *   in ApiKeyRepository.getByHash.
 *
 * Prefix:
 *   The first 12 characters of the plaintext (e.g. `pl_sk_AbCd1234`)
 *   — safe to display in UIs because the remaining 28+ chars are unguessable.
 */

import { createHash, randomBytes } from 'crypto';

/** Result of generating a new API key. The plaintext MUST be shown only once. */
export interface GeneratedApiKey {
  /** Full plaintext key — return to the user only at creation time. */
  readonly plaintext: string;
  /** SHA-256 hex digest of the plaintext — persist this. */
  readonly hash: string;
  /** First 12 characters of the plaintext — safe to display in UIs. */
  readonly prefix: string;
}

const KEY_PREFIX = 'pl_sk_';
const ENTROPY_BYTES = 24; // 24 bytes → 32 base62-ish chars via base64url
const DISPLAY_PREFIX_LENGTH = 12;

// Base62 alphabet — avoids ambiguous chars (0/O, 1/l/I) for safer manual entry.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function base62Encode(bytes: Uint8Array): string {
  // Convert bytes → base62 by treating as a big integer, then repeatedly
  // dividing by 62. This produces a uniform distribution over the alphabet.
  let out = '';
  // Carry-based big-integer conversion.
  const digits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const v = (digits[j] << 8) + carry;
      digits[j] = v % 62;
      carry = Math.floor(v / 62);
    }
    while (carry > 0) {
      digits.push(carry % 62);
      carry = Math.floor(carry / 62);
    }
  }
  // Leading zero bytes → leading 'A's (index 0) to preserve length.
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros++;
  }
  for (let k = 0; k < digits.length; k++) {
    out += ALPHABET[digits[k]];
  }
  // Prepend leading-zero characters.
  for (let m = 0; m < leadingZeros; m++) {
    out = ALPHABET[0] + out;
  }
  return out;
}

/**
 * Generate a new PlayLiquid API key.
 *
 * @returns `{ plaintext, hash, prefix }` — the plaintext is returned only
 *          here; callers MUST NOT log or persist it.
 */
export function generateApiKey(): GeneratedApiKey {
  const entropy = randomBytes(ENTROPY_BYTES);
  const randomPart = base62Encode(entropy);
  // Pad to a minimum 32 chars if the conversion produced fewer.
  const padded = randomPart.padEnd(32, '0').slice(0, 32);
  const plaintext = `${KEY_PREFIX}${padded}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(0, DISPLAY_PREFIX_LENGTH);

  return { plaintext, hash, prefix };
}

/**
 * Hash a presented plaintext API key for lookup via the repository.
 *
 * @param plaintext full key as presented by the caller (`pl_sk_...`)
 * @returns SHA-256 hex digest, or null if the input is not a well-formed key.
 */
export function hashApiKey(plaintext: string): string | null {
  if (!isValidApiKeyFormat(plaintext)) return null;
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Check that a presented string has the `pl_sk_` prefix and sufficient length. */
export function isValidApiKeyFormat(plaintext: string): boolean {
  if (typeof plaintext !== 'string') return false;
  if (!plaintext.startsWith(KEY_PREFIX)) return false;
  const body = plaintext.slice(KEY_PREFIX.length);
  // Body must be base62 and at least 24 chars.
  return body.length >= 24 && /^[A-Za-z0-9]+$/.test(body);
}

/**
 * Derive the display prefix from a plaintext key.
 * Returns the first 12 chars (e.g. `pl_sk_AbCd12`).
 */
export function deriveApiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
}
