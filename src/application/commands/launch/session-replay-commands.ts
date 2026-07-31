/**
 * Session replay command.
 *
 * RecordSession.
 *
 * Session replays are recordings of a beta participant's play session. They
 * are stored as immutable records in the SessionReplayRepository, with the
 * actual replay payload stored in object storage (referenced by storageKey).
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { SessionReplayRepository } from '@/domain/launch/repositories';
import { ValidationError } from '@/domain/shared/errors';

// ─── Record Session ───────────────────────────────────────────────────────

export interface RecordSessionPayload {
  readonly sessionId: string;
  readonly userId: string;
  readonly cohortId: string;
  readonly durationSeconds: number;
  readonly eventCount: number;
  readonly storageKey: string;
  readonly metadata: Record<string, unknown>;
}

export interface RecordSessionResult {
  readonly replayId: string;
}

export class RecordSessionCommand
  implements CommandWithPayload<RecordSessionPayload>
{
  readonly commandType = 'RecordSession';
  constructor(
    public readonly payload: RecordSessionPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RecordSessionHandler
  implements CommandHandler<RecordSessionCommand, RecordSessionResult>
{
  readonly commandType = 'RecordSession';

  constructor(private readonly replayRepo: SessionReplayRepository) {}

  async execute(
    command: RecordSessionCommand,
  ): Promise<Result<RecordSessionResult>> {
    const {
      sessionId,
      userId,
      cohortId,
      durationSeconds,
      eventCount,
      storageKey,
      metadata,
    } = command.payload;

    if (!sessionId || sessionId.trim().length === 0) {
      return Result.fail(new ValidationError('sessionId is required', 'sessionId'));
    }
    if (!userId || userId.trim().length === 0) {
      return Result.fail(new ValidationError('userId is required', 'userId'));
    }
    if (!cohortId || cohortId.trim().length === 0) {
      return Result.fail(new ValidationError('cohortId is required', 'cohortId'));
    }
    if (!storageKey || storageKey.trim().length === 0) {
      return Result.fail(new ValidationError('storageKey is required', 'storageKey'));
    }
    if (durationSeconds < 0) {
      return Result.fail(
        new ValidationError('durationSeconds must be >= 0', 'durationSeconds'),
      );
    }
    if (eventCount < 0) {
      return Result.fail(
        new ValidationError('eventCount must be >= 0', 'eventCount'),
      );
    }

    const replayId = createId('replay');
    const recordedAt = new Date().toISOString();
    try {
      await this.replayRepo.save({
        id: replayId,
        sessionId,
        userId,
        cohortId,
        durationSeconds,
        eventCount,
        recordedAt,
        storageKey,
        metadata,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ replayId });
  }
}
