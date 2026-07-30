/**
 * Health check registry — verifies the status of all core infrastructure.
 *
 * Each component registers a health check function. The health endpoints
 * (/health, /ready, /live) aggregate these checks.
 *
 *   /live  — is the process running? (always 200 if reachable)
 *   /ready — is the app ready to serve traffic? (all checks must pass)
 *   /health — overall status with component breakdown
 */

import { getClient } from '@/infrastructure/database/prisma';
import type { EventBus, OutboxRepository } from '@/application/ports';
import { logger } from '@/shared/logging';

export interface HealthCheckResult {
  readonly name: string;
  readonly status: 'healthy' | 'unhealthy' | 'degraded';
  readonly latencyMs: number;
  readonly details?: Record<string, unknown>;
}

export type HealthCheck = () => Promise<HealthCheckResult>;

export class HealthCheckRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  async runAll(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    checks: HealthCheckResult[];
  }> {
    const results: HealthCheckResult[] = [];
    for (const [name, check] of this.checks) {
      try {
        const result = await check();
        results.push(result);
      } catch (e: any) {
        results.push({
          name,
          status: 'unhealthy',
          latencyMs: 0,
          details: { error: e?.message ?? 'unknown error' },
        });
      }
    }

    const hasUnhealthy = results.some((r) => r.status === 'unhealthy');
    const hasDegraded = results.some((r) => r.status === 'degraded');
    const status = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    return { status, checks: results };
  }

  list(): string[] {
    return Array.from(this.checks.keys());
  }
}

/** Register default infrastructure health checks. */
export function registerDefaultHealthChecks(
  registry: HealthCheckRegistry,
  eventBus: EventBus,
  outbox: OutboxRepository,
): void {
  registry.register('database', async () => {
    const start = Date.now();
    try {
      const client = getClient();
      await client.$queryRaw`SELECT 1`;
      return {
        name: 'database',
        status: 'healthy' as const,
        latencyMs: Date.now() - start,
      };
    } catch (e: any) {
      return {
        name: 'database',
        status: 'unhealthy' as const,
        latencyMs: Date.now() - start,
        details: { error: e?.message },
      };
    }
  });

  registry.register('event-store', async () => {
    const start = Date.now();
    try {
      const client = getClient();
      const count = await client.eventRecord.count();
      return {
        name: 'event-store',
        status: 'healthy' as const,
        latencyMs: Date.now() - start,
        details: { eventCount: count },
      };
    } catch (e: any) {
      return {
        name: 'event-store',
        status: 'unhealthy' as const,
        latencyMs: Date.now() - start,
        details: { error: e?.message },
      };
    }
  });

  registry.register('event-bus', async () => {
    return {
      name: 'event-bus',
      status: 'healthy' as const,
      latencyMs: 0,
      details: { type: eventBus.constructor.name },
    };
  });

  registry.register('outbox', async () => {
    const start = Date.now();
    try {
      const counts = await outbox.countByStatus();
      const status = counts.failed > 0 ? 'degraded' : 'healthy';
      return {
        name: 'outbox',
        status,
        latencyMs: Date.now() - start,
        details: counts,
      };
    } catch (e: any) {
      return {
        name: 'outbox',
        status: 'unhealthy' as const,
        latencyMs: Date.now() - start,
        details: { error: e?.message },
      };
    }
  });

  registry.register('cache', async () => {
    return {
      name: 'cache',
      status: 'healthy' as const,
      latencyMs: 0,
      details: { type: 'InMemoryCache' },
    };
  });

  logger.system().info('Health checks registered', { checks: registry.list() });
}
