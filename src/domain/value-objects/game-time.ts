/**
 * GameTime value object — duration in minutes.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

export interface GameTimeProps {
  readonly minutes: number;
}

export class GameTime extends ValueObject<GameTimeProps> {
  constructor(minutes: number) {
    GameTime.validate(minutes);
    super({ minutes });
  }

  get minutes(): number {
    return this.props.minutes;
  }

  get seconds(): number {
    return this.props.minutes * 60;
  }

  static validate(minutes: number): void {
    if (!Number.isInteger(minutes)) {
      throw new ValidationError('GameTime must be an integer number of minutes', 'minutes');
    }
    if (minutes < 0) {
      throw new ValidationError('GameTime cannot be negative', 'minutes');
    }
  }

  add(minutes: number): GameTime {
    if (minutes < 0) {
      throw new ValidationError('Cannot add negative minutes', 'minutes');
    }
    return new GameTime(this.props.minutes + minutes);
  }

  subtract(minutes: number): GameTime {
    const result = this.props.minutes - minutes;
    if (result < 0) {
      throw new ValidationError('GameTime cannot go below zero', 'minutes');
    }
    return new GameTime(result);
  }

  static zero(): GameTime {
    return new GameTime(0);
  }

  toString(): string {
    const h = Math.floor(this.props.minutes / 60);
    const m = this.props.minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
