/**
 * Marketplace domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface PurchaseCompletedPayload {
  readonly purchaseId: string;
  readonly playerId: string;
  readonly gameId: string;
  readonly amount: number;
  readonly currency: string;
  readonly completedAt: string;
}

export class PurchaseCompleted extends DomainEvent<PurchaseCompletedPayload> {}

export interface PurchaseRefundedPayload {
  readonly purchaseId: string;
  readonly amount: number;
  readonly reason: string;
}

export class PurchaseRefunded extends DomainEvent<PurchaseRefundedPayload> {}
