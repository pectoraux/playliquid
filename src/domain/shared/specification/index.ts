/**
 * Specification pattern — composable business rules.
 *
 * A specification encapsulates a boolean predicate over a domain object.
 * Specifications can be combined with AND, OR, and NOT to build complex
 * query/filter logic without scattering conditionals across the domain.
 */

export abstract class Specification<T> {
  /** Test whether a candidate satisfies this specification. */
  abstract isSatisfiedBy(candidate: T): boolean;

  /** Combine with another specification using logical AND. */
  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  /** Combine with another specification using logical OR. */
  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  /** Negate this specification. */
  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

class AndSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }
}

class OrSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }
}

class NotSpecification<T> extends Specification<T> {
  constructor(private readonly spec: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this.spec.isSatisfiedBy(candidate);
  }
}

/** A specification that wraps a simple predicate function. */
export class PredicateSpecification<T> extends Specification<T> {
  constructor(private readonly predicate: (candidate: T) => boolean) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.predicate(candidate);
  }
}

/** A specification that is always satisfied. */
export class AlwaysSatisfied<T> extends Specification<T> {
  isSatisfiedBy(_candidate: T): boolean {
    return true;
  }
}

/** A specification that is never satisfied. */
export class NeverSatisfied<T> extends Specification<T> {
  isSatisfiedBy(_candidate: T): boolean {
    return false;
  }
}
