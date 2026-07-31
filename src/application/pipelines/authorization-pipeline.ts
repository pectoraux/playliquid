/**
 * Authorization middleware — enforces the policy registered for the command.
 */

import type { CommandMiddleware } from './pipeline';
import type { Command } from '@/application/commands/command';
import { Result } from '@/shared/types/result';
import { getPolicy, type Principal, type AuthorizationContext } from '@/application/authorization/policy';

export class AuthorizationMiddleware implements CommandMiddleware {
  readonly name = 'authorization';

  constructor(private readonly principalResolver: (command: Command) => Principal | null) {}

  async handle<T>(command: Command, next: (command: Command) => Promise<Result<T>>): Promise<Result<T>> {
    const principal = this.principalResolver(command);
    const context: AuthorizationContext = { principal, command };
    const policy = getPolicy(command.commandType);
    const authResult = policy.authorize(context);
    if (!authResult.ok) {
      return Result.fail(authResult.error) as Result<T>;
    }
    return next(command);
  }
}
