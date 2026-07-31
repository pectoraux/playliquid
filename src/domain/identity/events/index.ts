/**
 * Identity event registry — registers all M3 events.
 */

import { registerEventSafe as registerEvent } from '@/domain/shared/event/event-registry';
import {
  UserCreated, UserApproved, UserRejected, UserSuspendedM3, UserReactivated, UserDeleted,
  UserProfileUpdated, UserEmailChanged, UserPasswordChanged, UserEmailVerified,
  UserMfaEnabled, UserMfaDisabled,
  RoleAssigned, RoleRemoved,
  OrganizationJoined, OrganizationLeft,
  SessionStarted, SessionEnded,
  OrganizationCreated, MemberAdded, MemberRemoved,
  ApiKeyCreated, ApiKeyRotated, ApiKeyDisabled,
  AuditRecorded,
} from './identity-events';

let registered = false;

export function registerIdentityEvents(): void {
  if (registered) return;

  registerEvent('UserCreated', UserCreated);
  registerEvent('UserApproved', UserApproved);
  registerEvent('UserRejected', UserRejected);
  registerEvent('UserSuspendedM3', UserSuspendedM3);
  registerEvent('UserReactivated', UserReactivated);
  registerEvent('UserDeleted', UserDeleted);
  registerEvent('UserProfileUpdated', UserProfileUpdated);
  registerEvent('UserEmailChanged', UserEmailChanged);
  registerEvent('UserPasswordChanged', UserPasswordChanged);
  registerEvent('UserEmailVerified', UserEmailVerified);
  registerEvent('UserMfaEnabled', UserMfaEnabled);
  registerEvent('UserMfaDisabled', UserMfaDisabled);
  registerEvent('RoleAssigned', RoleAssigned);
  registerEvent('RoleRemoved', RoleRemoved);
  registerEvent('OrganizationJoined', OrganizationJoined);
  registerEvent('OrganizationLeft', OrganizationLeft);
  registerEvent('SessionStarted', SessionStarted);
  registerEvent('SessionEnded', SessionEnded);
  registerEvent('OrganizationCreated', OrganizationCreated);
  registerEvent('MemberAdded', MemberAdded);
  registerEvent('MemberRemoved', MemberRemoved);
  registerEvent('ApiKeyCreated', ApiKeyCreated);
  registerEvent('ApiKeyRotated', ApiKeyRotated);
  registerEvent('ApiKeyDisabled', ApiKeyDisabled);
  registerEvent('AuditRecorded', AuditRecorded);

  registered = true;
}

export * from './identity-events';
