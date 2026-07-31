/**
 * Launch event registry.
 */

import { registerEventSafe as registerEvent } from '@/domain/shared/event/event-registry';
import {
  BetaCohortCreated, ParticipantInvited, InvitationAccepted, InvitationRevoked,
  FeedbackSubmitted, FeedbackTriaged,
  ValidationRunStarted, ValidationRunCompleted,
  ReconciliationCompleted, SessionRecorded,
  BugReported, BugResolved,
} from './launch-events';

let registered = false;

export function registerLaunchEvents(): void {
  if (registered) return;
  registerEvent('BetaCohortCreated', BetaCohortCreated);
  registerEvent('ParticipantInvited', ParticipantInvited);
  registerEvent('InvitationAccepted', InvitationAccepted);
  registerEvent('InvitationRevoked', InvitationRevoked);
  registerEvent('FeedbackSubmitted', FeedbackSubmitted);
  registerEvent('FeedbackTriaged', FeedbackTriaged);
  registerEvent('ValidationRunStarted', ValidationRunStarted);
  registerEvent('ValidationRunCompleted', ValidationRunCompleted);
  registerEvent('ReconciliationCompleted', ReconciliationCompleted);
  registerEvent('SessionRecorded', SessionRecorded);
  registerEvent('BugReported', BugReported);
  registerEvent('BugResolved', BugResolved);
  registered = true;
}

export * from './launch-events';
