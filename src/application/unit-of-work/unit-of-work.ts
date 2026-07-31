/**
 * Unit of Work — transaction boundary.
 *
 * Defines the contract for transaction management. The infrastructure
 * implements this (e.g., wrapping Prisma's `$transaction`). Repositories
 * participate automatically by checking the active transaction context.
 *
 * The Unit of Work is injected by the DI container and used by the
 * TransactionMiddleware to wrap command handler execution.
 *
 * The `execute` method is the primary entry point: it runs the provided
 * function inside a database transaction, propagating the transaction client
 * via AsyncLocalStorage so that all repositories participate atomically.
 */

export interface UnitOfWork {
  /** Begin a transaction (manual mode). */
  begin(): Promise<void>;

  /** Commit the transaction (manual mode). */
  commit(): Promise<void>;

  /** Rollback the transaction (manual mode). */
  rollback(): Promise<void>;

  /** Whether a transaction is currently active. */
  isActive(): boolean;

  /**
   * Execute a function within a transaction.
   *
   * The function runs inside the database transaction, and the transaction
   * client is propagated via AsyncLocalStorage. If the function throws, the
   * transaction rolls back. If it succeeds, it commits.
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

/** Factory for creating units of work. */
export interface UnitOfWorkFactory {
  create(): UnitOfWork;
}

/** A no-op unit of work (for read-only operations or testing). */
export class NoOpUnitOfWork implements UnitOfWork {
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

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.active = true;
    try {
      return await fn();
    } finally {
      this.active = false;
    }
  }
}
