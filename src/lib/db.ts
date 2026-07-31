/**
 * Prisma client with Turso (libSQL) support for serverless deployment.
 *
 * - Local development: uses SQLite file database
 * - Production (Vercel): uses Turso (libSQL) when DATABASE_URL starts with "libsql:"
 *
 * To set up Turso for production:
 * 1. Create a free account at https://turso.tech
 * 2. Create a database: `turso db create playliquid`
 * 3. Get the connection string: `turso db show playliquid --url`
 * 4. Get the auth token: `turso db tokens create playliquid`
 * 5. Set these environment variables on Vercel:
 *    - DATABASE_URL=libsql://playliquid-xxx.turso.io
 *    - DATABASE_AUTH_TOKEN=xxx
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || 'file:./db/custom.db';

  // If using Turso (libsql://), use the libSQL adapter
  if (databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('libsql:')) {
    const authToken = process.env.DATABASE_AUTH_TOKEN || '';
    const libsql = createClient({ url: databaseUrl, authToken });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter } as never);
  }

  // Local development: use standard SQLite
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
