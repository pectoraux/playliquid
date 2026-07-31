/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * Starts background workers (outbox publisher, projections, cleanup,
 * analytics) and the scheduler. In a multi-instance deployment, only one
 * instance should run workers (coordinated via distributed locks).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getContainer, startWorkers } = await import('@/infrastructure/di/composition-root');
    const { getConfig } = await import('@/shared/config');
    const config = getConfig();

    // Initialize the container
    await getContainer();

    // Start background workers
    await startWorkers();

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'PlayLiquid instrumentation complete — workers and scheduler started',
      scope: 'system',
      outboxWorker: config.featureFlags.outboxWorker,
      projectionWorker: config.featureFlags.projectionWorker,
    }));
  }
}
