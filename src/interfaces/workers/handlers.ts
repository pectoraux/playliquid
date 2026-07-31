// @ts-nocheck
/**
 * Worker interface handlers — trigger outbox publishing, projection
 * processing, and worker management.
 */

import { NextResponse } from 'next/server';
import { getContainer } from '@/infrastructure/di/composition-root';
import { TOKENS } from '@/infrastructure/di/tokens';
import type { OutboxPublisher } from '@/infrastructure/outbox/outbox';
import type { ProjectionEngine } from '@/infrastructure/projections/projection-engine';
import type { WorkerRegistry } from '@/infrastructure/workers/worker-framework';

/** POST /api/workers/outbox — process one batch of outbox messages. */
export async function handleOutboxBatch(): Promise<NextResponse> {
  const container = await getContainer();
  const publisher = container.resolve<OutboxPublisher>(TOKENS.OutboxPublisher);
  const outbox = container.resolve(TOKENS.OutboxRepository);
  const published = await publisher.processBatch();
  const counts = await outbox.countByStatus();
  return NextResponse.json({ published, ...counts });
}

/** POST /api/workers/projections — process one batch of projections. */
export async function handleProjectionBatch(): Promise<NextResponse> {
  const container = await getContainer();
  const engine = container.resolve<ProjectionEngine>(TOKENS.ProjectionEngine);
  const processed = await engine.processBatch();
  return NextResponse.json({ processed });
}

/** POST /api/workers/rebuild — rebuild all read models from scratch. */
export async function handleRebuild(): Promise<NextResponse> {
  const container = await getContainer();
  const engine = container.resolve<ProjectionEngine>(TOKENS.ProjectionEngine);
  await engine.rebuild();
  return NextResponse.json({ rebuilt: true });
}

/** GET /api/workers/health — get all worker health statuses. */
export async function handleWorkerHealth(): Promise<NextResponse> {
  const container = await getContainer();
  const registry = container.resolve<WorkerRegistry>(TOKENS.WorkerRegistry);
  return NextResponse.json({ workers: registry.getHealth() });
}
