/**
 * Correlation middleware — ensures every command has a correlation id and
 * runs the rest of the pipeline within a request context scope.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { runInContext, getRequestContext } from '@/application/context';
import { Result } from '@/shared/types/result';

export class CorrelationMiddleware implements CommandMiddleware {
  readonly name = 'correlation';

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const existing = getRequestContext();
    const correlationId = command.correlationId ?? existing?.correlationId;

    const enriched: Command = correlationId
      ? { ...command, correlationId }
      : command;

    return runInContext(
      { correlationId: enriched.correlationId, userId: command.userId ?? null },
      () => next(enriched),
    );
  }
}
