/**
 * Score value object — a non-negative integer game score.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

export interface ScoreProps {
  readonly value: number;
}

export class Score extends ValueObject<ScoreProps> {
  constructor(value: number) {
    Score.validate(value);
    super({ value });
  }

  get value(): number {
    return this.props.value;
  }

  static validate(value: number): void {
    if (!Number.isInteger(value)) {
      throw new ValidationError('Score must be an integer', 'score');
    }
    if (value < 0) {
      throw new ValidationError('Score cannot be negative', 'score');
    }
  }

  add(points: number): Score {
    if (points < 0) {
      throw new ValidationError('Cannot add negative points; use subtract', 'points');
    }
    return new Score(this.props.value + points);
  }

  subtract(points: number): Score {
    const result = this.props.value - points;
    if (result < 0) {
      throw new ValidationError('Score cannot go below zero', 'points');
    }
    return new Score(result);
  }

  isGreaterThan(other: Score): boolean {
    return this.props.value > other.props.value;
  }

  static zero(): Score {
    return new Score(0);
  }

  toString(): string {
    return this.props.value.toString();
  }
}
