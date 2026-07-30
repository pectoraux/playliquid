/**
 * Identity API Handlers — authentication and admin console endpoints.
 *
 * All endpoints dispatch through the CommandBus/QueryBus. Authentication
 * endpoints set secure cookies for session tokens.
 */

import { NextResponse } from 'next/server';
import { getContainer } from '@/infrastructure/di/composition-root';
import { TOKENS } from '@/infrastructure/di/tokens';
import type { CommandBus } from '@/application/buses/command-bus';
import type { QueryBus } from '@/application/buses/query-bus';
import { runInContext } from '@/application/context';
import { requestId, traceId, createId } from '@/shared/ids';
import { getConfig } from '@/shared/config';
import type { Command } from '@/application/commands/command';
import type { Query } from '@/application/queries/query';
import type { DomainError } from '@/domain/shared/errors';

const isProduction = getConfig().nodeEnv === 'production';

// ─── Auth Endpoints ────────────────────────────────────────────────────────

/** POST /api/auth/register — register a new user (waitlist). */
export async function handleRegister(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RegisterUser');
}

/** POST /api/auth/verify-email — verify email address. */
export async function handleVerifyEmail(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'VerifyEmail');
}

/** POST /api/auth/login — authenticate and create session. */
export async function handleLogin(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const container = await getContainer();
  const commandBus = container.resolve<CommandBus>(TOKENS.CommandBus);

  const command: Command = {
    commandType: 'Login',
    payload: {
      email: body.email,
      password: body.password,
      deviceFingerprint: body.deviceFingerprint || 'unknown',
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    },
    correlationId: req.headers.get('x-correlation-id') ?? undefined,
    idempotencyKey: req.headers.get('idempotency-key') ?? undefined,
  };

  return runInContext(
    { correlationId: command.correlationId, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await commandBus.dispatch<{ token: string; refreshToken: string; userId: string }>(command);

      if (result.ok) {
        const response = NextResponse.json({ ok: true, data: result.value });
        // Set secure cookies
        response.cookies.set('pl_session', result.value.token, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax',
          path: '/',
          maxAge: 3600, // 1 hour
        });
        response.cookies.set('pl_refresh', result.value.refreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 3600, // 7 days
        });
        return response;
      }

      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapErrorToStatus(error) },
      );
    },
  );
}

/** POST /api/auth/logout — end session. */
export async function handleLogout(req: Request): Promise<NextResponse> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  return dispatchCommand(req, 'Logout', { payload: { token } });
}

/** POST /api/auth/refresh — refresh session. */
export async function handleRefresh(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RefreshSession');
}

/** POST /api/auth/change-password — change password. */
export async function handleChangePassword(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'ChangePassword');
}

/** POST /api/auth/request-reset — request password reset. */
export async function handleRequestReset(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RequestPasswordReset');
}

/** POST /api/auth/reset-password — reset password with token. */
export async function handleResetPassword(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'ResetPassword');
}

// ─── Admin Console Endpoints ───────────────────────────────────────────────

/** POST /api/admin/waitlist/approve */
export async function handleApproveUser(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'ApproveUser');
}

/** POST /api/admin/waitlist/reject */
export async function handleRejectUser(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RejectUser');
}

/** GET /api/admin/waitlist — list waitlist entries. */
export async function handleListWaitlist(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListWaitlist', {
    status: url.searchParams.get('status') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

/** GET /api/admin/waitlist/stats */
export async function handleWaitlistStats(req: Request): Promise<NextResponse> {
  return dispatchQuery(req, 'GetWaitlistStats', {});
}

/** POST /api/admin/users/suspend */
export async function handleSuspendUser(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'SuspendUser');
}

/** POST /api/admin/users/reactivate */
export async function handleReactivateUser(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'ReactivateUser');
}

/** POST /api/admin/users/delete */
export async function handleDeleteUser(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'DeleteUser');
}

/** POST /api/admin/users/update-profile */
export async function handleUpdateProfile(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'UpdateProfile');
}

/** POST /api/admin/users/assign-role */
export async function handleAssignRole(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'AssignRole');
}

/** POST /api/admin/users/remove-role */
export async function handleRemoveRole(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RemoveRole');
}

/** GET /api/admin/users — list users. */
export async function handleListUsers(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListUsers', {
    status: url.searchParams.get('status') || undefined,
    search: url.searchParams.get('search') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

/** GET /api/admin/users/:userId — get user details. */
export async function handleGetUser(req: Request, userId: string): Promise<NextResponse> {
  return dispatchQuery(req, 'GetUser', { userId });
}

/** POST /api/admin/organizations/create */
export async function handleCreateOrganization(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'CreateOrganization');
}

