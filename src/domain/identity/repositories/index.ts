/**
 * Identity repository interfaces.
 *
 * These contracts live in the domain layer. Infrastructure provides
 * implementations. No Prisma, no database concerns here.
 */

import type { UserAggregate } from '@/domain/identity/aggregates/user-aggregate';
import type { OrganizationAggregate } from '@/domain/identity/aggregates/organization-aggregate';

export interface UserRepository {
  getById(id: string): Promise<UserAggregate | null>;
  getByEmail(email: string): Promise<UserAggregate | null>;
  getByUsername(username: string): Promise<UserAggregate | null>;
  save(aggregate: UserAggregate, expectedVersion: number): Promise<void>;
  exists(id: string): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;
  usernameExists(username: string): Promise<boolean>;
}

export interface OrganizationRepository {
  getById(id: string): Promise<OrganizationAggregate | null>;
  getBySlug(slug: string): Promise<OrganizationAggregate | null>;
  save(aggregate: OrganizationAggregate, expectedVersion: number): Promise<void>;
  exists(id: string): Promise<boolean>;
}

/** Role and Permission repository (data-driven, not enum). */
export interface RoleRepository {
  getById(id: string): Promise<RoleData | null>;
  getByName(name: string): Promise<RoleData | null>;
  list(): Promise<RoleData[]>;
  save(role: RoleData): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface PermissionRepository {
  getById(id: string): Promise<PermissionData | null>;
  getByResource(resource: string): Promise<PermissionData[]>;
  list(): Promise<PermissionData[]>;
  save(permission: PermissionData): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Role data (data-driven, not enum). */
export interface RoleData {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: string[]; // permission IDs
  readonly isSystem: boolean; // system roles cannot be deleted
  readonly createdAt: string;
}

/** Permission data (data-driven, not enum). */
export interface PermissionData {
  readonly id: string;
  readonly resource: string;
  readonly action: string;
  readonly description: string;
  readonly isSystem: boolean;
  readonly createdAt: string;
}

/** API Key repository. */
export interface ApiKeyRepository {
  getById(id: string): Promise<ApiKeyData | null>;
  getByHash(hash: string): Promise<ApiKeyData | null>;
  getByUserId(userId: string): Promise<ApiKeyData[]>;
  save(key: ApiKeyData): Promise<void>;
  update(id: string, updates: Partial<ApiKeyData>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ApiKeyData {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly keyHash: string;
  readonly keyPrefix: string; // first 8 chars for display
  readonly scopes: string[];
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly lastUsedIp: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly active: boolean;
}

/** Audit log repository (append-only). */
export interface AuditLogRepository {
  append(entry: AuditLogEntry): Promise<void>;
  getById(id: string): Promise<AuditLogEntry | null>;
  list(filters: AuditLogFilters): Promise<AuditLogEntry[]>;
  listByActor(actorId: string, limit: number): Promise<AuditLogEntry[]>;
  listByTarget(targetType: string, targetId: string, limit: number): Promise<AuditLogEntry[]>;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly action: string;
  readonly actorId: string;
  readonly actorType: 'user' | 'system' | 'api_key';
  readonly targetType: string;
  readonly targetId: string;
  readonly timestamp: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly metadata: Record<string, unknown>;
  readonly correlationId: string | null;
}

export interface AuditLogFilters {
  readonly actorId?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly action?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** Device registry repository. */
export interface DeviceRepository {
  getById(id: string): Promise<DeviceData | null>;
  getByFingerprint(userId: string, fingerprint: string): Promise<DeviceData | null>;
  getByUserId(userId: string): Promise<DeviceData[]>;
  save(device: DeviceData): Promise<void>;
  update(id: string, updates: Partial<DeviceData>): Promise<void>;
  delete(id: string): Promise<void>;
  revoke(id: string): Promise<void>;
}

export interface DeviceData {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly browser: string;
  readonly os: string;
  readonly ipAddress: string;
  readonly location: string | null;
  readonly fingerprint: string;
  readonly riskScore: number;
  readonly trusted: boolean;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt: string | null;
}

/** Waitlist repository. */
export interface WaitlistRepository {
  add(entry: WaitlistEntry): Promise<void>;
  getById(id: string): Promise<WaitlistEntry | null>;
  getByEmail(email: string): Promise<WaitlistEntry | null>;
  list(filters: { status?: string; limit?: number; offset?: number }): Promise<WaitlistEntry[]>;
  update(id: string, updates: Partial<WaitlistEntry>): Promise<void>;
  count(): Promise<number>;
  countByStatus(): Promise<Record<string, number>>;
}

export interface WaitlistEntry {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly status: 'pending' | 'email_verified' | 'approved' | 'rejected' | 'converted';
  readonly verificationToken: string | null;
  readonly verifiedAt: string | null;
  readonly approvalNotes: string | null;
  readonly rejectionReason: string | null;
  readonly invitedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
