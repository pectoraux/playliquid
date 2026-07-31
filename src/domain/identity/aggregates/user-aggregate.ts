/**
 * User Aggregate — the core identity aggregate.
 *
 * Manages the full user lifecycle: waitlist → approval → activation →
 * suspension/deletion. Tracks profile, email verification, MFA, roles,
 * and organization memberships.
 *
 * All state changes go through domain methods that raise events. The
 * aggregate enforces invariants (e.g., can't suspend an already-suspended
 * user, can't approve a deleted user).
 */

import { AggregateRoot } from '@/domain/shared/aggregate/aggregate-root';
import { BusinessRuleError } from '@/domain/shared/errors';
import { Email } from '@/domain/value-objects';
import { Username } from '@/domain/value-objects';
import { DisplayName } from '@/domain/identity/value-objects/display-name';
import { Timezone } from '@/domain/identity/value-objects/timezone';
import { Locale } from '@/domain/identity/value-objects/locale';
import { PasswordHash } from '@/domain/identity/value-objects/password-hash';
import { Country } from '@/domain/value-objects';

import {
  UserCreated, UserApproved, UserRejected, UserSuspendedM3, UserReactivated, UserDeleted,
  UserProfileUpdated, UserEmailChanged, UserPasswordChanged, UserEmailVerified,
  UserMfaEnabled, UserMfaDisabled,
  RoleAssigned, RoleRemoved,
  OrganizationJoined, OrganizationLeft,
} from '@/domain/identity/events/identity-events';

export type UserStatus = 'waitlist' | 'pending_approval' | 'active' | 'suspended' | 'rejected' | 'deleted';

export interface Membership {
  readonly organizationId: string;
  readonly roleId: string;
  readonly joinedAt: string;
}

export interface UserRole {
  readonly roleId: string;
  readonly roleName: string;
  readonly assignedAt: string;
  readonly assignedBy: string;
}

export class UserAggregate extends AggregateRoot<string> {
  private _email: string = '';
  private _username: string = '';
  private _displayName: string = '';
  private _country: string = '';
  private _timezone: string = 'UTC';
  private _locale: string = 'en';
  private _status: UserStatus = 'waitlist';
  private _passwordHash: string | null = null;
  private _emailVerified: boolean = false;
  private _mfaEnabled: boolean = false;
  private _mfaMethod: string | null = null;
  private _roles: UserRole[] = [];
  private _memberships: Membership[] = [];
  private _approvalNotes: string | null = null;
  private _rejectionReason: string | null = null;
  private _suspensionReason: string | null = null;

  // ─── Getters ──────────────────────────────────────────────────────────────

  get email(): string { return this._email; }
  get username(): string { return this._username; }
  get displayName(): string { return this._displayName; }
  get country(): string { return this._country; }
  get timezone(): string { return this._timezone; }
  get locale(): string { return this._locale; }
  get status(): UserStatus { return this._status; }
  get passwordHash(): string | null { return this._passwordHash; }
  get emailVerified(): boolean { return this._emailVerified; }
  get mfaEnabled(): boolean { return this._mfaEnabled; }
  get mfaMethod(): string | null { return this._mfaMethod; }
  get roles(): readonly UserRole[] { return this._roles; }
  get memberships(): readonly Membership[] { return this._memberships; }
  get approvalNotes(): string | null { return this._approvalNotes; }
  get rejectionReason(): string | null { return this._rejectionReason; }
  get suspensionReason(): string | null { return this._suspensionReason; }

  get isActive(): boolean { return this._status === 'active'; }
  get isWaitlist(): boolean { return this._status === 'waitlist' || this._status === 'pending_approval'; }
  get isSuspended(): boolean { return this._status === 'suspended'; }
  get isDeleted(): boolean { return this._status === 'deleted'; }

  // ─── Factory ──────────────────────────────────────────────────────────────

  /** Create a new user on the waitlist. */
  static create(params: {
    id: string;
    email: Email;
    username: Username;
    displayName: DisplayName;
    country: Country;
    timezone: Timezone;
    locale: Locale;
  }): UserAggregate {
    const user = new UserAggregate(params.id);
    user.raiseEvent(UserCreated, {
      userId: params.id,
      email: params.email.value,
      username: params.username.value,
      displayName: params.displayName.value,
      country: params.country.code,
      timezone: params.timezone.value,
      locale: params.locale.value,
      status: 'waitlist',
      createdAt: new Date().toISOString(),
    });
    return user;
  }

  // ─── Domain Methods ───────────────────────────────────────────────────────

