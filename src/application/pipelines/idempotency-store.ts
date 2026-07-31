/**
 * Idempotency store contract.
 *
 * Stores the result of a command execution keyed by an idempotency key.
 * When the same key is seen again, the stored result is returned without
 * re-executing the command. Entries expire after a configurable TTL.
 */

export interface IdempotencyRecord {
  readonly key: string;
  readonly result: unknown;
  readonly expiresAt: string;
}

export interface IdempotencyStore {
  /** Get a stored result by key. Returns null if missing or expired. */
  get(key: string): Promise<IdempotencyRecord | null>;

  /** Store a result with a TTL. */
  set(key: string, result: unknown, ttlSeconds: number): Promise<void>;

  /** Remove a record. */
  delete(key: string): Promise<void>;
}
