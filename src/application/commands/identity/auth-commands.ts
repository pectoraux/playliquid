/**
 * Authentication commands.
 *
 * RegisterUser → VerifyEmail → Login → RefreshSession → Logout
 * ChangePassword / RequestPasswordReset / ResetPassword
 *
 * Each handler loads the UserAggregate from the UserRepository, mutates it via
 * the aggregate's domain methods, persists via the repository (which appends
 * events to the EventStore + Outbox in the same transaction), and returns a
 * typed Result.
 *
 * Session lifecycle (Login, Logout, RefreshSession) is delegated to the
 * AppSessionStore + AppJwtService ports — these are infrastructure adapters
 * selected by the composition root.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { UserRepository, WaitlistRepository } from '@/domain/identity/repositories';
import type { DeviceRepository, DeviceData } from '@/domain/identity/repositories';
import type { AuditLogRepository, AuditLogEntry } from '@/domain/identity/repositories';
import type {
  PasswordHasher,
  MfaProvider,
  BreachChecker,
} from '@/domain/identity/services/identity-ports';
import type { RiskEngine } from '@/domain/identity/services/risk-engine';
import type {
  AppSession,
  AppSessionStore,
  AppJwtService,
  EmailService,
  TokenStore,
  TokenType,
  GeoLocation,
  GeoLocationService,
  LoginThrottle,
} from '@/application/ports/identity-ports';
import { Email } from '@/domain/value-objects';
import { Username } from '@/domain/value-objects';
import { Country } from '@/domain/value-objects';
import { DisplayName } from '@/domain/identity/value-objects/display-name';
import { Timezone } from '@/domain/identity/value-objects/timezone';
import { Locale } from '@/domain/identity/value-objects/locale';
import { PasswordHash } from '@/domain/identity/value-objects/password-hash';
import { UserAggregate } from '@/domain/identity/aggregates/user-aggregate';
import {
  ValidationError,
  BusinessRuleError,
  NotFoundError,
  AuthorizationError,
} from '@/domain/shared/errors';

// ─── Register User ─────────────────────────────────────────────────────────

export interface RegisterUserPayload {
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
  readonly country: string;
  readonly timezone: string;
  readonly locale: string;
}

export interface RegisterUserResult {
  readonly userId: string;
  readonly verificationToken: string;
}

export class RegisterUserCommand implements CommandWithPayload<RegisterUserPayload> {
  readonly commandType = 'RegisterUser';
  constructor(
    public readonly payload: RegisterUserPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RegisterUserHandler
  implements CommandHandler<RegisterUserCommand, RegisterUserResult>
{
  readonly commandType = 'RegisterUser';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly waitlistRepo: WaitlistRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly breachChecker: BreachChecker | null,
    private readonly emailService: EmailService,
    private readonly tokenStore: TokenStore,
  ) {}

  async execute(command: RegisterUserCommand): Promise<Result<RegisterUserResult>> {
    const { email, username, displayName, password, country, timezone, locale } =
      command.payload;

    // Validate value objects (throws ValidationError).
    let emailVo: Email;
    let usernameVo: Username;
    let displayNameVo: DisplayName;
    let countryVo: Country;
    let timezoneVo: Timezone;
    let localeVo: Locale;
    try {
      emailVo = new Email(email);
      usernameVo = new Username(username);
      displayNameVo = new DisplayName(displayName);
      countryVo = new Country(country);
      timezoneVo = new Timezone(timezone);
      localeVo = new Locale(locale);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Uniqueness checks.
    if (await this.userRepo.emailExists(emailVo.value)) {
      return Result.fail(
        new BusinessRuleError('Email is already registered', 'EMAIL_TAKEN'),
      );
    }
    if (await this.userRepo.usernameExists(usernameVo.value)) {
      return Result.fail(
        new BusinessRuleError('Username is already taken', 'USERNAME_TAKEN'),
      );
    }

    // Password strength + breach check.
    const strength = this.passwordHasher.validateStrength(password);
    if (!strength.valid) {
      return Result.fail(
        new ValidationError(
          `Password does not meet strength requirements: ${strength.issues.join('; ')}`,
          'password',
        ),
      );
    }
    if (this.breachChecker && (await this.breachChecker.isBreached(password))) {
      return Result.fail(
        new ValidationError(
          'Password has been found in a known data breach; please choose another',
          'password',
        ),
      );
    }

    const passwordHashStr = await this.passwordHasher.hash(password);
    let passwordHashVo: PasswordHash;
    try {
      passwordHashVo = new PasswordHash(passwordHashStr);
    } catch {
      // The hasher produced a hash that doesn't conform to our VO format.
      return Result.fail(
        new BusinessRuleError('Password hasher produced an invalid hash', 'HASH_INVALID'),
      );
    }

    // Build the UserAggregate via the factory (raises UserCreated).
    const userId = createId('user');
    const user = UserAggregate.create({
      id: userId,
      email: emailVo,
      username: usernameVo,
      displayName: displayNameVo,
      country: countryVo,
      timezone: timezoneVo,
      locale: localeVo,
    });
    user.setPasswordHash(passwordHashVo);

    const expectedVersion = user.version; // 0 for a new aggregate
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Add a waitlist entry so admins can review.
    const verificationToken = createId('vfy');
    const now = new Date().toISOString();
    await this.waitlistRepo.add({
      id: createId('wl'),
      email: emailVo.value,
      username: usernameVo.value,
      status: 'pending',
      verificationToken,
      verifiedAt: null,
      approvalNotes: null,
      rejectionReason: null,
      invitedById: null,
      createdAt: now,
      updatedAt: now,
    });

    // Issue an email-verification token and email the link.
    await this.tokenStore.issue({
      type: 'email_verification' as TokenType,
      userId,
      email: emailVo.value,
      ttlSeconds: 24 * 60 * 60,
    });
    try {
      await this.emailService.sendVerificationEmail(emailVo.value, verificationToken);
    } catch {
      // Email failures are non-fatal — the user can request a resend.
    }

    return Result.ok({ userId, verificationToken });
  }
}

// ─── Verify Email ──────────────────────────────────────────────────────────

export interface VerifyEmailPayload {
  readonly userId: string;
  readonly verificationToken: string;
}

export class VerifyEmailCommand implements CommandWithPayload<VerifyEmailPayload> {
  readonly commandType = 'VerifyEmail';
  constructor(
    public readonly payload: VerifyEmailPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class VerifyEmailHandler
  implements CommandHandler<VerifyEmailCommand, { userId: string }>
{
  readonly commandType = 'VerifyEmail';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly waitlistRepo: WaitlistRepository,
    private readonly tokenStore: TokenStore,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<Result<{ userId: string }>> {
    const { userId, verificationToken } = command.payload;

    const tokenData = await this.tokenStore.consume(
      verificationToken,
      'email_verification' as TokenType,
    );
    if (!tokenData || tokenData.userId !== userId) {
      return Result.fail(
        new AuthorizationError('Invalid or expired verification token', 'verify_email'),
      );
    }

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }

    if (user.emailVerified) {
      return Result.fail(
        new BusinessRuleError('Email is already verified', 'EMAIL_ALREADY_VERIFIED'),
      );
    }

    const expectedVersion = user.version;
    try {
      user.verifyEmail();
    } catch (e) {
      return Result.fail(e as Error);
    }

    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Update the waitlist entry status.
    const entry = await this.waitlistRepo.getByEmail(user.email);
    if (entry) {
      await this.waitlistRepo.update(entry.id, {
        status: 'email_verified',
        verifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return Result.ok({ userId });
  }
}

// ─── Login ─────────────────────────────────────────────────────────────────

export interface LoginPayload {
  readonly email: string;
  readonly password: string;
  readonly deviceFingerprint: string;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface LoginResult {
  readonly userId: string;
  readonly sessionId: string;
  readonly token: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly requiresMfa: boolean;
  readonly mfaChallenge?: string;
}

export class LoginCommand implements CommandWithPayload<LoginPayload> {
  readonly commandType = 'Login';
  constructor(
    public readonly payload: LoginPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d
const MAX_LOGIN_FAILURES = 10;

export class LoginHandler implements CommandHandler<LoginCommand, LoginResult> {
  readonly commandType = 'Login';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionStore: AppSessionStore,
    private readonly jwtService: AppJwtService,
    private readonly deviceRepo: DeviceRepository,
    private readonly riskEngine: RiskEngine | null,
    private readonly geoService: GeoLocationService | null,
    private readonly throttle: LoginThrottle | null,
    private readonly mfaProvider: MfaProvider | null,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: LoginCommand): Promise<Result<LoginResult>> {
    const { email, password, deviceFingerprint, ipAddress, userAgent } = command.payload;

    const user = await this.userRepo.getByEmail(email.toLowerCase());

    // Always run the password verify to avoid timing oracles — but only treat
    // the result as success if the user actually exists.
    const storedHash = user?.passwordHash ?? '$argon2id$invalid$invalid';
    const passwordOk = await this.passwordHasher.verify(password, storedHash);

    if (!user || !passwordOk) {
      if (this.throttle && user) {
        await this.throttle.recordFailure(user.email);
      }
      return Result.fail(
        new AuthorizationError('Invalid email or password', 'login'),
      );
    }

    if (user.isDeleted) {
      return Result.fail(new AuthorizationError('Account is deleted', 'login'));
    }
    if (user.isSuspended) {
      return Result.fail(
        new AuthorizationError('Account is suspended; contact support', 'login'),
      );
    }
    if (!user.isActive) {
      return Result.fail(
        new AuthorizationError('Account is pending approval', 'login'),
      );
    }

    // Throttle: lockout after too many failures.
    if (this.throttle) {
      const failures = await this.throttle.getFailureCount(user.email);
      if (failures >= MAX_LOGIN_FAILURES) {
        return Result.fail(
          new AuthorizationError('Too many failed attempts; try again later', 'login'),
        );
      }
    }

    // Risk assessment.
    let requiresMfa = user.mfaEnabled;
    let geo: GeoLocation | null = null;
    if (this.geoService) {
      geo = await this.geoService.lookup(ipAddress);
    }
    if (this.riskEngine) {
      const devices = await this.deviceRepo.getByUserId(user.id);
      const assessment = this.riskEngine.assess({
        userId: user.id,
        deviceFingerprint,
        ipAddress,
        geoLocation: geo,
        loginTime: Date.now(),
        userTimezone: user.timezone,
        knownDevices: devices.map((d) => ({
          fingerprint: d.fingerprint,
          trusted: d.trusted,
          lastSeenAt: d.lastSeenAt,
        })),
        recentFailedAttempts: this.throttle
          ? await this.throttle.getFailureCount(user.email)
          : 0,
      });
      if (assessment.requiresMfa) requiresMfa = true;
    }

    // MFA step-up: if required, return a challenge instead of a session.
    if (requiresMfa && this.mfaProvider) {
      const challenge = createId('mfa');
      return Result.ok({
        userId: user.id,
        sessionId: '',
        token: '',
        refreshToken: '',
        expiresAt: 0,
        requiresMfa: true,
        mfaChallenge: challenge,
      });
    }

    // Mint the session token + refresh token.
    const now = Date.now();
    const token = await this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles.map((r) => r.roleId),
        iat: Math.floor(now / 1000),
      },
      SESSION_TTL_SECONDS,
    );
    const refreshToken = createId('rfr');

    const session = await this.sessionStore.create({
      userId: user.id,
      token,
      refreshToken,
      device: userAgent,
      ipAddress,
      userAgent,
      expiresAt: now + SESSION_TTL_SECONDS * 1000,
      refreshExpiresAt: now + REFRESH_TTL_SECONDS * 1000,
      metadata: { deviceFingerprint },
    });

    // Upsert the device record.
    await this.upsertDevice(user.id, deviceFingerprint, ipAddress, userAgent);

    // Reset the failure counter after a successful login.
    if (this.throttle) {
      await this.throttle.reset(user.email);
    }

    // Audit.
    if (this.auditRepo) {
      await this.auditRepo.append(this.buildAuditEntry(user.id, 'user.login', ipAddress, userAgent));
    }

    return Result.ok({
      userId: user.id,
      sessionId: session.id,
      token,
      refreshToken,
      expiresAt: session.expiresAt,
      requiresMfa: false,
    });
  }

  private async upsertDevice(
    userId: string,
    fingerprint: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const existing = await this.deviceRepo.getByFingerprint(userId, fingerprint);
    const now = new Date().toISOString();
    if (existing) {
      await this.deviceRepo.update(existing.id, {
        lastSeenAt: now,
        ipAddress,
      });
      return;
    }
    const device: DeviceData = {
      id: createId('device'),
      userId,
      name: userAgent.slice(0, 120),
      browser: userAgent,
      os: '',
      ipAddress,
      location: null,
      fingerprint,
      riskScore: 0,
      trusted: false,
      firstSeenAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    await this.deviceRepo.save(device);
  }

  private buildAuditEntry(
    actorId: string,
    action: string,
    ipAddress: string,
    userAgent: string,
  ): AuditLogEntry {
    return {
      id: createId('aud'),
      action,
      actorId,
      actorType: 'user',
      targetType: 'User',
      targetId: actorId,
      timestamp: new Date().toISOString(),
      ipAddress,
      userAgent,
      metadata: {},
      correlationId: null,
    };
  }
}

// ─── Logout ────────────────────────────────────────────────────────────────

export interface LogoutPayload {
  readonly sessionId: string;
}

export class LogoutCommand implements CommandWithPayload<LogoutPayload> {
  readonly commandType = 'Logout';
  constructor(
    public readonly payload: LogoutPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class LogoutHandler implements CommandHandler<LogoutCommand, { sessionId: string }> {
  readonly commandType = 'Logout';

  constructor(private readonly sessionStore: AppSessionStore) {}

  async execute(command: LogoutCommand): Promise<Result<{ sessionId: string }>> {
    const { sessionId } = command.payload;
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      // Idempotent: already gone.
      return Result.ok({ sessionId });
    }
    await this.sessionStore.revoke(sessionId);
    return Result.ok({ sessionId });
  }
}

// ─── Refresh Session ───────────────────────────────────────────────────────

export interface RefreshSessionPayload {
  readonly refreshToken: string;
}

export interface RefreshSessionResult {
  readonly sessionId: string;
  readonly token: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export class RefreshSessionCommand implements CommandWithPayload<RefreshSessionPayload> {
  readonly commandType = 'RefreshSession';
  constructor(
    public readonly payload: RefreshSessionPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RefreshSessionHandler
  implements CommandHandler<RefreshSessionCommand, RefreshSessionResult>
{
  readonly commandType = 'RefreshSession';

  constructor(
    private readonly sessionStore: AppSessionStore,
    private readonly jwtService: AppJwtService,
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<Result<RefreshSessionResult>> {
    const { refreshToken } = command.payload;
    // Look up the session by refresh token. Session store implementations
    // SHOULD index by both the access token and the refresh token via
    // `getByToken`; the composition root is responsible for choosing an
    // adapter that satisfies this contract.
    const session = await this.sessionStore.getByToken(refreshToken);
    if (!session) {
      return Result.fail(new AuthorizationError('Invalid refresh token', 'refresh'));
    }
    if (session.refreshToken && session.refreshToken !== refreshToken) {
      return Result.fail(new AuthorizationError('Invalid refresh token', 'refresh'));
    }

    if (session.revokedAt !== undefined) {
      return Result.fail(new AuthorizationError('Session revoked', 'refresh'));
    }
    if (session.refreshExpiresAt !== undefined && session.refreshExpiresAt < Date.now()) {
      return Result.fail(new AuthorizationError('Refresh token expired', 'refresh'));
    }

    const user = await this.userRepo.getById(session.userId);
    if (!user || !user.isActive) {
      return Result.fail(new AuthorizationError('Account is not active', 'refresh'));
    }

    const now = Date.now();
    const newToken = await this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles.map((r) => r.roleId),
        iat: Math.floor(now / 1000),
      },
      SESSION_TTL_SECONDS,
    );
    const newRefresh = createId('rfr');
    const updated = await this.sessionStore.refresh(
      session.id,
      newToken,
      now + SESSION_TTL_SECONDS * 1000,
    );

    return Result.ok({
      sessionId: session.id,
      token: newToken,
      refreshToken: newRefresh,
      expiresAt: updated.expiresAt,
    });
  }
}

// ─── Change Password ───────────────────────────────────────────────────────

export interface ChangePasswordPayload {
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export class ChangePasswordCommand implements CommandWithPayload<ChangePasswordPayload> {
  readonly commandType = 'ChangePassword';
  constructor(
    public readonly payload: ChangePasswordPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ChangePasswordHandler
  implements CommandHandler<ChangePasswordCommand, { userId: string }>
{
  readonly commandType = 'ChangePassword';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly breachChecker: BreachChecker | null,
    private readonly sessionStore: AppSessionStore | null,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<Result<{ userId: string }>> {
    const { userId, currentPassword, newPassword } = command.payload;

    const user = await this.userRepo.getById(userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', userId));
    }
    if (!user.passwordHash) {
      return Result.fail(
        new BusinessRuleError('User has no password set', 'NO_PASSWORD_SET'),
      );
    }

    const currentOk = await this.passwordHasher.verify(currentPassword, user.passwordHash);
    if (!currentOk) {
      return Result.fail(new AuthorizationError('Current password is incorrect', 'change_password'));
    }

    const strength = this.passwordHasher.validateStrength(newPassword);
    if (!strength.valid) {
      return Result.fail(
        new ValidationError(
          `Password does not meet strength requirements: ${strength.issues.join('; ')}`,
          'newPassword',
        ),
      );
    }
    if (newPassword === currentPassword) {
      return Result.fail(
        new ValidationError('New password must differ from current', 'newPassword'),
      );
    }
    if (this.breachChecker && (await this.breachChecker.isBreached(newPassword))) {
      return Result.fail(
        new ValidationError(
          'New password has been found in a known data breach; please choose another',
          'newPassword',
        ),
      );
    }

    const newHashStr = await this.passwordHasher.hash(newPassword);
    let newHashVo: PasswordHash;
    try {
      newHashVo = new PasswordHash(newHashStr);
    } catch {
      return Result.fail(
        new BusinessRuleError('Password hasher produced an invalid hash', 'HASH_INVALID'),
      );
    }

    const expectedVersion = user.version;
    try {
      user.changePassword(newHashVo, userId);
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Revoke all other sessions for this user so they have to log in again.
    if (this.sessionStore) {
      await this.sessionStore.revokeAllForUser(userId);
    }

    return Result.ok({ userId });
  }
}

// ─── Request Password Reset ────────────────────────────────────────────────

export interface RequestPasswordResetPayload {
  readonly email: string;
}

export class RequestPasswordResetCommand
  implements CommandWithPayload<RequestPasswordResetPayload>
{
  readonly commandType = 'RequestPasswordReset';
  constructor(
    public readonly payload: RequestPasswordResetPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RequestPasswordResetHandler
  implements CommandHandler<RequestPasswordResetCommand, { requested: true }>
{
  readonly commandType = 'RequestPasswordReset';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenStore: TokenStore,
    private readonly emailService: EmailService,
  ) {}

  async execute(
    command: RequestPasswordResetCommand,
  ): Promise<Result<{ requested: true }>> {
    const { email } = command.payload;
    // Always return success — never reveal whether the email is registered.
    const user = await this.userRepo.getByEmail(email.toLowerCase());
    if (!user) {
      return Result.ok({ requested: true });
    }

    const token = createId('rst');
    await this.tokenStore.issue({
      type: 'password_reset' as TokenType,
      userId: user.id,
      email: user.email,
      ttlSeconds: 60 * 60, // 1h
    });
    try {
      await this.emailService.sendPasswordResetEmail(user.email, token);
    } catch {
      // Email failures are non-fatal; user can retry.
    }
    return Result.ok({ requested: true });
  }
}

// ─── Reset Password ────────────────────────────────────────────────────────

export interface ResetPasswordPayload {
  readonly token: string;
  readonly newPassword: string;
}

export class ResetPasswordCommand implements CommandWithPayload<ResetPasswordPayload> {
  readonly commandType = 'ResetPassword';
  constructor(
    public readonly payload: ResetPasswordPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class ResetPasswordHandler
  implements CommandHandler<ResetPasswordCommand, { userId: string }>
{
  readonly commandType = 'ResetPassword';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly breachChecker: BreachChecker | null,
    private readonly tokenStore: TokenStore,
    private readonly sessionStore: AppSessionStore | null,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<Result<{ userId: string }>> {
    const { token, newPassword } = command.payload;

    const tokenData = await this.tokenStore.consume(
      token,
      'password_reset' as TokenType,
    );
    if (!tokenData) {
      return Result.fail(
        new AuthorizationError('Invalid or expired reset token', 'reset_password'),
      );
    }

    const user = await this.userRepo.getById(tokenData.userId);
    if (!user) {
      return Result.fail(new NotFoundError('User not found', 'User', tokenData.userId));
    }

    const strength = this.passwordHasher.validateStrength(newPassword);
    if (!strength.valid) {
      return Result.fail(
        new ValidationError(
          `Password does not meet strength requirements: ${strength.issues.join('; ')}`,
          'newPassword',
        ),
      );
    }
    if (this.breachChecker && (await this.breachChecker.isBreached(newPassword))) {
      return Result.fail(
        new ValidationError(
          'Password has been found in a known data breach; please choose another',
          'newPassword',
        ),
      );
    }

    const newHashStr = await this.passwordHasher.hash(newPassword);
    let newHashVo: PasswordHash;
    try {
      newHashVo = new PasswordHash(newHashStr);
    } catch {
      return Result.fail(
        new BusinessRuleError('Password hasher produced an invalid hash', 'HASH_INVALID'),
      );
    }

    const expectedVersion = user.version;
    try {
      user.changePassword(newHashVo, 'system');
    } catch (e) {
      return Result.fail(e as Error);
    }
    try {
      await this.userRepo.save(user, expectedVersion);
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (this.sessionStore) {
      await this.sessionStore.revokeAllForUser(user.id);
    }

    return Result.ok({ userId: user.id });
  }
}
