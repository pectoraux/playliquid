/**
 * Launch Application Ports.
 *
 * Application-layer interfaces that launch command and query handlers depend
 * on. They live in the application layer (NOT infrastructure) so the
 * dependency direction stays clean: infrastructure adapters implement these
 * ports; the application never imports infrastructure.
 *
 * The BetaCohortAggregate is event-sourced and keyed by cohort id. For
 * listing cohorts by phase, and for resolving which cohort owns a given
 * invitation id (needed by Accept/Revoke commands), the composition root
 * binds read-model store / lookup adapters to these ports.
 */

import type {
  LaunchPhase,
  Participant,
  ParticipantRole,
  InvitationStatus,
} from '@/domain/launch/aggregates/beta-cohort-aggregate';

// ─── Paginated Result ──────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ─── Beta Cohort Read Models ───────────────────────────────────────────────

/** Flat view of a beta cohort (read model). */
export interface BetaCohortView {
  readonly cohortId: string;
  readonly name: string;
  readonly phase: LaunchPhase;
  readonly maxParticipants: number;
  readonly acceptedCount: number;
  readonly pendingCount: number;
  readonly revokedCount: number;
  readonly createdById: string;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Filters for listing cohorts. */
export interface BetaCohortListFilters {
  readonly phase?: LaunchPhase;
  readonly limit: number;
  readonly offset: number;
}

/** Read-model store for beta cohorts. */
export interface BetaCohortReadModelStore {
  /** Look up a single cohort by id. */
  getById(cohortId: string): Promise<BetaCohortView | null>;
  /** List cohorts with optional phase filter and pagination. */
  list(filters: BetaCohortListFilters): Promise<PaginatedResult<BetaCohortView>>;
}

// ─── Invitation Lookup ─────────────────────────────────────────────────────

/**
 * Resolves the cohort id that owns a given invitation id.
 *
 * The BetaCohortAggregate is keyed by cohort id, not invitation id. To accept
 * or revoke an invitation by id alone, the command handler needs to find the
 * owning cohort first. The composition root binds this to a projection /
 * lookup table maintained by an event-sourced projector.
 */
export interface InvitationLookup {
  /** Return the cohort id that owns the invitation, or null if not found. */
  findCohortByInvitation(invitationId: string): Promise<string | null>;
}

// ─── Participant View ──────────────────────────────────────────────────────

/** Flat view of a beta cohort participant (read model). */
export interface ParticipantView {
  readonly invitationId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: ParticipantRole;
  readonly status: InvitationStatus;
  readonly invitedAt: string;
  readonly acceptedAt: string | null;
  readonly expiresAt: string;
}

/** Convenience: convert a domain Participant to a flat ParticipantView. */
export function participantToView(p: Participant): ParticipantView {
  return {
    invitationId: p.invitationId,
    userId: p.userId,
    email: p.email,
    role: p.role,
    status: p.status,
    invitedAt: p.invitedAt,
    acceptedAt: p.acceptedAt,
    expiresAt: p.expiresAt,
  };
}
