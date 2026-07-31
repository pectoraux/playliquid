/**
 * Domain Event Registry — central registration of all domain events.
 *
 * This module imports every concrete event class and registers it so that
 * serialized events can be rehydrated. It MUST be imported once at startup
 * (the DI container does this).
 */

import { registerEvent } from '@/domain/shared/event/event-registry';

import { GameStarted, GameFinished, GamePublished, GameUnpublished } from './gaming-events';
import { SessionStarted, SessionEnded } from './session-events';
import { WalletDeposited, WalletWithdrawn, MinutesPurchased, WalletDebited } from './economy-events';
import { ScoreVerified, LeaderboardUpdated, ScoreRejected } from './scoring-events';
import { UserRegistered, UserApproved, UserSuspended } from './identity-events';
import { PurchaseCompleted, PurchaseRefunded } from './marketplace-events';
import { CreatorPayoutRequested, CreatorPayoutCompleted } from './creator-events';
import { PaymentInitiated, PaymentSucceeded, PaymentFailed } from './payments-events';
import { AiContentGenerated, AiRequestFailed } from './ai-events';

let registered = false;

/** Register all domain events. Safe to call multiple times. */
export function registerAllEvents(): void {
  if (registered) return;

  registerEvent('GameStarted', GameStarted);
  registerEvent('GameFinished', GameFinished);
  registerEvent('GamePublished', GamePublished);
  registerEvent('GameUnpublished', GameUnpublished);

  registerEvent('SessionStarted', SessionStarted);
  registerEvent('SessionEnded', SessionEnded);

  registerEvent('WalletDeposited', WalletDeposited);
  registerEvent('WalletWithdrawn', WalletWithdrawn);
  registerEvent('MinutesPurchased', MinutesPurchased);
  registerEvent('WalletDebited', WalletDebited);

  registerEvent('ScoreVerified', ScoreVerified);
  registerEvent('LeaderboardUpdated', LeaderboardUpdated);
  registerEvent('ScoreRejected', ScoreRejected);

  registerEvent('UserRegistered', UserRegistered);
  registerEvent('UserApproved', UserApproved);
  registerEvent('UserSuspended', UserSuspended);

  registerEvent('PurchaseCompleted', PurchaseCompleted);
  registerEvent('PurchaseRefunded', PurchaseRefunded);

  registerEvent('CreatorPayoutRequested', CreatorPayoutRequested);
  registerEvent('CreatorPayoutCompleted', CreatorPayoutCompleted);

  registerEvent('PaymentInitiated', PaymentInitiated);
  registerEvent('PaymentSucceeded', PaymentSucceeded);
  registerEvent('PaymentFailed', PaymentFailed);

  registerEvent('AiContentGenerated', AiContentGenerated);
  registerEvent('AiRequestFailed', AiRequestFailed);

  registered = true;
}

// Re-export all event classes and payloads.
export * from './gaming-events';
export * from './session-events';
export * from './economy-events';
export * from './scoring-events';
export * from './identity-events';
export * from './marketplace-events';
export * from './creator-events';
export * from './payments-events';
export * from './ai-events';
