/**
 * Prisma Unit of Work implementation.
 *
 * Wraps command handler execution in a Prisma interactive transaction. The
 * transaction client is propagated via AsyncLocalStorage so that the event
 * store, outbox, and repositories all participate in the same transaction.
 *
 * This guarantees atomicity: domain events are written to the event store
 * AND the outbox in a single transaction. Either both succeed or both fail.
 */

import type { UnitOfWork, UnitOfWorkFactory } from '@/application/unit-of-work/unit-of-work';
import { prisma, runInTransaction, type PrismaTransactionClient } from '@/infrastructure/database/prisma';

export class PrismaUnitOfWork implements UnitOfWork {
  private active = false;

  async begin(): Promise<void> {
    this.active = true;
  }

  async commit(): Promise<void> {
    this.active = false;
  }

  async rollback(): Promise<void> {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Execute a function within a database transaction.
   *
   * The function runs inside Prisma's `$transaction` callback, and the
   * transaction client is propagated via AsyncLocalStorage. If the function
   * throws, the transaction rolls back. If it succeeds, it commits.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (getActiveTransaction()) {
      // Already inside a transaction — just run the function.
      return fn();
    }
    return prisma.$transaction(async (tx: PrismaTransactionClient) => {
      return runInTransaction(tx, fn);
    });
  }
}

export class PrismaUnitOfWorkFactory implements UnitOfWorkFactory {
  create(): UnitOfWork {
    return new PrismaUnitOfWork();
  }
}

// Internal: track active transaction for nested UoW detection.
let activeTransactionDepth = 0;

function getActiveTransaction(): boolean {
  return activeTransactionDepth > 0;
}

export function _setTransactionDepth(depth: number): void {
  activeTransactionDepth = depth;
}
