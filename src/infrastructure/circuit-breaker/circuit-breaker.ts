/**
 * Circuit Breaker
 *
 * Protects services from cascading failures. When a service fails repeatedly,
 * the circuit opens and subsequent calls fail fast instead of waiting for
 * timeouts. After a cooldown period, the circuit enters half-open state
 * and allows a single test call.
 *
 * States:
 *   Closed   → calls pass through (normal operation)
 *   Open     → calls fail immediately (service is down)
 *   Half-Open → one test call allowed (checking recovery)
 *
 * Protected services: AI providers, PaySwap, storage, email, notifications.
 */

import { logger } from '@/shared/logging';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Failure threshold to open the circuit. */
  failureThreshold: number;
  /** Success threshold in half-open to close the circuit. */
  successThreshold: number;
  /** Time in ms before transitioning from open to half-open. */
  cooldownMs: number;
  /** Time window in ms for counting failures. */
  rollingWindowMs: number;
}

export const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 3,
  cooldownMs: 30000,
  rollingWindowMs: 60000,
};

export interface CircuitBreakerState {
  readonly name: string;
  readonly state: CircuitState;
  readonly failureCount: number;
  readonly successCount: number;
  readonly lastFailureAt: number | null;
  readonly openedAt: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number[] = []; // timestamps
  private halfOpenSuccesses = 0;
  private openedAt: number | null = null;
  private lastFailureAt: number | null = null;

  constructor(
    readonly name: string,
    private options: CircuitBreakerOptions = DEFAULT_CIRCUIT_OPTIONS,
  ) {}

  /** Execute a function through the circuit breaker. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldTransitionToHalfOpen()) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  /** Current state snapshot. */
  getState(): CircuitBreakerState {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.halfOpenSuccesses,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }

  /** Reset the circuit to closed. */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.halfOpenSuccesses = 0;
    this.openedAt = null;
    this.lastFailureAt = null;
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Clear failures on success in closed state
      this.failures = [];
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.lastFailureAt = now;
    this.failures.push(now);
    this.pruneOldFailures(now);

    if (this.state === 'half-open') {
      // Failure during half-open → back to open
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      if (this.failures.length >= this.options.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (this.openedAt === null) return false;
    return Date.now() - this.openedAt >= this.options.cooldownMs;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    if (newState === 'open') {
      this.openedAt = Date.now();
      this.halfOpenSuccesses = 0;
    } else if (newState === 'closed') {
      this.failures = [];
      this.halfOpenSuccesses = 0;
      this.openedAt = null;
    } else if (newState === 'half-open') {
      this.halfOpenSuccesses = 0;
    }
    logger.system().warn('Circuit breaker transitioned', {
      name: this.name,
      from: oldState,
      to: newState,
    });
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.options.rollingWindowMs;
    this.failures = this.failures.filter((t) => t >= cutoff);
  }
}

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit "${circuitName}" is open — calls are being rejected`);
    this.name = 'CircuitOpenError';
  }
}

/** Registry of named circuit breakers. */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  get(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  getAll(): CircuitBreakerState[] {
    return Array.from(this.breakers.values()).map((b) => b.getState());
  }

  reset(name?: string): void {
    if (name) {
      this.breakers.get(name)?.reset();
    } else {
      for (const b of this.breakers.values()) b.reset();
    }
  }
}
