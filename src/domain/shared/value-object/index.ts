/**
 * Value Object base class.
 *
 * Value objects are immutable, self-validating, and compared by value rather
 * than by identity. Every value object MUST validate its invariants in the
 * constructor and throw ValidationError if violated.
 */

import { ValidationError } from '@/domain/shared/errors';

export abstract class ValueObject<T = unknown> {
  protected readonly props: Readonly<T>;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  /** Structural equality — value objects are equal when their props match. */
  equals(other: ValueObject<T>): boolean {
    if (other === this) return true;
    if (!(other instanceof ValueObject)) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }

  /** Serialize to a primitive for storage / transport. */
  abstract toString(): string;

  /** Serialize to JSON. */
  toJSON(): unknown {
    return this.props;
  }

  /** Protected helper for validation. */
  protected static assert(condition: boolean, message: string, field?: string): void {
    if (!condition) {
      throw new ValidationError(message, field);
    }
  }
}
