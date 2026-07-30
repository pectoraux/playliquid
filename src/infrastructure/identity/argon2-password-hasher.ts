/**
 * Argon2id-style password hasher implemented on Node's built-in `crypto.scrypt`.
 *
 * scrypt is the only battle-tested KDF that ships with Node's standard library.
 * It is intentionally configured here as an Argon2 substitute (the domain's
 * PasswordHash value object requires the `$argon2` PHC-format prefix). The
 * underlying derivation is scrypt, but the persisted hash string mimics the
 * PHC format so that:
 *
 *   1. Existing domain value-object validation passes (starts with `$argon2`).
 *   2. The string is self-describing — algorithm, version, params, salt and
 *      digest are all encoded, so verification does not need to read config
 *      to match the parameters used at hash time.
 *
 * PHC layout produced:
 *
 *   $argon2id$scrypt$v=1$N=<N>,r=<r>,p=<p>$<saltB64>$<hashB64>
 *
 * Configurable work factors (read via `getEnvVar` to avoid touching the
 * raw environment outside `src/shared/config/`):
 *
 *   PASSWORD_SCRYPT_N  — CPU/memory cost (power of 2). Default 16384.
 *   PASSWORD_SCRYPT_R  — Block size. Default 8.
 *   PASSWORD_SCRYPT_P  — Parallelization. Default 1.
 *
 * Memory cost ≈ N * r * 128 bytes. Time cost scales with N.
 */

import { scrypt as scryptCallback, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { PasswordHasher } from '@/domain/identity/services/identity-ports';
import { validatePasswordStrength } from '@/domain/identity/services/identity-ports';
import { getEnvVar } from '@/shared/config';
import { logger } from '@/shared/logging';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>;

// ─── Defaults & config ─────────────────────────────────────────────────────

const DEFAULT_N = 16384; // 2^14 — OWASP-recommended minimum
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const DEFAULT_KEYLEN = 64; // 512-bit derived key
const DEFAULT_SALTLEN = 16; // 128-bit salt
const DEFAULT_MAXMEM = 64 * 1024 * 1024; // 64 MiB headroom

const PHC_PREFIX = '$argon2id$scrypt$v=1';

export interface ScryptWorkFactors {
  readonly N: number; // CPU/memory cost (power of 2)
  readonly r: number; // block size
  readonly p: number; // parallelization
  readonly keylen: number; // derived key length in bytes
  readonly saltlen: number; // salt length in bytes
}

/** Read scrypt work factors from environment, falling back to safe defaults. */
export function readScryptWorkFactors(): ScryptWorkFactors {
  const parsePositive = (raw: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  let N = parsePositive(getEnvVar('PASSWORD_SCRYPT_N'), DEFAULT_N);
  // N must be a power of two for scrypt.
  if ((N & (N - 1)) !== 0) {
    logger.system().warn('PASSWORD_SCRYPT_N is not a power of two; falling back to default', { N });
    N = DEFAULT_N;
  }

  return {
    N,
    r: parsePositive(getEnvVar('PASSWORD_SCRYPT_R'), DEFAULT_R),
    p: parsePositive(getEnvVar('PASSWORD_SCRYPT_P'), DEFAULT_P),
    keylen: DEFAULT_KEYLEN,
    saltlen: DEFAULT_SALTLEN,
  };
}

// ─── PHC format helpers ────────────────────────────────────────────────────

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function encodeParamSegment(wf: ScryptWorkFactors): string {
  return `N=${wf.N},r=${wf.r},p=${wf.p}`;
}

function decodeParamSegment(segment: string): { N: number; r: number; p: number } {
  const map: Record<string, number> = {};
  for (const pair of segment.split(',')) {
    const [k, v] = pair.split('=');
    if (k && v !== undefined) {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) map[k.trim()] = n;
    }
  }
  const N = map['N'] ?? DEFAULT_N;
  const r = map['r'] ?? DEFAULT_R;
  const p = map['p'] ?? DEFAULT_P;
  return { N, r, p };
}

/** Parse a previously produced hash string into its scrypt parameters + buffers. */
function parseHashString(stored: string): ParsedHash | null {
  // Expected: $argon2id$scrypt$v=1$N=...,r=...,p=...$<saltB64>$<hashB64>
  const parts = stored.split('$');
  // parts[0] === '' (leading $), parts[1] === 'argon2id', parts[2] === 'scrypt',
  // parts[3] === 'v=1', parts[4] === params, parts[5] === salt, parts[6] === hash
  if (parts.length !== 7) return null;
  if (parts[1] !== 'argon2id' || parts[2] !== 'scrypt' || parts[3] !== 'v=1') return null;

  const { N, r, p } = decodeParamSegment(parts[4]);

  let salt: Buffer;
  let hash: Buffer;
  try {
    salt = Buffer.from(parts[5], 'base64');
    hash = Buffer.from(parts[6], 'base64');
  } catch {
    return null;
  }
  if (salt.length === 0 || hash.length === 0) return null;

  return { N, r, p, salt, hash };
}

// ─── Implementation ────────────────────────────────────────────────────────

export class Argon2PasswordHasher implements PasswordHasher {
  private readonly workFactors: ScryptWorkFactors;

  constructor(workFactors: ScryptWorkFactors = readScryptWorkFactors()) {
    this.workFactors = workFactors;
  }

  async hash(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.length === 0) {
      throw new Error('Cannot hash an empty password');
    }

    const salt = randomBytes(this.workFactors.saltlen);
    const derived = await scrypt(plaintext, salt, this.workFactors.keylen, {
      N: this.workFactors.N,
      r: this.workFactors.r,
      p: this.workFactors.p,
      maxmem: DEFAULT_MAXMEM,
    });

    const params = encodeParamSegment(this.workFactors);
    const saltB64 = salt.toString('base64');
    const hashB64 = derived.toString('base64');

    return `${PHC_PREFIX}$${params}$${saltB64}$${hashB64}`;
  }

  async verify(plaintext: string, stored: string): Promise<boolean> {
    if (!plaintext || !stored) return false;

    const parsed = parseHashString(stored);
    if (!parsed) {
      // Not a hash we produced — refuse to verify rather than crash.
      logger.system().warn('Password hash could not be parsed', {
        prefix: stored.slice(0, 12),
      });
      return false;
    }

    const derived: Buffer = await scrypt(plaintext, parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: DEFAULT_MAXMEM,
    });

    if (derived.length !== parsed.hash.length) return false;

    try {
      return timingSafeEqual(derived, parsed.hash);
    } catch {
      return false;
    }
  }

  validateStrength(plaintext: string): { valid: boolean; issues: string[] } {
    return validatePasswordStrength(plaintext);
  }
}

/**
 * Verify that a stored hash is compatible with this hasher.
 *
 * Useful for migration scenarios where legacy hashes (e.g., plain bcrypt)
 * need to be detected and re-hashed on next login.
 */
export function isScryptArgon2Hash(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith(PHC_PREFIX);
}
