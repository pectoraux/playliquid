/**
 * Validation run commands.
 *
 * StartValidationRun / CompleteValidationRun.
 *
 * Validation runs are managed by the ValidationSuiteRunner domain service,
 * which executes a named suite of checks and produces a ValidationRunResult.
 * The ValidationRunRepository persists the running state at start time and
 * the final result at completion time.
 *
 *   StartValidationRun:
 *     1. Persist a "running" record (so the dashboard can show in-flight runs).
 *     2. Invoke the runner.
 *     3. Persist the completed result.
 *     4. Return the runId + summary.
 *
 *   CompleteValidationRun:
 *     For externally orchestrated runs (e.g., CI), this command accepts a
 *     pre-computed result and persists it without invoking the runner.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { ValidationRunRepository } from '@/domain/launch/repositories';
import type { ValidationSuiteRunner } from '@/domain/launch/services/validation-suite';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

// ─── Start Validation Run ─────────────────────────────────────────────────

export interface StartValidationRunPayload {
  readonly suite: string;
  readonly triggeredBy: string;
}

export interface StartValidationRunResult {
  readonly runId: string;
  readonly suite: string;
  readonly status: 'running' | 'passed' | 'failed' | 'partial';
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly durationMs: number;
}

export class StartValidationRunCommand
  implements CommandWithPayload<StartValidationRunPayload>
{
  readonly commandType = 'StartValidationRun';
  constructor(
    public readonly payload: StartValidationRunPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class StartValidationRunHandler
  implements
    CommandHandler<StartValidationRunCommand, StartValidationRunResult>
{
  readonly commandType = 'StartValidationRun';

  constructor(
    private readonly runRepo: ValidationRunRepository,
    private readonly runner: ValidationSuiteRunner,
  ) {}

  async execute(
    command: StartValidationRunCommand,
  ): Promise<Result<StartValidationRunResult>> {
    const { suite, triggeredBy } = command.payload;

    if (!suite || suite.trim().length === 0) {
      return Result.fail(new ValidationError('suite is required', 'suite'));
    }

    const runId = createId('val');
    const startedAt = new Date().toISOString();
    try {
      await this.runRepo.start({
        id: runId,
        suite,
        triggeredBy,
        startedAt,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    let runResult;
    try {
      runResult = await this.runner.run(suite);
    } catch (e) {
      // Mark the run as failed in persistence, then return the error.
      await this.runRepo
        .complete(runId, {
          status: 'failed',
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          durationMs: 0,
          report: { error: (e as Error).message },
        })
        .catch(() => undefined);
      return Result.fail(e as Error);
    }

    try {
      await this.runRepo.complete(runId, {
        status: runResult.status,
        totalChecks: runResult.totalChecks,
        passedChecks: runResult.passedChecks,
        failedChecks: runResult.failedChecks,
        durationMs: runResult.durationMs,
        report: runResult.report,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({
      runId,
      suite: runResult.suite,
      status: runResult.status,
      totalChecks: runResult.totalChecks,
      passedChecks: runResult.passedChecks,
      failedChecks: runResult.failedChecks,
      durationMs: runResult.durationMs,
    });
  }
}

// ─── Complete Validation Run ──────────────────────────────────────────────

export interface CompleteValidationRunPayload {
  readonly runId: string;
  readonly status: 'running' | 'passed' | 'failed' | 'partial';
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly durationMs: number;
  readonly report: Record<string, unknown>;
}

export interface CompleteValidationRunResult {
  readonly runId: string;
}

export class CompleteValidationRunCommand
  implements CommandWithPayload<CompleteValidationRunPayload>
{
  readonly commandType = 'CompleteValidationRun';
  constructor(
    public readonly payload: CompleteValidationRunPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class CompleteValidationRunHandler
  implements
    CommandHandler<CompleteValidationRunCommand, CompleteValidationRunResult>
{
  readonly commandType = 'CompleteValidationRun';

  constructor(private readonly runRepo: ValidationRunRepository) {}

  async execute(
    command: CompleteValidationRunCommand,
  ): Promise<Result<CompleteValidationRunResult>> {
    const {
      runId,
      status,
      totalChecks,
      passedChecks,
      failedChecks,
      durationMs,
      report,
    } = command.payload;

    if (status === 'running') {
      return Result.fail(
        new ValidationError(
          'Cannot complete a run with status "running"',
          'status',
        ),
      );
    }
    if (passedChecks + failedChecks > totalChecks) {
      return Result.fail(
        new ValidationError(
          'passedChecks + failedChecks cannot exceed totalChecks',
          'passedChecks',
        ),
      );
    }

    const existing = await this.runRepo.getById(runId);
    if (!existing) {
      return Result.fail(
        new NotFoundError('Validation run not found', 'ValidationRun', runId),
      );
    }

    try {
      await this.runRepo.complete(runId, {
        status,
        totalChecks,
        passedChecks,
        failedChecks,
        durationMs,
        report,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ runId });
  }
}
