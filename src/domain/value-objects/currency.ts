/**
 * Currency value object (ISO 4217).
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'JPY', 'CNY', 'INR',
]);

export interface CurrencyProps {
  readonly code: string;
}

export class Currency extends ValueObject<CurrencyProps> {
  constructor(code: string) {
    const normalized = code.toUpperCase();
    Currency.validate(normalized);
    super({ code: normalized });
  }

  get code(): string {
    return this.props.code;
  }

  static validate(code: string): void {
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new ValidationError(
        'Currency code must be 3 uppercase letters (ISO 4217)',
        'currency',
      );
    }
    if (!SUPPORTED_CURRENCIES.has(code)) {
      throw new ValidationError(`Unsupported currency code: ${code}`, 'currency');
    }
  }

  static USD = new Currency('USD');
  static EUR = new Currency('EUR');
  static GBP = new Currency('GBP');
  static GHS = new Currency('GHS');

  toString(): string {
    return this.props.code;
  }
}
