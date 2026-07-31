/**
 * Logging middleware — structured logs for every command dispatch.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { Result } from '@/shared/types/result';
import { logger } from '@/shared/logging';
import { getRequestContext } from '@/application/context';

export class LoggingMiddleware implements CommandMiddleware {
  readonly name = 'logging';

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const ctx = getRequestContext();
    const log = logger.command();
    const startedAt = Date.now();

    log.info('Command dispatching', {
      commandType: command.commandType,
      correlationId: command.correlationId ?? ctx?.correlationId,
      userId: command.userId,
    });

    try {
      const result = await next(command);
      const durationMs = Date.now() - startedAt;

      if (result.ok) {
        log.info('Command succeeded', { commandType: command.commandType, durationMs });
      } else {
        log.warn('Command failed', {
          commandType: command.commandType,
          durationMs,
          error: (result.error as Error)?.message,
        });
      }

      return result;
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      log.error('Command threw unexpectedly', { commandType: command.commandType, durationMs }, e);
      throw e;
    }
  }
}
