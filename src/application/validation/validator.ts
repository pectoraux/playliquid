/**
 * Validation framework.
 *
 * Validators are registered per command/query type and executed by the
 * ValidationMiddleware BEFORE the handler runs. Validation uses Zod schemas
 * and returns Result.Failure(ValidationError) on failure.
 */

import { z } from 'zod';
import { Result } from '@/shared/types/result';
import { ValidationError } from '@/domain/shared/errors';

export interface Validator<TInput = unknown, TOutput = TInput> {
  validate(input: unknown): Result<TOutput>;
}

/** Wrap a Zod schema into a Validator. */
export class ZodValidator<TInput> implements Validator<TInput> {
  constructor(private readonly schema: z.ZodType<TInput>) {}

  validate(input: unknown): Result<TInput> {
    const result = this.schema.safeParse(input);
    if (result.success) {
      return Result.ok(result.data);
    }
    const firstError = result.error.issues[0];
    const message = firstError
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return Result.fail(new ValidationError(message, firstError?.path.join('.')));
  }
}

/** A validator that always passes (for commands with no validation). */
export class NoOpValidator<T> implements Validator<T> {
  validate(input: unknown): Result<T> {
    return Result.ok(input as T);
  }
}

/** Registry of validators keyed by command/query type. */
const validatorRegistry = new Map<string, Validator<any>>();

/** Register a validator for a command type. */
export function registerCommandValidator<T>(
  commandType: string,
  validator: Validator<T>,
): void {
  validatorRegistry.set(`command:${commandType}`, validator);
}

/** Register a validator for a query type. */
export function registerQueryValidator<T>(
  queryType: string,
  validator: Validator<T>,
): void {
  validatorRegistry.set(`query:${queryType}`, validator);
}

/** Look up the validator for a command type. */
export function getCommandValidator(commandType: string): Validator | null {
  return validatorRegistry.get(`command:${commandType}`) ?? null;
}

/** Look up the validator for a query type. */
export function getQueryValidator(queryType: string): Validator | null {
  return validatorRegistry.get(`query:${queryType}`) ?? null;
}
