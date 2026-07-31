/**
 * Idempotency middleware — deduplicates command execution by key.
 *
 * If a command carries an `idempotencyKey`, the middleware checks the
 * IdempotencyStore. If a result exists, it is returned without re-executing.
 * Otherwise the command executes and the result is cached.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { Result } from '@/shared/types/result';
import type { IdempotencyStore } from './idempotency-store';
import { logger } from '@/shared/logging';

export class IdempotencyMiddleware implements CommandMiddleware {
  readonly name = 'idempotency';

  constructor(
    private readonly store: IdempotencyStore,
    private readonly ttlSeconds: number,
  ) {}

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const key = command.idempotencyKey;
    if (!key) {
      return next(command);
    }

    const existing = await this.store.get(key);
    if (existing) {
      logger.command().info('Idempotent hit — returning cached result', {
        idempotencyKey: key,
        commandType: command.commandType,
      });
      return existing.result as Result<T>;
    }

    const result = await next(command);

    if (result.ok) {
      await this.store.set(key, result, this.ttlSeconds);
    }

    return result;
  }
}
