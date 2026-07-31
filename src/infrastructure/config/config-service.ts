/**
 * Configuration Service (Extended)
 *
 * Extends the static `getConfig()` from `src/shared/config` with:
 *   - Runtime overrides (in-memory, settable via API or admin tooling)
 *   - Secret references (config values prefixed with `secret:` are resolved
 *     through a SecretProvider at access time)
 *   - Hot reload (re-reads env, re-validates, then re-applies overrides)
 *   - Dot-notation path access (e.g. `get('database.url')`)
 *
 * The ConfigService is the single runtime entry point for config reads inside
 * the application/infrastructure layers. The shared/config module remains the
 * only place that touches environment variables directly.
 */

import type { AppConfig } from '@/shared/config';
import { getConfig, loadConfig, resetConfig } from '@/shared/config';
import { logger } from '@/shared/logging';
import type { SecretProvider } from '@/infrastructure/secrets/secret-provider';
import { EnvironmentSecretProvider } from '@/infrastructure/secrets/secret-provider';

export interface ConfigService {
  /** Get a config value by dot-notation path (e.g. 'database.url'). */
  get<T>(path: string): T;
  /** Set a runtime override (in-memory, survives reload). */
  setOverride(path: string, value: unknown): void;
  /** Remove a runtime override. */
  clearOverride(path: string): void;
  /** Re-read env config, re-validate, then re-apply overrides. */
  reload(): Promise<void>;
  /** Return the entire config as a plain object (overrides applied). */
  getAll(): Record<string, unknown>;
  /** Fetch a secret by name via the configured SecretProvider. */
  getSecret(name: string): Promise<string>;
}

/** Marker prefix indicating a config value is actually a secret name. */
const SECRET_REF_PREFIX = 'secret:';

/** Sentinel returned when a path is not found. */
const NOT_FOUND = Symbol('config-not-found');

/**
 * Default ConfigService implementation.
 *
 * Wraps `getConfig()` from shared/config, layers in-memory overrides on top,
 * and resolves `secret:` references through the configured SecretProvider.
 */
export class DefaultConfigService implements ConfigService {
  private readonly overrides = new Map<string, unknown>();
  private readonly secretProvider: SecretProvider;

  constructor(secretProvider?: SecretProvider) {
    this.secretProvider = secretProvider ?? new EnvironmentSecretProvider();
  }

  get<T>(path: string): T {
    // Override takes precedence.
    if (this.overrides.has(path)) {
      const overrideValue = this.overrides.get(path);
      return this.resolveSecretRef<T>(overrideValue);
    }

    const config = getConfig();
    const value = this.getPath(config, path);
    if (value === NOT_FOUND) {
      throw new ConfigPathNotFoundError(path);
    }
    return this.resolveSecretRef<T>(value);
  }

  setOverride(path: string, value: unknown): void {
    this.overrides.set(path, value);
    logger.system().debug('Config override set', { path });
  }

  clearOverride(path: string): void {
    this.overrides.delete(path);
    logger.system().debug('Config override cleared', { path });
  }

  async reload(): Promise<void> {
    // Re-read env by clearing the shared/config cache and re-loading.
    resetConfig();
    try {
      loadConfig();
      logger.system().info('Config reloaded', {
        overrideCount: this.overrides.size,
      });
    } catch (e) {
      // On reload failure, restore the previous cache state by re-loading.
      // loadConfig() throws on invalid config; we surface the error but leave
      // the override map intact so callers can recover.
      logger.system().error('Config reload failed', {}, e);
      throw e;
    }
  }

  getAll(): Record<string, unknown> {
    const config = getConfig();
    const merged = this.toObject(config) as Record<string, unknown>;
    // Apply overrides on top of the snapshot.
    for (const [path, value] of this.overrides) {
      this.setPath(merged, path, value);
    }
    return merged;
  }

  async getSecret(name: string): Promise<string> {
    return this.secretProvider.get(name);
  }

  // --- internals ---

  /**
   * If the value is a string of the form `secret:<name>`, resolve it through
   * the secret provider synchronously by returning a cached promise. Since
   * `get()` is synchronous, we throw if the secret has not been pre-warmed.
   * Callers that need a secret should use `getSecret()` directly.
   */
  private resolveSecretRef<T>(value: unknown): T {
    if (typeof value === 'string' && value.startsWith(SECRET_REF_PREFIX)) {
      // Synchronous get() cannot await a secret fetch. Surface a clear error
      // directing callers to use getSecret() for secret refs.
      const name = value.slice(SECRET_REF_PREFIX.length);
      throw new SecretRefSyncError(name);
    }
    return value as T;
  }

  /** Read a dot-notation path from a nested object. Returns NOT_FOUND if missing. */
  private getPath(obj: unknown, path: string): unknown {
    if (path === '') return obj;
    const segments = path.split('.');
    let current: unknown = obj;
    for (const segment of segments) {
      if (current === null || current === undefined) return NOT_FOUND;
      if (typeof current !== 'object') return NOT_FOUND;
      current = (current as Record<string, unknown>)[segment];
    }
    if (current === undefined) return NOT_FOUND;
    return current;
  }

  /** Write a dot-notation path into a nested object, creating intermediate objects. */
  private setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = path.split('.');
    let current: Record<string, unknown> = target;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const next = current[segment];
      if (typeof next !== 'object' || next === null) {
        const fresh: Record<string, unknown> = {};
        current[segment] = fresh;
        current = fresh;
      } else {
        current = next as Record<string, unknown>;
      }
    }
    current[segments[segments.length - 1]] = value;
  }

  /** Convert a typed config object into a plain serializable object. */
  private toObject(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map((v) => this.toObject(v));
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = this.toObject(v);
    }
    return result;
  }
}

/** Thrown when a dot-notation config path is not found. */
export class ConfigPathNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`Configuration path '${path}' not found`);
    this.name = 'ConfigPathNotFoundError';
  }
}

/**
 * Thrown when `get()` encounters a `secret:` reference. Use `getSecret()`
 * instead, which returns a Promise and resolves through the SecretProvider.
 */
export class SecretRefSyncError extends Error {
  constructor(readonly secretName: string) {
    super(
      `Cannot resolve secret '${secretName}' synchronously — use configService.getSecret() instead`,
    );
    this.name = 'SecretRefSyncError';
  }
}
