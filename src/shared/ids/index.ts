/**
 * Identity value generators.
 *
 * All IDs in the system are generated through this module so that the format
 * is consistent and traceable. IDs are prefixed strings that encode their
 * type, making logs and database rows self-documenting.
 */

import { randomUUID } from 'crypto';

/**
 * Generate a prefixed identifier.
 *
 * @example
 * createId('usr') // => "usr_01HZX..."
 */
export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** A plain UUID v4 without prefix. */
export function uuid(): string {
  return randomUUID();
}

/** A short, URL-safe random token (used for nonces). */
export function nonce(length = 24): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a correlation id. */
export function correlationId(): string {
  return createId('corr');
}

/** Generate a causation id. */
export function causationId(): string {
  return createId('caus');
}

/** Generate a request id. */
export function requestId(): string {
  return createId('req');
}

/** Generate a trace id. */
export function traceId(): string {
  return createId('trace');
}

/** Generate an event id. */
export function eventId(): string {
  return createId('evt');
}

/** Generate an aggregate stream id. */
export function streamId(aggregateType: string, aggregateId: string): string {
  return `${aggregateType.toLowerCase()}-${aggregateId}`;
}

/** Validate that a value is a non-empty string id. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
