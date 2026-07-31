/**
 * DisplayName value object — human-readable display name.
 */

import { ValueObject } from '@/domain/shared/value-object';
import { ValidationError } from '@/domain/shared/errors';

const MIN_LENGTH = 1;
const MAX_LENGTH = 100;

export interface DisplayNameProps {
  readonly value: string;
}

export class DisplayName extends ValueObject<DisplayNameProps> {
  constructor(value: string) {
    const trimmed = value.trim();
    DisplayName.validate(trimmed);
    super({ value: trimmed });
  }

  get value(): string {
    return this.props.value;
  }

  get initials(): string {
    const parts = this.props.value.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  static validate(value: string): void {
    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
      throw new ValidationError(
        `Display name must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
        'displayName',
      );
    }
  }

  toString(): string {
    return this.props.value;
  }
}
