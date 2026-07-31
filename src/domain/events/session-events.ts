/**
 * Session domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface SessionStartedPayload {
  readonly sessionId: string;
  readonly gameId: string;
  readonly playerId: string;
  readonly startedAt: string;
}

export class SessionStarted extends DomainEvent<SessionStartedPayload> {}

export interface SessionEndedPayload {
  readonly sessionId: string;
  readonly gameId: string;
  readonly playerId: string;
  readonly durationMinutes: number;
  readonly endedAt: string;
}

export class SessionEnded extends DomainEvent<SessionEndedPayload> {}
