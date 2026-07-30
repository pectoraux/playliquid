/**
 * Dependency Injection Container.
 *
 * A lightweight IoC container that resolves services through tokens. Every
 * dependency in the system is resolved via this container — no singleton
 * imports, no `new` in application/domain code.
 *
 * Supports:
 *   - Singleton lifetime (one instance per container)
 *   - Transient lifetime (new instance per resolution)
 *   - Instance binding (pre-constructed values)
 *   - Factory functions with container access
 */

import type { InjectionToken } from '@/shared/types';
import { ConfigurationError } from '@/domain/shared/errors';

type Factory<T = unknown> = (container: DIContainer) => T;

interface Binding<T = unknown> {
  readonly lifetime: 'singleton' | 'transient';
  readonly factory: Factory<T>;
  instance?: T;
}

export class DIContainer {
  private readonly bindings = new Map<InjectionToken, Binding>();
  private readonly instances = new Map<InjectionToken, unknown>();
  private readonly resolving = new Set<InjectionToken>();

  /** Register a singleton — one instance shared across all resolutions. */
  singleton<T>(token: InjectionToken<T>, factory: Factory<T>): void {
    this.bindings.set(token, { lifetime: 'singleton', factory });
  }

  /** Register a transient — new instance on every resolution. */
  transient<T>(token: InjectionToken<T>, factory: Factory<T>): void {
    this.bindings.set(token, { lifetime: 'transient', factory });
  }

  /** Bind a pre-constructed instance (singleton). */
  bind<T>(token: InjectionToken<T>, instance: T): void {
    this.instances.set(token, instance);
  }

  /** Resolve a dependency by token. */
  resolve<T>(token: InjectionToken<T>): T {
    // Check pre-bound instances first.
    const bound = this.instances.get(token);
    if (bound !== undefined) return bound as T;

    const binding = this.bindings.get(token);
    if (!binding) {
      const name = typeof token === 'function'
        ? (token as { name?: string }).name
        : String(token);
      throw new ConfigurationError(`No binding registered for token: ${name}`);
    }

    // Singleton: return cached instance.
    if (binding.lifetime === 'singleton' && binding.instance !== undefined) {
      return binding.instance as T;
    }

    // Detect circular dependencies.
    if (this.resolving.has(token)) {
      const name = typeof token === 'function'
        ? (token as { name?: string }).name
        : String(token);
      throw new ConfigurationError(`Circular dependency detected for token: ${name}`);
    }

    this.resolving.add(token);
    try {
      const instance = binding.factory(this);
      if (binding.lifetime === 'singleton') {
        binding.instance = instance;
      }
      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  /** Check if a binding exists. */
  has(token: InjectionToken): boolean {
    return this.bindings.has(token) || this.instances.has(token);
  }

  /** Resolve all bindings matching a predicate (for introspection). */
  listBindings(): Array<{ token: string; lifetime: string }> {
    const result: Array<{ token: string; lifetime: string }> = [];
    for (const [token, binding] of this.bindings) {
      const name = typeof token === 'function'
        ? (token as { name?: string }).name ?? 'anonymous'
        : String(token);
      result.push({ token: name, lifetime: binding.lifetime });
    }
    return result;
  }
}
