/**
 * PhoneNumber value object — E.164 format.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export interface PhoneNumberProps {
  readonly value: string;
}

export class PhoneNumber extends ValueObject<PhoneNumberProps> {
  constructor(value: string) {
    const normalized = value.replace(/[\s()-]/g, '');
    PhoneNumber.validate(normalized);
    super({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }

  get countryCode(): string {
    return this.props.value.substring(1, 3);
  }

  static validate(value: string): void {
    if (!E164_REGEX.test(value)) {
      throw new ValidationError(
        'Phone number must be in E.164 format (e.g., +233244123456)',
        'phoneNumber',
      );
    }
  }

  toString(): string {
    return this.props.value;
  }
}
