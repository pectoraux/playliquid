/**
 * Result type — explicit success/failure without throwing.
 *
 * Expected business errors MUST be returned as Result.Failure rather than
 * thrown. Only truly unexpected / programmer errors should be thrown.
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Result = {
  /** Create a successful result. */
  ok<T, E = Error>(value: T): Result<T, E> {
    return { ok: true, value } as const;
  },

  /** Create a failed result. */
  fail<T, E = Error>(error: E): Result<T, E> {
    return { ok: false, error } as const;
  },

  /** Wrap a potentially throwing function into a Result. */
  tryCatch<T, E = Error>(
    fn: () => T,
    mapError?: (e: unknown) => E,
  ): Result<T, E> {
    try {
      return Result.ok<T, E>(fn());
    } catch (e) {
      return Result.fail<E>(mapError ? mapError(e) : (e as E));
    }
  },

  /** Wrap an async potentially throwing function into a Result. */
  async tryCatchAsync<T, E = Error>(
    fn: () => Promise<T>,
    mapError?: (e: unknown) => E,
  ): Promise<Result<T, E>> {
    try {
      const value = await fn();
      return Result.ok<T, E>(value);
    } catch (e) {
      return Result.fail<E>(mapError ? mapError(e) : (e as E));
    }
  },

  /** Combine multiple results; fails fast on the first failure. */
  combine<T, E = Error>(results: Array<Result<T, E>>): Result<T[], E> {
    const values: T[] = [];
    for (const r of results) {
      if (!r.ok) return Result.fail<E>(r.error);
      values.push(r.value);
    }
    return Result.ok<T[], E>(values);
  },

  /** Type guard for success. */
  isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
    return r.ok;
  },

  /** Type guard for failure. */
  isFail<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
    return !r.ok;
  },

  /** Map the value of a successful result. */
  map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
    return r.ok ? Result.ok<U, E>(fn(r.value)) : Result.fail<U, E>(r.error);
  },

  /** Flat-map (bind) over a result. */
  flatMap<T, U, E>(r: Result<T, E>, fn: (v: T) => Result<U, E>): Result<U, E> {
    return r.ok ? fn(r.value) : Result.fail<U, E>(r.error);
  },

  /** Get the value or throw. */
  unwrap<T, E>(r: Result<T, E>): T {
    if (!r.ok) throw r.error;
    return r.value;
  },

  /** Get the value or a default. */
  unwrapOr<T, E>(r: Result<T, E>, defaultValue: T): T {
    return r.ok ? r.value : defaultValue;
  },
};
