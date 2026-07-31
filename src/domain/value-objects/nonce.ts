/**
 * Nonce value object — a single-use cryptographic token.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const MIN_NONCE_LENGTH = 16;

export interface NonceProps {
  readonly value: string;
}

export class Nonce extends ValueObject<NonceProps> {
  constructor(value: string) {
    Nonce.validate(value);
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (value.length < MIN_NONCE_LENGTH) {
      throw new ValidationError(
        `Nonce must be at least ${MIN_NONCE_LENGTH} characters`,
        'nonce',
      );
    }
    if (!/^[a-fA-F0-9]+$/.test(value)) {
      throw new ValidationError('Nonce must be hexadecimal', 'nonce');
    }
  }

  toString(): string {
    return this.props.value;
  }
}