/** POST /api/admin/organizations/add-member */
export async function handleAddMember(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'AddMember');
}

/** POST /api/admin/organizations/remove-member */
export async function handleRemoveMember(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RemoveMember');
}

/** GET /api/admin/organizations — list organizations. */
export async function handleListOrganizations(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListOrganizations', {
    limit: parseInt(url.searchParams.get('limit') || '20', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

/** GET /api/admin/organizations/:orgId/members */
export async function handleGetOrgMembers(req: Request, orgId: string): Promise<NextResponse> {
  return dispatchQuery(req, 'GetOrganizationMembers', { organizationId: orgId });
}

/** POST /api/admin/api-keys/create */
export async function handleCreateApiKey(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'CreateApiKey');
}

/** POST /api/admin/api-keys/rotate */
export async function handleRotateApiKey(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'RotateApiKey');
}

/** POST /api/admin/api-keys/disable */
export async function handleDisableApiKey(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'DisableApiKey');
}

/** GET /api/admin/api-keys — list API keys for a user. */
export async function handleListApiKeys(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListApiKeys', { userId: url.searchParams.get('userId') || '' });
}

/** GET /api/admin/roles — list all roles. */
export async function handleListRoles(req: Request): Promise<NextResponse> {
  return dispatchQuery(req, 'ListRoles', {});
}

/** GET /api/admin/permissions — list all permissions. */
export async function handleListPermissions(req: Request): Promise<NextResponse> {
  return dispatchQuery(req, 'ListPermissions', {});
}

/** POST /api/admin/roles/create */
export async function handleCreateRole(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'CreateRole');
}

/** POST /api/admin/permissions/create */
export async function handleCreatePermission(req: Request): Promise<NextResponse> {
  return dispatchCommand(req, 'CreatePermission');
}

/** GET /api/admin/audit — list audit log entries. */
export async function handleListAuditLog(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  return dispatchQuery(req, 'ListAuditLog', {
    actorId: url.searchParams.get('actorId') || undefined,
    targetType: url.searchParams.get('targetType') || undefined,
    action: url.searchParams.get('action') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '50', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function dispatchCommand(req: Request, commandType: string, overrides?: Record<string, unknown>): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const container = await getContainer();
  const commandBus = container.resolve<CommandBus>(TOKENS.CommandBus);

  if (!commandBus.hasHandler(commandType)) {
    return NextResponse.json(
      { ok: false, error: `No handler for command: ${commandType}` },
      { status: 404 },
    );
  }

  const command: Command = {
    commandType,
    payload: body.payload ?? body,
    correlationId: req.headers.get('x-correlation-id') ?? createId('corr'),
    idempotencyKey: req.headers.get('idempotency-key') ?? body.idempotencyKey,
    userId: req.headers.get('x-user-id') ?? body.userId,
    metadata: body.metadata,
    ...overrides,
  };

  return runInContext(
    { correlationId: command.correlationId!, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await commandBus.dispatch(command);
      if (result.ok) {
        return NextResponse.json({ ok: true, data: result.value });
      }
      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapErrorToStatus(error) },
      );
    },
  );
}

async function dispatchQuery(req: Request, queryType: string, payload: Record<string, unknown>): Promise<NextResponse> {
  const container = await getContainer();
  const queryBus = container.resolve<QueryBus>(TOKENS.QueryBus);

  if (!queryBus.hasHandler(queryType)) {
    return NextResponse.json(
      { ok: false, error: `No handler for query: ${queryType}` },
      { status: 404 },
    );
  }

  const query: Query = {
    queryType,
    payload,
    correlationId: req.headers.get('x-correlation-id') ?? createId('corr'),
    userId: req.headers.get('x-user-id') ?? undefined,
  };

  return runInContext(
    { correlationId: query.correlationId!, requestId: requestId(), traceId: traceId() },
    async () => {
      const result = await queryBus.execute(query);
      if (result.ok) {
        return NextResponse.json({ ok: true, data: result.value });
      }
      const error = result.error as DomainError;
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, category: error.category },
        { status: mapErrorToStatus(error) },
      );
    },
  );
}

function mapErrorToStatus(error: DomainError): number {
  switch (error.category) {
    case 'validation': return 400;
    case 'authorization': return 403;
    case 'not_found': return 404;
    case 'concurrency': return 409;
    case 'business': return 422;
    case 'configuration': return 500;
    case 'infrastructure': return 503;
    default: return 500;
  }
}
