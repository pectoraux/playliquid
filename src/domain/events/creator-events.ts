/**
 * Creator domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface CreatorPayoutRequestedPayload {
  readonly payoutId: string;
  readonly creatorId: string;
  readonly amount: number;
  readonly currency: string;
  readonly requestedAt: string;
}

export class CreatorPayoutRequested extends DomainEvent<CreatorPayoutRequestedPayload> {}

export interface CreatorPayoutCompletedPayload {
  readonly payoutId: string;
  readonly creatorId: string;
  readonly amount: number;
  readonly currency: string;
  readonly completedAt: string;
}

export class CreatorPayoutCompleted extends DomainEvent<CreatorPayoutCompletedPayload> {}
