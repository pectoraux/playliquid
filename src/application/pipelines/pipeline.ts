/**
 * Pipeline middleware contracts for the CommandBus and QueryBus.
 *
 * Middlewares form a chain-of-responsibility. Each middleware receives the
 * command/query and a `next` function that invokes the next middleware (or
 * the handler if this is the last middleware). Middlewares may:
 *   - Transform the input before calling next
 *   - Inspect/transform the result after next returns
 *   - Short-circuit by returning a result without calling next
 */

import type { Result } from '@/shared/types/result';
import type { Command } from '@/application/commands/command';
import type { Query } from '@/application/queries/query';

/** A command middleware. */
export interface CommandMiddleware {
  readonly name: string;
  handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>>;
}

/** A query middleware. */
export interface QueryMiddleware {
  readonly name: string;
  handle<T>(query: Query, next: (query: Query) => Promise<Result<T>>): Promise<Result<T>>;
}
