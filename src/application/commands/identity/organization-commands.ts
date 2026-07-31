/**
 * Organization commands.
 *
 * CreateOrganization / AddMember / RemoveMember / JoinOrganization.
 *
 * CreateOrganization uses the OrganizationAggregate's factory; the others
 * load the aggregate from the OrganizationRepository, call a domain method,
 * and save it.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type {
  UserRepository,
  OrganizationRepository,
  RoleRepository,
} from '@/domain/identity/repositories';
import { OrganizationAggregate, type OrganizationType } from '@/domain/identity/aggregates/organization-aggregate';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';

// ─── Create Organization ───────────────────────────────────────────────────

export interface CreateOrganizationPayload {
  readonly name: string;
  readonly slug: string;
  readonly type: OrganizationType;
  readonly createdById: string;
}

export class CreateOrganizationCommand implements CommandWithPayload<CreateOrganizationPayload> {
  readonly commandType = 'CreateOrganization';
  constructor(
    public readonly payload: CreateOrganizationPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class CreateOrganizationHandler
  implements CommandHandler<CreateOrganizationCommand, { organizationId: string }>
{
  readonly commandType = 'CreateOrganization';

  constructor(private readonly orgRepo: OrganizationRepository) {}

  async execute(
    command: CreateOrganizationCommand,
  ): Promise<Result<{ organizationId: string }>> {
    const { name, slug, type, createdById } = command.payload;

    // Slug uniqueness check (the aggregate factory only validates format).
    if (await this.orgRepo.getBySlug(slug)) {
      return Result.fail(
        new BusinessRuleError(`Organization slug '${slug}' is already taken`, 'SLUG_TAKEN'),
      );
    }

    const organizationId = createId('org');
    let org: OrganizationAggregate;
    try {
      org = OrganizationAggregate.create({
        id: organizationId,
        name,
        slug,
        type,
        createdById,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    try {
      await this.orgRepo.save(org, org.version);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ organizationId });
  }
}

// ─── Add Member ────────────────────────────────────────────────────────────

export interface AddMemberPayload {
  readonly organizationId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly addedBy: string;
}

export class AddMemberCommand implements CommandWithPayload<AddMemberPayload> {
  readonly commandType = 'AddMember';
  constructor(
    public readonly payload: AddMemberPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class AddMemberHandler
  implements CommandHandler<AddMemberCommand, { organizationId: string; userId: string }>
{
  readonly commandType = 'AddMember';

  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly userRepo: UserRepository,
    private readonly roleRepo: RoleRepository,
  ) {}

  async execute(
    command: AddMemberCommand,
  ): Promise<Result<{ organizationId: string; userId: string }>> {
    const { organizationId, userId, roleId, addedBy } = command.payload;

    const org = await this.orgRepo.getById(organizationId);
    if (!org) {
      return Result.fail(new NotFoundError('Organization not found', 'Organization', organizationId));
    }
    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }
    if (!user.isActive) {
      return Result.fail(
        new BusinessRuleError('Only active users can be added to organizations', 'USER_NOT_ACTIVE'),
      );
    }
    const role = await this.roleRepo.getById(roleId);
    if (!role) {
      return Result.fail(new NotFoundError('Role not found', 'Role', roleId));
    }

    const expectedOrgVersion = org.version;
    try {
      org.addMember(userId, roleId, addedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.orgRepo.save(org, expectedOrgVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Mirror the membership onto the user aggregate so RBAC queries can
    // resolve organization-scoped roles.
    const expectedUserVersion = user.version;
    try {
      user.joinOrganization(organizationId, roleId);
    } catch (e) {
      // If the user is already a member via the user aggregate, treat as
      // success — the org's member list is the source of truth.
      if (!(e instanceof BusinessRuleError)) throw e;
    }
    try {
      await this.userRepo.save(user, expectedUserVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ organizationId, userId });
  }
}

// ─── Remove Member ─────────────────────────────────────────────────────────

export interface RemoveMemberPayload {
  readonly organizationId: string;
  readonly userId: string;
  readonly removedBy: string;
}

export class RemoveMemberCommand implements CommandWithPayload<RemoveMemberPayload> {
  readonly commandType = 'RemoveMember';
  constructor(
    public readonly payload: RemoveMemberPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RemoveMemberHandler
  implements CommandHandler<RemoveMemberCommand, { organizationId: string; userId: string }>
{
  readonly commandType = 'RemoveMember';

  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly userRepo: UserRepository,
  ) {}

  async execute(
    command: RemoveMemberCommand,
  ): Promise<Result<{ organizationId: string; userId: string }>> {
    const { organizationId, userId, removedBy } = command.payload;

    const org = await this.orgRepo.getById(organizationId);
    if (!org) {
      return Result.fail(new NotFoundError('Organization not found', 'Organization', organizationId));
    }

    const expectedOrgVersion = org.version;
    try {
      org.removeMember(userId, removedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.orgRepo.save(org, expectedOrgVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Mirror onto the user aggregate (best-effort).
    const user = await this.userRepo.getById(userId);
    if (user) {
      const expectedUserVersion = user.version;
      try {
        user.leaveOrganization(organizationId);
        try {
          await this.userRepo.save(user, expectedUserVersion);
        } catch (e) {
          return Result.fail(e as Error);
        }
      } catch {
        // User aggregate may already reflect the removal; ignore.
      }
    }

    return Result.ok({ organizationId, userId });
  }
}

// ─── Join Organization ─────────────────────────────────────────────────────

export interface JoinOrganizationPayload {
  readonly userId: string;
  readonly organizationId: string;
  readonly roleId: string;
}

export class JoinOrganizationCommand implements CommandWithPayload<JoinOrganizationPayload> {
  readonly commandType = 'JoinOrganization';
  constructor(
    public readonly payload: JoinOrganizationPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class JoinOrganizationHandler
  implements CommandHandler<JoinOrganizationCommand, { userId: string; organizationId: string }>
{
  readonly commandType = 'JoinOrganization';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly roleRepo: RoleRepository,
  ) {}

  async execute(
    command: JoinOrganizationCommand,
  ): Promise<Result<{ userId: string; organizationId: string }>> {
    const { userId, organizationId, roleId } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }
    if (!user.isActive) {
      return Result.fail(
        new ValidationError('Only active users can join organizations', 'userId'),
      );
    }

    const org = await this.orgRepo.getById(organizationId);
    if (!org) {
      return Result.fail(new NotFoundError('Organization not found', 'Organization', organizationId));
    }
    if (!org.active) {
      return Result.fail(
        new BusinessRuleError('Organization is inactive', 'ORG_INACTIVE'),
      );
    }
    const role = await this.roleRepo.getById(roleId);
    if (!role) {
      return Result.fail(new NotFoundError('Role not found', 'Role', roleId));
    }

    // Mutate the user aggregate (records membership + emits OrganizationJoined).
    const expectedUserVersion = user.version;
    try {
      user.joinOrganization(organizationId, roleId);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedUserVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Mirror onto the organization aggregate so its member list is consistent.
    const expectedOrgVersion = org.version;
    try {
      org.addMember(userId, roleId, userId);
      try {
        await this.orgRepo.save(org, expectedOrgVersion);
      } catch (e) {
        return Result.fail(e as Error);
      }
    } catch {
      // The org aggregate may already have this member; not fatal.
    }

    return Result.ok({ userId, organizationId });
  }
}
