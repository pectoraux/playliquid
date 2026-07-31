/**
 * Transaction middleware — wraps command execution in a Unit of Work.
 *
 * Uses the `execute` method to run the handler inside a database transaction.
 * The transaction client is propagated via AsyncLocalStorage so that the event
 * store and outbox participate in the same transaction, guaranteeing that
 * domain events are persisted atomically with state changes.
 *
 * If the handler returns a failure Result, the transaction rolls back.
 * If the handler throws, the transaction rolls back.
 * If the handler succeeds, the transaction commits.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { Result } from '@/shared/types/result';
import type { UnitOfWorkFactory } from '@/application/unit-of-work/unit-of-work';
import { logger } from '@/shared/logging';

export class TransactionMiddleware implements CommandMiddleware {
  readonly name = 'transaction';

  constructor(private readonly uowFactory: UnitOfWorkFactory) {}

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const uow = this.uowFactory.create();

    return uow.execute(async () => {
      try {
        const result = await next(command);
        if (result.ok) {
          logger.command().debug('Transaction will commit', { commandType: command.commandType });
        } else {
          logger.command().debug('Transaction will rollback (business failure)', {
            commandType: command.commandType,
          });
        }
        return result;
      } catch (e) {
        logger.command().error('Transaction will rollback (exception)', {
          commandType: command.commandType,
        }, e);
        throw e;
      }
    });
  }
}
