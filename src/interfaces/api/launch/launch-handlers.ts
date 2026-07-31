/**
 * Launch API Handlers — endpoints for the Launch & Scale Program.
 *
 * Phase A (Internal Alpha): validation runs, reconciliation, bug triage,
 * performance metrics, session replays.
 *
 * Phase B (Closed Beta): cohort management, invitations, feedback.
 */

import { NextResponse } from 'next/server';
import { getContainer } from '@/infrastructure/di/composition-root';
import { TOKENS } from '@/infrastructure/di/tokens';
import type { CommandBus } from '@/application/buses/command-bus';
import type { QueryBus } from '@/application/buses/query-bus';
import { runInContext } from '@/application/context';
import { requestId, traceId, createId } from '@/shared/ids';
import type { Command } from '@/application/commands/command';
import type { Query } from '@/application/queries/query';
import type { DomainError } from '@/domain/shared/errors';

// ─── Helper ────────────────────────────────────────────────────────────────

async function dispatchCommand(req: Request, commandType: string): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const container = await getContainer();
  const commandBus = container.resolve<CommandBus>(TOKENS.CommandBus);

  if (!commandBus.hasHandler(commandType)) {
    return NextResponse.json({ ok: false, error: `No handler: ${commandType}` }, { status: 404 });
  }

  const command: Command = {
    commandType,
    payload: body.payload ?? body,
    correlationId: req.headers.get('x-correlation-id') ?? createId('corr'),
    idempotencyKey: req.headers.get('idempotency-key') ?? body.idempotencyKey,
    userId: req.headers.get('x-user-id') ?? body.userId,
  };

  return runInContext(
    { correlationId: command.correlationId!, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await commandBus.dispatch(command);
      if (result.ok) return NextResponse.json({ ok: true, data: result.value });
      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapError(error) },
      );
    },
  );
}

async function dispatchQuery(req: Request, queryType: string, payload: Record<string, unknown>): Promise<NextResponse> {
  const container = await getContainer();
  const queryBus = container.resolve<QueryBus>(TOKENS.QueryBus);

  if (!queryBus.hasHandler(queryType)) {
    return NextResponse.json({ ok: false, error: `No handler: ${queryType}` }, { status: 404 });
  }

  const query: Query = {
    queryType,
    payload,
    correlationId: req.headers.get('x-correlation-id') ?? createId('corr'),
    userId: req.headers.get('x-user-id') ?? undefined,
  };

  return runInContext(
    { correlationId: query.correlationId!, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await queryBus.execute(query);
      if (result.ok) return NextResponse.json({ ok: true, data: result.value });
      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapError(error) },
      );
    },
  );
}

function mapError(error: DomainError): number {
  switch (error.category) {
    case 'validation': return 400;
    case 'authorization': return 403;
    case 'not_found': return 404;
    case 'concurrency': return 409;
    case 'business': return 422;
    default: return 500;
  }
}

// ─── Phase A: Validation ───────────────────────────────────────────────────

export async function handleStartValidation(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'StartValidationRun');
}

export async function handleListValidationRuns(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListValidationRuns', { limit: parseInt(url.searchParams.get('limit') || '20', 10) });
}

export async function handleGetValidationRun(req: Request, runId: string): Promise<NextResponse> {
  return dispatchQuery(req, 'GetValidationRun', { runId });
}

export async function handleGetLatestValidation(req: Request, suite: string): Promise<NextResponse> {
  return dispatchQuery(req, 'GetLatestValidation', { suite });
}

// ─── Phase A: Reconciliation ───────────────────────────────────────────────

export async function handleRunReconciliation(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RunReconciliation');
}

export async function handleListReconciliations(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListReconciliations', { limit: parseInt(url.searchParams.get('limit') || '20', 10) });
}

export async function handleGetLatestReconciliation(req: Request): Promise<NextResponse> {
  return dispatchQuery(req, 'GetLatestReconciliation', {});
}

// ─── Phase A: Bugs ─────────────────────────────────────────────────────────

export async function handleReportBug(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'ReportBug');
}

export async function handleResolveBug(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'ResolveBug');
}

export async function handleAssignBug(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'AssignBug');
}

export async function handleListBugs(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListBugs', {
    severity: url.searchParams.get('severity') || undefined,
    status: url.searchParams.get('status') || undefined,
    cohortId: url.searchParams.get('cohortId') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

export async function handleGetBugStats(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'GetBugStats', { cohortId: url.searchParams.get('cohortId') || undefined });
}

// ─── Phase A: Performance ──────────────────────────────────────────────────

export async function handleGetPerformanceSummary(req: Request): Promise<NextResponse> {
  return dispatchQuery(req, 'GetPerformanceSummary', {});
}

// ─── Phase A: Session Replays ──────────────────────────────────────────────

export async function handleListSessionReplays(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListSessionReplays', {
    cohortId: url.searchParams.get('cohortId') || undefined,
    userId: url.searchParams.get('userId') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

// ─── Phase B: Beta Cohorts ─────────────────────────────────────────────────

export async function handleCreateCohort(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'CreateCohort');
}

export async function handleInviteParticipant(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'InviteParticipant');
}

export async function handleAcceptInvitation(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'AcceptInvitation');
}

export async function handleRevokeInvitation(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RevokeInvitation');
}

export async function handleListCohorts(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListCohorts', {
    phase: url.searchParams.get('phase') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

export async function handleGetCohort(req: Request, cohortId: string): Promise<NextResponse> {
  return dispatchQuery(req, 'GetCohort', { cohortId });
}

export async function handleGetCohortParticipants(req: Request, cohortId: string): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'GetCohortParticipants', {
    cohortId,
    status: url.searchParams.get('status') || undefined,
  });
}

// ─── Phase B: Feedback ─────────────────────────────────────────────────────

export async function handleSubmitFeedback(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'SubmitFeedback');
}

export async function handleTriageFeedback(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'TriageFeedback');
}

export async function handleListFeedback(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListFeedback', {
    cohortId: url.searchParams.get('cohortId') || undefined,
    category: url.searchParams.get('category') || undefined,
    severity: url.searchParams.get('severity') || undefined,
    status: url.searchParams.get('status') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

export async function handleGetFeedbackStats(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'GetFeedbackStats', { cohortId: url.searchParams.get('cohortId') || '' });
}

// ─── Phase B: Beta Metrics ─────────────────────────────────────────────────

export async function handleBetaMetrics(req: Request): Promise<NextResponse> {
  const container = await getContainer();
  const cohortRepo = container.resolve('BetaCohortRepository');
  const feedbackRepo = container.resolve('FeedbackRepository');
  const bugRepo = container.resolve('BugRepository');

  // Aggregate metrics across cohorts
  const cohorts = await (await import('@/application/queries/launch/beta-queries')).ListCohortsHandler;
  // Use query bus for cohorts
  const queryBus = container.resolve<QueryBus>(TOKENS.QueryBus);
  const cohortResult = await queryBus.execute({ queryType: 'ListCohorts', payload: { limit: 100, offset: 0 } });

  const feedbackStats = await feedbackRepo.countByStatus('');
  const bugStats = await bugRepo.countByStatus();

  return NextResponse.json({
    ok: true,
    data: {
      cohorts: cohortResult.ok ? cohortResult.value : { items: [], total: 0 },
      feedbackByStatus: feedbackStats,
      bugsByStatus: bugStats,
    },
  });
}
