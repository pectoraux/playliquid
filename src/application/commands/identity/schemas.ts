/**
 * Zod schemas for all identity commands and queries.
 *
 * Each schema mirrors the corresponding command/query payload. The
 * composition root registers them with `registerCommandValidator` /
 * `registerQueryValidator` so the ValidationMiddleware enforces them
 * before the handler runs.
 *
 * Schemas are exported individually and aggregated in `IDENTITY_SCHEMAS` for
 * convenient bulk registration.
 */

import { z } from 'zod';

// ─── Auth ───────────────────────────────────────────────────────────────────

export const RegisterUserSchema = z.object({
  email: z.string().email().max(254),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  country: z.string().length(2).regex(/^[A-Z]{2}$/),
  timezone: z.string().min(1).max(64),
  locale: z.string().min(2).max(5).regex(/^[a-z]{2}(-[A-Z]{2})?$/),
});

export const VerifyEmailSchema = z.object({
  userId: z.string().min(1),
  verificationToken: z.string().min(1),
});

export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  deviceFingerprint: z.string().min(1).max(256),
  ipAddress: z.string().min(1).max(64),
  userAgent: z.string().min(1).max(512),
});

export const LogoutSchema = z.object({
  sessionId: z.string().min(1),
});

export const RefreshSessionSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ChangePasswordSchema = z.object({
  userId: z.string().min(1),
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().email().max(254),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

// ─── Waitlist ───────────────────────────────────────────────────────────────

export const ApproveUserSchema = z.object({
  userId: z.string().min(1),
  approvedBy: z.string().min(1),
  notes: z.string().max(1000).optional().default(''),
});

export const RejectUserSchema = z.object({
  userId: z.string().min(1),
  rejectedBy: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export const SubmitForApprovalSchema = z.object({
  userId: z.string().min(1),
});

// ─── User Management ────────────────────────────────────────────────────────

export const SuspendUserSchema = z.object({
  userId: z.string().min(1),
  suspendedBy: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export const ReactivateUserSchema = z.object({
  userId: z.string().min(1),
  reactivatedBy: z.string().min(1),
});

export const DeleteUserSchema = z.object({
  userId: z.string().min(1),
  deletedBy: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(100),
  timezone: z.string().min(1).max(64),
  locale: z.string().min(2).max(5).regex(/^[a-z]{2}(-[A-Z]{2})?$/),
});

export const ChangeEmailSchema = z.object({
  userId: z.string().min(1),
  newEmail: z.string().email().max(254),
  changedBy: z.string().min(1),
});

export const EnableMfaSchema = z.object({
  userId: z.string().min(1),
  method: z.string().min(1).max(64),
});

export const DisableMfaSchema = z.object({
  userId: z.string().min(1),
});

export const AssignRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  assignedBy: z.string().min(1),
});

export const RemoveRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  removedBy: z.string().min(1),
});

// ─── Organization ───────────────────────────────────────────────────────────

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  type: z.enum([
    'creator_studio',
    'platform_operations',
    'moderation_team',
    'enterprise_customer',
    'tournament_organizer',
  ]),
  createdById: z.string().min(1),
});

export const AddMemberSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  roleId: z.string().min(1),
  addedBy: z.string().min(1),
});

export const RemoveMemberSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  removedBy: z.string().min(1),
});

export const JoinOrganizationSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  roleId: z.string().min(1),
});

// ─── API Keys ───────────────────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1).max(100)).max(50),
  expiresAt: z.string().datetime().optional(),
});

export const RotateApiKeySchema = z.object({
  apiKeyId: z.string().min(1),
  userId: z.string().min(1),
});

export const DisableApiKeySchema = z.object({
  apiKeyId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

// ─── Roles & Permissions ────────────────────────────────────────────────────

export const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  permissions: z.array(z.string().min(1).max(200)).max(200),
});

export const UpdateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1).max(200)).max(200).optional(),
});

export const DeleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

export const CreatePermissionSchema = z.object({
  resource: z.string().min(1).max(100),
  action: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
});

export const DeletePermissionSchema = z.object({
  permissionId: z.string().min(1),
});

// ─── Queries ────────────────────────────────────────────────────────────────

export const GetUserSchema = z.object({
  userId: z.string().min(1),
});

