/**
 * Worker interface handlers — trigger outbox publishing and projection
 * processing. In a production deployment these would run as separate worker
 * processes; in this foundation they are triggerable via API so the
 * dashboard can demonstrate the full event flow.
 */

import { NextResponse } from 'next/server';
import { getContainer } from '@/infrastructure/di/composition-root';
import { TOKENS } from '@/infrastructure/di/tokens';
import { OutboxPublisher } from '@/infrastructure/outbox/outbox';
import { ProjectionEngine } from '@/infrastructure/projections/projection-engine';

/** POST /api/workers/outbox — process one batch of outbox messages. */
export async function handleOutboxBatch(): Promise<NextResponse> {
  const container = getContainer();
  const publisher = container.resolve<OutboxPublisher>(TOKENS.OutboxPublisher);
  const outbox = container.resolve(TOKENS.OutboxRepository);
  const published = await publisher.processBatch();
  const counts = await outbox.countByStatus();
  return NextResponse.json({ published, ...counts });
}

/** POST /api/workers/projections — process one batch of projections. */
export async function handleProjectionBatch(): Promise<NextResponse> {
  const container = getContainer();
  const engine = container.resolve<ProjectionEngine>(TOKENS.ProjectionEngine);
  const processed = await engine.processBatch();
  return NextResponse.json({ processed });
}

/** POST /api/workers/rebuild — rebuild all read models from scratch. */
export async function handleRebuild(): Promise<NextResponse> {
  const container = getContainer();
  const engine = container.resolve<ProjectionEngine>(TOKENS.ProjectionEngine);
  await engine.rebuild();
  return NextResponse.json({ rebuilt: true });
}
