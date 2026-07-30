/**
 * User management commands.
 *
 * SuspendUser / ReactivateUser / DeleteUser — admin lifecycle operations.
 * UpdateProfile / ChangeEmail — self-service profile updates.
 * EnableMfa / DisableMfa — MFA opt-in/out.
 * AssignRole / RemoveRole — role binding.
 *
 * Each handler loads the UserAggregate, calls a domain method, and saves it.
 */

import { Result } from '@/shared/types/result';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type {
  UserRepository,
  RoleRepository,
  AuditLogRepository,
  AuditLogEntry,
} from '@/domain/identity/repositories';
import type { MfaProvider } from '@/domain/identity/services/identity-ports';
import type {
  AppSessionStore,
  EmailService,
} from '@/application/ports/identity-ports';
import { Email } from '@/domain/value-objects';
import { DisplayName } from '@/domain/identity/value-objects/display-name';
import { Timezone } from '@/domain/identity/value-objects/timezone';
import { Locale } from '@/domain/identity/value-objects/locale';
import { createId } from '@/shared/ids';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';

// ─── Suspend User ──────────────────────────────────────────────────────────

export interface SuspendUserPayload {
  readonly userId: string;
  readonly suspendedBy: string;
  readonly reason: string;
}

export class SuspendUserCommand implements CommandWithPayload<SuspendUserPayload> {
  readonly commandType = 'SuspendUser';
  constructor(
    public readonly payload: SuspendUserPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class SuspendUserHandler
  implements CommandHandler<SuspendUserCommand, { userId: string }>
{
  readonly commandType = 'SuspendUser';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionStore: AppSessionStore | null,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: SuspendUserCommand): Promise<Result<{ userId: string }>> {
    const { userId, suspendedBy, reason } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.suspend(suspendedBy, reason);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Revoke all active sessions.
    if (this.sessionStore) {
      await this.sessionStore.revokeAllForUser(userId);
    }

    if (this.auditRepo) {
      await this.auditRepo.append(buildAudit(suspendedBy, 'user.suspend', 'User', userId, { reason }));
    }

    return Result.ok({ userId });
  }
}

// ─── Reactivate User ───────────────────────────────────────────────────────

export interface ReactivateUserPayload {
  readonly userId: string;
  readonly reactivatedBy: string;
}

export class ReactivateUserCommand implements CommandWithPayload<ReactivateUserPayload> {
  readonly commandType = 'ReactivateUser';
  constructor(
    public readonly payload: ReactivateUserPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ReactivateUserHandler
  implements CommandHandler<ReactivateUserCommand, { userId: string }>
{
  readonly commandType = 'ReactivateUser';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: ReactivateUserCommand): Promise<Result<{ userId: string }>> {
    const { userId, reactivatedBy } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.reactivate(reactivatedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (this.auditRepo) {
      await this.auditRepo.append(buildAudit(reactivatedBy, 'user.reactivate', 'User', userId, {}));
    }

    return Result.ok({ userId });
  }
}

// ─── Delete User ───────────────────────────────────────────────────────────

export interface DeleteUserPayload {
  readonly userId: string;
  readonly deletedBy: string;
}

export class DeleteUserCommand implements CommandWithPayload<DeleteUserPayload> {
  readonly commandType = 'DeleteUser';
  constructor(
    public readonly payload: DeleteUserPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class DeleteUserHandler
  implements CommandHandler<DeleteUserCommand, { userId: string }>
{
  readonly commandType = 'DeleteUser';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionStore: AppSessionStore | null,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: DeleteUserCommand): Promise<Result<{ userId: string }>> {
    const { userId, deletedBy } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.delete(deletedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Revoke all sessions for the deleted user.
    if (this.sessionStore) {
      await this.sessionStore.revokeAllForUser(userId);
    }

    if (this.auditRepo) {
      await this.auditRepo.append(buildAudit(deletedBy, 'user.delete', 'User', userId, {}));
    }

    return Result.ok({ userId });
  }
}

// ─── Update Profile ────────────────────────────────────────────────────────

export interface UpdateProfilePayload {
  readonly userId: string;
  readonly displayName: string;
  readonly timezone: string;
  readonly locale: string;
}

export class UpdateProfileCommand implements CommandWithPayload<UpdateProfilePayload> {
  readonly commandType = 'UpdateProfile';
  constructor(
    public readonly payload: UpdateProfilePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class UpdateProfileHandler
  implements CommandHandler<UpdateProfileCommand, { userId: string }>
{
  readonly commandType = 'UpdateProfile';

  constructor(private readonly userRepo: UserRepository) {}

  async execute(command: UpdateProfileCommand): Promise<Result<{ userId: string }>> {
    const { userId, displayName, timezone, locale } = command.payload;

    let displayNameVo: DisplayName;
    let timezoneVo: Timezone;
    let localeVo: Locale;
    try {
      displayNameVo = new DisplayName(displayName);
      timezoneVo = new Timezone(timezone);
      localeVo = new Locale(locale);
    } catch (e) {
      return Result.fail(e as Error);
    }

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.updateProfile({
        displayName: displayNameVo,
        timezone: timezoneVo,
        locale: localeVo,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ userId });
  }
}

// ─── Change Email ──────────────────────────────────────────────────────────

export interface ChangeEmailPayload {
  readonly userId: string;
  readonly newEmail: string;
  readonly changedBy: string;
}

export class ChangeEmailCommand implements CommandWithPayload<ChangeEmailPayload> {
  readonly commandType = 'ChangeEmail';
  constructor(
    public readonly payload: ChangeEmailPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ChangeEmailHandler
  implements CommandHandler<ChangeEmailCommand, { userId: string; verificationToken: string }>
{
  readonly commandType = 'ChangeEmail';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly emailService: EmailService | null,
  ) {}

  async execute(
    command: ChangeEmailCommand,
  ): Promise<Result<{ userId: string; verificationToken: string }>> {
    const { userId, newEmail, changedBy } = command.payload;

    let emailVo: Email;
    try {
      emailVo = new Email(newEmail);
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (await this.userRepo.emailExists(emailVo.value)) {
      return Result.fail(
        new BusinessRuleError('Email is already registered', 'EMAIL_TAKEN'),
      );
    }

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }
    if (user.email === emailVo.value) {
      return Result.fail(
        new ValidationError('New email is the same as the current email', 'newEmail'),
      );
    }

    const expectedVersion = user.version;
    try {
      user.changeEmail(emailVo, changedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Send a verification email for the new address.
    const verificationToken = createId('vfy');
    if (this.emailService) {
      try {
        await this.emailService.sendVerificationEmail(emailVo.value, verificationToken);
      } catch {
        // Non-fatal.
      }
    }

    return Result.ok({ userId, verificationToken });
  }
}

// ─── Enable MFA ────────────────────────────────────────────────────────────

export interface EnableMfaPayload {
  readonly userId: string;
  readonly method: string;
}

export interface EnableMfaResult {
  readonly userId: string;
  readonly secret: string;
  readonly qrCodeUrl: string;
  readonly backupCodes: string[];
}

export class EnableMfaCommand implements CommandWithPayload<EnableMfaPayload> {
  readonly commandType = 'EnableMfa';
  constructor(
    public readonly payload: EnableMfaPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class EnableMfaHandler
  implements CommandHandler<EnableMfaCommand, EnableMfaResult>
{
  readonly commandType = 'EnableMfa';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly mfaProvider: MfaProvider,
  ) {}

  async execute(command: EnableMfaCommand): Promise<Result<EnableMfaResult>> {
    const { userId, method } = command.payload;

    if (method !== this.mfaProvider.method) {
      return Result.fail(
        new ValidationError(
          `MFA method '${method}' is not supported by the configured provider`,
          'method',
        ),
      );
    }

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const setupResult = await this.mfaProvider.setup(userId);

    const expectedVersion = user.version;
    try {
      user.enableMfa(method);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({
      userId,
      secret: setupResult.secret,
      qrCodeUrl: setupResult.qrCodeUrl,
      backupCodes: setupResult.backupCodes,
    });
  }
}

// ─── Disable MFA ───────────────────────────────────────────────────────────

export interface DisableMfaPayload {
  readonly userId: string;
}

export class DisableMfaCommand implements CommandWithPayload<DisableMfaPayload> {
  readonly commandType = 'DisableMfa';
  constructor(
    public readonly payload: DisableMfaPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class DisableMfaHandler
  implements CommandHandler<DisableMfaCommand, { userId: string }>
{
  readonly commandType = 'DisableMfa';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly mfaProvider: MfaProvider | null,
  ) {}

  async execute(command: DisableMfaCommand): Promise<Result<{ userId: string }>> {
    const { userId } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.disableMfa();
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (this.mfaProvider) {
      try {
        await this.mfaProvider.disable(userId);
      } catch {
        // Provider cleanup is best-effort.
      }
    }

    return Result.ok({ userId });
  }
}

// ─── Assign Role ───────────────────────────────────────────────────────────

export interface AssignRolePayload {
  readonly userId: string;
  readonly roleId: string;
  readonly assignedBy: string;
}

export class AssignRoleCommand implements CommandWithPayload<AssignRolePayload> {
  readonly commandType = 'AssignRole';
  constructor(
    public readonly payload: AssignRolePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class AssignRoleHandler
  implements CommandHandler<AssignRoleCommand, { userId: string; roleId: string }>
{
  readonly commandType = 'AssignRole';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly roleRepo: RoleRepository,
  ) {}

  async execute(
    command: AssignRoleCommand,
  ): Promise<Result<{ userId: string; roleId: string }>> {
    const { userId, roleId, assignedBy } = command.payload;

    const role = await this.roleRepo.getById(roleId);
    if (!role) {
      return Result.fail(new NotFoundError('Role not found', 'Role', roleId));
    }

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.addRole(roleId, role.name, assignedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ userId, roleId });
  }
}

// ─── Remove Role ───────────────────────────────────────────────────────────

export interface RemoveRolePayload {
  readonly userId: string;
  readonly roleId: string;
  readonly removedBy: string;
}

export class RemoveRoleCommand implements CommandWithPayload<RemoveRolePayload> {
  readonly commandType = 'RemoveRole';
  constructor(
    public readonly payload: RemoveRolePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RemoveRoleHandler
  implements CommandHandler<RemoveRoleCommand, { userId: string; roleId: string }>
{
  readonly commandType = 'RemoveRole';

  constructor(private readonly userRepo: UserRepository) {}

  async execute(
    command: RemoveRoleCommand,
  ): Promise<Result<{ userId: string; roleId: string }>> {
    const { userId, roleId, removedBy } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    const expectedVersion = user.version;
    try {
      user.removeRole(roleId, removedBy);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ userId, roleId });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
): AuditLogEntry {
  return {
    id: createId('aud'),
    action,
    actorId,
    actorType: 'user',
    targetType,
    targetId,
    timestamp: new Date().toISOString(),
    ipAddress: null,
    userAgent: null,
    metadata,
    correlationId: null,
  };
}
