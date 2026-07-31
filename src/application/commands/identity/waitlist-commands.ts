/**
 * Waitlist commands.
 *
 * ApproveUser / RejectUser / SubmitForApproval — admin operations that
 * transition a user through the waitlist → approval → active lifecycle.
 *
 * These handlers delegate the state transition to the UserAggregate's domain
 * methods and persist via the UserRepository. They also update the
 * WaitlistRepository mirror entry so admins can see the waitlist status
 * without rehydrating aggregates.
 */

import { Result } from '@/shared/types/result';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { UserRepository, WaitlistRepository } from '@/domain/identity/repositories';
import type { EmailService } from '@/application/ports/identity-ports';
import {
  BusinessRuleError,
  NotFoundError,
} from '@/domain/shared/errors';

// ─── Approve User ──────────────────────────────────────────────────────────

export interface ApproveUserPayload {
  readonly userId: string;
  readonly approvedBy: string;
  readonly notes: string;
}

export class ApproveUserCommand implements CommandWithPayload<ApproveUserPayload> {
  readonly commandType = 'ApproveUser';
  constructor(
    public readonly payload: ApproveUserPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ApproveUserHandler
  implements CommandHandler<ApproveUserCommand, { userId: string }>
{
  readonly commandType = 'ApproveUser';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly waitlistRepo: WaitlistRepository,
    private readonly emailService: EmailService | null,
  ) {}

  async execute(command: ApproveUserCommand): Promise<Result<{ userId: string }>> {
    const { userId, approvedBy, notes } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.approve(approvedBy, notes);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Mirror the status in the waitlist table.
    const entry = await this.waitlistRepo.getByEmail(user.email);
    if (entry) {
      await this.waitlistRepo.update(entry.id, {
        status: 'approved',
        approvalNotes: notes,
        invitedById: approvedBy,
        updatedAt: new Date().toISOString(),
      });
    }

    // Send a welcome email (best-effort).
    if (this.emailService) {
      try {
        await this.emailService.sendWelcomeEmail(user.email, user.displayName);
      } catch {
        // Non-fatal.
      }
    }

    return Result.ok({ userId });
  }
}

// ─── Reject User ───────────────────────────────────────────────────────────

export interface RejectUserPayload {
  readonly userId: string;
  readonly rejectedBy: string;
  readonly reason: string;
}

export class RejectUserCommand implements CommandWithPayload<RejectUserPayload> {
  readonly commandType = 'RejectUser';
  constructor(
    public readonly payload: RejectUserPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RejectUserHandler
  implements CommandHandler<RejectUserCommand, { userId: string }>
{
  readonly commandType = 'RejectUser';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly waitlistRepo: WaitlistRepository,
  ) {}

  async execute(command: RejectUserCommand): Promise<Result<{ userId: string }>> {
    const { userId, rejectedBy, reason } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }
    if (user.isActive) {
      return Result.fail(
        new BusinessRuleError('Cannot reject an active user; suspend instead', 'USER_ACTIVE'),
      );
    }

    const expectedVersion = user.version;
    try {
      user.reject(rejectedBy, reason);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    const entry = await this.waitlistRepo.getByEmail(user.email);
    if (entry) {
      await this.waitlistRepo.update(entry.id, {
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: new Date().toISOString(),
      });
    }

    return Result.ok({ userId });
  }
}

// ─── Submit For Approval ───────────────────────────────────────────────────

export interface SubmitForApprovalPayload {
  readonly userId: string;
}

export class SubmitForApprovalCommand implements CommandWithPayload<SubmitForApprovalPayload> {
  readonly commandType = 'SubmitForApproval';
  constructor(
    public readonly payload: SubmitForApprovalPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class SubmitForApprovalHandler
  implements CommandHandler<SubmitForApprovalCommand, { userId: string }>
{
  readonly commandType = 'SubmitForApproval';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly waitlistRepo: WaitlistRepository,
  ) {}

  async execute(command: SubmitForApprovalCommand): Promise<Result<{ userId: string }>> {
    const { userId } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }
    if (!user.emailVerified) {
      return Result.fail(
        new BusinessRuleError('Email must be verified before submission', 'EMAIL_NOT_VERIFIED'),
      );
    }

    const expectedVersion = user.version;
    // The aggregate's submitForApproval does not raise an event — it's a
    // sub-state of waitlist. We persist the snapshot so the change survives
    // a rehydration. (If the repository is event-sourced, the absence of new
    // events means save() is a no-op; the emailVerified flag already
    // indicates the user is ready for review.)
    try {
      user.submitForApproval();
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Update the waitlist mirror to `email_verified` if not already.
    const entry = await this.waitlistRepo.getByEmail(user.email);
    if (entry && entry.status === 'pending') {
      await this.waitlistRepo.update(entry.id, {
        status: 'email_verified',
        updatedAt: new Date().toISOString(),
      });
    }

    return Result.ok({ userId });
  }
}