  /** Submit for admin review (after email verification). */
  submitForApproval(): void {
    if (this._status !== 'waitlist') {
      throw new BusinessRuleError(
        `Cannot submit for approval: user is in ${this._status} state`,
        'INVALID_STATUS',
      );
    }
    if (!this._emailVerified) {
      throw new BusinessRuleError('Email must be verified before approval submission', 'EMAIL_NOT_VERIFIED');
    }
    // Transition to pending_approval — no event needed, it's a sub-state
    this._status = 'pending_approval';
  }

  /** Approve the user — transitions to active. */
  approve(approvedBy: string, notes: string): void {
    if (this._status === 'deleted') {
      throw new BusinessRuleError('Cannot approve a deleted user', 'USER_DELETED');
    }
    if (this._status === 'active') {
      throw new BusinessRuleError('User is already active', 'USER_ALREADY_ACTIVE');
    }
    if (!this._emailVerified) {
      throw new BusinessRuleError('Email must be verified before approval', 'EMAIL_NOT_VERIFIED');
    }

    this.raiseEvent(UserApproved, {
      userId: String(this.id),
      approvedBy,
      approvalNotes: notes,
      approvedAt: new Date().toISOString(),
    });
  }

  /** Reject the user. */
  reject(rejectedBy: string, reason: string): void {
    if (this._status === 'deleted') {
      throw new BusinessRuleError('Cannot reject a deleted user', 'USER_DELETED');
    }
    if (this._status === 'active') {
      throw new BusinessRuleError('Cannot reject an active user; suspend instead', 'USER_ACTIVE');
    }

    this.raiseEvent(UserRejected, {
      userId: String(this.id),
      rejectedBy,
      rejectionReason: reason,
      rejectedAt: new Date().toISOString(),
    });
  }

  /** Suspend the user. */
  suspend(suspendedBy: string, reason: string): void {
    if (this._status === 'deleted') {
      throw new BusinessRuleError('Cannot suspend a deleted user', 'USER_DELETED');
    }
    if (this._status === 'suspended') {
      throw new BusinessRuleError('User is already suspended', 'USER_ALREADY_SUSPENDED');
    }

    this.raiseEvent(UserSuspendedM3, {
      userId: String(this.id),
      suspendedBy,
      reason,
      suspendedAt: new Date().toISOString(),
    });
  }

  /** Reactivate a suspended user. */
  reactivate(reactivatedBy: string): void {
    if (this._status !== 'suspended') {
      throw new BusinessRuleError('Only suspended users can be reactivated', 'USER_NOT_SUSPENDED');
    }

    this.raiseEvent(UserReactivated, {
      userId: String(this.id),
      reactivatedBy,
      reactivatedAt: new Date().toISOString(),
    });
  }

  /** Delete the user (soft delete). */
  delete(deletedBy: string): void {
    if (this._status === 'deleted') {
      throw new BusinessRuleError('User is already deleted', 'USER_ALREADY_DELETED');
    }

    this.raiseEvent(UserDeleted, {
      userId: String(this.id),
      deletedBy,
      deletedAt: new Date().toISOString(),
    });
  }

