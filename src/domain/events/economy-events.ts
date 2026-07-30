/**
 * Economy domain events (wallet, minutes, purchases).
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface WalletDepositedPayload {
  readonly playerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly reference: string;
  readonly depositedAt: string;
}

export class WalletDeposited extends DomainEvent<WalletDepositedPayload> {}

export interface WalletWithdrawnPayload {
  readonly playerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly reference: string;
  readonly withdrawnAt: string;
}

export class WalletWithdrawn extends DomainEvent<WalletWithdrawnPayload> {}

export interface MinutesPurchasedPayload {
  readonly playerId: string;
  readonly gameId: string;
  readonly minutes: number;
  readonly amountPaid: number;
  readonly currency: string;
  readonly purchasedAt: string;
}

export class MinutesPurchased extends DomainEvent<MinutesPurchasedPayload> {}

export interface WalletDebitedPayload {
  readonly playerId: string;
  readonly amount: number;
  readonly currency: string;
  readonly reason: string;
}

export class WalletDebited extends DomainEvent<WalletDebitedPayload> {}
