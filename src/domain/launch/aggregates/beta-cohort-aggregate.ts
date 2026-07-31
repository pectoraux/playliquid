// @ts-nocheck
/**
 * Beta Cohort Aggregate — manages a group of beta participants.
 *
 * A cohort represents a phase of the launch program (alpha, closed beta,
 * open beta) with a set of invited players and creators. The aggregate
 * enforces capacity limits and tracks participant status.
 */

import { AggregateRoot } from '@/domain/shared/aggregate/aggregate-root';
import { BusinessRuleError } from '@/domain/shared/errors';
import {
  BetaCohortCreated, ParticipantInvited, InvitationAccepted, InvitationRevoked,
} from '@/domain/launch/events/launch-events';

export type LaunchPhase = 'alpha' | 'closed_beta' | 'open_beta';
export type ParticipantRole = 'player' | 'creator';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Participant {
  readonly invitationId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: ParticipantRole;
  readonly status: InvitationStatus;
  readonly invitedAt: string;
  readonly acceptedAt: string | null;
  readonly expiresAt: string;
}

export class BetaCohortAggregate extends AggregateRoot<string> {
  private _name: string = '';
  private _phase: LaunchPhase = 'closed_beta';
  private _maxParticipants: number = 0;
  private _createdById: string = '';
  private _participants: Participant[] = [];
  private _active: boolean = true;

  get name(): string { return this._name; }
  get phase(): LaunchPhase { return this._phase; }
  get maxParticipants(): number { return this._maxParticipants; }
  get createdById(): string { return this._createdById; }
  get participants(): readonly Participant[] { return this._participants; }
  get active(): boolean { return this._active; }

  get acceptedCount(): number {
    return this._participants.filter((p) => p.status === 'accepted').length;
  }

  get pendingCount(): number {
    return this._participants.filter((p) => p.status === 'pending').length;
  }

  static create(params: {
    id: string;
    name: string;
    phase: LaunchPhase;
    maxParticipants: number;
    createdById: string;
  }): BetaCohortAggregate {
    if (!params.name || params.name.trim().length === 0) {
      throw new BusinessRuleError('Cohort name is required', 'COHORT_NAME_REQUIRED');
    }
    if (params.maxParticipants < 1) {
      throw new BusinessRuleError('Max participants must be at least 1', 'INVALID_MAX_PARTICIPANTS');
    }

    const cohort = new BetaCohortAggregate(params.id);
    cohort.raiseEvent(BetaCohortCreated, {
      cohortId: params.id,
      name: params.name,
      phase: params.phase,
      maxParticipants: params.maxParticipants,
      createdById: params.createdById,
      createdAt: new Date().toISOString(),
    });
    return cohort;
  }

  invite(params: {
    invitationId: string;
    userId: string;
    email: string;
    role: ParticipantRole;
    invitedBy: string;
    expiresAt: string;
  }): void {
    if (!this._active) {
      throw new BusinessRuleError('Cannot invite to an inactive cohort', 'COHORT_INACTIVE');
    }
    if (this.acceptedCount >= this._maxParticipants) {
      throw new BusinessRuleError(
        `Cohort is at capacity (${this._maxParticipants} participants)`,
        'COHORT_FULL',
      );
    }
    if (this._participants.some((p) => p.userId === params.userId)) {
      throw new BusinessRuleError('User already invited to this cohort', 'ALREADY_INVITED');
    }

    this.raiseEvent(ParticipantInvited, {
      cohortId: String(this.id),
      invitationId: params.invitationId,
      userId: params.userId,
      email: params.email,
      role: params.role,
      invitedBy: params.invitedBy,
      invitedAt: new Date().toISOString(),
      expiresAt: params.expiresAt,
    });
  }

  acceptInvitation(invitationId: string, userId: string): void {
    const participant = this._participants.find((p) => p.invitationId === invitationId);
    if (!participant) {
      throw new BusinessRuleError('Invitation not found', 'INVITATION_NOT_FOUND');
    }
    if (participant.userId !== userId) {
      throw new BusinessRuleError('Invitation does not belong to this user', 'INVITATION_MISMATCH');
    }
    if (participant.status !== 'pending') {
      throw new BusinessRuleError(`Invitation is already ${participant.status}`, 'INVITATION_NOT_PENDING');
    }
    if (new Date(participant.expiresAt) < new Date()) {
      throw new BusinessRuleError('Invitation has expired', 'INVITATION_EXPIRED');
    }

    this.raiseEvent(InvitationAccepted, {
      invitationId,
      cohortId: String(this.id),
      userId,
      acceptedAt: new Date().toISOString(),
    });
  }

  revokeInvitation(invitationId: string, revokedBy: string, reason: string): void {
    const participant = this._participants.find((p) => p.invitationId === invitationId);
    if (!participant) {
      throw new BusinessRuleError('Invitation not found', 'INVITATION_NOT_FOUND');
    }
    if (participant.status === 'revoked') {
      throw new BusinessRuleError('Invitation is already revoked', 'ALREADY_REVOKED');
    }

    this.raiseEvent(InvitationRevoked, {
      invitationId,
      cohortId: String(this.id),
      revokedBy,
      reason,
      revokedAt: new Date().toISOString(),
    });
  }

  hasParticipant(userId: string): boolean {
    return this._participants.some((p) => p.userId === userId && p.status === 'accepted');
  }

  getParticipant(userId: string): Participant | null {
    return this._participants.find((p) => p.userId === userId) ?? null;
  }

  private applyBetaCohortCreated(event: { payload: Record<string, unknown> }): void {
    this._name = String(event.payload.name);
    this._phase = String(event.payload.phase) as LaunchPhase;
    this._maxParticipants = String(event.payload.maxParticipants);
    this._createdById = String(event.payload.createdById);
  }

  private applyParticipantInvited(event: { payload: Record<string, unknown> }): void {
    this._participants = [...this._participants, {
      invitationId: String(event.payload.invitationId),
      userId: String(event.payload.userId),
      email: String(event.payload.email),
      role: String(event.payload.role),
      status: 'pending',
      invitedAt: String(event.payload.invitedAt),
      acceptedAt: null,
      expiresAt: String(event.payload.expiresAt),
    }];
  }

  private applyInvitationAccepted(event: { payload: Record<string, unknown> }): void {
    this._participants = this._participants.map((p) =>
      p.invitationId === String(event.payload.invitationId)
        ? { ...p, status: 'accepted' as const, acceptedAt: String(event.payload.acceptedAt) }
        : p,
    );
  }

  private applyInvitationRevoked(event: { payload: Record<string, unknown> }): void {
    this._participants = this._participants.map((p) =>
      p.invitationId === String(event.payload.invitationId)
        ? { ...p, status: 'revoked' as const }
        : p,
    );
  }

  validate(): void {
    if (this._version > 0 && !this._name) {
      throw new BusinessRuleError('Cohort must have a name', 'COHORT_NAME_REQUIRED');
    }
  }

  protected toSnapshotState(): Record<string, unknown> {
    return {
      name: this._name,
      phase: this._phase,
      maxParticipants: this._maxParticipants,
      createdById: this._createdById,
      participants: this._participants,
      active: this._active,
    };
  }

  protected fromSnapshotState(state: Record<string, unknown>): void {
    this._name = (state.name as string) ?? '';
    this._phase = (state.phase as LaunchPhase) ?? 'closed_beta';
    this._maxParticipants = (state.maxParticipants as number) ?? 0;
    this._createdById = (state.createdById as string) ?? '';
    this._participants = (state.participants as Participant[]) ?? [];
    this._active = (state.active as boolean) ?? true;
  }
}
