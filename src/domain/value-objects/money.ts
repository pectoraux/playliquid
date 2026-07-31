/**
 * Money value object.
 *
 * Stores amounts as integer minor units (cents) to avoid floating-point
 * rounding errors. Paired with a Currency value object.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';
import { Currency } from './currency';

export interface MoneyProps {
  readonly amount: number;
  readonly currency: Currency;
}

export class Money extends ValueObject<MoneyProps> {
  constructor(amount: number, currency: Currency) {
    Money.validate(amount, currency);
    super({ amount, currency });
  }

  get value(): number {
    return this.props.amount;
  }

  get currencyCode(): string {
    return this.props.currency.code;
  }

  static validate(amount: number, currency: Currency): void {
    if (!Number.isInteger(amount)) {
      throw new ValidationError('Money amount must be an integer (minor units)', 'amount');
    }
    if (amount < 0) {
      throw new ValidationError('Money amount cannot be negative', 'amount');
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.props.amount + other.props.amount, this.props.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.props.amount - other.props.amount;
    if (result < 0) {
      throw new ValidationError('Subtraction would result in negative money', 'amount');
    }
    return new Money(result, this.props.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new ValidationError('Cannot multiply money by a negative factor', 'factor');
    }
    return new Money(Math.round(this.props.amount * factor), this.props.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.props.amount > other.props.amount;
  }

  isZero(): boolean {
    return this.props.amount === 0;
  }

  static zero(currency: Currency): Money {
    return new Money(0, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (!this.props.currency.equals(other.props.currency)) {
      throw new ValidationError(
        `Currency mismatch: ${this.props.currency.code} vs ${other.props.currency.code}`,
        'currency',
      );
    }
  }

  toString(): string {
    const major = Math.floor(this.props.amount / 100);
    const minor = Math.abs(this.props.amount % 100);
    return `${major}.${minor.toString().padStart(2, '0')} ${this.props.currency.code}`;
  }
}
