/**
 * Payments domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface PaymentInitiatedPayload {
  readonly paymentId: string;
  readonly playerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly provider: string;
  readonly initiatedAt: string;
}

export class PaymentInitiated extends DomainEvent<PaymentInitiatedPayload> {}

export interface PaymentSucceededPayload {
  readonly paymentId: string;
  readonly providerReference: string;
  readonly succeededAt: string;
}

export class PaymentSucceeded extends DomainEvent<PaymentSucceededPayload> {}

export interface PaymentFailedPayload {
  readonly paymentId: string;
  readonly reason: string;
  readonly failedAt: string;
}

export class PaymentFailed extends DomainEvent<PaymentFailedPayload> {}
