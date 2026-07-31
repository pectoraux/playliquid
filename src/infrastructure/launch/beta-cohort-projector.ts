/**
 * Beta Cohort Projector — projects BetaCohortCreated events into the
 * BetaCohort read model and ParticipantInvited events into CohortParticipant.
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import { Projector } from '@/infrastructure/projections/projection-engine';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

export class BetaCohortProjector extends Projector {
  readonly name = 'BetaCohortProjector';
  readonly handledEventTypes = [
    'BetaCohortCreated', 'ParticipantInvited', 'InvitationAccepted', 'InvitationRevoked',
  ] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();

    if (event.eventType === 'BetaCohortCreated') {
      const p = event.payload as {
        cohortId: string; name: string; phase: string; maxParticipants: number; createdById: string; createdAt: string;
      };
      // Use createMany with skipDuplicates or check existence first
      const existing = await client.betaCohort.findUnique({ where: { cohortId: p.cohortId } });
      if (!existing) {
        await client.betaCohort.create({
          data: {
            cohortId: p.cohortId,
            name: p.name,
            phase: p.phase,
            maxParticipants: p.maxParticipants,
            createdById: p.createdById,
            active: true,
            createdAt: p.createdAt,
          },
        });
      } else {
        await client.betaCohort.update({
          where: { cohortId: p.cohortId },
          data: {
            name: p.name,
            phase: p.phase,
            maxParticipants: p.maxParticipants,
          },
        });
      }
    } else if (event.eventType === 'ParticipantInvited') {
      const p = event.payload as {
        cohortId: string; invitationId: string; userId: string; email: string;
        role: string; invitedAt: string; expiresAt: string;
      };
      const existing = await client.cohortParticipant.findUnique({ where: { invitationId: p.invitationId } });
      if (!existing) {
        await client.cohortParticipant.create({
          data: {
            cohortId: p.cohortId,
            invitationId: p.invitationId,
            userId: p.userId,
            email: p.email,
            role: p.role,
            status: 'pending',
            invitedAt: p.invitedAt,
            expiresAt: p.expiresAt,
          },
        });
      }
    } else if (event.eventType === 'InvitationAccepted') {
      const p = event.payload as { invitationId: string; acceptedAt: string };
      await client.cohortParticipant.update({
        where: { invitationId: p.invitationId },
        data: { status: 'accepted', acceptedAt: p.acceptedAt },
      }).catch(() => {});
    } else if (event.eventType === 'InvitationRevoked') {
      const p = event.payload as { invitationId: string };
      await client.cohortParticipant.update({
        where: { invitationId: p.invitationId },
        data: { status: 'revoked' },
      }).catch(() => {});
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.cohortParticipant.deleteMany({});
    await client.betaCohort.deleteMany({});
    logger.projection().info('BetaCohortProjector read model cleared');
  }
}
