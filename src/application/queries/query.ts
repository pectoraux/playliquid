/**
 * Query base type.
 *
 * A query is a request for data. It never mutates state. Queries flow through
 * the QueryBus and are handled by exactly one QueryHandler.
 */

import type { Metadata } from '@/shared/types';

export interface Query<TResult = unknown> {
  /** Discriminator identifying the query type. */
  readonly queryType: string;
  readonly correlationId?: string;
  readonly userId?: string;
  readonly metadata?: Metadata;
}

/** A query that carries a typed payload (filter criteria). */
export interface QueryWithPayload<TPayload, TResult = unknown> extends Query<TResult> {
  readonly payload: TPayload;
}
