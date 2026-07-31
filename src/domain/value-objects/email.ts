/**
 * Email value object — validated RFC-5322-ish email address.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

export interface EmailProps {
  readonly value: string;
}

export class Email extends ValueObject<EmailProps> {
  constructor(value: string) {
    const normalized = value.trim().toLowerCase();
    Email.validate(normalized);
    super({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }

  get domain(): string {
    return this.props.value.split('@')[1] ?? '';
  }

  get localPart(): string {
    return this.props.value.split('@')[0] ?? '';
  }

  static validate(value: string): void {
    if (value.length > MAX_LENGTH) {
      throw new ValidationError(`Email exceeds ${MAX_LENGTH} characters`, 'email');
    }
    if (!EMAIL_REGEX.test(value)) {
      throw new ValidationError('Invalid email address format', 'email');
    }
  }

  toString(): string {
    return this.props.value;
  }
}
