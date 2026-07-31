/**
 * Bug commands.
 *
 * ReportBug / ResolveBug / AssignBug.
 *
 * Bug records are append-only records stored in the BugRepository. They are
 * linked to a cohort (and indirectly, to feedback of category "bug"). The
 * repository handles persistence and status transitions.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { BugRepository } from '@/domain/launch/repositories';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

// ─── Report Bug ───────────────────────────────────────────────────────────

export interface ReportBugPayload {
  readonly title: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly category: string;
  readonly reportedBy: string;
  readonly cohortId: string;
}

export interface ReportBugResult {
  readonly bugId: string;
}

export class ReportBugCommand implements CommandWithPayload<ReportBugPayload> {
  readonly commandType = 'ReportBug';
  constructor(
    public readonly payload: ReportBugPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ReportBugHandler
  implements CommandHandler<ReportBugCommand, ReportBugResult>
{
  readonly commandType = 'ReportBug';

  constructor(private readonly bugRepo: BugRepository) {}

  async execute(command: ReportBugCommand): Promise<Result<ReportBugResult>> {
    const { title, description, severity, category, reportedBy, cohortId } =
      command.payload;

    if (!title || title.trim().length === 0) {
      return Result.fail(new ValidationError('title is required', 'title'));
    }
    if (!description || description.trim().length === 0) {
      return Result.fail(new ValidationError('description is required', 'description'));
    }
    if (!category || category.trim().length === 0) {
      return Result.fail(new ValidationError('category is required', 'category'));
    }

    const bugId = createId('bug');
    const now = new Date().toISOString();
    try {
      await this.bugRepo.report({
        id: bugId,
        title,
        description,
        severity,
        category,
        reportedBy,
        cohortId,
        createdAt: now,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ bugId });
  }
}

// ─── Resolve Bug ──────────────────────────────────────────────────────────

export interface ResolveBugPayload {
  readonly bugId: string;
  readonly resolution: 'fixed' | 'wont_fix' | 'duplicate' | 'invalid';
  readonly resolvedBy: string;
}

export interface ResolveBugResult {
  readonly bugId: string;
}

export class ResolveBugCommand implements CommandWithPayload<ResolveBugPayload> {
  readonly commandType = 'ResolveBug';
  constructor(
    public readonly payload: ResolveBugPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ResolveBugHandler
  implements CommandHandler<ResolveBugCommand, ResolveBugResult>
{
  readonly commandType = 'ResolveBug';

  constructor(private readonly bugRepo: BugRepository) {}

  async execute(command: ResolveBugCommand): Promise<Result<ResolveBugResult>> {
    const { bugId, resolution, resolvedBy } = command.payload;

    if (!resolvedBy || resolvedBy.trim().length === 0) {
      return Result.fail(new ValidationError('resolvedBy is required', 'resolvedBy'));
    }

    const existing = await this.bugRepo.getById(bugId);
    if (!existing) {
      return Result.fail(new NotFoundError('Bug not found', 'Bug', bugId));
    }

    try {
      await this.bugRepo.resolve(bugId, resolution, resolvedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ bugId });
  }
}

// ─── Assign Bug ───────────────────────────────────────────────────────────

export interface AssignBugPayload {
  readonly bugId: string;
  readonly assignedTo: string;
}

export interface AssignBugResult {
  readonly bugId: string;
  readonly assignedTo: string;
}

export class AssignBugCommand implements CommandWithPayload<AssignBugPayload> {
  readonly commandType = 'AssignBug';
  constructor(
    public readonly payload: AssignBugPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class AssignBugHandler
  implements CommandHandler<AssignBugCommand, AssignBugResult>
{
  readonly commandType = 'AssignBug';

  constructor(private readonly bugRepo: BugRepository) {}

  async execute(command: AssignBugCommand): Promise<Result<AssignBugResult>> {
    const { bugId, assignedTo } = command.payload;

    if (!assignedTo || assignedTo.trim().length === 0) {
      return Result.fail(new ValidationError('assignedTo is required', 'assignedTo'));
    }

    const existing = await this.bugRepo.getById(bugId);
    if (!existing) {
      return Result.fail(new NotFoundError('Bug not found', 'Bug', bugId));
    }

    try {
      await this.bugRepo.assign(bugId, assignedTo);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ bugId, assignedTo });
  }
}
