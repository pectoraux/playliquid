/**
 * Domain Error Framework.
 *
 * Every error in the system extends DomainError. No generic exceptions are
 * thrown for expected business failures — those are returned as Result.Fail
 * with one of these typed errors.
 */

export type ErrorCategory =
  | 'validation'
  | 'business'
  | 'concurrency'
  | 'authorization'
  | 'infrastructure'
  | 'configuration'
  | 'not_found';

export abstract class DomainError extends Error {
  abstract readonly category: ErrorCategory;
  abstract readonly code: string;
  readonly timestamp: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

/** Raised when input fails validation. */
export class ValidationError extends DomainError {
  readonly category = 'validation' as const;
  readonly code = 'VALIDATION_ERROR';
  readonly field?: string;

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, { ...details, field });
    this.field = field;
  }
}

/** Raised when a business rule is violated. */
export class BusinessRuleError extends DomainError {
  readonly category = 'business' as const;

  constructor(
    message: string,
    public readonly code: string = 'BUSINESS_RULE_VIOLATION',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/** Raised on optimistic concurrency conflict. */
export class ConcurrencyError extends DomainError {
  readonly category = 'concurrency' as const;
  readonly code = 'CONCURRENCY_CONFLICT';

  constructor(
    message: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(message, { expectedVersion, actualVersion });
  }
}

/** Raised when a user is not authorized to perform an action. */
export class AuthorizationError extends DomainError {
  readonly category = 'authorization' as const;
  readonly code = 'NOT_AUTHORIZED';

  constructor(
    message: string = 'You are not authorized to perform this action',
    public readonly permission?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, { ...details, permission });
  }
}

/** Raised when an entity is not found. */
export class NotFoundError extends DomainError {
  readonly category = 'not_found' as const;
  readonly code = 'NOT_FOUND';

  constructor(
    message: string,
    public readonly entityType: string,
    public readonly entityId: string,
  ) {
    super(message, { entityType, entityId });
  }
}

/** Raised when infrastructure fails (database, network, etc). */
export class InfrastructureError extends DomainError {
  readonly category = 'infrastructure' as const;

  constructor(
    message: string,
    public readonly code: string = 'INFRASTRUCTURE_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/** Raised when configuration is invalid or missing. */
export class ConfigurationError extends DomainError {
  readonly category = 'configuration' as const;
  readonly code = 'CONFIGURATION_ERROR';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/** Type guard for DomainError. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
