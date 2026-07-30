/**
 * HTTP interface handlers — pure functions that take a Request and return a
 * Response. The Next.js route handlers in src/app/api/ are thin wrappers
 * around these. This keeps the interface logic testable and decoupled from
 * the Next.js runtime.
 */

import { NextResponse } from 'next/server';
import { getContainer } from '@/infrastructure/di/composition-root';
import { TOKENS } from '@/infrastructure/di/tokens';
import type { HealthCheckRegistry } from '@/infrastructure/telemetry/health-checks';
import type { ExtendedHealthCheckRegistry } from '@/infrastructure/telemetry/extended-health-checks';
import type { CommandBus } from '@/application/buses/command-bus';
import type { QueryBus } from '@/application/buses/query-bus';
import type { MetricsFramework } from '@/infrastructure/metrics/metrics-framework';
import type { WorkerRegistry } from '@/infrastructure/workers/worker-framework';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/feature-flags';
import type { CircuitBreakerRegistry } from '@/infrastructure/circuit-breaker/circuit-breaker';
import { getRegisteredEventTypes } from '@/domain/shared/event/event-registry';
import { runInContext } from '@/application/context';
import { requestId, traceId } from '@/shared/ids';
import type { Command } from '@/application/commands/command';
import type { Query } from '@/application/queries/query';
import type { DomainError } from '@/domain/shared/errors';

/** /health — overall status with component breakdown. */
export async function handleHealth(): Promise<NextResponse> {
  const container = await getContainer();
  const registry = container.resolve<HealthCheckRegistry>(TOKENS.HealthCheckRegistry);
  const result = await registry.runAll();

  const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;

  return NextResponse.json(
    { status: result.status, timestamp: new Date().toISOString(), checks: result.checks },
    { status: statusCode },
  );
}

/** /ready — readiness probe (all checks must pass). */
export async function handleReady(): Promise<NextResponse> {
  const container = await getContainer();
  const registry = container.resolve<HealthCheckRegistry>(TOKENS.HealthCheckRegistry);
  const result = await registry.runAll();
  const ready = result.status !== 'unhealthy';

  return NextResponse.json(
    { ready, status: result.status, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503 },
  );
}

/** /live — liveness probe (process is running). */
export async function handleLive(): Promise<NextResponse> {
  return NextResponse.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/** /api/health/extended — comprehensive health with all infrastructure checks. */
export async function handleExtendedHealth(): Promise<NextResponse> {
  const container = await getContainer();
  const registry = container.resolve<ExtendedHealthCheckRegistry>(TOKENS.ExtendedHealthCheckRegistry);
  const result = await registry.runAll();

  const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;

  return NextResponse.json(
    { status: result.status, timestamp: new Date().toISOString(), checks: result.checks },
    { status: statusCode },
  );
}

/** /api/metrics — Prometheus-compatible metrics. */
export async function handleMetrics(): Promise<Response> {
  const container = await getContainer();
  const metrics = container.resolve<MetricsFramework>(TOKENS.MetricsFramework);
  const prometheusText = metrics.toPrometheus();

  return new Response(prometheusText, {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** /api/commands — dispatch a command through the CommandBus. */
export async function handleCommandDispatch(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body || !body.commandType) {
    return NextResponse.json(
      { ok: false, error: 'Missing commandType in request body' },
      { status: 400 },
    );
  }

  const container = await getContainer();
  const commandBus = container.resolve<CommandBus>(TOKENS.CommandBus);

  if (!commandBus.hasHandler(body.commandType)) {
    return NextResponse.json(
      { ok: false, error: `No handler for command: ${body.commandType}` },
      { status: 404 },
    );
  }

  const command: Command = {
    commandType: body.commandType,
    payload: body.payload,
    correlationId: req.headers.get('x-correlation-id') ?? undefined,
    idempotencyKey: req.headers.get('idempotency-key') ?? body.idempotencyKey,
    userId: req.headers.get('x-user-id') ?? body.userId,
    metadata: body.metadata,
  };

  return runInContext(
    { correlationId: command.correlationId, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await commandBus.dispatch(command);

      if (result.ok) {
        return NextResponse.json({ ok: true, data: result.value });
      }

      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapErrorToStatus(error) },
      );
    },
  );
}

/** /api/queries — execute a query through the QueryBus. */
export async function handleQueryDispatch(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body || !body.queryType) {
    return NextResponse.json(
      { ok: false, error: 'Missing queryType in request body' },
      { status: 400 },
    );
  }

  const container = await getContainer();
  const queryBus = container.resolve<QueryBus>(TOKENS.QueryBus);

  if (!queryBus.hasHandler(body.queryType)) {
    return NextResponse.json(
      { ok: false, error: `No handler for query: ${body.queryType}` },
      { status: 404 },
    );
  }

  const query: Query = {
    queryType: body.queryType,
    payload: body.payload,
    correlationId: req.headers.get('x-correlation-id') ?? undefined,
    userId: req.headers.get('x-user-id') ?? undefined,
  };

  return runInContext(
    { correlationId: query.correlationId, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await queryBus.execute(query);

      if (result.ok) {
        return NextResponse.json({ ok: true, data: result.value });
      }

      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapErrorToStatus(error) },
      );
    },
  );
}

/** /api/architecture — introspection endpoint for the dashboard. */
export async function handleArchitecture(): Promise<NextResponse> {
  const container = await getContainer();
  const commandBus = container.resolve<CommandBus>(TOKENS.CommandBus);
  const queryBus = container.resolve<QueryBus>(TOKENS.QueryBus);
  const workerRegistry = container.resolve<WorkerRegistry>(TOKENS.WorkerRegistry);
  const circuitBreakers = container.resolve<CircuitBreakerRegistry>(TOKENS.CircuitBreakerRegistry);

  return NextResponse.json({
    milestone: 'M2 — Production Infrastructure',
    layers: ['shared', 'domain', 'application', 'infrastructure', 'interfaces'],
    eventTypes: getRegisteredEventTypes(),
    commandTypes: commandBus.getCommandTypes(),
    queryTypes: queryBus.getQueryTypes(),
    bindings: container.listBindings(),
    workers: workerRegistry.getHealth(),
    circuitBreakers: circuitBreakers.getAll(),
    timestamp: new Date().toISOString(),
  });
}

/** /api/workers — list worker health. */
export async function handleWorkers(): Promise<NextResponse> {
  const container = await getContainer();
  const registry = container.resolve<WorkerRegistry>(TOKENS.WorkerRegistry);
  return NextResponse.json({ workers: registry.getHealth() });
}

/** /api/feature-flags — list/evaluate feature flags. */
export async function handleFeatureFlags(req: Request): Promise<NextResponse> {
  const container = await getContainer();
  const flags = container.resolve<FeatureFlagService>(TOKENS.FeatureFlagService);

  if (req.method === 'GET') {
    return NextResponse.json({ flags: flags.listFlags() });
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null);
    if (!body || !body.key) {
      return NextResponse.json({ ok: false, error: 'Missing key' }, { status: 400 });
    }

    if (body.action === 'evaluate') {
      const result = flags.evaluate(body.key, body.context ?? {});
      return NextResponse.json(result);
    }

    if (body.action === 'set') {
      await flags.setFlag(body.flag);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'delete') {
      await flags.deleteFlag(body.key);
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}

function mapErrorToStatus(error: DomainError): number {
  switch (error.category) {
    case 'validation': return 400;
    case 'authorization': return 403;
    case 'not_found': return 404;
    case 'concurrency': return 409;
    case 'business': return 422;
    case 'configuration': return 500;
    case 'infrastructure': return 503;
    default: return 500;
  }
}
