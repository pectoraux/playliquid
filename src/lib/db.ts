import { PrismaClient } from '@prisma/client'
import { config as dotenvConfig } from 'dotenv'

// Load .env before Prisma client initialization
dotenvConfig()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    datasourceUrl: process.env.DATABASE_URL,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
