import { PrismaClient } from '@prisma/client'
import { config as dotenvConfig } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env file manually if process.env.DATABASE_URL is not set
function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  // Try to read from .env file
  try {
    const envPath = resolve(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    const match = envContent.match(/^DATABASE_URL=(.+)$/m)
    if (match) {
      // Remove surrounding quotes if present
      let url = match[1].trim()
      if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
        url = url.slice(1, -1)
      }
      process.env.DATABASE_URL = url
      return url
    }
  } catch {
    // .env file not found or unreadable
  }

  // Fallback to SQLite for local development
  return 'file:./db/custom.db'
}

const databaseUrl = getDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    datasourceUrl: databaseUrl,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
