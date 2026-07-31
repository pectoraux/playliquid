/**
 * Feedback commands.
 *
 * SubmitFeedback / TriageFeedback.
 *
 * Feedback records are not aggregates — they are append-only records stored
 * in the FeedbackRepository. The repository handles persistence and status
 * transitions. The submit operation accepts a flat payload and the triage
 * operation transitions a record's status with optional assignment and notes.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { FeedbackRepository } from '@/domain/launch/repositories';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

// ─── Submit Feedback ───────────────────────────────────────────────────────

export interface SubmitFeedbackPayload {
  readonly cohortId: string;
  readonly userId: string;
  readonly category: 'bug' | 'feature_request' | 'experience' | 'performance' | 'other';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly description: string;
}

export interface SubmitFeedbackResult {
  readonly feedbackId: string;
}

export class SubmitFeedbackCommand
  implements CommandWithPayload<SubmitFeedbackPayload>
{
  readonly commandType = 'SubmitFeedback';
  constructor(
    public readonly payload: SubmitFeedbackPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class SubmitFeedbackHandler
  implements CommandHandler<SubmitFeedbackCommand, SubmitFeedbackResult>
{
  readonly commandType = 'SubmitFeedback';

  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  async execute(
    command: SubmitFeedbackCommand,
  ): Promise<Result<SubmitFeedbackResult>> {
    const { cohortId, userId, category, severity, title, description } = command.payload;

    if (!title || title.trim().length === 0) {
      return Result.fail(new ValidationError('title is required', 'title'));
    }
    if (!description || description.trim().length === 0) {
      return Result.fail(new ValidationError('description is required', 'description'));
    }

    const feedbackId = createId('fb');
    const now = new Date().toISOString();
    try {
      await this.feedbackRepo.submit({
        id: feedbackId,
        cohortId,
        userId,
        category,
        severity,
        title,
        description,
        createdAt: now,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ feedbackId });
  }
}

// ─── Triage Feedback ──────────────────────────────────────────────────────

export interface TriageFeedbackPayload {
  readonly feedbackId: string;
  readonly status: 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';
  readonly assignedTo: string;
  readonly triagedBy: string;
  readonly notes: string;
}

export interface TriageFeedbackResult {
  readonly feedbackId: string;
}

export class TriageFeedbackCommand
  implements CommandWithPayload<TriageFeedbackPayload>
{
  readonly commandType = 'TriageFeedback';
  constructor(
    public readonly payload: TriageFeedbackPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class TriageFeedbackHandler
  implements CommandHandler<TriageFeedbackCommand, TriageFeedbackResult>
{
  readonly commandType = 'TriageFeedback';

  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  async execute(
    command: TriageFeedbackCommand,
  ): Promise<Result<TriageFeedbackResult>> {
    const { feedbackId, status, assignedTo, triagedBy, notes } = command.payload;

    if (!assignedTo || assignedTo.trim().length === 0) {
      return Result.fail(new ValidationError('assignedTo is required', 'assignedTo'));
    }
    if (!triagedBy || triagedBy.trim().length === 0) {
      return Result.fail(new ValidationError('triagedBy is required', 'triagedBy'));
    }

    const existing = await this.feedbackRepo.getById(feedbackId);
    if (!existing) {
      return Result.fail(
        new NotFoundError('Feedback not found', 'Feedback', feedbackId),
      );
    }

    try {
      await this.feedbackRepo.triage(feedbackId, {
        status,
        assignedTo,
        triagedBy,
        notes,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ feedbackId });
  }
}
