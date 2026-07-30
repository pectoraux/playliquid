/**
 * Secret Management
 *
 * Provides a uniform interface for fetching application secrets (API keys,
 * service-account credentials, signing keys, etc.) regardless of where they
 * are physically stored.
 *
 * Implementations:
 *   - EnvironmentSecretProvider: reads from environment variables via the
 *     shared/config `getEnvVar()` helper (no raw env access outside the config
 *     layer).
 *   - ChainedSecretProvider: tries multiple providers in order — first match
 *     wins. Useful for "env in dev, AWS Secrets Manager in prod" setups.
 *
 * Design notes:
 *   - Secrets are cached in memory after the first read to avoid repeated
 *     env/syscall lookups on hot paths.
 *   - `rotate()` is a no-op for env-backed secrets (env vars are immutable at
 *     runtime); the chained provider forwards to whichever provider actually
 *     owns the secret, when known.
 *   - `validate()` checks the secret is non-empty and, optionally, matches a
 *     caller-supplied format validator (e.g. regex or shape check).
 */

import { getEnvVar } from '@/shared/config';
import { logger } from '@/shared/logging';

export interface SecretProvider {
  /** Fetch the raw secret value as a string. */
  get(name: string): Promise<string>;
  /** Fetch and JSON-parse a secret. */
  getJson<T>(name: string): Promise<T>;
  /** Rotate the secret (provider-specific). */
  rotate(name: string): Promise<void>;
  /** Validate that the secret is present and well-formed. */
  validate(name: string): Promise<boolean>;
  /** List known secret names (best-effort for env-backed providers). */
  list(): Promise<string[]>;
}

export interface SecretMetadata {
  name: string;
  version: number;
  lastRotatedAt: number | null;
  isValid: boolean;
}

/** A function that checks whether a secret value is well-formed. */
export type SecretValidator = (value: string) => boolean;

export interface EnvironmentSecretProviderOptions {
  /** Optional validators keyed by secret name. */
  validators?: Record<string, SecretValidator>;
  /** Optional prefix that all secret env vars share (e.g. 'SECRET_'). */
  prefix?: string;
}

/**
 * Secret provider backed by environment variables (via shared/config
 * `getEnvVar`).
 *
 * Suitable for development and for production deployments that inject secrets
 * via the environment (Kubernetes secrets, ECS task role, etc.).
 */
export class EnvironmentSecretProvider implements SecretProvider {
  private readonly cache = new Map<string, string>();
  private readonly versions = new Map<string, number>();
  private readonly rotatedAt = new Map<string, number | null>();
  private readonly validators: Record<string, SecretValidator>;
  private readonly prefix: string;

  constructor(options: EnvironmentSecretProviderOptions = {}) {
    this.validators = options.validators ?? {};
    this.prefix = options.prefix ?? '';
  }

  async get(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached !== undefined) return cached;

