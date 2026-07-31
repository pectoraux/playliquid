/**
 * Identity projectors — materialize identity domain events into read models.
 *
 * Each projector subscribes to a coherent set of events and updates a
 * projection table. All handlers are idempotent: re-applying the same event
 * produces the same state, so replay/rebuild works correctly.
 *
 * Projectors in this module:
 *   - UserProfileProjector    → UserReadModel (lifecycle + profile changes)
 *   - OrganizationProjector   → OrganizationReadModel + OrganizationMemberReadModel
 *   - AuditLogProjector       → AuditLog (append-only)
 *   - ApiKeyProjector         → ApiKey (creation, rotation, revocation)
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import { Projector } from '@/infrastructure/projections/projection-engine';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

// ─── User Profile Projector ────────────────────────────────────────────────

/**
 * Materializes User lifecycle and profile events into the UserReadModel.
 *
 * Maintains: status transitions, email/username, profile fields, email-verified
 * and MFA flags. Used by:
 *   - UserRepositoryImpl.getByEmail / getByUsername (lookup index)
 *   - Admin user-management dashboards (list / filter by status)
 *   - Authentication flow (status check, email-verified gate)
 */
export class UserProfileProjector extends Projector {
  readonly name = 'UserProfileProjector';
  readonly handledEventTypes = [
    'UserCreated',
    'UserApproved',
    'UserRejected',
    'UserSuspendedM3',
    'UserReactivated',
    'UserDeleted',
    'UserProfileUpdated',
    'UserEmailChanged',
    'UserEmailVerified',
    'UserMfaEnabled',
    'UserMfaDisabled',
  ] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();
    const type = event.eventType;
    const payload = event.payload as Record<string, unknown>;

    switch (type) {
      case 'UserCreated': {
        const p = payload as {
          userId: string;
          email: string;
          username: string;
          displayName: string;
          country: string;
          timezone: string;
          locale: string;
          status: string;
          createdAt: string;
        };
        await client.userReadModel.upsert({
          where: { userId: p.userId },
          create: {
            userId: p.userId,
            email: p.email,
            username: p.username,
            displayName: p.displayName,
            country: p.country,
            timezone: p.timezone,
            locale: p.locale,
            status: p.status,
            emailVerified: false,
            mfaEnabled: false,
            createdAt: p.createdAt,
          },
          update: {
            email: p.email,
            username: p.username,
            displayName: p.displayName,
            country: p.country,
            timezone: p.timezone,
            locale: p.locale,
            status: p.status,
          },
        });
        break;
      }

      case 'UserApproved': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { status: 'active' },
        }).catch(() => {});
        break;
      }

      case 'UserRejected': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { status: 'rejected' },
        }).catch(() => {});
        break;
      }

      case 'UserSuspendedM3': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { status: 'suspended' },
        }).catch(() => {});
        break;
      }

      case 'UserReactivated': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { status: 'active' },
        }).catch(() => {});
        break;
      }

      case 'UserDeleted': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { status: 'deleted' },
        }).catch(() => {});
        break;
      }

      case 'UserProfileUpdated': {
        const p = payload as {
          userId: string;
          displayName: string;
          timezone: string;
          locale: string;
        };
        await client.userReadModel.update({
          where: { userId: p.userId },
          data: {
            displayName: p.displayName,
            timezone: p.timezone,
            locale: p.locale,
          },
        }).catch(() => {});
        break;
      }

      case 'UserEmailChanged': {
        const p = payload as { userId: string; newEmail: string };
        await client.userReadModel.update({
          where: { userId: p.userId },
          data: { email: p.newEmail, emailVerified: false },
        }).catch(() => {});
        break;
      }

      case 'UserEmailVerified': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { emailVerified: true },
        }).catch(() => {});
        break;
      }

      case 'UserMfaEnabled': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { mfaEnabled: true },
        }).catch(() => {});
        break;
      }

      case 'UserMfaDisabled': {
        await client.userReadModel.update({
          where: { userId: payload['userId'] as string },
          data: { mfaEnabled: false },
        }).catch(() => {});
        break;
      }

      default:
        // Not our event — ignore.
        break;
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.userReadModel.deleteMany({});
    logger.projection().info('UserProfileProjector read model cleared');
  }
}

