/**
 * Entity base class.
 *
 * Entities have identity (id) that persists across state changes. They are
 * compared by identity, not by value. Entities live inside aggregates and are
 * only accessible through their aggregate root.
 */

export abstract class Entity<TId = string> {
  protected readonly _id: TId;
  protected _props: Record<string, unknown>;

  constructor(id: TId, props: Record<string, unknown> = {}) {
    this._id = id;
    this._props = props;
  }

  /** The identity of this entity. */
  get id(): TId {
    return this._id;
  }

  /** Equality by identity. */
  equals(other: Entity<TId>): boolean {
    if (other === this) return true;
    if (!(other instanceof Entity)) return false;
    return this._id === other._id;
  }

  /** The identity value. */
  identity(): TId {
    return this._id;
  }

  /** Deep clone of this entity. */
  clone(): this {
    const ctor = this.constructor as new (id: TId, props: Record<string, unknown>) => this;
    return new ctor(this._id, structuredClone(this._props));
  }

  /** Validate invariants. Throws on violation. */
  abstract validate(): void;
}
