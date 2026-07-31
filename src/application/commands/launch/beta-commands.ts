/**
 * Beta cohort commands.
 *
 * CreateCohort / InviteParticipant / AcceptInvitation / RevokeInvitation.
 *
 * The BetaCohortAggregate is the only aggregate in the launch domain. It is
 * event-sourced: handlers load it via the BetaCohortRepository, invoke a
 * domain method that raises an event, then persist via `save()` with the
 * expected version for optimistic concurrency. Record-based concepts
 * (feedback, bugs, validation runs, etc.) are managed via their own
 * repositories — see the corresponding command files.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { BetaCohortRepository } from '@/domain/launch/repositories';
import type {
  LaunchPhase,
  ParticipantRole,
} from '@/domain/launch/aggregates/beta-cohort-aggregate';
import { BetaCohortAggregate } from '@/domain/launch/aggregates/beta-cohort-aggregate';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';

// ─── Create Cohort ─────────────────────────────────────────────────────────

export interface CreateCohortPayload {
  readonly name: string;
  readonly phase: LaunchPhase;
  readonly maxParticipants: number;
  readonly createdById: string;
}

export interface CreateCohortResult {
  readonly cohortId: string;
}

export class CreateCohortCommand implements CommandWithPayload<CreateCohortPayload> {
  readonly commandType = 'CreateCohort';
  constructor(
    public readonly payload: CreateCohortPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class CreateCohortHandler
  implements CommandHandler<CreateCohortCommand, CreateCohortResult>
{
  readonly commandType = 'CreateCohort';

  constructor(private readonly cohortRepo: BetaCohortRepository) {}

  async execute(command: CreateCohortCommand): Promise<Result<CreateCohortResult>> {
    const { name, phase, maxParticipants, createdById } = command.payload;

    if (!name || name.trim().length === 0) {
      return Result.fail(new ValidationError('Cohort name is required', 'name'));
    }
    if (maxParticipants < 1) {
      return Result.fail(
        new ValidationError('maxParticipants must be at least 1', 'maxParticipants'),
      );
    }

    const cohortId = createId('cohort');
    let cohort: BetaCohortAggregate;
    try {
      cohort = BetaCohortAggregate.create({
        id: cohortId,
        name,
        phase,
        maxParticipants,
        createdById,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    try {
      await this.cohortRepo.save(cohort, 0);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ cohortId });
  }
}

// ─── Invite Participant ───────────────────────────────────────────────────

export interface InviteParticipantPayload {
  readonly cohortId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: ParticipantRole;
  readonly invitedBy: string;
  readonly expiresAt: string;
}

export interface InviteParticipantResult {
  readonly cohortId: string;
  readonly invitationId: string;
}

export class InviteParticipantCommand
  implements CommandWithPayload<InviteParticipantPayload>
{
  readonly commandType = 'InviteParticipant';
  constructor(
    public readonly payload: InviteParticipantPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class InviteParticipantHandler
  implements
    CommandHandler<InviteParticipantCommand, InviteParticipantResult>
{
  readonly commandType = 'InviteParticipant';

  constructor(private readonly cohortRepo: BetaCohortRepository) {}

  async execute(
    command: InviteParticipantCommand,
  ): Promise<Result<InviteParticipantResult>> {
    const { cohortId, userId, email, role, invitedBy, expiresAt } = command.payload;

    const expiry = new Date(expiresAt).getTime();
    if (Number.isNaN(expiry) || expiry < Date.now()) {
      return Result.fail(
        new ValidationError('expiresAt must be a future ISO timestamp', 'expiresAt'),
      );
    }

    const cohort = await this.cohortRepo.getById(cohortId);
    if (!cohort) {
      return Result.fail(new NotFoundError('Cohort not found', 'BetaCohort', cohortId));
    }

    const expectedVersion = cohort.version;
    const invitationId = createId('inv');
    try {
      cohort.invite({
        invitationId,
        userId,
        email,
        role,
        invitedBy,
        expiresAt,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    try {
      await this.cohortRepo.save(cohort, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ cohortId, invitationId });
  }
}

// ─── Accept Invitation ────────────────────────────────────────────────────

export interface AcceptInvitationPayload {
  readonly invitationId: string;
  readonly userId: string;
}

export interface AcceptInvitationResult {
  readonly invitationId: string;
  readonly cohortId: string;
}

export class AcceptInvitationCommand
  implements CommandWithPayload<AcceptInvitationPayload>
{
  readonly commandType = 'AcceptInvitation';
  constructor(
    public readonly payload: AcceptInvitationPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class AcceptInvitationHandler
  implements CommandHandler<AcceptInvitationCommand, AcceptInvitationResult>
{
  readonly commandType = 'AcceptInvitation';

  /**
   * @param cohortRepo The beta cohort repository.
   * @param cohortLookup Function that finds the cohort id containing a given
   *     invitation. In production this is backed by a projection/lookup table
   *     because the aggregate is keyed by cohort id, not invitation id. The
   *     composition root binds this to a real implementation.
   */
  constructor(
    private readonly cohortRepo: BetaCohortRepository,
    private readonly cohortLookup: (invitationId: string) => Promise<string | null>,
  ) {}

  async execute(
    command: AcceptInvitationCommand,
  ): Promise<Result<AcceptInvitationResult>> {
    const { invitationId, userId } = command.payload;

    const cohortId = await this.cohortLookup(invitationId);
    if (!cohortId) {
      return Result.fail(
        new NotFoundError('Invitation not found', 'Invitation', invitationId),
      );
    }

    const cohort = await this.cohortRepo.getById(cohortId);
    if (!cohort) {
      return Result.fail(new NotFoundError('Cohort not found', 'BetaCohort', cohortId));
    }

    const expectedVersion = cohort.version;
    try {
      cohort.acceptInvitation(invitationId, userId);
    } catch (e) {
      return Result.fail(e as Error);
    }

    try {
      await this.cohortRepo.save(cohort, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ invitationId, cohortId });
  }
}

