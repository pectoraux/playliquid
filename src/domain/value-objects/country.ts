/**
 * Country value object — ISO 3166-1 alpha-2 code.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const COUNTRY_REGEX = /^[A-Z]{2}$/;

const SUPPORTED_COUNTRIES = new Set([
  'US', 'GB', 'GH', 'NG', 'KE', 'ZA', 'CA', 'DE', 'FR', 'JP', 'CN', 'IN', 'BR', 'AU',
]);

export interface CountryProps {
  readonly code: string;
}

export class Country extends ValueObject<CountryProps> {
  constructor(code: string) {
    const normalized = code.toUpperCase();
    Country.validate(normalized);
    super({ code: normalized });
  }

  get code(): string {
    return this.props.code;
  }

  static validate(code: string): void {
    if (!COUNTRY_REGEX.test(code)) {
      throw new ValidationError(
        'Country code must be 2 uppercase letters (ISO 3166-1 alpha-2)',
        'country',
      );
    }
    if (!SUPPORTED_COUNTRIES.has(code)) {
      throw new ValidationError(`Unsupported country code: ${code}`, 'country');
    }
  }

  toString(): string {
    return this.props.code;
  }
}
