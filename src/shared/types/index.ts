/**
 * Shared type primitives.
 *
 * These types have ZERO dependencies on any other layer and may be imported
 * anywhere in the codebase.
 */

/** A value that may be present or absent. */
export type Maybe<T> = T | null | undefined;

/** A value that is asynchronously resolved. */
export type AsyncMaybe<T> = Promise<Maybe<T>>;

/** Brand a nominal type to prevent structural mixing. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** A readonly record. */
export type ReadonlyRecord<K extends string | number, V> = Readonly<Record<K, V>>;

/** Deep readonly. */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/** A JSON-serializable value. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** Metadata map carried by events and commands. */
export type Metadata = Record<string, string | number | boolean | undefined>;

/** Constructor type. */
export type Constructor<T = unknown> = new (...args: unknown[]) => T;

/** Abstract constructor type. */
export type AbstractConstructor<T = unknown> = abstract new (...args: unknown[]) => T;

/** Token used for DI binding. */
export type InjectionToken<T = unknown> =
  | string
  | symbol
  | Constructor<T>
  | AbstractConstructor<T>;

/** Nullable helper. */
export function isDefined<T>(value: Maybe<T>): value is T {
  return value !== null && value !== undefined;
}

/** Type guard for non-null. */
export function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

/** Type guard for objects. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
