/**
 * Password Hasher port — domain interface for password hashing.
 *
 * Infrastructure provides the Argon2id implementation. The domain never
 * knows which algorithm is used — it just hashes and verifies.
 */

export interface PasswordHasher {
  /** Hash a plaintext password. Returns the hash string. */
  hash(plaintext: string): Promise<string>;

  /** Verify a plaintext password against a hash. */
  verify(plaintext: string, hash: string): Promise<boolean>;

  /** Check if a password meets strength requirements. */
  validateStrength(plaintext: string): { valid: boolean; issues: string[] };
}

/** Password strength requirements. */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: false, // not required by default, but encouraged
} as const;

/** Validate password strength. */
export function validatePasswordStrength(plaintext: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (plaintext.length < PASSWORD_REQUIREMENTS.minLength) {
    issues.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }
  if (plaintext.length > PASSWORD_REQUIREMENTS.maxLength) {
    issues.push(`Password must be at most ${PASSWORD_REQUIREMENTS.maxLength} characters`);
  }
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(plaintext)) {
    issues.push('Password must contain at least one uppercase letter');
  }
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(plaintext)) {
    issues.push('Password must contain at least one lowercase letter');
  }
  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(plaintext)) {
    issues.push('Password must contain at least one number');
  }

  return { valid: issues.length === 0, issues };
}

/** MFA port — framework for multi-factor authentication. */
export interface MfaProvider {
  readonly method: string;
  /** Generate a new MFA secret/challenge. */
  setup(userId: string): Promise<MfaSetupResult>;
  /** Verify a challenge response. */
  verify(userId: string, code: string): Promise<boolean>;
  /** Disable MFA for a user. */
  disable(userId: string): Promise<void>;
}

export interface MfaSetupResult {
  readonly secret: string;
  readonly qrCodeUrl: string;
  readonly backupCodes: string[];
}

/** OAuth/OIDC port — interface for external identity providers. */
export interface OAuthProvider {
  readonly name: string;
  /** Get the authorization redirect URL. */
  getAuthUrl(state: string, redirectUri: string): string;
  /** Exchange authorization code for user info. */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthUserInfo>;
}

export interface OAuthUserInfo {
  readonly providerUserId: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly provider: string;
}

/** Breach detection port — checks if a password has been breached. */
export interface BreachChecker {
  isBreached(password: string): Promise<boolean>;
}
