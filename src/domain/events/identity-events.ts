/**
 * Identity domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface UserRegisteredPayload {
  readonly userId: string;
  readonly email: string;
  readonly username: string;
  readonly country: string;
  readonly registeredAt: string;
}

export class UserRegistered extends DomainEvent<UserRegisteredPayload> {}

export interface UserApprovedPayload {
  readonly userId: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export class UserApproved extends DomainEvent<UserApprovedPayload> {}

export interface UserSuspendedPayload {
  readonly userId: string;
  readonly reason: string;
  readonly suspendedAt: string;
}

export class UserSuspended extends DomainEvent<UserSuspendedPayload> {}