export const ListUsersSchema = z.object({
  status: z
    .enum(['waitlist', 'pending_approval', 'active', 'suspended', 'rejected', 'deleted'])
    .optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetCurrentUserSchema = z.object({
  userId: z.string().min(1),
});

export const GetUserPermissionsSchema = z.object({
  userId: z.string().min(1),
});

export const ListWaitlistSchema = z.object({
  status: z
    .enum(['pending', 'email_verified', 'approved', 'rejected', 'converted'])
    .optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetWaitlistStatsSchema = z.object({}).optional();

export const GetOrganizationSchema = z.object({
  organizationId: z.string().min(1),
});

export const ListOrganizationsSchema = z.object({
  type: z
    .enum([
      'creator_studio',
      'platform_operations',
      'moderation_team',
      'enterprise_customer',
      'tournament_organizer',
    ])
    .optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetOrganizationMembersSchema = z.object({
  organizationId: z.string().min(1),
});

export const ListAuditLogSchema = z.object({
  actorId: z.string().optional(),
  targetType: z.string().optional(),
  action: z.string().optional(),
  fromTimestamp: z.string().datetime().optional(),
  toTimestamp: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetAuditEntrySchema = z.object({
  auditId: z.string().min(1),
});

export const ListApiKeysSchema = z.object({
  userId: z.string().min(1),
});

export const GetApiKeySchema = z.object({
  apiKeyId: z.string().min(1),
});

export const ListRolesSchema = z.object({}).optional();

export const ListPermissionsSchema = z.object({}).optional();

// ─── Bulk Registration Map ──────────────────────────────────────────────────

/**
 * Map of command/query type → Zod schema. The composition root iterates this
 * map and calls `registerCommandValidator` / `registerQueryValidator` for
 * each entry.
 */
export const IDENTITY_COMMAND_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['RegisterUser', RegisterUserSchema],
  ['VerifyEmail', VerifyEmailSchema],
  ['Login', LoginSchema],
  ['Logout', LogoutSchema],
  ['RefreshSession', RefreshSessionSchema],
  ['ChangePassword', ChangePasswordSchema],
  ['RequestPasswordReset', RequestPasswordResetSchema],
  ['ResetPassword', ResetPasswordSchema],
  ['ApproveUser', ApproveUserSchema],
  ['RejectUser', RejectUserSchema],
  ['SubmitForApproval', SubmitForApprovalSchema],
  ['SuspendUser', SuspendUserSchema],
  ['ReactivateUser', ReactivateUserSchema],
  ['DeleteUser', DeleteUserSchema],
  ['UpdateProfile', UpdateProfileSchema],
  ['ChangeEmail', ChangeEmailSchema],
  ['EnableMfa', EnableMfaSchema],
  ['DisableMfa', DisableMfaSchema],
  ['AssignRole', AssignRoleSchema],
  ['RemoveRole', RemoveRoleSchema],
  ['CreateOrganization', CreateOrganizationSchema],
  ['AddMember', AddMemberSchema],
  ['RemoveMember', RemoveMemberSchema],
  ['JoinOrganization', JoinOrganizationSchema],
  ['CreateApiKey', CreateApiKeySchema],
  ['RotateApiKey', RotateApiKeySchema],
  ['DisableApiKey', DisableApiKeySchema],
  ['CreateRole', CreateRoleSchema],
  ['UpdateRole', UpdateRoleSchema],
  ['DeleteRole', DeleteRoleSchema],
  ['CreatePermission', CreatePermissionSchema],
  ['DeletePermission', DeletePermissionSchema],
];

export const IDENTITY_QUERY_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['GetUser', GetUserSchema],
  ['ListUsers', ListUsersSchema],
  ['GetCurrentUser', GetCurrentUserSchema],
  ['GetUserPermissions', GetUserPermissionsSchema],
  ['ListWaitlist', ListWaitlistSchema],
  ['GetWaitlistStats', GetWaitlistStatsSchema],
  ['GetOrganization', GetOrganizationSchema],
  ['ListOrganizations', ListOrganizationsSchema],
  ['GetOrganizationMembers', GetOrganizationMembersSchema],
  ['ListAuditLog', ListAuditLogSchema],
  ['GetAuditEntry', GetAuditEntrySchema],
  ['ListApiKeys', ListApiKeysSchema],
  ['GetApiKey', GetApiKeySchema],
  ['ListRoles', ListRolesSchema],
  ['ListPermissions', ListPermissionsSchema],
];
