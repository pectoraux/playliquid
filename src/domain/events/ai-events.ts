/**
 * AI domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface AiContentGeneratedPayload {
  readonly requestId: string;
  readonly modelId: string;
  readonly promptHash: string;
  readonly generatedAt: string;
}

export class AiContentGenerated extends DomainEvent<AiContentGeneratedPayload> {}

export interface AiRequestFailedPayload {
  readonly requestId: string;
  readonly modelId: string;
  readonly reason: string;
}

export class AiRequestFailed extends DomainEvent<AiRequestFailedPayload> {}
