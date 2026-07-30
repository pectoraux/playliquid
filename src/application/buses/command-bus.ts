/**
 * Command Bus.
 *
 * Routes commands to their registered handler through a configurable
 * middleware pipeline. Commands NEVER know about Prisma, the database, or
 * any infrastructure concern — they are pure intentions.
 *
 * Pipeline order (outer to inner):
 *   1. Correlation  — establish trace context
 *   2. Logging      — structured command logs
 *   3. Metrics      — timing / counters
 *   4. Idempotency  — dedup by key
 *   5. Validation   — schema validation
 *   6. Authorization — policy enforcement
 *   7. Transaction  — UoW boundary
 *   8. Handler      — actual execution
 */

import { Result } from '@/shared/types/result';
import type { DomainError } from '@/domain/shared/errors';
import type { Command } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { CommandMiddleware } from '@/application/pipelines/pipeline';
import { ConfigurationError } from '@/domain/shared/errors';
import { logger } from '@/shared/logging';

export class CommandBus {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly middlewares: CommandMiddleware[] = [];

  /** Register a command handler. */
  register(handler: CommandHandler): void {
    if (this.handlers.has(handler.commandType)) {
      throw new ConfigurationError(
        `Duplicate command handler for type: ${handler.commandType}`,
      );
    }
    this.handlers.set(handler.commandType, handler);
    logger.command().info('Command handler registered', { commandType: handler.commandType });
  }

  /** Add a middleware to the pipeline. Middlewares execute in registration order. */
  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  /** Dispatch a command through the middleware pipeline to its handler. */
  async dispatch<T = unknown>(command: Command): Promise<Result<T, DomainError>> {
    const handler = this.handlers.get(command.commandType);
    if (!handler) {
      return Result.fail(
        new ConfigurationError(`No handler registered for command: ${command.commandType}`),
      );
    }

    // Build the middleware chain. The innermost "next" calls the handler.
    const execute = this.middlewares.reduceRight(
      (next, middleware) => {
        return (cmd: Command) => middleware.handle<T>(cmd, next);
      },
      (cmd: Command) => handler.execute(cmd) as Promise<Result<T>>,
    );

    return execute(command);
  }

  /** Check whether a handler is registered for a command type. */
  hasHandler(commandType: string): boolean {
    return this.handlers.has(commandType);
  }

  /** List all registered command types. */
  getCommandTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