  /** Update profile fields. */
  updateProfile(params: { displayName: DisplayName; timezone: Timezone; locale: Locale }): void {
    if (!this.isActive) {
      throw new BusinessRuleError('Only active users can update their profile', 'USER_NOT_ACTIVE');
    }

    this.raiseEvent(UserProfileUpdated, {
      userId: String(this.id),
      displayName: params.displayName.value,
      timezone: params.timezone.value,
      locale: params.locale.value,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Change email address. */
  changeEmail(newEmail: Email, changedBy: string): void {
    if (!this.isActive) {
      throw new BusinessRuleError('Only active users can change their email', 'USER_NOT_ACTIVE');
    }
    if (newEmail.value === this._email) {
      throw new BusinessRuleError('New email is the same as current email', 'EMAIL_UNCHANGED');
    }

    this.raiseEvent(UserEmailChanged, {
      userId: String(this.id),
      oldEmail: this._email,
      newEmail: newEmail.value,
      changedAt: new Date().toISOString(),
    });
    // Email change requires re-verification
    this._emailVerified = false;
  }

  /** Change password. */
  changePassword(newHash: PasswordHash, changedBy: string): void {
    if (!this.isActive && this._status !== 'waitlist' && this._status !== 'pending_approval') {
      throw new BusinessRuleError('Cannot change password in current state', 'USER_NOT_ACTIVE');
    }

    this.raiseEvent(UserPasswordChanged, {
      userId: String(this.id),
      changedAt: new Date().toISOString(),
      changedBy,
    });
    this._passwordHash = newHash.value;
  }

  /** Set password hash (used during registration). */
  setPasswordHash(hash: PasswordHash): void {
    this._passwordHash = hash.value;
  }

  /** Mark email as verified. */
  verifyEmail(): void {
    if (this._emailVerified) {
      throw new BusinessRuleError('Email is already verified', 'EMAIL_ALREADY_VERIFIED');
    }

    this.raiseEvent(UserEmailVerified, {
      userId: String(this.id),
      verifiedAt: new Date().toISOString(),
    });
  }

  /** Enable MFA. */
  enableMfa(method: string): void {
    if (!this.isActive) {
      throw new BusinessRuleError('Only active users can enable MFA', 'USER_NOT_ACTIVE');
    }
    if (this._mfaEnabled) {
      throw new BusinessRuleError('MFA is already enabled', 'MFA_ALREADY_ENABLED');
    }

    this.raiseEvent(UserMfaEnabled, {
      userId: String(this.id),
      method,
      enabledAt: new Date().toISOString(),
    });
  }

  /** Disable MFA. */
  disableMfa(): void {
    if (!this._mfaEnabled) {
      throw new BusinessRuleError('MFA is not enabled', 'MFA_NOT_ENABLED');
    }

    this.raiseEvent(UserMfaDisabled, {
      userId: String(this.id),
      disabledAt: new Date().toISOString(),
    });
  }

  /** Assign a role. */
  addRole(roleId: string, roleName: string, assignedBy: string): void {
    if (!this.isActive) {
      throw new BusinessRuleError('Only active users can receive roles', 'USER_NOT_ACTIVE');
    }
    if (this._roles.some((r) => r.roleId === roleId)) {
      throw new BusinessRuleError(`Role ${roleId} is already assigned`, 'ROLE_ALREADY_ASSIGNED');
    }

    this.raiseEvent(RoleAssigned, {
      userId: String(this.id),
      roleId,
      roleName,
      assignedBy,
      assignedAt: new Date().toISOString(),
    });
  }

  /** Remove a role. */
  removeRole(roleId: string, removedBy: string): void {
    const role = this._roles.find((r) => r.roleId === roleId);
    if (!role) {
      throw new BusinessRuleError(`Role ${roleId} is not assigned`, 'ROLE_NOT_ASSIGNED');
    }

    this.raiseEvent(RoleRemoved, {
      userId: String(this.id),
      roleId,
      roleName: role.roleName,
      removedBy,
      removedAt: new Date().toISOString(),
    });
  }

  /** Join an organization. */
  joinOrganization(organizationId: string, roleId: string): void {
    if (!this.isActive) {
      throw new BusinessRuleError('Only active users can join organizations', 'USER_NOT_ACTIVE');
    }
    if (this._memberships.some((m) => m.organizationId === organizationId)) {
      throw new BusinessRuleError('User is already a member of this organization', 'ALREADY_MEMBER');
    }

    this.raiseEvent(OrganizationJoined, {
      userId: String(this.id),
      organizationId,
      roleId,
      joinedAt: new Date().toISOString(),
    });
  }

  /** Leave an organization. */
  leaveOrganization(organizationId: string): void {
    if (!this._memberships.some((m) => m.organizationId === organizationId)) {
      throw new BusinessRuleError('User is not a member of this organization', 'NOT_A_MEMBER');
    }

    this.raiseEvent(OrganizationLeft, {
      userId: String(this.id),
      organizationId,
      leftAt: new Date().toISOString(),
    });
  }

  /** Check if user has a specific permission (delegates to roles). */
  hasRole(roleId: string): boolean {
    return this._roles.some((r) => r.roleId === roleId);
  }

  /** Check if user is a member of an organization. */
  isMemberOf(organizationId: string): boolean {
    return this._memberships.some((m) => m.organizationId === organizationId);
  }

  // ─── Event Handlers ───────────────────────────────────────────────────────

  private applyUserCreated(event: { payload: UserCreatedPayload }): void {
    const p = event.payload;
    this._email = p.email;
    this._username = p.username;
    this._displayName = p.displayName;
    this._country = p.country;
    this._timezone = p.timezone;
    this._locale = p.locale;
    this._status = 'waitlist';
  }

  private applyUserApproved(event: { payload: UserApprovedPayload }): void {
    this._status = 'active';
    this._approvalNotes = event.payload.approvalNotes;
  }

  private applyUserRejected(event: { payload: UserRejectedPayload }): void {
    this._status = 'rejected';
    this._rejectionReason = event.payload.rejectionReason;
  }

  private applyUserSuspendedM3(event: { payload: UserSuspendedPayload }): void {
    this._status = 'suspended';
    this._suspensionReason = event.payload.reason;
  }

  private applyUserReactivated(_event: { payload: UserReactivatedPayload }): void {
    this._status = 'active';
    this._suspensionReason = null;
  }

  private applyUserDeleted(_event: { payload: UserDeletedPayload }): void {
    this._status = 'deleted';
  }

  private applyUserProfileUpdated(event: { payload: UserProfileUpdatedPayload }): void {
    this._displayName = event.payload.displayName;
    this._timezone = event.payload.timezone;
    this._locale = event.payload.locale;
  }

  private applyUserEmailChanged(event: { payload: UserEmailChangedPayload }): void {
    this._email = event.payload.newEmail;
    this._emailVerified = false;
  }

  private applyUserPasswordChanged(_event: { payload: UserPasswordChangedPayload }): void {
    // passwordHash is set directly by changePassword
  }

  private applyUserEmailVerified(_event: { payload: UserEmailVerifiedPayload }): void {
    this._emailVerified = true;
  }

  private applyUserMfaEnabled(event: { payload: UserMfaEnabledPayload }): void {
    this._mfaEnabled = true;
    this._mfaMethod = event.payload.method;
  }

  private applyUserMfaDisabled(_event: { payload: UserMfaDisabledPayload }): void {
    this._mfaEnabled = false;
    this._mfaMethod = null;
  }

  private applyRoleAssigned(event: { payload: RoleAssignedPayload }): void {
    this._roles = [...this._roles, {
      roleId: event.payload.roleId,
      roleName: event.payload.roleName,
      assignedAt: event.payload.assignedAt,
      assignedBy: event.payload.assignedBy,
    }];
  }

  private applyRoleRemoved(event: { payload: RoleRemovedPayload }): void {
    this._roles = this._roles.filter((r) => r.roleId !== event.payload.roleId);
  }

  private applyOrganizationJoined(event: { payload: OrganizationJoinedPayload }): void {
    this._memberships = [...this._memberships, {
      organizationId: event.payload.organizationId,
      roleId: event.payload.roleId,
      joinedAt: event.payload.joinedAt,
    }];
  }

  private applyOrganizationLeft(event: { payload: OrganizationLeftPayload }): void {
    this._memberships = this._memberships.filter((m) => m.organizationId !== event.payload.organizationId);
  }

  // ─── Aggregate Contract ───────────────────────────────────────────────────

  validate(): void {
    if (this._version > 0 && !this._email) {
      throw new BusinessRuleError('User must have an email', 'EMAIL_REQUIRED');
    }
  }

  protected toSnapshotState(): Record<string, unknown> {
    return {
      email: this._email,
      username: this._username,
      displayName: this._displayName,
      country: this._country,
      timezone: this._timezone,
      locale: this._locale,
      status: this._status,
      passwordHash: this._passwordHash,
      emailVerified: this._emailVerified,
      mfaEnabled: this._mfaEnabled,
      mfaMethod: this._mfaMethod,
      roles: this._roles,
      memberships: this._memberships,
      approvalNotes: this._approvalNotes,
      rejectionReason: this._rejectionReason,
      suspensionReason: this._suspensionReason,
    };
  }

  protected fromSnapshotState(state: Record<string, unknown>): void {
    this._email = (state.email as string) ?? '';
    this._username = (state.username as string) ?? '';
    this._displayName = (state.displayName as string) ?? '';
    this._country = (state.country as string) ?? '';
    this._timezone = (state.timezone as string) ?? 'UTC';
    this._locale = (state.locale as string) ?? 'en';
    this._status = (state.status as UserStatus) ?? 'waitlist';
    this._passwordHash = (state.passwordHash as string | null) ?? null;
    this._emailVerified = (state.emailVerified as boolean) ?? false;
    this._mfaEnabled = (state.mfaEnabled as boolean) ?? false;
    this._mfaMethod = (state.mfaMethod as string | null) ?? null;
    this._roles = (state.roles as UserRole[]) ?? [];
    this._memberships = (state.memberships as Membership[]) ?? [];
    this._approvalNotes = (state.approvalNotes as string | null) ?? null;
    this._rejectionReason = (state.rejectionReason as string | null) ?? null;
    this._suspensionReason = (state.suspensionReason as string | null) ?? null;
  }
}
