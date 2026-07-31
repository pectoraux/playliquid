/**
 * Locale value object — BCP 47 language tag (e.g., en, en-US, fr-FR).
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const LOCALE_REGEX = /^[a-z]{2}(-[A-Z]{2})?$/;

export interface LocaleProps {
  readonly value: string;
}

export class Locale extends ValueObject<LocaleProps> {
  constructor(value: string) {
    Locale.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  get language(): string {
    return this.props.value.split('-')[0];
  }

  get region(): string | null {
    const parts = this.props.value.split('-');
    return parts.length > 1 ? parts[1] : null;
  }

  static validate(value: string): void {
    if (!LOCALE_REGEX.test(value)) {
      throw new ValidationError(
        'Locale must be a BCP 47 tag (e.g., en, en-US, fr-FR)',
        'locale',
      );
    }
  }

  static default(): Locale {
    return new Locale('en');
  }

  toString(): string {
    return this.props.value;
  }
}