    const envName = this.resolveEnvName(name);
    const raw = getEnvVar(envName);
    if (raw === undefined || raw === '') {
      throw new SecretNotFoundError(name, `environment variable '${envName}' is not set`);
    }
    this.cache.set(name, raw);
    if (!this.versions.has(name)) this.versions.set(name, 1);
    if (!this.rotatedAt.has(name)) this.rotatedAt.set(name, null);
    return raw;
  }

  async getJson<T>(name: string): Promise<T> {
    const raw = await this.get(name);
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      throw new SecretFormatError(name, `secret is not valid JSON: ${(e as Error).message}`);
    }
  }

  async rotate(_name: string): Promise<void> {
    // Environment variables are immutable at runtime — rotation must happen
    // via deployment. Log a warning so callers know the no-op is intentional.
    logger.system().warn('EnvironmentSecretProvider.rotate() is a no-op', {
      name: _name,
      reason: 'environment variables are immutable at runtime; rotate via redeploy',
    });
  }

  async validate(name: string): Promise<boolean> {
    try {
      const value = await this.get(name);
      const validator = this.validators[name];
      if (!validator) return true;
      return validator(value);
    } catch {
      return false;
    }
  }

  async list(): Promise<string[]> {
    // Best-effort: env-backed providers do not have a closed enumeration of
    // "secrets", so we return the cached/known set plus any env vars that
    // match the configured prefix.
    const known = new Set<string>(this.cache.keys());
    if (this.prefix) {
      // We cannot enumerate raw env vars from outside shared/config, so we
      // rely on the cache and any explicitly registered validators.
      for (const name of Object.keys(this.validators)) {
        known.add(name);
      }
    } else {
      for (const name of Object.keys(this.validators)) {
        known.add(name);
      }
    }
    return Array.from(known);
  }

  /** Get metadata for a known secret. */
  getMetadata(name: string): SecretMetadata | null {
    if (!this.versions.has(name)) return null;
    return {
      name,
      version: this.versions.get(name) ?? 1,
      lastRotatedAt: this.rotatedAt.get(name) ?? null,
      isValid: this.cache.has(name),
    };
  }

  /** Force-clear the in-memory cache (e.g. after a deployment-driven rotation). */
  clearCache(name?: string): void {
    if (name) {
      this.cache.delete(name);
    } else {
      this.cache.clear();
    }
  }

  private resolveEnvName(name: string): string {
    return this.prefix ? `${this.prefix}${name}` : name;
  }
}

/**
 * Chained secret provider — tries each provider in order; first hit wins.
 *
 * Typical chain: [EnvironmentSecretProvider, AwsSecretsManagerProvider, ...].
 * The chain short-circuits on the first provider that returns a value; only
 * `SecretNotFoundError` is treated as "try the next provider" — other errors
 * propagate immediately.
 */
export class ChainedSecretProvider implements SecretProvider {
  constructor(private readonly providers: SecretProvider[]) {
    if (providers.length === 0) {
      throw new Error('ChainedSecretProvider requires at least one provider');
    }
  }

  async get(name: string): Promise<string> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.get(name);
      } catch (e) {
        if (e instanceof SecretNotFoundError) {
          errors.push(e.message);
          continue;
        }
        throw e;
      }
    }
    throw new SecretNotFoundError(name, `not found in any provider: ${errors.join('; ')}`);
  }

  async getJson<T>(name: string): Promise<T> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.getJson<T>(name);
      } catch (e) {
        if (e instanceof SecretNotFoundError) {
          errors.push(e.message);
          continue;
        }
        throw e;
      }
    }
    throw new SecretNotFoundError(name, `not found in any provider: ${errors.join('; ')}`);
  }

  async rotate(name: string): Promise<void> {
    // Forward to the first provider that knows about the secret.
    for (const provider of this.providers) {
      try {
        const exists = await provider
          .get(name)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          await provider.rotate(name);
          return;
        }
      } catch {
        // ignore — try next
      }
    }
    logger.system().warn('ChainedSecretProvider.rotate(): secret not found in any provider', {
      name,
    });
  }

  async validate(name: string): Promise<boolean> {
    for (const provider of this.providers) {
      const valid = await provider.validate(name).catch(() => false);
      if (valid) return true;
    }
    return false;
  }

  async list(): Promise<string[]> {
    const all = new Set<string>();
    for (const provider of this.providers) {
      const names = await provider.list().catch(() => []);
      for (const name of names) all.add(name);
    }
    return Array.from(all);
  }
}

/** Thrown when a secret cannot be located in any backing provider. */
export class SecretNotFoundError extends Error {
  constructor(
    readonly secretName: string,
    detail?: string,
  ) {
    super(`Secret '${secretName}' not found${detail ? `: ${detail}` : ''}`);
    this.name = 'SecretNotFoundError';
  }
}

/** Thrown when a secret is found but cannot be parsed in the expected format. */
export class SecretFormatError extends Error {
  constructor(
    readonly secretName: string,
    detail?: string,
  ) {
    super(`Secret '${secretName}' has invalid format${detail ? `: ${detail}` : ''}`);
    this.name = 'SecretFormatError';
  }
}