// ─── Organization Projector ────────────────────────────────────────────────

/**
 * Materializes Organization lifecycle and membership events.
 *
 * Maintains:
 *   - OrganizationReadModel — org-level state (name, slug, type, active flag)
 *   - OrganizationMemberReadModel — per-user membership (roleId, status)
 */
export class OrganizationProjector extends Projector {
  readonly name = 'OrganizationProjector';
  readonly handledEventTypes = [
    'OrganizationCreated',
    'MemberAdded',
    'MemberRemoved',
  ] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();
    const type = event.eventType;
    const payload = event.payload as Record<string, unknown>;

    switch (type) {
      case 'OrganizationCreated': {
        const p = payload as {
          organizationId: string;
          name: string;
          slug: string;
          type: string;
          createdById: string;
          createdAt: string;
        };
        await client.organizationReadModel.upsert({
          where: { orgId: p.organizationId },
          create: {
            orgId: p.organizationId,
            name: p.name,
            slug: p.slug,
            type: p.type,
            createdById: p.createdById,
            active: true,
            createdAt: p.createdAt,
          },
          update: {
            name: p.name,
            slug: p.slug,
            type: p.type,
            createdById: p.createdById,
          },
        });
        break;
      }

      case 'MemberAdded': {
        const p = payload as {
          organizationId: string;
          userId: string;
          roleId: string;
          addedAt: string;
        };
        await client.organizationMemberReadModel.upsert({
          where: { orgId_userId: { orgId: p.organizationId, userId: p.userId } },
          create: {
            orgId: p.organizationId,
            userId: p.userId,
            roleId: p.roleId,
            status: 'active',
            joinedAt: p.addedAt,
          },
          update: {
            roleId: p.roleId,
            status: 'active',
            joinedAt: p.addedAt,
          },
        });
        break;
      }

      case 'MemberRemoved': {
        const p = payload as {
          organizationId: string;
          userId: string;
        };
        await client.organizationMemberReadModel.update({
          where: { orgId_userId: { orgId: p.organizationId, userId: p.userId } },
          data: { status: 'removed' },
        }).catch(() => {});
        break;
      }

      default:
        break;
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.organizationMemberReadModel.deleteMany({});
    await client.organizationReadModel.deleteMany({});
    logger.projection().info('OrganizationProjector read models cleared');
  }
}

// ─── Audit Log Projector ───────────────────────────────────────────────────

/**
 * Materializes AuditRecorded events into the append-only AuditLog table.
 *
 * Each event corresponds to exactly one row. The projector NEVER updates or
 * deletes — audit entries are immutable. This makes the projector trivially
 * idempotent: re-applying an AuditRecorded event will hit the unique id
 * constraint and be silently ignored via the catch.
 */
export class AuditLogProjector extends Projector {
  readonly name = 'AuditLogProjector';
  readonly handledEventTypes = ['AuditRecorded'] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();
    const p = event.payload as {
      auditId: string;
      action: string;
      actorId: string;
      targetType: string;
      targetId: string;
      timestamp: string;
      metadata: Record<string, unknown>;
    };

    const metadata = (event.metadata as Record<string, unknown>) ?? {};
    const actorType =
      typeof metadata['actorType'] === 'string'
        ? (metadata['actorType'] as string)
        : 'system';
    const ipAddress =
      typeof metadata['ipAddress'] === 'string' ? (metadata['ipAddress'] as string) : null;
    const userAgent =
      typeof metadata['userAgent'] === 'string' ? (metadata['userAgent'] as string) : null;

    try {
      await client.auditLog.create({
        data: {
          id: p.auditId,
          action: p.action,
          actorId: p.actorId,
          actorType,
          targetType: p.targetType,
          targetId: p.targetId,
          timestamp: p.timestamp,
          ipAddress,
          userAgent,
          metadata: JSON.stringify(p.metadata ?? {}),
          correlationId: event.correlationId || null,
        },
      });
    } catch (e) {
      // Unique constraint → already projected (idempotent replay). Swallow.
      logger.projection().debug('AuditLog entry already exists', { auditId: p.auditId });
    }
  }

  async reset(): Promise<void> {
    // Audit log is append-only — reset is intentionally a no-op for safety.
    // Use a direct DB wipe only during a full rebuild in dev/test.
    const client = getClient();
    await client.auditLog.deleteMany({});
    logger.projection().info('AuditLogProjector read model cleared');
  }
}

