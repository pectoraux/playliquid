/**
 * Username value object — validated display handle.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

export interface UsernameProps {
  readonly value: string;
}

export class Username extends ValueObject<UsernameProps> {
  constructor(value: string) {
    const normalized = value.trim();
    Username.validate(normalized);
    super({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }

  static validate(value: string): void {
    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
      throw new ValidationError(
        `Username must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
        'username',
      );
    }
    if (!USERNAME_REGEX.test(value)) {
      throw new ValidationError(
        'Username may only contain letters, numbers, and underscores',
        'username',
      );
    }
  }

  toString(): string {
    return this.props.value;
  }
}