// ─── Revoke Invitation ────────────────────────────────────────────────────

export interface RevokeInvitationPayload {
  readonly invitationId: string;
  readonly revokedBy: string;
  readonly reason: string;
}

export interface RevokeInvitationResult {
  readonly invitationId: string;
  readonly cohortId: string;
}

export class RevokeInvitationCommand
  implements CommandWithPayload<RevokeInvitationPayload>
{
  readonly commandType = 'RevokeInvitation';
  constructor(
    public readonly payload: RevokeInvitationPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RevokeInvitationHandler
  implements CommandHandler<RevokeInvitationCommand, RevokeInvitationResult>
{
  readonly commandType = 'RevokeInvitation';

  constructor(
    private readonly cohortRepo: BetaCohortRepository,
    private readonly cohortLookup: (invitationId: string) => Promise<string | null>,
  ) {}

  async execute(
    command: RevokeInvitationCommand,
  ): Promise<Result<RevokeInvitationResult>> {
    const { invitationId, revokedBy, reason } = command.payload;

    if (!reason || reason.trim().length === 0) {
      return Result.fail(new ValidationError('reason is required', 'reason'));
    }

    const cohortId = await this.cohortLookup(invitationId);
    if (!cohortId) {
      return Result.fail(
        new NotFoundError('Invitation not found', 'Invitation', invitationId),
      );
    }

    const cohort = await this.cohortRepo.getById(cohortId);
    if (!cohort) {
      return Result.fail(new NotFoundError('Cohort not found', 'BetaCohort', cohortId));
    }

    const expectedVersion = cohort.version;
    try {
      cohort.revokeInvitation(invitationId, revokedBy, reason);
    } catch (e) {
      // Already-revoked is idempotent — return success.
      if (e instanceof BusinessRuleError && e.code === 'ALREADY_REVOKED') {
        return Result.ok({ invitationId, cohortId });
      }
      return Result.fail(e as Error);
    }

    try {
      await this.cohortRepo.save(cohort, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ invitationId, cohortId });
  }
}
