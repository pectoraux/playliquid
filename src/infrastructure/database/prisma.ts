/**
 * Prisma client with transaction-context propagation.
 *
 * IMPORTANT: This is the ONLY module in the entire codebase that imports
 * Prisma. All other infrastructure modules import from here.
 */

import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { getConfig } from '@/shared/config';
import { loadEnv } from '@/shared/config';

// Ensure env is loaded
loadEnv();

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['error', 'warn'] });

if (getConfig().nodeEnv !== 'production') globalForPrisma.prisma = prisma;

// ─── Transaction Context ──────────────────────────────────────────────────

const txStorage = new AsyncLocalStorage<PrismaTransactionClient>();

export function runInTransaction<T>(
  tx: PrismaTransactionClient,
  fn: () => Promise<T>,
): Promise<T> {
  return txStorage.run(tx, fn);
}

export function getTransactionClient(): PrismaTransactionClient | null {
  return txStorage.getStore() ?? null;
}

export function getClient(): PrismaClient | PrismaTransactionClient {
  return getTransactionClient() ?? prisma;
}
