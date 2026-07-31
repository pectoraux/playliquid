/**
 * Identity domain events.
 *
 * These events are raised by the UserAggregate and OrganizationAggregate.
 * They are consumed by projectors to build read models and by the audit log.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

// ─── User Lifecycle ────────────────────────────────────────────────────────

export interface UserCreatedPayload {
  readonly userId: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly country: string;
  readonly timezone: string;
  readonly locale: string;
  readonly status: 'waitlist';
  readonly createdAt: string;
}

export class UserCreated extends DomainEvent<UserCreatedPayload> {}

export interface UserApprovedPayload {
  readonly userId: string;
  readonly approvedBy: string;
  readonly approvalNotes: string;
  readonly approvedAt: string;
}

export class UserApproved extends DomainEvent<UserApprovedPayload> {}

export interface UserRejectedPayload {
  readonly userId: string;
  readonly rejectedBy: string;
  readonly rejectionReason: string;
  readonly rejectedAt: string;
}

export class UserRejected extends DomainEvent<UserRejectedPayload> {}

export interface UserSuspendedPayload {
  readonly userId: string;
  readonly suspendedBy: string;
  readonly reason: string;
  readonly suspendedAt: string;
}

export class UserSuspendedM3 extends DomainEvent<UserSuspendedPayload> {}

export interface UserReactivatedPayload {
  readonly userId: string;
  readonly reactivatedBy: string;
  readonly reactivatedAt: string;
}

export class UserReactivated extends DomainEvent<UserReactivatedPayload> {}

export interface UserDeletedPayload {
  readonly userId: string;
  readonly deletedBy: string;
  readonly deletedAt: string;
}

export class UserDeleted extends DomainEvent<UserDeletedPayload> {}

// ─── Profile ───────────────────────────────────────────────────────────────

export interface UserProfileUpdatedPayload {
  readonly userId: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly locale: string;
  readonly updatedAt: string;
}

export class UserProfileUpdated extends DomainEvent<UserProfileUpdatedPayload> {}

export interface UserEmailChangedPayload {
  readonly userId: string;
  readonly oldEmail: string;
  readonly newEmail: string;
  readonly changedAt: string;
}

export class UserEmailChanged extends DomainEvent<UserEmailChangedPayload> {}

export interface UserPasswordChangedPayload {
  readonly userId: string;
  readonly changedAt: string;
  readonly changedBy: string;
}

export class UserPasswordChanged extends DomainEvent<UserPasswordChangedPayload> {}

export interface UserEmailVerifiedPayload {
  readonly userId: string;
  readonly verifiedAt: string;
}

export class UserEmailVerified extends DomainEvent<UserEmailVerifiedPayload> {}

// ─── MFA ───────────────────────────────────────────────────────────────────

export interface UserMfaEnabledPayload {
  readonly userId: string;
  readonly method: string;
  readonly enabledAt: string;
}

export class UserMfaEnabled extends DomainEvent<UserMfaEnabledPayload> {}

export interface UserMfaDisabledPayload {
  readonly userId: string;
  readonly disabledAt: string;
}

export class UserMfaDisabled extends DomainEvent<UserMfaDisabledPayload> {}

// ─── Roles ─────────────────────────────────────────────────────────────────

export interface RoleAssignedPayload {
  readonly userId: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly assignedBy: string;
  readonly assignedAt: string;
}

export class RoleAssigned extends DomainEvent<RoleAssignedPayload> {}

export interface RoleRemovedPayload {
  readonly userId: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly removedBy: string;
  readonly removedAt: string;
}

export class RoleRemoved extends DomainEvent<RoleRemovedPayload> {}

// ─── Organization ──────────────────────────────────────────────────────────

export interface OrganizationJoinedPayload {
  readonly userId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly joinedAt: string;
}

export class OrganizationJoined extends DomainEvent<OrganizationJoinedPayload> {}

export interface OrganizationLeftPayload {
  readonly userId: string;
  readonly organizationId: string;
  readonly leftAt: string;
}

export class OrganizationLeft extends DomainEvent<OrganizationLeftPayload> {}

// ─── Sessions ──────────────────────────────────────────────────────────────

export interface SessionStartedPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly deviceFingerprint: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly startedAt: string;
}

export class SessionStarted extends DomainEvent<SessionStartedPayload> {}

export interface SessionEndedPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly endedAt: string;
  readonly reason: string;
}

export class SessionEnded extends DomainEvent<SessionEndedPayload> {}

// ─── Organization Events ───────────────────────────────────────────────────

export interface OrganizationCreatedPayload {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
  readonly createdById: string;
  readonly createdAt: string;
}

export class OrganizationCreated extends DomainEvent<OrganizationCreatedPayload> {}

export interface MemberAddedPayload {
  readonly organizationId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly addedBy: string;
  readonly addedAt: string;
}

export class MemberAdded extends DomainEvent<MemberAddedPayload> {}

export interface MemberRemovedPayload {
  readonly organizationId: string;
  readonly userId: string;
  readonly removedBy: string;
  readonly removedAt: string;
}

export class MemberRemoved extends DomainEvent<MemberRemovedPayload> {}

// ─── API Keys ──────────────────────────────────────────────────────────────

export interface ApiKeyCreatedPayload {
  readonly apiKeyId: string;
  readonly userId: string;
  readonly name: string;
  readonly scopes: string[];
  readonly createdAt: string;
}

export class ApiKeyCreated extends DomainEvent<ApiKeyCreatedPayload> {}

export interface ApiKeyRotatedPayload {
  readonly apiKeyId: string;
  readonly rotatedAt: string;
}

export class ApiKeyRotated extends DomainEvent<ApiKeyRotatedPayload> {}

export interface ApiKeyDisabledPayload {
  readonly apiKeyId: string;
  readonly disabledAt: string;
  readonly reason: string;
}

export class ApiKeyDisabled extends DomainEvent<ApiKeyDisabledPayload> {}

// ─── Audit ─────────────────────────────────────────────────────────────────

export interface AuditRecordedPayload {
  readonly auditId: string;
  readonly action: string;
  readonly actorId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly timestamp: string;
  readonly metadata: Record<string, unknown>;
}

export class AuditRecorded extends DomainEvent<AuditRecordedPayload> {}
