/**
 * PasswordHash value object — wraps an Argon2id hash string.
 *
 * The hash is stored as a single string encoding algorithm, parameters, salt,
 * and digest. This value object is immutable and validates the format on
 * construction.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

export interface PasswordHashProps {
  readonly hash: string;
}

export class PasswordHash extends ValueObject<PasswordHashProps> {
  constructor(hash: string) {
    PasswordHash.validate(hash);
    super({ hash });
  }

  get value(): string {
    return this.props.hash;
  }

  static validate(hash: string): void {
    if (!hash || hash.length < 20) {
      throw new ValidationError('Password hash must be at least 20 characters', 'passwordHash');
    }
    // Argon2 hashes start with $argon2
    if (!hash.startsWith('$argon2')) {
      throw new ValidationError('Password hash must be an Argon2 hash', 'passwordHash');
    }
  }

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): unknown {
    return { hash: '[REDACTED]' };
  }
}
