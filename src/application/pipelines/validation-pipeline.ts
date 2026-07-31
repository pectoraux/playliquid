/**
 * Validation middleware — validates command payload before the handler runs.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { Result } from '@/shared/types/result';
import { getCommandValidator } from '@/application/validation/validator';

export class ValidationMiddleware implements CommandMiddleware {
  readonly name = 'validation';

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const validator = getCommandValidator(command.commandType);
    if (validator) {
      const validation = validator.validate((command as { payload?: unknown }).payload ?? command);
      if (!validation.ok) {
        return Result.fail(validation.error) as Result<T>;
      }
    }
    return next(command);
  }
}
