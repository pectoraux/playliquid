/**
 * Identity Application Ports.
 *
 * These are the application-layer interfaces that identity command and query
 * handlers depend on. They live in the application layer (NOT infrastructure)
 * so that the dependency direction stays clean: infrastructure adapters
 * implement these ports; the application never imports infrastructure.
 *
 * The existing infrastructure implementations in
 * `src/infrastructure/sessions/session-store.ts` and friends satisfy these
 * contracts via TypeScript structural typing — the composition root wires the
 * concrete adapters to these port interfaces.
 */

// ─── Session Management ────────────────────────────────────────────────────

/** A signed-in session. */
export interface AppSession {
  readonly id: string;
  readonly userId: string;
  readonly token: string;
  readonly refreshToken?: string;
  readonly device?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly refreshExpiresAt?: number;
  readonly revokedAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Persistent store of authenticated sessions. */
export interface AppSessionStore {
  create(session: Omit<AppSession, 'id' | 'createdAt'>): Promise<AppSession>;
  get(id: string): Promise<AppSession | null>;
  getByToken(token: string): Promise<AppSession | null>;
  getByUserId(userId: string): Promise<AppSession[]>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  refresh(id: string, newToken: string, newExpiresAt: number): Promise<AppSession>;
}

/** JWT signing + verification (HS256 minimum). */
export interface AppJwtService {
  sign(payload: Readonly<Record<string, unknown>>, expiresIn: number): Promise<string>;
  verify(token: string): Promise<Readonly<Record<string, unknown>> | null>;
  decode(token: string): Readonly<Record<string, unknown>> | null;
}

// ─── API Key Hashing ────────────────────────────────────────────────────────

/** Hashes API keys for storage; only the hash is persisted. */
export interface ApiKeyHasher {
  /** Hash a plaintext API key for storage. */
  hash(plaintext: string): Promise<string>;
  /** Verify a plaintext API key against a stored hash. */
  verify(plaintext: string, hash: string): Promise<boolean>;
  /**
   * Generate a brand-new API key pair. Returns the plaintext (shown ONCE to the
   * user), its hash (for storage), and a short display prefix.
   */
  generate(): { plaintext: string; hash: string; prefix: string };
}

// ─── Outbound Email ─────────────────────────────────────────────────────────

/** Transactional email sender for identity flows. */
export interface EmailService {
  /** Send an email verification link to a newly registered user. */
  sendVerificationEmail(to: string, verificationToken: string): Promise<void>;
  /** Send a password-reset link. */
  sendPasswordResetEmail(to: string, resetToken: string): Promise<void>;
  /** Send a welcome email after the user is approved. */
  sendWelcomeEmail(to: string, displayName: string): Promise<void>;
}

// ─── Short-Lived Tokens (verification, password reset) ──────────────────────

export type TokenType = 'email_verification' | 'password_reset';

/** A short-lived token store used for one-shot flows. */
export interface TokenStore {
  /** Issue a token bound to a userId + email. */
  issue(payload: {
    readonly type: TokenType;
    readonly userId: string;
    readonly email: string;
    readonly ttlSeconds?: number;
  }): Promise<string>;
  /** Consume a token (single-use). Returns null if missing/expired/wrong type. */
  consume(
    token: string,
    expectedType: TokenType,
  ): Promise<{ readonly userId: string; readonly email: string } | null>;
  /** Look up a token without consuming it. */
  peek(
    token: string,
    expectedType: TokenType,
  ): Promise<{ readonly userId: string; readonly email: string } | null>;
}

// ─── IP Geolocation (for risk scoring) ──────────────────────────────────────

export interface GeoLocation {
  readonly country: string;
  readonly region: string;
  readonly lat: number;
  readonly lon: number;
}

/** Looks up geographic info for an IP address. */
export interface GeoLocationService {
  lookup(ipAddress: string): Promise<GeoLocation | null>;
}

// ─── Password Reset / Login Throttle (rate-limit primitive) ─────────────────

/** Tracks recent failed login attempts per identifier (email or IP). */
export interface LoginThrottle {
  /** Record a failed attempt; returns the current count. */
  recordFailure(identifier: string): Promise<number>;
  /** Read the current failure count. */
  getFailureCount(identifier: string): Promise<number>;
  /** Reset the count after a successful login. */
  reset(identifier: string): Promise<void>;
}

// ─── Identity Read-Model Stores ─────────────────────────────────────────────
//
// Query handlers MUST NOT load aggregates — that's a write-side concern. They
// read from materialised read models maintained by projectors subscribed to
// the EventBus. Each store returns flat DTOs (views) optimised for display.

export interface UserView {
  readonly userId: string;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly country: string;
  readonly timezone: string;
  readonly locale: string;
  readonly status: string;
  readonly emailVerified: boolean;
  readonly mfaEnabled: boolean;
  readonly mfaMethod: string | null;
  readonly roles: ReadonlyArray<{
    readonly roleId: string;
    readonly roleName: string;
    readonly assignedAt: string;
  }>;
  readonly memberships: ReadonlyArray<{
    readonly organizationId: string;
    readonly roleId: string;
    readonly joinedAt: string;
  }>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserListFilters {
  readonly status?: string;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** Read-model store for users. */
export interface UserReadModelStore {
  getById(userId: string): Promise<UserView | null>;
  getByIds(userIds: readonly string[]): Promise<UserView[]>;
  list(filters: UserListFilters): Promise<PaginatedResult<UserView>>;
}

export interface OrganizationView {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
  readonly createdById: string;
  readonly memberCount: number;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrganizationListFilters {
  readonly type?: string;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface OrganizationMemberView {
  readonly userId: string;
  readonly roleId: string;
  readonly joinedAt: string;
  readonly status: string;
  readonly email: string | null;
  readonly displayName: string | null;
}

export interface OrganizationReadModelStore {
  getById(organizationId: string): Promise<OrganizationView | null>;
  getBySlug(slug: string): Promise<OrganizationView | null>;
  list(filters: OrganizationListFilters): Promise<PaginatedResult<OrganizationView>>;
  listMembers(organizationId: string): Promise<OrganizationMemberView[]>;
}

/** Effective-permissions view for a user (RBAC-resolved). */
export interface UserPermissionView {
  readonly userId: string;
  readonly permissions: readonly string[];
  readonly roles: ReadonlyArray<{ readonly roleId: string; readonly roleName: string }>;
  readonly organizations: ReadonlyArray<{
    readonly organizationId: string;
    readonly roleId: string;
  }>;
}
