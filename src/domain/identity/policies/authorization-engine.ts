/**
 * Authorization Engine — RBAC + ABAC policy evaluation.
 *
 * Every authenticated request passes through this engine. It combines
 * role-based access control (RBAC) with attribute-based access control (ABAC)
 * to produce an authorization decision: Allow, Deny, or Conditional.
 *
 * Every decision is logged for audit purposes.
 */

import { logger } from '@/shared/logging';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuthzDecision = 'allow' | 'deny' | 'conditional';

export interface AuthzSubject {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly organizationId?: string;
  readonly organizationRoles?: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface AuthzResource {
  readonly type: string;
  readonly id: string;
  readonly ownerId?: string;
  readonly organizationId?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface AuthzContext {
  readonly action: string;
  readonly subject: AuthzSubject;
  readonly resource?: AuthzResource;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}

export interface AuthzResult {
  readonly decision: AuthzDecision;
  readonly reason: string;
  readonly evaluatedPolicies: string[];
  readonly timestamp: number;
}

// ─── RBAC Engine ───────────────────────────────────────────────────────────

export interface RolePermissionMap {
  readonly roleId: string;
  readonly roleName: string;
  readonly permissions: readonly string[];
  readonly inheritedRoleIds?: readonly string[];
  readonly denyPermissions?: readonly string[];
}

/**
 * RBAC Engine — evaluates role-based permissions with inheritance and deny rules.
 *
 * Permission resolution:
 *   1. Collect all roles for the subject
 *   2. Expand inherited roles (transitive closure)
 *   3. Collect all permissions from expanded roles
 *   4. Remove any explicitly denied permissions
 *   5. Check if the requested permission is in the final set
 */
export class RbacEngine {
  private readonly roleMap = new Map<string, RolePermissionMap>();

  registerRole(role: RolePermissionMap): void {
    this.roleMap.set(role.roleId, role);
  }

  registerRoles(roles: RolePermissionMap[]): void {
    for (const role of roles) this.registerRole(role);
  }

  /** Get all permissions for a set of roles (with inheritance and deny rules). */
  getPermissions(roleIds: readonly string[]): Set<string> {
    const expanded = this.expandRoles(roleIds);
    const permissions = new Set<string>();
    const denied = new Set<string>();

    for (const roleId of expanded) {
      const role = this.roleMap.get(roleId);
      if (!role) continue;
      for (const perm of role.permissions) permissions.add(perm);
      for (const perm of role.denyPermissions ?? []) denied.add(perm);
    }

    // Remove denied permissions
    for (const perm of denied) permissions.delete(perm);

    return permissions;
  }

  /** Check if any of the roles grant the permission. */
  hasPermission(roleIds: readonly string[], permission: string): boolean {
    const permissions = this.getPermissions(roleIds);
    // Check exact match and wildcard (e.g., "game.*" matches "game.publish")
    if (permissions.has(permission)) return true;
    const [resource] = permission.split('.');
    if (permissions.has(`${resource}.*`)) return true;
    if (permissions.has('*')) return true;
    return false;
  }

  /** Expand roles to include inherited roles (transitive). */
  private expandRoles(roleIds: readonly string[], visited = new Set<string>()): string[] {
    const result: string[] = [];
    for (const roleId of roleIds) {
      if (visited.has(roleId)) continue;
      visited.add(roleId);
      result.push(roleId);
      const role = this.roleMap.get(roleId);
      if (role?.inheritedRoleIds) {
        result.push(...this.expandRoles(role.inheritedRoleIds, visited));
      }
    }
    return result;
  }
}

// ─── ABAC Engine ───────────────────────────────────────────────────────────

export type AbacCondition = (context: AuthzContext) => boolean;

export interface AbacPolicy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: number;
  readonly effect: 'allow' | 'deny';
  readonly condition: AbacCondition;
  readonly audit: boolean;
}

/**
 * ABAC Engine — evaluates attribute-based policies.
 *
 * Policies are ordered by priority (higher = evaluated first).
 * A deny policy at any priority overrides an allow.
 */
export class AbacEngine {
  private readonly policies: AbacPolicy[] = [];

  registerPolicy(policy: AbacPolicy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
  }

  registerPolicies(policies: AbacPolicy[]): void {
    for (const p of policies) this.registerPolicy(p);
  }

