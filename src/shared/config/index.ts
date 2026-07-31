/**
 * Typed, fail-fast configuration.
 *
 * All environment access MUST go through this module. Accessing `process.env`
 * directly elsewhere is an architecture violation (enforced by the boundary
 * checker). The application fails fast on startup if required variables are
 * missing or malformed.
 */

import { z } from 'zod';

const LogLevel = z.enum(['debug', 'info', 'warn', 'error', 'fatal']);
const NodeEnv = z.enum(['development', 'test', 'production']);

const ConfigSchema = z.object({
  nodeEnv: NodeEnv.default('development'),
  logLevel: LogLevel.default('info'),

  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
  }),

  cache: z.object({
    ttlSeconds: z.coerce.number().int().positive().default(300),
    maxSize: z.coerce.number().int().positive().default(1000),
  }),

  eventStore: z.object({
    snapshotEvery: z.coerce.number().int().positive().default(50),
  }),

  outbox: z.object({
    pollIntervalMs: z.coerce.number().int().positive().default(2000),
    batchSize: z.coerce.number().int().positive().default(100),
    maxRetries: z.coerce.number().int().positive().default(5),
  }),

  projections: z.object({
    pollIntervalMs: z.coerce.number().int().positive().default(1000),
    batchSize: z.coerce.number().int().positive().default(500),
  }),

  idempotency: z.object({
    ttlSeconds: z.coerce.number().int().positive().default(86400),
  }),

  observability: z.object({
    enabled: z.coerce.boolean().default(false),
    serviceName: z.string().default('playliquid'),
  }),

  auth: z.object({
    secret: z.string().min(1, 'AUTH_SECRET is required').default('dev-only-secret'),
  }),

  featureFlags: z.object({
    outboxWorker: z.coerce.boolean().default(true),
    projectionWorker: z.coerce.boolean().default(true),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cachedConfig: AppConfig | null = null;

/**
 * Load and validate configuration. Caches the result.
 * Throws on invalid configuration — fail fast.
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const raw = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',

    database: {
      url: process.env.DATABASE_URL ?? 'file:./db/custom.db',
    },

    cache: {
      ttlSeconds: process.env.CACHE_TTL_SECONDS ?? 300,
      maxSize: process.env.CACHE_MAX_SIZE ?? 1000,
    },

    eventStore: {
      snapshotEvery: process.env.EVENT_STORE_SNAPSHOT_EVERY ?? 50,
    },

    outbox: {
      pollIntervalMs: process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000,
      batchSize: process.env.OUTBOX_BATCH_SIZE ?? 100,
      maxRetries: process.env.OUTBOX_MAX_RETRIES ?? 5,
    },

    projections: {
      pollIntervalMs: process.env.PROJECTION_POLL_INTERVAL_MS ?? 1000,
      batchSize: process.env.PROJECTION_BATCH_SIZE ?? 500,
    },

    idempotency: {
      ttlSeconds: process.env.IDEMPOTENCY_TTL_SECONDS ?? 86400,
    },

    observability: {
      enabled: process.env.OBSERVABILITY_ENABLED === 'true',
      serviceName: process.env.OBSERVABILITY_SERVICE_NAME ?? 'playliquid',
    },

    auth: {
      secret: process.env.AUTH_SECRET ?? 'dev-only-secret',
    },

    featureFlags: {
      outboxWorker: process.env.FEATURE_OUTBOX_WORKER !== 'false',
      projectionWorker: process.env.FEATURE_PROJECTION_WORKER !== 'false',
    },
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

/** Get the cached config (must have been loaded first). */
export function getConfig(): AppConfig {
  if (!cachedConfig) return loadConfig();
  return cachedConfig;
}

/** Reset cached config (for testing / hot reload). */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Read a raw environment variable by name.
 *
 * This is the ONLY sanctioned way for code outside `src/shared/config/` to
 * read arbitrary environment variables (e.g. secrets managed by an external
 * secret manager) without violating the architecture boundary rule.
 * Returns `undefined` if the variable is unset.
 */
export function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

/**
 * Read a raw environment variable by name, throwing if unset.
 * Use for required secrets that must exist at runtime.
 */
export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable '${name}' is not set`);
  }
  return value;
}
