/**
 * Branded identifier value objects.
 *
 * These wrap primitive strings/numbers in distinct types so that the compiler
 * prevents accidental mixing (e.g., passing a PlayerId where a GameId is
 * expected). Each validates its format on construction.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';
import { createId } from '@/shared/ids';

/** CorrelationId — traces a single logical operation across services. */
export class CorrelationId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    CorrelationId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('CorrelationId must be at least 3 characters', 'correlationId');
    }
  }

  static generate(): CorrelationId {
    return new CorrelationId(createId('corr'));
  }

  toString(): string {
    return this.props.value;
  }
}

/** Version — a monotonically increasing aggregate version. */
export class Version extends ValueObject<{ value: number }> {
  constructor(value: number) {
    Version.validate(value);
    super({ value });
  }

  get value(): number {
    return this.props.value;
  }

  static validate(value: number): void {
    if (!Number.isInteger(value)) {
      throw new ValidationError('Version must be an integer', 'version');
    }
    if (value < 0) {
      throw new ValidationError('Version cannot be negative', 'version');
    }
  }

  static initial(): Version {
    return new Version(0);
  }

  next(): Version {
    return new Version(this.props.value + 1);
  }

  toString(): string {
    return this.props.value.toString();
  }
}

/** PlayerId — identifies a player aggregate. */
export class PlayerId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    PlayerId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('PlayerId must be a non-empty string', 'playerId');
    }
  }

  static generate(): PlayerId {
    return new PlayerId(createId('player'));
  }

  toString(): string {
    return this.props.value;
  }
}

/** GameId — identifies a game aggregate. */
export class GameId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    GameId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('GameId must be a non-empty string', 'gameId');
    }
  }

  static generate(): GameId {
    return new GameId(createId('game'));
  }

  toString(): string {
    return this.props.value;
  }
}

/** SessionId — identifies a game session aggregate. */
export class SessionId extends ValueObject<{ value: string }> {
  constructor(value: string) {
    SessionId.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (!value || value.length < 3) {
      throw new ValidationError('SessionId must be a non-empty string', 'sessionId');
    }
  }

  static generate(): SessionId {
    return new SessionId(createId('session'));
  }

  toString(): string {
    return this.props.value;
  }
}