  /** Evaluate all matching policies. Returns the highest-priority decision. */
  evaluate(context: AuthzContext): { decision: AuthzDecision; matchedPolicies: string[] } {
    const matched: string[] = [];
    let hasAllow = false;
    let hasDeny = false;

    for (const policy of this.policies) {
      try {
        if (policy.condition(context)) {
          matched.push(policy.id);
          if (policy.effect === 'deny') {
            hasDeny = true;
          } else {
            hasAllow = true;
          }
        }
      } catch (e) {
        logger.system().error('ABAC policy evaluation failed', { policyId: policy.id }, e);
      }
    }

    // Deny always wins
    if (hasDeny) return { decision: 'deny', matchedPolicies: matched };
    if (hasAllow) return { decision: 'allow', matchedPolicies: matched };
    return { decision: 'conditional', matchedPolicies: matched };
  }
}

// ─── Policy Engine (combines RBAC + ABAC) ──────────────────────────────────

/**
 * Policy Engine — the centralized authorization pipeline.
 *
 * Evaluation order:
 *   1. If subject is deleted/suspended → deny
 *   2. If subject has explicit deny permission → deny
 *   3. If RBAC grants the permission → check ABAC
 *   4. ABAC evaluates: deny overrides allow
 *   5. If ABAC allows → allow
 *   6. If ABAC is conditional and RBAC allows → allow
 *   7. Otherwise → deny
 *
 * Every decision is logged.
 */
export class PolicyEngine {
  constructor(
    private readonly rbac: RbacEngine,
    private readonly abac: AbacEngine,
  ) {}

  authorize(context: AuthzContext): AuthzResult {
    const evaluatedPolicies: string[] = [];

    // Step 1: Check if subject is active
    const status = context.subject.attributes.status as string | undefined;
    if (status === 'deleted') {
      return this.result('deny', 'Subject is deleted', evaluatedPolicies);
    }
    if (status === 'suspended') {
      return this.result('deny', 'Subject is suspended', evaluatedPolicies);
    }

    // Step 2: Check RBAC
    const requiredPermission = context.action;
    const hasRbacPermission = this.rbac.hasPermission(
      context.subject.roles,
      requiredPermission,
    );
    evaluatedPolicies.push(`rbac:${requiredPermission}:${hasRbacPermission}`);

    if (!hasRbacPermission) {
      return this.result('deny', `RBAC: missing permission ${requiredPermission}`, evaluatedPolicies);
    }

    // Step 3: Check ABAC
    const abacResult = this.abac.evaluate(context);
    evaluatedPolicies.push(...abacResult.matchedPolicies);

    if (abacResult.decision === 'deny') {
      return this.result('deny', 'ABAC: denied by policy', evaluatedPolicies);
    }

    if (abacResult.decision === 'allow') {
      return this.result('allow', 'ABAC: allowed by policy', evaluatedPolicies);
    }

    // Conditional: RBAC allows, ABAC is neutral
    return this.result('allow', 'RBAC permission granted, no ABAC denial', evaluatedPolicies);
  }

  private result(decision: AuthzDecision, reason: string, policies: string[]): AuthzResult {
    const result: AuthzResult = {
      decision,
      reason,
      evaluatedPolicies: policies,
      timestamp: Date.now(),
    };

    logger.system().debug('Authorization decision', {
      decision,
      reason,
      policies: policies.length,
    });

    return result;
  }
}

// ─── Built-in ABAC Policies ────────────────────────────────────────────────

/** Ownership check — resource owner can access their own resources. */
export const ownershipPolicy: AbacPolicy = {
  id: 'ownership',
  name: 'Ownership Check',
  description: 'Allow if the subject owns the resource',
  priority: 100,
  effect: 'allow',
  audit: true,
  condition: (ctx) => {
    if (!ctx.resource?.ownerId) return false;
    return ctx.resource.ownerId === ctx.subject.userId;
  },
};

/** Organization membership check. */
export const organizationMemberPolicy: AbacPolicy = {
  id: 'org-member',
  name: 'Organization Member',
  description: 'Allow if subject and resource are in the same organization',
  priority: 90,
  effect: 'allow',
  audit: true,
  condition: (ctx) => {
    if (!ctx.subject.organizationId || !ctx.resource?.organizationId) return false;
    return ctx.subject.organizationId === ctx.resource.organizationId;
  },
};

/** Risk-based check — deny if risk score is too high. */
export const lowRiskPolicy: AbacPolicy = {
  id: 'low-risk',
  name: 'Low Risk Required',
  description: 'Deny if subject risk score is above threshold',
  priority: 200,
  effect: 'deny',
  audit: true,
  condition: (ctx) => {
    const riskScore = ctx.subject.attributes.riskScore as number | undefined;
    if (riskScore === undefined) return false;
    return riskScore > 0.8; // deny if risk > 80%
  },
};

/** Time-based check — deny access outside business hours for sensitive operations. */
export const businessHoursPolicy: AbacPolicy = {
  id: 'business-hours',
  name: 'Business Hours Only',
  description: 'Deny sensitive operations outside business hours (configurable)',
  priority: 150,
  effect: 'deny',
  audit: true,
  condition: (ctx) => {
    const requireBusinessHours = ctx.environment.requireBusinessHours as boolean | undefined;
    if (!requireBusinessHours) return false;
    const hour = new Date(ctx.timestamp).getUTCHours();
    return hour < 6 || hour > 22; // deny 10pm - 6am UTC
  },
};
