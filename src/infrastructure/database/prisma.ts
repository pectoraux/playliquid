/**
 * Prisma client with transaction-context propagation.
 *
 * The default Prisma client is re-exported from the existing singleton in
 * `src/lib/db`. This module adds a transaction context based on
 * AsyncLocalStorage so that repositories automatically participate in the
 * active Unit of Work transaction without explicit client passing.
 *
 * IMPORTANT: This is the ONLY module in the entire codebase that imports
 * Prisma. All other infrastructure modules import from here.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';
import { AsyncLocalStorage } from 'async_hooks';
import { getConfig, getEnvVar } from '@/shared/config';

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = getEnvVar('DATABASE_URL') || 'file:./db/custom.db';

  // If using Turso (libsql://), use the libSQL adapter for serverless compatibility
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('libsql:')) {
    const authToken = getEnvVar('DATABASE_AUTH_TOKEN') || '';
    const libsql = createClient({ url: databaseUrl, authToken });
    const adapter = new PrismaLibSql(libsql);
    return new PrismaClient({ adapter } as never);
  }

  // Local development: standard SQLite
  return new PrismaClient({ log: ['error', 'warn'] });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (getConfig().nodeEnv !== 'production') globalForPrisma.prisma = prisma;

// ─── Transaction Context ──────────────────────────────────────────────────

const txStorage = new AsyncLocalStorage<PrismaTransactionClient>();

/** Run a function within a transaction client context. */
export function runInTransaction<T>(
  tx: PrismaTransactionClient,
  fn: () => Promise<T>,
): Promise<T> {
  return txStorage.run(tx, fn);
}

/** Get the active transaction client, or null if not in a transaction. */
export function getTransactionClient(): PrismaTransactionClient | null {
  return txStorage.getStore() ?? null;
}

/**
 * Get the database client to use: the active transaction client if one
 * exists, otherwise the default Prisma client.
 */
export function getClient(): PrismaClient | PrismaTransactionClient {
  return getTransactionClient() ?? prisma;
}
