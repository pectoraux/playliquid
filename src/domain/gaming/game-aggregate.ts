/**
 * Game Aggregate — example aggregate demonstrating the event-sourcing infrastructure.
 *
 * This is intentionally minimal: it shows how an aggregate raises domain events,
 * applies them, and supports snapshot/rehydrate. Future milestones add full
 * game lifecycle logic.
 */

import { AggregateRoot, type AggregateSnapshot } from '@/domain/shared/aggregate/aggregate-root';
import { BusinessRuleError } from '@/domain/shared/errors';
import { GamePublished, type GamePublishedPayload } from '@/domain/events/gaming-events';
import { GameUnpublished, type GameUnpublishedPayload } from '@/domain/events/gaming-events';

export type GameStatus = 'draft' | 'published' | 'unpublished';

export class GameAggregate extends AggregateRoot<string> {
  private _title: string = '';
  private _creatorId: string = '';
  private _status: GameStatus = 'draft';
  private _publishedAt: string | null = null;

  get title(): string {
    return this._title;
  }

  get creatorId(): string {
    return this._creatorId;
  }

  get status(): GameStatus {
    return this._status;
  }

  get publishedAt(): string | null {
    return this._publishedAt;
  }

  /** Publish the game — raises a GamePublished event. */
  publish(title: string, creatorId: string): void {
    if (!title || title.trim().length === 0) {
      throw new BusinessRuleError('Game title is required', 'GAME_TITLE_REQUIRED');
    }
    if (!creatorId) {
      throw new BusinessRuleError('Creator id is required', 'CREATOR_ID_REQUIRED');
    }
    if (this._status === 'published') {
      throw new BusinessRuleError('Game is already published', 'GAME_ALREADY_PUBLISHED');
    }

    const payload: GamePublishedPayload = {
      gameId: String(this.id),
      title,
      creatorId,
      publishedAt: new Date().toISOString(),
    };

    this.raiseEvent(GamePublished, payload);
  }

  /** Unpublish the game — raises a GameUnpublished event. */
  unpublish(reason: string): void {
    if (this._status !== 'published') {
      throw new BusinessRuleError('Only published games can be unpublished', 'GAME_NOT_PUBLISHED');
    }

    const payload: GameUnpublishedPayload = {
      gameId: String(this.id),
      reason,
    };

    this.raiseEvent(GameUnpublished, payload);
  }

  /** Event handler — applies GamePublished. */
  private applyGamePublished(event: DomainEvent<GamePublishedPayload>): void {
    this._title = event.payload.title;
    this._creatorId = event.payload.creatorId;
    this._status = 'published';
    this._publishedAt = event.payload.publishedAt;
  }

  /** Event handler — applies GameUnpublished. */
  private applyGameUnpublished(event: DomainEvent<GameUnpublishedPayload>): void {
    this._status = 'unpublished';
  }

  validate(): void {
    if (this._version > 0 && !this._title) {
      throw new BusinessRuleError('Published game must have a title', 'GAME_TITLE_REQUIRED');
    }
  }

  protected toSnapshotState(): Record<string, unknown> {
    return {
      title: this._title,
      creatorId: this._creatorId,
      status: this._status,
      publishedAt: this._publishedAt,
    };
  }

  protected fromSnapshotState(state: Record<string, unknown>): void {
    this._title = (state.title as string) ?? '';
    this._creatorId = (state.creatorId as string) ?? '';
    this._status = (state.status as GameStatus) ?? 'draft';
    this._publishedAt = (state.publishedAt as string | null) ?? null;
  }
}

// Type import to avoid circular reference issues.
import type { DomainEvent } from '@/domain/shared/event/domain-event';
