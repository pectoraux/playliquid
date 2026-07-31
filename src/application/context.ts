/**
 * Request context — AsyncLocalStorage propagation of correlation/trace IDs.
 *
 * Every request, command, and query enters a context scope. Downstream code
 * (handlers, repositories, projectors) can read the current correlation id
 * without threading it through every function parameter.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { correlationId as newCorrelationId, requestId as newRequestId, traceId as newTraceId } from '@/shared/ids';

export interface RequestContext {
  readonly correlationId: string;
  readonly traceId: string;
  readonly requestId: string;
  readonly userId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run a function within a request context scope. */
export function runInContext<T>(context: Partial<RequestContext>, fn: () => Promise<T>): Promise<T> {
  const full: RequestContext = {
    correlationId: context.correlationId ?? newCorrelationId(),
    traceId: context.traceId ?? newTraceId(),
    requestId: context.requestId ?? newRequestId(),
    userId: context.userId ?? null,
  };
  return storage.run(full, fn);
}

/** Get the current request context, or null if not in a scope. */
export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/** Get the current correlation id, or generate a fallback. */
export function getCorrelationId(): string {
  return storage.getStore()?.correlationId ?? newCorrelationId();
}
