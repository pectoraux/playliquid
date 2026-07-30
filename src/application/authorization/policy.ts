/**
 * Authorization framework.
 *
 * Supports RBAC (role-based), ABAC (attribute-based), and a policy engine.
 * Policies are registered per command type and executed by the
 * AuthorizationMiddleware. No hardcoded roles — permissions are declarative.
 */

import { Result } from '@/shared/types/result';
import { AuthorizationError } from '@/domain/shared/errors';
import type { Command } from '@/application/commands/command';

/** The principal performing an action (user, service, system). */
export interface Principal {
  readonly id: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

/** Authorization context passed to policies. */
export interface AuthorizationContext {
  readonly principal: Principal | null;
  readonly command: Command;
}

/** A policy decides whether a principal may execute a command. */
export interface Policy<TCommand extends Command = Command> {
  authorize(context: AuthorizationContext): Result<void>;
}

/** Allow anyone (including anonymous). */
export class AllowAnyonePolicy implements Policy {
  authorize(): Result<void> {
    return Result.ok(undefined);
  }
}

/** Require authentication (any logged-in principal). */
export class RequireAuthenticatedPolicy implements Policy {
  authorize(context: AuthorizationContext): Result<void> {
    if (!context.principal) {
      return Result.fail(new AuthorizationError('Authentication required'));
    }
    return Result.ok(undefined);
  }
}

/** Require a specific permission. */
export class RequirePermissionPolicy implements Policy {
  constructor(private readonly permission: string) {}

  authorize(context: AuthorizationContext): Result<void> {
    if (!context.principal) {
      return Result.fail(new AuthorizationError('Authentication required', this.permission));
    }
    if (!context.principal.permissions.includes(this.permission)) {
      return Result.fail(
        new AuthorizationError(
          `Missing permission: ${this.permission}`,
          this.permission,
        ),
      );
    }
    return Result.ok(undefined);
  }
}

/** Require any of the given roles (RBAC). */
export class RequireAnyRolePolicy implements Policy {
  constructor(private readonly roles: readonly string[]) {}

  authorize(context: AuthorizationContext): Result<void> {
    if (!context.principal) {
      return Result.fail(new AuthorizationError('Authentication required'));
    }
    const hasRole = context.principal.roles.some((r) => this.roles.includes(r));
    if (!hasRole) {
      return Result.fail(
        new AuthorizationError(`Requires one of roles: ${this.roles.join(', ')}`),
      );
    }
    return Result.ok(undefined);
  }
}

/** Compose policies with AND — all must pass. */
export class AllOfPolicy implements Policy {
  constructor(private readonly policies: readonly Policy[]) {}

  authorize(context: AuthorizationContext): Result<void> {
    for (const policy of this.policies) {
      const result = policy.authorize(context);
      if (!result.ok) return result;
    }
    return Result.ok(undefined);
  }
}

/** Compose policies with OR — at least one must pass. */
export class AnyOfPolicy implements Policy {
  constructor(private readonly policies: readonly Policy[]) {}

  authorize(context: AuthorizationContext): Result<void> {
    let lastError: unknown = null;
    for (const policy of this.policies) {
      const result = policy.authorize(context);
      if (result.ok) return result;
      lastError = result.error;
    }
    return Result.fail(
      lastError instanceof AuthorizationError
        ? lastError
        : new AuthorizationError('No policy satisfied'),
    );
  }
}

/** Registry of policies per command type. */
const policyRegistry = new Map<string, Policy>();

/** Register a policy for a command type. */
export function registerPolicy(commandType: string, policy: Policy): void {
  policyRegistry.set(commandType, policy);
}

/** Look up the policy for a command type. */
export function getPolicy(commandType: string): Policy {
  return policyRegistry.get(commandType) ?? new AllowAnyonePolicy();
}
