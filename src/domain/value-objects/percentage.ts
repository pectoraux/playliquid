/**
 * Percentage value object — 0 to 100 inclusive.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

export interface PercentageProps {
  readonly value: number;
}

export class Percentage extends ValueObject<PercentageProps> {
  constructor(value: number) {
    Percentage.validate(value);
    super({ value });
  }

  get value(): number {
    return this.props.value;
  }

  /** As a 0-1 ratio. */
  get ratio(): number {
    return this.props.value / 100;
  }

  static validate(value: number): void {
    if (!Number.isFinite(value)) {
      throw new ValidationError('Percentage must be a finite number', 'percentage');
    }
    if (value < 0 || value > 100) {
      throw new ValidationError('Percentage must be between 0 and 100', 'percentage');
    }
  }

  static zero(): Percentage {
    return new Percentage(0);
  }

  static full(): Percentage {
    return new Percentage(100);
  }

  toString(): string {
    return `${this.props.value}%`;
  }
}