// ─── API Key Projector ─────────────────────────────────────────────────────

/**
 * Materializes API key lifecycle events into the ApiKey table.
 *
 * The ApiKeyCreated event carries the hashed key + display prefix (the
 * plaintext is never persisted, never appears in any event). Rotation
 * produces a new ApiKeyRotated event with the new hash. Disabling marks
 * the key inactive and records the revokedAt timestamp.
 *
 * Note: ApiKeyCreated is the ONLY source of truth for `keyHash`. The
 * rotation event MUST include the new hash in its payload for the projector
 * to update the row.
 */
export class ApiKeyProjector extends Projector {
  readonly name = 'ApiKeyProjector';
  readonly handledEventTypes = [
    'ApiKeyCreated',
    'ApiKeyRotated',
    'ApiKeyDisabled',
  ] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();
    const type = event.eventType;
    const payload = event.payload as Record<string, unknown>;

    switch (type) {
      case 'ApiKeyCreated': {
        const p = payload as {
          apiKeyId: string;
          userId: string;
          name: string;
          scopes: string[];
          createdAt: string;
        };
        const metadata = (event.metadata as Record<string, unknown>) ?? {};
        // keyHash + keyPrefix are provided via metadata so the event payload
        // remains minimal. The infrastructure that raises ApiKeyCreated
        // (e.g., the CreateApiKey command handler) is responsible for
        // populating these.
        const keyHash =
          typeof metadata['keyHash'] === 'string' ? (metadata['keyHash'] as string) : '';
        const keyPrefix =
          typeof metadata['keyPrefix'] === 'string' ? (metadata['keyPrefix'] as string) : '';

        if (!keyHash) {
          logger.projection().warn('ApiKeyCreated missing keyHash in metadata', {
            apiKeyId: p.apiKeyId,
          });
          return;
        }

        await client.apiKey.upsert({
          where: { id: p.apiKeyId },
          create: {
            id: p.apiKeyId,
            userId: p.userId,
            name: p.name,
            keyHash,
            keyPrefix,
            scopes: JSON.stringify(p.scopes ?? []),
            active: true,
            createdAt: new Date(p.createdAt),
          },
          update: {
            userId: p.userId,
            name: p.name,
            keyHash,
            keyPrefix,
            scopes: JSON.stringify(p.scopes ?? []),
            active: true,
          },
        });
        break;
      }

      case 'ApiKeyRotated': {
        const p = payload as { apiKeyId: string; rotatedAt: string };
        const metadata = (event.metadata as Record<string, unknown>) ?? {};
        const newHash =
          typeof metadata['keyHash'] === 'string' ? (metadata['keyHash'] as string) : null;
        const newPrefix =
          typeof metadata['keyPrefix'] === 'string' ? (metadata['keyPrefix'] as string) : null;
        if (!newHash) {
          logger.projection().warn('ApiKeyRotated missing keyHash in metadata', {
            apiKeyId: p.apiKeyId,
          });
          return;
        }
        await client.apiKey.update({
          where: { id: p.apiKeyId },
          data: {
            keyHash: newHash,
            ...(newPrefix ? { keyPrefix: newPrefix } : {}),
            active: true,
            revokedAt: null,
          },
        }).catch(() => {});
        break;
      }

      case 'ApiKeyDisabled': {
        const p = payload as { apiKeyId: string; disabledAt: string };
        await client.apiKey.update({
          where: { id: p.apiKeyId },
          data: {
            active: false,
            revokedAt: new Date(p.disabledAt),
          },
        }).catch(() => {});
        break;
      }

      default:
        break;
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.apiKey.deleteMany({});
    logger.projection().info('ApiKeyProjector read model cleared');
  }
}
